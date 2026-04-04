from fastapi import APIRouter, BackgroundTasks, File, UploadFile
from fastapi.responses import FileResponse
from typing import Any

from app.services import conversion_service


router = APIRouter()


@router.get("/")
async def root():
    return {"status": "ok", "service": "ExtConvert API v1.0.0"}


@router.get("/api/formats")
async def get_supported_formats() -> dict[str, Any]:
    return conversion_service.supported_formats()


@router.post("/api/convert/batch")
async def convert_batch(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    target_format: str = "pdf",
) -> dict[str, Any]:
    result = await conversion_service.create_batch_job(files, target_format)
    background_tasks.add_task(conversion_service.run_batch, str(result["batch_id"]))
    return result


@router.get("/api/jobs/{batch_id}")
async def get_job_status(batch_id: str):
    return conversion_service.get_job(batch_id)


@router.get("/api/jobs/{batch_id}/download/{file_id}")
async def download_file(batch_id: str, file_id: str):
    download = conversion_service.resolve_output_file(batch_id, file_id)
    return FileResponse(
        path=download["path"],
        filename=download["filename"],
        media_type="application/octet-stream",
    )


@router.get("/api/download/{filename}")
async def download_by_name(filename: str):
    download = conversion_service.resolve_output_by_filename(filename)
    return FileResponse(
        download["path"],
        filename=download["filename"],
        media_type="application/octet-stream",
    )


@router.get("/api/history")
async def get_history(limit: int = 50) -> list[dict[str, Any]]:
    return conversion_service.load_history()[:limit]


@router.delete("/api/history")
async def clear_history():
    conversion_service.clear_history()
    return {"message": "History cleared."}


@router.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "status": "healthy",
        "active_jobs": len(conversion_service.jobs),
        "upload_dir": str(conversion_service.upload_dir),
        "output_dir": str(conversion_service.output_dir),
        "storage_backend": conversion_service.storage_backend,
        "upload_ttl_hours": conversion_service.upload_ttl_hours,
        "output_ttl_hours": conversion_service.output_ttl_hours,
    }
