from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel

# Monthly token limit per user
MONTHLY_TOKEN_LIMIT = 30_000


def _get_period_start() -> datetime:
    """Get the start of the current monthly period (1st of current month, UTC)."""
    now = datetime.now(UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _get_period_end() -> datetime:
    """Get the end of the current monthly period (1st of next month, UTC)."""
    now = datetime.now(UTC)
    if now.month == 12:
        return now.replace(
            year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0
        )
    return now.replace(
        month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0
    )


class TokenUsage(SQLModel, table=True):
    """Monthly token usage tracking per user."""

    __tablename__ = "token_usage"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()  # Cognito user sub (no index for DSQL compatibility)
    tokens_used: int = Field(default=0)
    period_start: datetime = Field(default_factory=_get_period_start)
    period_end: datetime = Field(default_factory=_get_period_end)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TokenUsageRead(SQLModel):
    """Schema for reading token usage info."""

    tokens_used: int
    token_limit: int
    period_start: datetime
    period_end: datetime
