from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

from sqlalchemy.exc import OperationalError

from app.auth.dependencies import get_current_app_user
from app.models import AppUser


def test_get_current_app_user_returns_existing_user_after_retryable_commit_conflict():
    session = Mock()
    existing_user = AppUser(
        user_id="user-123",
        email="user@example.com",
        display_name="User Example",
        admin=False,
        last_seen_at=datetime.now(UTC),
    )
    session.get.side_effect = [None, existing_user]
    session.commit.side_effect = [
        OperationalError(
            "INSERT INTO app_users ...",
            {},
            Exception("change conflicts with another transaction, please retry: (OC000)"),
        )
    ]

    result = get_current_app_user(
        current_user={
            "sub": "user-123",
            "email": "user@example.com",
            "name": "User Example",
        },
        session=session,
    )

    assert result is existing_user
    session.rollback.assert_called_once()


def test_get_current_app_user_skips_commit_when_touch_interval_has_not_elapsed():
    now = datetime.now(UTC)
    app_user = AppUser(
        user_id="user-123",
        email="user@example.com",
        display_name="User Example",
        admin=False,
        last_seen_at=now - timedelta(minutes=5),
    )
    session = Mock()
    session.get.return_value = app_user

    result = get_current_app_user(
        current_user={
            "sub": "user-123",
            "email": "user@example.com",
            "name": "User Example",
        },
        session=session,
    )

    assert result is app_user
    session.commit.assert_not_called()
