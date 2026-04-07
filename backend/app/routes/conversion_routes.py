from fastapi import APIRouter, BackgroundTasks, File, Form, UploadFile, HTTPException
from fastapi.responses import RedirectResponse, StreamingResponse
from typing import Any

MAX_FILE_SIZE = 100 * 1024 * 1024

from backend.app.services import conversion_service


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
    file_ids: list[str] | None = Form(default=None),
    target_format: str = "pdf",
) -> dict[str, Any]:
    for file in files:
        if getattr(file, "size", 0) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File '{file.filename}' exceeds the maximum allowed size of 100MB."
            )
            
    result = await conversion_service.create_batch_job(files, target_format, file_ids=file_ids)
    background_tasks.add_task(conversion_service.run_batch, str(result["batch_id"]))
    return result


@router.get("/api/jobs/{batch_id}")
async def get_job_status(batch_id: str):
    return conversion_service.get_job(batch_id)


@router.get("/api/jobs/{batch_id}/stream")
async def stream_job_status(batch_id: str):
    return StreamingResponse(
        conversion_service.stream_job_progress(batch_id),
        media_type="text/event-stream"
    )


@router.get("/api/jobs/{batch_id}/download/{file_id}")
async def download_file(batch_id: str, file_id: str):
    download = conversion_service.resolve_output_file(batch_id, file_id)
    return RedirectResponse(url=download["url"], status_code=307)


@router.head("/api/jobs/{batch_id}/download/{file_id}")
async def download_file_head(batch_id: str, file_id: str):
    download = conversion_service.resolve_output_file(batch_id, file_id)
    return RedirectResponse(url=download["url"], status_code=307)


@router.get("/api/download/{filename}")
async def download_by_name(filename: str):
    download = conversion_service.resolve_output_by_filename(filename)
    return RedirectResponse(url=download["url"], status_code=307)


@router.head("/api/download/{filename}")
async def download_by_name_head(filename: str):
    download = conversion_service.resolve_output_by_filename(filename)
    return RedirectResponse(url=download["url"], status_code=307)


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
        "active_jobs": conversion_service.count_active_jobs(),
        "upload_dir": str(conversion_service.upload_dir),
        "output_dir": str(conversion_service.output_dir),
        "storage_backend": conversion_service.storage_backend,
        "upload_ttl_hours": conversion_service.upload_ttl_hours,
        "output_ttl_hours": conversion_service.output_ttl_hours,
    }
