from datetime import UTC, datetime

from pydantic import BaseModel, field_validator

from app.models import FolderRead, NoteRead


class WorkspaceSnapshotResponse(BaseModel):
    """Bootstrap snapshot returned to sync-aware workspace clients."""

    folders: list[FolderRead]
    notes: list[NoteRead]
    cursor: str
    server_time: datetime

    @field_validator("server_time", mode="before")
    @classmethod
    def ensure_utc_timezone(cls, value: datetime) -> datetime:
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value
