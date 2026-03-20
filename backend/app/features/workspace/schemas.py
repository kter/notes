from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

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


class WorkspaceChangeRequest(BaseModel):
    """One requested workspace mutation."""

    entity: Literal["folder", "note"]
    operation: Literal["create", "update", "delete"]
    entity_id: UUID | None = None
    client_mutation_id: str | None = None
    expected_version: int | None = Field(default=None, ge=1)
    payload: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_shape(self) -> "WorkspaceChangeRequest":
        if self.operation in {"update", "delete"} and self.entity_id is None:
            raise ValueError("entity_id is required for update and delete operations")
        if self.operation == "delete" and self.payload:
            raise ValueError("delete operations do not accept payload")
        if self.operation in {"create", "update"} and not self.payload:
            raise ValueError("create and update operations require payload")
        return self


class WorkspaceChangesRequest(BaseModel):
    """Batch workspace mutations sent by sync-aware clients."""

    device_id: str | None = None
    base_cursor: str | None = None
    changes: list[WorkspaceChangeRequest]


class WorkspaceAppliedChange(BaseModel):
    """One mutation result returned to the client."""

    entity: Literal["folder", "note"]
    operation: Literal["create", "update", "delete"]
    entity_id: UUID
    client_mutation_id: str | None = None
    folder: FolderRead | None = None
    note: NoteRead | None = None


class WorkspaceChangesResponse(BaseModel):
    """Batch mutation results followed by an updated snapshot."""

    applied: list[WorkspaceAppliedChange]
    snapshot: WorkspaceSnapshotResponse
