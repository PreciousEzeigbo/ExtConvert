import asyncio
import os
import re
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from time import monotonic
from typing import Any, cast

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

        self._job_cache: dict[str, tuple[float, dict[str, Any]]] = {}
        self._progress_cache: dict[str, int] = {}
        self._cleanup_task: asyncio.Task[None] | None = None

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

        self._schedule_cleanup_artifacts()

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

    def _invalidate_job_cache(self, batch_id: str) -> None:
        self._job_cache.pop(batch_id, None)

    def _set_job_cache(self, batch_id: str, payload: dict[str, Any]) -> None:
        self._job_cache[batch_id] = (monotonic(), payload)

    def _get_job_cache(self, batch_id: str) -> dict[str, Any] | None:
        cached = self._job_cache.get(batch_id)
        if not cached:
            return None

        cached_at, payload = cached
        if monotonic() - cached_at > 0.5:
            self._job_cache.pop(batch_id, None)
            return None
        return payload

    def _schedule_cleanup_artifacts(self) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return

        if self._cleanup_task is not None and not self._cleanup_task.done():
            return

        task = loop.create_task(self._cleanup_artifacts_task())
        self._cleanup_task = task
        task.add_done_callback(self._clear_cleanup_task)

    def _clear_cleanup_task(self, task: asyncio.Task[None]) -> None:
        if self._cleanup_task is task:
            self._cleanup_task = None

    def _upload_bytes(self, source_path: str, payload: bytes, content_type: str) -> None:
        self.supabase.storage.from_(self.bucket).upload(
            source_path,
            payload,
            {
                "content-type": content_type,
                "upsert": "true",
            },
        )

    def _download_bytes(self, source_path: str) -> bytes:
        source_bytes = self.supabase.storage.from_(self.bucket).download(source_path)
        if isinstance(source_bytes, str):
            source_bytes = source_bytes.encode("utf-8")
        return bytes(source_bytes)

    def _update_file_row(self, batch_id: str, filters: dict[str, Any], values: dict[str, Any]) -> None:
        payload: dict[str, Any] = {**values, "updated_at": self._now_iso()}
        query = self._table("conversion_job_files").update(payload)
        for column, value in filters.items():
            query = query.eq(column, value)
        query.execute()
        self._invalidate_job_cache(batch_id)

    def _cleanup_batch(self, batch_id: str) -> None:
        files = self._fetch_job_files(batch_id)
        paths_to_remove = [
            *(f.get("source_path") for f in files),
            *(f.get("output_path") for f in files),
        ]
        
        supabase_paths = [p for p in paths_to_remove if p and not p.startswith("/")]
        self._remove_storage_paths(supabase_paths)
        
        for p in paths_to_remove:
            if p and p.startswith("/") and Path(p).exists():
                try:
                    Path(p).unlink()
                except Exception:
                    pass
                    
        self._table("conversion_job_files").delete().eq("batch_id", batch_id).execute()
        self._table("conversion_jobs").delete().eq("id", batch_id).execute()
        self._invalidate_job_cache(batch_id)

    async def _cleanup_artifacts_task(self) -> None:
        try:
            old_jobs_resp = await asyncio.to_thread(
                lambda: self._table("conversion_jobs")
                .select("id,created_at")
                .lt("created_at", (datetime.now(timezone.utc) - timedelta(days=self.history_retention_days)).isoformat())
                .execute()
            )

            old_jobs: list[dict[str, Any]] = []
            for item in cast(list[Any], old_jobs_resp.data or []):
                if isinstance(item, dict):
                    job_item = cast(dict[str, Any], item)
                    if job_item.get("id"):
                        old_jobs.append(job_item)

            if not old_jobs:
                return

            batch_ids = [str(job["id"]) for job in old_jobs]
            await asyncio.gather(
                *(asyncio.to_thread(self._cleanup_batch, batch_id) for batch_id in batch_ids),
                return_exceptions=True,
            )
        except Exception:
            return

    def _fetch_job_row(self, batch_id: str) -> dict[str, Any]:
        result = (
            self._table("conversion_jobs")
            .select("*")
            .eq("id", batch_id)
            .single()
            .execute()
        )
        row = cast(dict[str, Any] | None, result.data)
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
        files: list[dict[str, Any]] = []
        for item in cast(list[Any], result.data or []):
            if isinstance(item, dict):
                files.append(cast(dict[str, Any], item))
        return files

    def _update_job(self, batch_id: str, values: dict[str, Any]) -> None:
        payload: dict[str, Any] = {**values, "updated_at": self._now_iso()}
        self._table("conversion_jobs").update(payload).eq("id", batch_id).execute()
        self._invalidate_job_cache(batch_id)

    def _create_signed_url(self, path: str) -> str:
        signed = cast(
            dict[str, Any],
            self.supabase.storage.from_(self.bucket).create_signed_url(
                path,
                self.download_url_ttl_seconds,
            ),
        )
        signed_url = signed.get("signedURL") or signed.get("signedUrl")
        if signed_url:
            return str(signed_url)
        raise HTTPException(status_code=500, detail="Could not generate signed URL.")

    def _remove_storage_paths(self, paths: list[str]) -> None:
        if not paths:
            return
        unique_paths = sorted({p for p in paths if p})
        if unique_paths:
            self.supabase.storage.from_(self.bucket).remove(unique_paths)

    def _save_source_file_locally(self, local_path: str, upload_file: UploadFile) -> None:
        upload_stream = cast(Any, upload_file.file)
        try:
            upload_stream.seek(0)
        except Exception:
            pass

        upload_bytes = upload_stream.read()
        if isinstance(upload_bytes, str):
            upload_bytes = upload_bytes.encode("utf-8")
        if not isinstance(upload_bytes, (bytes, bytearray)):
            raise HTTPException(status_code=400, detail="Uploaded file content could not be read.")

        target_path = Path(local_path)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(bytes(upload_bytes))

    async def _process_conversion_file(
        self,
        file_info: dict[str, Any],
        conversion_manager: ConversionManager,
        io_semaphore: asyncio.Semaphore,
        cpu_semaphore: asyncio.Semaphore,
    ) -> dict[str, Any]:
        file_row_id = file_info["id"]
        batch_id = file_info["batch_id"]
        file_id = file_info["file_id"]
        source_path = file_info["source_path"]
        source_ext = file_info["source_ext"]
        target_format = file_info["target_format"]

        try:
            if source_path.startswith("/"):
                 source_bytes = await asyncio.to_thread(Path(source_path).read_bytes)
            else:
                 async with io_semaphore:
                     source_bytes = await asyncio.to_thread(self._download_bytes, source_path)

            with tempfile.TemporaryDirectory() as temp_dir:
                temp_root = Path(temp_dir)
                input_path = temp_root / f"input{source_ext}"
                input_path.write_bytes(source_bytes)

                self._progress_cache[file_id] = 10
                async with cpu_semaphore:
                    self._progress_cache[file_id] = 30
                    output_path_str = await asyncio.to_thread(
                        conversion_manager.convert,
                        str(input_path),
                        source_ext,
                        target_format,
                        file_id,
                    )

                self._progress_cache[file_id] = 80
                output_path = Path(output_path_str)
                output_filename = self._build_output_filename(
                    file_info["original_name"],
                    target_format,
                )
                storage_output_path = self._storage_output_path(file_id, output_filename)
                output_bytes = await asyncio.to_thread(output_path.read_bytes)

            async with io_semaphore:
                await asyncio.to_thread(
                    self._upload_bytes,
                    storage_output_path,
                    output_bytes,
                    "application/octet-stream",
                )

            self._update_file_row(
                batch_id,
                {"id": file_row_id},
                {
                    "status": "success",
                    "output_path": storage_output_path,
                    "output_filename": output_filename,
                    "error": None,
                },
            )

            self._progress_cache[file_id] = 100
            return {
                "status": "success",
                "file_id": file_id,
                "output_filename": output_filename,
            }
        except Exception as exc:
            import traceback
            traceback.print_exc()
            error_message = str(exc).lower()
            
            user_error = "Failed to convert file. The file may be corrupt or unsupported."
            if "password" in error_message or "encrypt" in error_message:
                user_error = "The document is password-protected or encrypted."
            elif "renderable" in error_message:
                user_error = "The document has no pages that can be rendered."
            elif "permission" in error_message:
                user_error = "Permission denied to read this file."
                
            self._update_file_row(
                batch_id,
                {"id": file_row_id},
                {
                    "status": "failed",
                    "error": user_error,
                },
            )

            self._progress_cache[file_id] = 100
            return {
                "status": "failed",
                "file_id": file_id,
                "error": user_error,
            }

    def cleanup_artifacts(self) -> None:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(self._cleanup_artifacts_task())
            return

        self._schedule_cleanup_artifacts()

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
        if not files:
            raise HTTPException(status_code=400, detail="No files provided.")

        if file_ids is not None and len(file_ids) != len(files):
            raise HTTPException(status_code=400, detail="file_ids must match files length.")

        if file_ids is not None:
            for provided_file_id in file_ids:
                if not self._safe_file_id_re.fullmatch(provided_file_id):
                    raise HTTPException(status_code=400, detail="Invalid file_id format.")

        self._schedule_cleanup_artifacts()

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
            
            # Use local disk rather than Supabase storage
            local_path = str(self.base_dir / "uploads" / f"{batch_id}" / f"{file_id}{source_ext}")

            file_rows.append(
                {
                    "batch_id": batch_id,
                    "file_id": file_id,
                    "original_name": source_name,
                    "source_ext": source_ext,
                    "source_path": local_path,
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

        upload_tasks = [
            asyncio.to_thread(self._save_source_file_locally, record["source_path"], upload_file)
            for record, upload_file in zip(file_rows, files, strict=True)
        ]
        if upload_tasks:
            upload_results = await asyncio.gather(*upload_tasks, return_exceptions=True)
            for record, result in zip(file_rows, upload_results, strict=True):
                if isinstance(result, Exception):
                    self._update_file_row(
                        batch_id,
                        {"batch_id": batch_id, "file_id": record["file_id"]},
                        {
                            "status": "failed",
                            "error": str(result),
                        },
                    )

        return {"batch_id": batch_id, "total": len(files), "status": "pending"}

    async def run_batch(self, batch_id: str):
        self._update_job(batch_id, {"status": ConversionStatus.PROCESSING.value, "error": None})

        files = self._fetch_job_files(batch_id)
        pending_files = [file_info for file_info in files if file_info.get("status") == ConversionStatus.PENDING.value]
        if not pending_files:
            self._update_job(
                batch_id,
                {
                    "status": ConversionStatus.FAILED.value,
                    "error": "No pending files found for batch.",
                },
            )
            return

        io_semaphore = asyncio.Semaphore(min(8, len(pending_files)))
        cpu_semaphore = asyncio.Semaphore(min(4, len(pending_files)))

        with tempfile.TemporaryDirectory() as temp_dir:
            batch_temp_root = Path(temp_dir)
            conversion_manager = ConversionManager(batch_temp_root, batch_temp_root)

            async def process_file(file_info: dict[str, Any]) -> dict[str, Any]:
                return await self._process_conversion_file(
                    file_info,
                    conversion_manager,
                    io_semaphore,
                    cpu_semaphore,
                )

            results = await asyncio.gather(*(process_file(file_info) for file_info in pending_files))

        completed = sum(1 for result in results if result["status"] == "success")
        failed = sum(1 for result in results if result["status"] == "failed")

        if completed == len(pending_files) and failed == 0:
            status = ConversionStatus.DONE.value
        elif completed == 0:
            status = ConversionStatus.FAILED.value
        else:
            status = ConversionStatus.PARTIAL.value

        self._update_job(
            batch_id,
            {
                "status": status,
                "output_filename": next((result.get("output_filename") for result in results if result.get("status") == "success"), None),
                "error": None if completed > 0 else "All conversions failed.",
            },
        )

    def get_job(self, batch_id: str) -> dict[str, Any]:
        cached_job = self._get_job_cache(batch_id)
        if cached_job is not None:
            return cached_job

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
        payload = job.model_dump()
        self._set_job_cache(batch_id, payload)
        return payload

    def resolve_output_file(self, batch_id: str, file_id: str) -> dict[str, str]:
        result = (
            self._table("conversion_job_files")
            .select("output_path,output_filename,status")
            .eq("batch_id", batch_id)
            .eq("file_id", file_id)
            .single()
            .execute()
        )
        row = cast(dict[str, Any] | None, result.data)
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

        rows = cast(list[dict[str, Any]], result.data or [])
        if not rows:
            raise HTTPException(status_code=404, detail="File not found.")

        row = rows[0]
        return {
            "kind": "supabase",
            "url": self._create_signed_url(str(row["output_path"])),
            "filename": row.get("output_filename") or filename,
        }

    async def stream_job_progress(self, batch_id: str):
        while True:
            job_row = self._fetch_job_row(batch_id)
            if job_row["status"] in {ConversionStatus.DONE.value, ConversionStatus.FAILED.value}:
                break
                
            files = self._fetch_job_files(batch_id)
            file_progress = []
            for f in files:
                fid = f["file_id"]
                if f["status"] == "success" or f["status"] == "failed":
                    file_progress.append({"file_id": fid, "progress": 100, "status": f["status"]})
                else:
                    progress = self._progress_cache.get(fid, 0)
                    file_progress.append({"file_id": fid, "progress": progress, "status": "processing"})
                    
            yield f"data: {__import__('json').dumps({'status': job_row['status'], 'files': file_progress})}\n\n"
            await asyncio.sleep(0.5)
            
        # Final state
        files = self._fetch_job_files(batch_id)
        file_progress = [
            {"file_id": f["file_id"], "progress": 100, "status": f["status"]}
            for f in files
        ]
        yield f"data: {__import__('json').dumps({'status': job_row['status'], 'files': file_progress})}\n\n"

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
        jobs: list[dict[str, Any]] = []
        for item in cast(list[Any], jobs_resp.data or []):
            if isinstance(item, dict):
                jobs.append(cast(dict[str, Any], item))

        if not jobs:
            return []

        batch_ids = [str(job["id"]) for job in jobs]
        files_resp = (
            self._table("conversion_job_files")
            .select("*")
            .in_("batch_id", batch_ids)
            .order("created_at")
            .execute()
        )
        files_by_batch: dict[str, list[dict[str, Any]]] = {batch_id: [] for batch_id in batch_ids}
        for item in cast(list[Any], files_resp.data or []):
            if isinstance(item, dict):
                file_item = cast(dict[str, Any], item)
                batch_id = str(file_item.get("batch_id", ""))
                if batch_id in files_by_batch:
                    files_by_batch[batch_id].append(file_item)

        history: list[dict[str, Any]] = []
        for job in jobs:
            job_id = str(job["id"])
            files = files_by_batch.get(job_id, [])
            if not files:
                continue

            files.sort(key=lambda item: str(item.get("created_at", "")))
            completed = sum(1 for item in files if item.get("status") == "success")
            failed = sum(1 for item in files if item.get("status") == "failed")
            target_format = files[0]["target_format"] if files else ""

            history.append(
                {
                    "batch_id": job_id,
                    "target_format": target_format,
                    "total": len(files),
                    "completed": completed,
                    "failed": failed,
                    "created_at": job["created_at"],
                    "finished_at": cast(str | None, job.get("updated_at")),
                    "status": str(job["status"]),
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
        files: list[dict[str, Any]] = []
        for item in cast(list[Any], files_resp.data or []):
            if isinstance(item, dict):
                files.append(cast(dict[str, Any], item))

        paths: list[str] = []
        for item in files:
            source_path = item.get("source_path")
            output_path = item.get("output_path")
            if source_path:
                paths.append(str(source_path))
            if output_path:
                paths.append(str(output_path))

        self._remove_storage_paths(paths)

        self._table("conversion_job_files").delete().neq("id", 0).execute()
        self._table("conversion_jobs").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

    def count_active_jobs(self) -> int:
        response = (
            self._table("conversion_jobs")
            .select("id", count=cast(Any, "exact"))
            .in_("status", [ConversionStatus.PENDING.value, ConversionStatus.PROCESSING.value])
            .execute()
        )
        return int(getattr(response, "count", 0) or 0)