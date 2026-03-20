from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import field_validator
from sqlmodel import Field, SQLModel


class FolderBase(SQLModel):
    """Base Folder schema."""

    name: str = Field(max_length=255)


class Folder(FolderBase, table=True):
    """Folder database model."""

    __tablename__ = "folders"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()  # Cognito user sub (no index for DSQL compatibility)
    version: int = Field(default=1)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    deleted_at: datetime | None = Field(default=None)


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
    version: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

    @field_validator("created_at", "updated_at", "deleted_at", mode="before")
    @classmethod
    def ensure_utc_timezone(cls, v: datetime | None) -> datetime | None:
        """Ensure datetime has UTC timezone info for proper JSON serialization."""
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v
