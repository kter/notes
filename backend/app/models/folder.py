from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class FolderBase(SQLModel):
    """Base Folder schema."""

    name: str = Field(max_length=255)


class Folder(FolderBase, table=True):
    """Folder database model."""

    __tablename__ = "folders"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()  # Cognito user sub (no index for DSQL compatibility)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class FolderCreate(FolderBase):
    """Schema for creating a folder."""

    pass


class FolderUpdate(SQLModel):
    """Schema for updating a folder."""

    name: str | None = None


class FolderRead(FolderBase):
    """Schema for reading a folder."""

    id: UUID
    user_id: str
    created_at: datetime
    updated_at: datetime
