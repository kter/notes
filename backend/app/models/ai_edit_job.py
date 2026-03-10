from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import field_validator
from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel

AIEditJobStatus = Literal["pending", "running", "completed", "failed"]


class AIEditJob(SQLModel, table=True):
    """Asynchronous AI edit job persisted for polling."""

    __tablename__ = "ai_edit_jobs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()
    note_id: UUID | None = Field(default=None)
    content: str = Field(default="", sa_column=Column(Text))
    instruction: str = Field(default="", sa_column=Column(Text))
    status: str = Field(default="pending", max_length=32)
    edited_content: str | None = Field(default=None, sa_column=Column(Text))
    error_message: str | None = Field(default=None, sa_column=Column(Text))
    tokens_used: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    started_at: datetime | None = Field(default=None)
    completed_at: datetime | None = Field(default=None)


class AIEditJobCreate(SQLModel):
    """Request schema for creating an AI edit job."""

    content: str
    instruction: str
    note_id: UUID | None = None


class AIEditJobRead(SQLModel):
    """Response schema for reading an AI edit job."""

    id: UUID
    note_id: UUID | None
    status: AIEditJobStatus
    edited_content: str | None = None
    error_message: str | None = None
    tokens_used: int = 0
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None

    @field_validator("created_at", "updated_at", "started_at", "completed_at", mode="before")
    @classmethod
    def ensure_utc_timezone(cls, value: datetime | None) -> datetime | None:
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value
