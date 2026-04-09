from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import field_validator
from sqlmodel import Field, SQLModel


class UserApiKeyBase(SQLModel):
    """Shared API key fields."""

    name: str = Field(min_length=1, max_length=255)


class UserApiKey(UserApiKeyBase, table=True):
    """Stored API key metadata for an application user."""

    __tablename__ = "user_api_keys"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()
    token_hash: str = Field(max_length=64)
    token_prefix: str = Field(max_length=32)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_used_at: datetime | None = Field(default=None)
    revoked_at: datetime | None = Field(default=None)


class UserApiKeyCreate(UserApiKeyBase):
    """Request schema for creating a user API key."""


class UserApiKeyRead(UserApiKeyBase):
    """Response schema for API key metadata."""

    id: UUID
    user_id: str
    token_prefix: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None

    @field_validator("created_at", "last_used_at", "revoked_at", mode="before")
    @classmethod
    def ensure_utc_timezone(cls, value: datetime | None) -> datetime | None:
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class UserApiKeyCreateResponse(SQLModel):
    """Response schema returned once when a new API key is created."""

    api_key: UserApiKeyRead
    token_plain: str
