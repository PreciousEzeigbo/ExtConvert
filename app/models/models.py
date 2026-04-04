from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


def _dict_list_default() -> list[dict[str, Any]]:
    return []


class ConversionStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    PARTIAL = "partial"
    FAILED = "failed"


class ConversionJob(BaseModel):
    batch_id: str
    status: ConversionStatus
    total: int
    completed: int
    failed: int
    files: list[dict[str, Any]] = Field(default_factory=_dict_list_default)
    results: list[dict[str, Any]] = Field(default_factory=_dict_list_default)
    created_at: str
    finished_at: Optional[str] = None
    target_format: str

    @property
    def progress(self) -> float:
        if self.total == 0:
            return 0.0
        return round((self.completed + self.failed) / self.total * 100, 1)


class HistoryEntry(BaseModel):
    batch_id: str
    target_format: str
    total: int
    completed: int
    failed: int
    created_at: str
    finished_at: Optional[str] = None
    status: str
    files: list[dict[str, Any]] = Field(default_factory=_dict_list_default)