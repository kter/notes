from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class NoteBase(SQLModel):
    """Base Note schema."""

    title: str = Field(max_length=255, default="")
    content: str = Field(default="")


class Note(NoteBase, table=True):
    """Note database model."""

    __tablename__ = "notes"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field(index=True)  # Cognito user sub
    folder_id: UUID | None = Field(default=None, index=True)  # Logical FK, no constraint
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


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
