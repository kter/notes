"""Unit tests for token usage limit checking logic.

The 429 rate-limit behaviour cannot easily be exercised through the real API
(the monthly limit is 1,000,000 tokens), so these unit tests mock the database
session to drive check_limit into both the under-limit and over-limit code paths
and verify the AI router raises the correct HTTPException.
"""

import unittest
from unittest.mock import MagicMock

from fastapi import HTTPException

from app.features.assistant.router import _check_token_limit
from app.features.assistant.token_usage_service import check_limit
from app.models.token_usage import MONTHLY_TOKEN_LIMIT, TokenUsage


def _make_session(tokens_used: int) -> MagicMock:
    """Return a mock SQLModel Session whose exec().first() yields a TokenUsage
    with the given tokens_used value.

    session.get() returns None to simulate a user with no custom UserSettings,
    so _get_user_token_limit falls back to MONTHLY_TOKEN_LIMIT.
    """
    mock_usage = MagicMock(spec=TokenUsage)
    mock_usage.tokens_used = tokens_used

    mock_session = MagicMock()
    mock_session.exec.return_value.first.return_value = mock_usage
    mock_session.get.return_value = None  # No custom UserSettings
    return mock_session


class TestCheckLimit(unittest.TestCase):
    """Tests for app.features.assistant.token_usage_service.check_limit."""

    def test_zero_usage_is_within_limit(self):
        session = _make_session(0)
        self.assertTrue(check_limit(session, "user-a"))

    def test_usage_well_below_limit_is_within_limit(self):
        session = _make_session(MONTHLY_TOKEN_LIMIT // 2)
        self.assertTrue(check_limit(session, "user-a"))

    def test_usage_one_below_limit_is_within_limit(self):
        session = _make_session(MONTHLY_TOKEN_LIMIT - 1)
        self.assertTrue(check_limit(session, "user-a"))

    def test_usage_exactly_at_limit_exceeds_limit(self):
        """tokens_used == MONTHLY_TOKEN_LIMIT must be treated as exceeded."""
        session = _make_session(MONTHLY_TOKEN_LIMIT)
        self.assertFalse(check_limit(session, "user-a"))

    def test_usage_above_limit_exceeds_limit(self):
        session = _make_session(MONTHLY_TOKEN_LIMIT + 1)
        self.assertFalse(check_limit(session, "user-a"))


class TestCheckTokenLimitRouter(unittest.TestCase):
    """Tests for the _check_token_limit helper in app.features.assistant.router.

    This verifies that the router raises HTTP 429 when check_limit returns False
    and does nothing when check_limit returns True.
    """

    def test_raises_429_when_limit_exceeded(self):
        session = _make_session(MONTHLY_TOKEN_LIMIT)
        with self.assertRaises(HTTPException) as ctx:
            _check_token_limit(session, "user-b")
        self.assertEqual(ctx.exception.status_code, 429)

    def test_no_exception_when_within_limit(self):
        session = _make_session(0)
        # Should not raise
        _check_token_limit(session, "user-b")
