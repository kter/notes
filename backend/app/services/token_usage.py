"""Token usage tracking service."""

import logging
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.models.token_usage import (
    MONTHLY_TOKEN_LIMIT,
    TokenUsage,
    TokenUsageRead,
    _get_period_end,
    _get_period_start,
)
from app.models.user_settings import UserSettings
from app.routers.db_exceptions import commit_with_error_handling

logger = logging.getLogger(__name__)


def get_or_create_current_period(session: Session, user_id: str) -> TokenUsage:
    """Get or create the token usage record for the current monthly period."""
    period_start = _get_period_start()

    # Find existing record for current period
    statement = select(TokenUsage).where(
        TokenUsage.user_id == user_id,
        TokenUsage.period_start == period_start,
    )
    usage = session.exec(statement).first()

    if usage is None:
        # Create new period record
        usage = TokenUsage(
            user_id=user_id,
            tokens_used=0,
            period_start=period_start,
            period_end=_get_period_end(),
        )
        session.add(usage)
        commit_with_error_handling(session, "TokenUsage")
        session.refresh(usage)
        logger.info(f"Created new token usage period for user {user_id}: {period_start}")

    return usage


def get_current_period_usage(session: Session, user_id: str) -> TokenUsage | None:
    """Get the token usage record for the current period without creating it."""
    period_start = _get_period_start()
    statement = select(TokenUsage).where(
        TokenUsage.user_id == user_id,
        TokenUsage.period_start == period_start,
    )
    return session.exec(statement).first()


def _get_user_token_limit(session: Session, user_id: str) -> int:
    """Get the per-user token limit from UserSettings, falling back to the global default."""
    settings = session.get(UserSettings, user_id)
    if settings is not None:
        return settings.token_limit
    return MONTHLY_TOKEN_LIMIT


def check_limit(session: Session, user_id: str) -> bool:
    """Check if the user has exceeded their monthly token limit.

    Returns:
        True if the user is within the limit, False if exceeded.
    """
    usage = get_or_create_current_period(session, user_id)
    return usage.tokens_used < _get_user_token_limit(session, user_id)


def record_usage(session: Session, user_id: str, tokens: int) -> TokenUsage:
    """Record token usage for the current period.

    Args:
        session: Database session
        user_id: User ID
        tokens: Number of tokens to add

    Returns:
        Updated TokenUsage record
    """
    usage = get_or_create_current_period(session, user_id)
    usage.tokens_used += tokens
    usage.updated_at = datetime.now(UTC)
    session.add(usage)
    commit_with_error_handling(session, "TokenUsage")
    session.refresh(usage)
    logger.info(f"Recorded {tokens} tokens for user {user_id}. Total: {usage.tokens_used}/{MONTHLY_TOKEN_LIMIT}")
    return usage


def get_usage_info(session: Session, user_id: str) -> TokenUsageRead:
    """Get current token usage information for a user.

    Returns:
        TokenUsageRead with usage info, limit, and reset date
    """
    usage = get_or_create_current_period(session, user_id)
    return TokenUsageRead(
        tokens_used=usage.tokens_used,
        token_limit=_get_user_token_limit(session, user_id),
        period_start=usage.period_start,
        period_end=usage.period_end,
    )


def get_usage_snapshot(session: Session, user_id: str) -> TokenUsageRead:
    """Get current usage information without creating a usage record."""
    usage = get_current_period_usage(session, user_id)
    return TokenUsageRead(
        tokens_used=usage.tokens_used if usage else 0,
        token_limit=_get_user_token_limit(session, user_id),
        period_start=usage.period_start if usage else _get_period_start(),
        period_end=usage.period_end if usage else _get_period_end(),
    )
