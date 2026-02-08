"""NoteShare model for sharing notes publicly."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import field_validator
from sqlmodel import Field, SQLModel


class NoteShareBase(SQLModel):
    """Base NoteShare schema."""

    pass


class NoteShare(NoteShareBase, table=True):
    """NoteShare database model - stores share tokens for public access."""

    __tablename__ = "note_shares"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    note_id: UUID = Field()  # Reference to the note being shared
    share_token: UUID = Field(default_factory=uuid4)  # UUID is practically unique, no index for DSQL compat
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime | None = Field(default=None)  # Optional expiration


class NoteShareCreate(SQLModel):
    """Schema for creating a note share - no fields needed, token is auto-generated."""

    pass


class NoteShareRead(SQLModel):
    """Schema for reading a note share."""

    id: UUID
    note_id: UUID
    share_token: UUID
    created_at: datetime
    expires_at: datetime | None

    @field_validator("created_at", mode="before")
    @classmethod
    def ensure_utc_timezone(cls, v: datetime) -> datetime:
        """Ensure datetime has UTC timezone info for proper JSON serialization."""
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v


class SharedNoteRead(SQLModel):
    """Schema for reading a shared note (public, limited fields)."""

    title: str
    content: str
    updated_at: datetime

    @field_validator("updated_at", mode="before")
    @classmethod
    def ensure_utc_timezone(cls, v: datetime) -> datetime:
        """Ensure datetime has UTC timezone info for proper JSON serialization."""
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v
