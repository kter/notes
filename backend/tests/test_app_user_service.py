from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sqlalchemy.exc import OperationalError

from app.auth.app_user_service import AppUserService
from app.models import AppUser


def make_settings(**overrides):
    return SimpleNamespace(
        environment=overrides.get("environment", "prd"),
        bootstrap_admin_user_id_list=overrides.get("bootstrap_admin_user_id_list", []),
        bootstrap_admin_email_list=overrides.get("bootstrap_admin_email_list", []),
    )


def test_ensure_app_user_returns_existing_user_after_retryable_commit_conflict():
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
            Exception(
                "change conflicts with another transaction, please retry: (OC000)"
            ),
        )
    ]

    service = AppUserService(session, settings=make_settings())
    result = service.ensure_app_user(
        {
            "sub": "user-123",
            "email": "user@example.com",
            "name": "User Example",
        }
    )

    assert result is existing_user
    session.rollback.assert_called_once()


def test_ensure_app_user_skips_commit_when_touch_interval_has_not_elapsed():
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

    service = AppUserService(session, settings=make_settings())
    result = service.ensure_app_user(
        {
            "sub": "user-123",
            "email": "user@example.com",
            "name": "User Example",
        }
    )

    assert result is app_user
    session.commit.assert_not_called()


def test_ensure_app_user_bootstraps_admin_from_configured_email():
    session = Mock()
    session.get.return_value = None

    service = AppUserService(
        session,
        settings=make_settings(
            bootstrap_admin_email_list=["admin@example.com"],
        ),
    )
    result = service.ensure_app_user(
        {
            "sub": "user-123",
            "email": "Admin@Example.com",
            "name": "Admin User",
        }
    )

    assert result.admin is True
    session.add.assert_called_once()
    session.refresh.assert_called_once_with(result)


def test_ensure_app_user_updates_profile_fields_and_touches_last_seen():
    stale_time = datetime.now(UTC) - timedelta(hours=1)
    app_user = AppUser(
        user_id="user-123",
        email="old@example.com",
        display_name="Old Name",
        admin=False,
        last_seen_at=stale_time,
    )
    session = Mock()
    session.get.return_value = app_user

    service = AppUserService(session, settings=make_settings())
    result = service.ensure_app_user(
        {
            "sub": "user-123",
            "email": "new@example.com",
            "name": "New Name",
        }
    )

    assert result.email == "new@example.com"
    assert result.display_name == "New Name"
    assert result.last_seen_at > stale_time
    session.commit.assert_called_once()


def test_should_bootstrap_admin_allows_dev_integration_users():
    service = AppUserService(
        session=Mock(),
        settings=make_settings(environment="dev"),
    )

    assert (
        service.should_bootstrap_admin({"sub": "integration-test-user-id-123"}) is True
    )


def test_get_current_app_user_rejects_missing_subject():
    from app.auth.dependencies import get_current_app_user

    with pytest.raises(Exception) as exc_info:
        get_current_app_user(current_user={}, session=Mock())

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Missing user subject"
