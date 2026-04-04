import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile

from backend.app.converters import ConversionManager
from backend.app.models.models import ConversionJob, ConversionStatus


class ConversionService:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.upload_dir = base_dir / "uploads"
        self.output_dir = base_dir / "outputs"
        self.history_file = base_dir / "history" / "log.json"

        self.storage_backend = "local"
        self.upload_ttl_hours = self._int_env("DOC_CONVERT_UPLOAD_TTL_HOURS", 1)
        self.output_ttl_hours = self._int_env("DOC_CONVERT_OUTPUT_TTL_HOURS", 72)
        self.history_retention_days = self._int_env("DOC_CONVERT_HISTORY_RETENTION_DAYS", 30)
        self.history_max_entries = self._int_env("DOC_CONVERT_HISTORY_MAX_ENTRIES", 200)

        for directory in [self.upload_dir, self.output_dir, base_dir / "history"]:
            directory.mkdir(parents=True, exist_ok=True)

        if not self.history_file.exists():
            self.history_file.write_text("[]")

        self.jobs: dict[str, ConversionJob] = {}
        self.converter = ConversionManager(self.upload_dir, self.output_dir)
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
    def _parse_iso_datetime(value: str) -> datetime | None:
        if not value:
            return None
        try:
            normalized = value.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(normalized)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed
        except Exception:
            return None

    def _prune_history_entries(self, entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
        now = datetime.now(timezone.utc)
        keep: list[dict[str, Any]] = []
        for entry in entries:
            ts = self._parse_iso_datetime(
                str(entry.get("finished_at") or entry.get("created_at") or "")
            )
            if ts is None:
                keep.append(entry)
                continue
            age = now - ts.astimezone(timezone.utc)
            if age <= timedelta(days=self.history_retention_days):
                keep.append(entry)
        return keep[: self.history_max_entries]

    def _cleanup_directory(self, directory: Path, ttl_hours: int) -> int:
        if ttl_hours <= 0:
            return 0

        removed = 0
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=ttl_hours)

        for item in directory.iterdir():
            if not item.is_file():
                continue
            try:
                modified = datetime.fromtimestamp(item.stat().st_mtime, tz=timezone.utc)
                if modified < cutoff:
                    item.unlink(missing_ok=True)
                    removed += 1
            except FileNotFoundError:
                continue

        return removed

    def cleanup_artifacts(self) -> None:
        self._cleanup_directory(self.upload_dir, self.upload_ttl_hours)
        self._cleanup_directory(self.output_dir, self.output_ttl_hours)

        history = self.load_history()
        pruned = self._prune_history_entries(history)
        if pruned != history:
            self.history_file.write_text(json.dumps(pruned, indent=2))

    def load_history(self) -> list[dict[str, Any]]:
        try:
            return json.loads(self.history_file.read_text())
        except Exception:
            return []

    def save_history(self, entry: dict[str, Any]) -> None:
        history = self.load_history()
        history.insert(0, entry)
        self.history_file.write_text(json.dumps(self._prune_history_entries(history), indent=2))

    @staticmethod
    def supported_formats() -> dict[str, Any]:
        return {
            "conversions": [
                {"from": "image", "to": "pdf", "label": "Image -> PDF", "group": "image_to_doc"},
                {"from": "image", "to": "docx", "label": "Image -> DOCX", "group": "image_to_doc"},
                {"from": "pdf", "to": "png", "label": "PDF -> PNG", "group": "doc_to_image"},
                {"from": "pdf", "to": "jpg", "label": "PDF -> JPG", "group": "doc_to_image"},
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

    async def create_batch_job(self, files: list[UploadFile], target_format: str) -> dict[str, Any]:
        self.cleanup_artifacts()

        if not files:
            raise HTTPException(status_code=400, detail="No files provided.")

        batch_id = str(uuid.uuid4())
        job = ConversionJob(
            batch_id=batch_id,
            status=ConversionStatus.PENDING,
            total=len(files),
            completed=0,
            failed=0,
            files=[],
            created_at=datetime.now(timezone.utc).isoformat(),
            target_format=target_format,
        )
        self.jobs[batch_id] = job

        saved_files: list[dict[str, str]] = []
        for file in files:
            file_id = str(uuid.uuid4())
            source_name = file.filename or f"{file_id}.bin"
            ext = Path(source_name).suffix.lower()
            destination = self.upload_dir / f"{file_id}{ext}"
            destination.write_bytes(await file.read())
            saved_files.append(
                {
                    "file_id": file_id,
                    "original_name": source_name,
                    "path": str(destination),
                    "ext": ext,
                }
            )

        job.files = saved_files
        return {"batch_id": batch_id, "total": len(files), "status": "pending"}

    async def run_batch(self, batch_id: str):
        job = self.jobs[batch_id]
        job.status = ConversionStatus.PROCESSING

        results: list[dict[str, str]] = []
        for file_info in job.files:
            source_path = Path(file_info["path"])
            try:
                output_path = await asyncio.get_event_loop().run_in_executor(
                    None,
                    self.converter.convert,
                    file_info["path"],
                    file_info["ext"],
                    job.target_format,
                    file_info["file_id"],
                )

                result_record: dict[str, str] = {
                    "original": file_info["original_name"],
                    "status": "success",
                }

                result_record["backend"] = "local"
                result_record["output"] = output_path

                job.completed += 1
                results.append(result_record)
            except Exception as exc:
                job.failed += 1
                results.append(
                    {
                        "original": file_info["original_name"],
                        "error": str(exc),
                        "status": "failed",
                    }
                )
            finally:
                source_path.unlink(missing_ok=True)

        job.status = ConversionStatus.DONE if job.failed == 0 else (
            ConversionStatus.PARTIAL if job.completed > 0 else ConversionStatus.FAILED
        )
        job.results = results
        job.finished_at = datetime.now(timezone.utc).isoformat()

        self.save_history(
            {
                "batch_id": batch_id,
                "target_format": job.target_format,
                "total": job.total,
                "completed": job.completed,
                "failed": job.failed,
                "created_at": job.created_at,
                "finished_at": job.finished_at,
                "status": job.status.value,
                "files": [{"name": item["original"], "status": item["status"]} for item in results],
            }
        )
        self.cleanup_artifacts()

    def get_job(self, batch_id: str) -> ConversionJob:
        job = self.jobs.get(batch_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")
        return job

    def resolve_output_file(self, batch_id: str, file_id: str) -> dict[str, str]:
        job = self.jobs.get(batch_id)
        if not job or not job.results:
            raise HTTPException(status_code=404, detail="Job not ready.")

        for result in job.results:
            if result.get("status") != "success":
                continue

            output = str(result.get("output", ""))
            if file_id in output:
                path = Path(output)
                if path.exists():
                    return {
                        "kind": "local",
                        "path": str(path),
                        "filename": path.name,
                    }

        extensions = [".pdf", ".docx", ".txt", ".png", ".jpg", ".webp"]
        for ext in extensions:
            candidate = self.output_dir / f"{file_id}{ext}"
            if candidate.exists():
                return {
                    "kind": "local",
                    "path": str(candidate),
                    "filename": candidate.name,
                }

        raise HTTPException(status_code=404, detail="Output file not found.")

    def resolve_output_by_filename(self, filename: str) -> dict[str, str]:
        path = self.output_dir / filename
        if not path.exists():
            raise HTTPException(status_code=404, detail="File not found.")
        return {
            "kind": "local",
            "path": str(path),
            "filename": filename,
        }

    def clear_history(self):
        self.history_file.write_text("[]")
