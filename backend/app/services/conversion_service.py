import asyncio
import os
import re
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile
from supabase import Client, create_client

from backend.app.converters import ConversionManager
from backend.app.models.models import ConversionJob, ConversionStatus


class ConversionService:
    _safe_filename_re = re.compile(r"^[A-Za-z0-9._ -]+$")
    _safe_file_id_re = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.upload_dir = Path("supabase://conversions/uploads")
        self.output_dir = Path("supabase://conversions/outputs")
        self.storage_backend = "supabase"

        self.upload_ttl_hours = self._int_env("DOC_CONVERT_UPLOAD_TTL_HOURS", 1)
        self.output_ttl_hours = self._int_env("DOC_CONVERT_OUTPUT_TTL_HOURS", 72)
        self.history_retention_days = self._int_env("DOC_CONVERT_HISTORY_RETENTION_DAYS", 30)
        self.history_max_entries = self._int_env("DOC_CONVERT_HISTORY_MAX_ENTRIES", 200)
        self.download_url_ttl_seconds = self._int_env("DOC_CONVERT_DOWNLOAD_URL_TTL_SECONDS", 300)

        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not supabase_url or not supabase_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")

        self.supabase: Client = create_client(supabase_url, supabase_key)
        self.bucket = "conversions"

        self.cleanup_artifacts()

    @staticmethod
    def _int_env(key: str, default: int) -> int:
        raw = os.getenv(key)
        if raw is None:
            return default
        try:
            value = int(raw)
            return value if value >= 0 else default
        except ValueError:
            return default

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _sanitize_output_stem(original_name: str) -> str:
        stem = Path(original_name).stem or "converted_file"
        cleaned = re.sub(r"[^A-Za-z0-9._ -]+", "_", stem).strip(" ._")
        return cleaned or "converted_file"

    def _build_output_filename(self, original_name: str, target_format: str) -> str:
        extension = target_format.lower().lstrip(".")
        stem = self._sanitize_output_stem(original_name)
        return f"{stem}.{extension}"

    def _storage_upload_path(self, file_id: str, filename: str) -> str:
        return f"uploads/{file_id}/{filename}"

    def _storage_output_path(self, file_id: str, filename: str) -> str:
        return f"outputs/{file_id}/{filename}"

    def _table(self, name: str):
        return self.supabase.table(name)

    def _fetch_job_row(self, batch_id: str) -> dict[str, Any]:
        result = (
            self._table("conversion_jobs")
            .select("*")
            .eq("id", batch_id)
            .single()
            .execute()
        )
        row = result.data
        if not row:
            raise HTTPException(status_code=404, detail="Batch not found.")
        return row

    def _fetch_job_files(self, batch_id: str) -> list[dict[str, Any]]:
        result = (
            self._table("conversion_job_files")
            .select("*")
            .eq("batch_id", batch_id)
            .order("created_at")
            .execute()
        )
        return list(result.data or [])

    def _update_job(self, batch_id: str, values: dict[str, Any]) -> None:
        payload = {**values, "updated_at": self._now_iso()}
        self._table("conversion_jobs").update(payload).eq("id", batch_id).execute()

    def _create_signed_url(self, path: str) -> str:
        signed = self.supabase.storage.from_(self.bucket).create_signed_url(
            path,
            self.download_url_ttl_seconds,
        )
        if isinstance(signed, dict):
            signed_url = signed.get("signedURL") or signed.get("signedUrl")
            if signed_url:
                return signed_url
        signed_url = getattr(signed, "signedURL", None) or getattr(signed, "signedUrl", None)
        if signed_url:
            return signed_url
        raise HTTPException(status_code=500, detail="Could not generate signed URL.")

    def _remove_storage_paths(self, paths: list[str]) -> None:
        if not paths:
            return
        unique_paths = sorted({p for p in paths if p})
        if unique_paths:
            self.supabase.storage.from_(self.bucket).remove(unique_paths)

    def cleanup_artifacts(self) -> None:
        now = datetime.now(timezone.utc)
        history_cutoff = now - timedelta(days=self.history_retention_days)

        old_jobs_resp = (
            self._table("conversion_jobs")
            .select("id,created_at")
            .lt("created_at", history_cutoff.isoformat())
            .execute()
        )
        old_jobs = list(old_jobs_resp.data or [])
        if not old_jobs:
            return

        batch_ids = [job["id"] for job in old_jobs if job.get("id")]
        for batch_id in batch_ids:
            files = self._fetch_job_files(batch_id)
            paths_to_remove = [
                *(f.get("source_path") for f in files),
                *(f.get("output_path") for f in files),
            ]
            self._remove_storage_paths([p for p in paths_to_remove if p])
            self._table("conversion_job_files").delete().eq("batch_id", batch_id).execute()

        if batch_ids:
            self._table("conversion_jobs").delete().in_("id", batch_ids).execute()

    @staticmethod
    def supported_formats() -> dict[str, Any]:
        return {
            "conversions": [
                {"from": "image", "to": "pdf", "label": "Image -> PDF", "group": "image_to_doc"},
                {"from": "image", "to": "docx", "label": "Image -> DOCX", "group": "image_to_doc"},
                {"from": "pdf", "to": "png", "label": "PDF -> PNG", "group": "doc_to_image"},
                {"from": "pdf", "to": "jpg", "label": "PDF -> JPG", "group": "doc_to_image"},
                {"from": "pdf", "to": "webp", "label": "PDF -> WebP", "group": "doc_to_image"},
                {"from": "docx", "to": "png", "label": "DOCX -> PNG", "group": "doc_to_image"},
                {"from": "pdf", "to": "txt", "label": "PDF -> TXT", "group": "doc_to_text"},
                {"from": "docx", "to": "txt", "label": "DOCX -> TXT", "group": "doc_to_text"},
                {"from": "image", "to": "txt", "label": "Image -> TXT (OCR)", "group": "image_to_text"},
                {"from": "txt", "to": "pdf", "label": "TXT -> PDF", "group": "text_to_doc"},
                {"from": "txt", "to": "docx", "label": "TXT -> DOCX", "group": "text_to_doc"},
                {"from": "image", "to": "webp", "label": "Image -> WebP", "group": "image_convert"},
                {"from": "image", "to": "png", "label": "Image -> PNG", "group": "image_convert"},
                {"from": "image", "to": "jpg", "label": "Image -> JPG", "group": "image_convert"},
            ],
            "accepted_extensions": {
                "image": [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".gif"],
                "pdf": [".pdf"],
                "docx": [".docx"],
                "txt": [".txt"],
            },
        }

    async def create_batch_job(
        self,
        files: list[UploadFile],
        target_format: str,
        file_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        self.cleanup_artifacts()

        if not files:
            raise HTTPException(status_code=400, detail="No files provided.")

        if file_ids is not None and len(file_ids) != len(files):
            raise HTTPException(status_code=400, detail="file_ids must match files length.")

        if file_ids is not None:
            for provided_file_id in file_ids:
                if not self._safe_file_id_re.fullmatch(provided_file_id):
                    raise HTTPException(status_code=400, detail="Invalid file_id format.")

        batch_id = str(uuid.uuid4())
        first_filename = files[0].filename if files and files[0].filename else None

        self._table("conversion_jobs").insert(
            {
                "id": batch_id,
                "status": ConversionStatus.PENDING.value,
                "original_filename": first_filename,
                "output_filename": None,
                "error": None,
                "created_at": self._now_iso(),
                "updated_at": self._now_iso(),
            }
        ).execute()

        file_rows: list[dict[str, Any]] = []
        for index, file in enumerate(files):
            provided_file_id = file_ids[index] if file_ids is not None else None
            file_id = provided_file_id or str(uuid.uuid4())

            source_name = file.filename or f"{file_id}.bin"
            source_ext = Path(source_name).suffix.lower()
            source_path = self._storage_upload_path(file_id, source_name)
            payload = await file.read()

            self.supabase.storage.from_(self.bucket).upload(
                source_path,
                payload,
                {"content-type": file.content_type or "application/octet-stream", "upsert": "true"},
            )

            file_rows.append(
                {
                    "batch_id": batch_id,
                    "file_id": file_id,
                    "original_name": source_name,
                    "source_ext": source_ext,
                    "source_path": source_path,
                    "target_format": target_format,
                    "status": ConversionStatus.PENDING.value,
                    "output_path": None,
                    "output_filename": None,
                    "error": None,
                    "created_at": self._now_iso(),
                    "updated_at": self._now_iso(),
                }
            )

        if file_rows:
            self._table("conversion_job_files").insert(file_rows).execute()

        return {"batch_id": batch_id, "total": len(files), "status": "pending"}

    async def run_batch(self, batch_id: str):
        self._update_job(batch_id, {"status": ConversionStatus.PROCESSING.value, "error": None})

        files = self._fetch_job_files(batch_id)
        if not files:
            self._update_job(
                batch_id,
                {
                    "status": ConversionStatus.FAILED.value,
                    "error": "No files found for batch.",
                },
            )
            return

        completed = 0
        failed = 0
        first_output_filename: str | None = None

        for file_info in files:
            file_row_id = file_info["id"]
            file_id = file_info["file_id"]
            source_path = file_info["source_path"]
            source_ext = file_info["source_ext"]
            target_format = file_info["target_format"]

            try:
                source_bytes = self.supabase.storage.from_(self.bucket).download(source_path)
                if isinstance(source_bytes, str):
                    source_bytes = source_bytes.encode("utf-8")

                with tempfile.TemporaryDirectory() as temp_dir:
                    temp_root = Path(temp_dir)
                    input_path = temp_root / f"input{source_ext}"
                    input_path.write_bytes(source_bytes)

                    converter = ConversionManager(temp_root, temp_root)
                    output_path_str = await asyncio.get_event_loop().run_in_executor(
                        None,
                        converter.convert,
                        str(input_path),
                        source_ext,
                        target_format,
                        file_id,
                    )

                    output_path = Path(output_path_str)
                    output_filename = self._build_output_filename(
                        file_info["original_name"],
                        target_format,
                    )
                    storage_output_path = self._storage_output_path(file_id, output_filename)
                    output_bytes = output_path.read_bytes()

                self.supabase.storage.from_(self.bucket).upload(
                    storage_output_path,
                    output_bytes,
                    {"content-type": "application/octet-stream", "upsert": "true"},
                )

                self._table("conversion_job_files").update(
                    {
                        "status": "success",
                        "output_path": storage_output_path,
                        "output_filename": output_filename,
                        "error": None,
                        "updated_at": self._now_iso(),
                    }
                ).eq("id", file_row_id).execute()

                if not first_output_filename:
                    first_output_filename = output_filename
                completed += 1
            except Exception as exc:
                failed += 1
                self._table("conversion_job_files").update(
                    {
                        "status": "failed",
                        "error": str(exc),
                        "updated_at": self._now_iso(),
                    }
                ).eq("id", file_row_id).execute()

        if completed == len(files):
            status = ConversionStatus.DONE.value
        elif completed == 0:
            status = ConversionStatus.FAILED.value
        else:
            status = ConversionStatus.PARTIAL.value

        self._update_job(
            batch_id,
            {
                "status": status,
                "output_filename": first_output_filename,
                "error": None if completed > 0 else "All conversions failed.",
            },
        )

    def get_job(self, batch_id: str) -> dict[str, Any]:
        job_row = self._fetch_job_row(batch_id)
        files = self._fetch_job_files(batch_id)
        if not files:
            raise HTTPException(status_code=404, detail="Batch files not found.")

        file_entries: list[dict[str, Any]] = []
        results: list[dict[str, Any]] = []
        completed = 0
        failed = 0

        for file_info in files:
            file_entries.append(
                {
                    "file_id": file_info["file_id"],
                    "original_name": file_info["original_name"],
                    "path": file_info["source_path"],
                    "ext": file_info["source_ext"],
                }
            )

            file_status = file_info.get("status")
            if file_status == "success":
                completed += 1
                results.append(
                    {
                        "original": file_info["original_name"],
                        "file_id": file_info["file_id"],
                        "status": "success",
                        "filename": file_info.get("output_filename"),
                        "output": file_info.get("output_path"),
                    }
                )
            elif file_status == "failed":
                failed += 1
                results.append(
                    {
                        "original": file_info["original_name"],
                        "file_id": file_info["file_id"],
                        "status": "failed",
                        "error": file_info.get("error") or "Conversion failed.",
                    }
                )

        target_format = files[0]["target_format"]
        finished_at = None
        if job_row["status"] in {
            ConversionStatus.DONE.value,
            ConversionStatus.PARTIAL.value,
            ConversionStatus.FAILED.value,
        }:
            finished_at = job_row.get("updated_at")

        job = ConversionJob(
            batch_id=batch_id,
            status=ConversionStatus(job_row["status"]),
            total=len(files),
            completed=completed,
            failed=failed,
            files=file_entries,
            results=results,
            created_at=job_row["created_at"],
            finished_at=finished_at,
            target_format=target_format,
        )
        return job.model_dump()

    def resolve_output_file(self, batch_id: str, file_id: str) -> dict[str, str]:
        result = (
            self._table("conversion_job_files")
            .select("output_path,output_filename,status")
            .eq("batch_id", batch_id)
            .eq("file_id", file_id)
            .single()
            .execute()
        )
        row = result.data
        if not row or row.get("status") != "success" or not row.get("output_path"):
            raise HTTPException(status_code=404, detail="Output file not found.")

        return {
            "kind": "supabase",
            "url": self._create_signed_url(str(row["output_path"])),
            "filename": row.get("output_filename") or "download.bin",
        }

    def resolve_output_by_filename(self, filename: str) -> dict[str, str]:
        if not self._safe_filename_re.fullmatch(filename):
            raise HTTPException(status_code=400, detail="Invalid filename.")

        result = (
            self._table("conversion_job_files")
            .select("output_path,output_filename,status")
            .eq("output_filename", filename)
            .eq("status", "success")
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )

        rows = list(result.data or [])
        if not rows:
            raise HTTPException(status_code=404, detail="File not found.")

        row = rows[0]
        return {
            "kind": "supabase",
            "url": self._create_signed_url(str(row["output_path"])),
            "filename": row.get("output_filename") or filename,
        }

    def load_history(self) -> list[dict[str, Any]]:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=self.history_retention_days)).isoformat()
        jobs_resp = (
            self._table("conversion_jobs")
            .select("id,status,created_at,updated_at")
            .gte("created_at", cutoff)
            .in_("status", [
                ConversionStatus.DONE.value,
                ConversionStatus.PARTIAL.value,
                ConversionStatus.FAILED.value,
            ])
            .order("created_at", desc=True)
            .limit(self.history_max_entries)
            .execute()
        )
        jobs = list(jobs_resp.data or [])

        history: list[dict[str, Any]] = []
        for job in jobs:
            files = self._fetch_job_files(job["id"])
            if not files:
                continue

            completed = sum(1 for item in files if item.get("status") == "success")
            failed = sum(1 for item in files if item.get("status") == "failed")
            target_format = files[0]["target_format"] if files else ""

            history.append(
                {
                    "batch_id": job["id"],
                    "target_format": target_format,
                    "total": len(files),
                    "completed": completed,
                    "failed": failed,
                    "created_at": job["created_at"],
                    "finished_at": job.get("updated_at"),
                    "status": job["status"],
                    "files": [
                        {
                            "file_id": item["file_id"],
                            "original_name": item["original_name"],
                            "output_filename": item.get("output_filename"),
                            "status": item.get("status"),
                            "error": item.get("error"),
                        }
                        for item in files
                    ],
                }
            )

        return history

    def clear_history(self) -> None:
        files_resp = self._table("conversion_job_files").select("source_path,output_path").execute()
        files = list(files_resp.data or [])

        paths = [
            *(item.get("source_path") for item in files),
            *(item.get("output_path") for item in files),
        ]
        self._remove_storage_paths([p for p in paths if p])

        self._table("conversion_job_files").delete().neq("id", 0).execute()
        self._table("conversion_jobs").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

    def count_active_jobs(self) -> int:
        response = (
            self._table("conversion_jobs")
            .select("id", count="exact")
            .in_("status", [ConversionStatus.PENDING.value, ConversionStatus.PROCESSING.value])
            .execute()
        )
        return int(getattr(response, "count", 0) or 0)