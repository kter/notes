from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import OperationalError

from app.db_commit import commit_with_error_handling, commit_with_retry


def test_commit_with_retry_returns_recovered_resource_on_retryable_conflict():
    session = Mock()
    recovered = object()
    session.commit.side_effect = [
        OperationalError(
            "UPDATE app_users ...",
            {},
            Exception("change conflicts with another transaction, please retry: (OC000)"),
        )
    ]

    result = commit_with_retry(
        session,
        max_retries=3,
        recovery=lambda: recovered,
    )

    assert result is recovered
    session.rollback.assert_called_once()


def test_commit_with_error_handling_maps_retryable_conflict_to_http_409():
    session = Mock()
    session.commit.side_effect = OperationalError(
        "UPDATE notes ...",
        {},
        Exception("change conflicts with another transaction, please retry: (OC000)"),
    )

    with pytest.raises(HTTPException, match="Concurrent update conflict"):
        commit_with_error_handling(session, "Note", max_retries=1)
