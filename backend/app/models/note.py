from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import field_validator
from sqlmodel import Field, SQLModel


class NoteBase(SQLModel):
    """Base Note schema."""

    title: str = Field(max_length=255, default="")
    content: str = Field(default="")


class Note(NoteBase, table=True):
    """Note database model."""

    __tablename__ = "notes"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()  # Cognito user sub (no index for DSQL compatibility)
    folder_id: UUID | None = Field(
        default=None
    )  # Logical FK, no constraint (no index for DSQL)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class NoteCreate(NoteBase):
    """Schema for creating a note."""

    folder_id: UUID | None = None


class NoteUpdate(SQLModel):
    """Schema for updating a note."""

    title: str | None = None
    content: str | None = None
    folder_id: UUID | None = None


class NoteRead(NoteBase):
    """Schema for reading a note."""

    id: UUID
    user_id: str
    folder_id: UUID | None
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def ensure_utc_timezone(cls, v: datetime) -> datetime:
        """Ensure datetime has UTC timezone info for proper JSON serialization."""
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v
