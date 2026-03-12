from datetime import UTC, datetime, timedelta

from pydantic import field_validator
from sqlmodel import Field, SQLModel

APP_USER_TOUCH_INTERVAL = timedelta(minutes=30)


class AppUserBase(SQLModel):
    """Base schema for application-managed user metadata."""

    email: str | None = Field(default=None, max_length=320)
    display_name: str | None = Field(default=None, max_length=255)
    admin: bool = Field(default=False)


class AppUser(AppUserBase, table=True):
    """Application-side user profile keyed by Cognito subject."""

    __tablename__ = "app_users"

    user_id: str = Field(primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_seen_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AppUserRead(AppUserBase):
    """Read schema for application users."""

    user_id: str
    created_at: datetime
    updated_at: datetime
    last_seen_at: datetime

    @field_validator("created_at", "updated_at", "last_seen_at", mode="before")
    @classmethod
    def ensure_utc_timezone(cls, value: datetime) -> datetime:
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value
