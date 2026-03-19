"""Unit tests for token usage limit checking logic."""

import unittest
from unittest.mock import MagicMock

from app.features.assistant.errors import AITokenLimitExceededError
from app.features.assistant.usage_policy import check_limit
from app.features.assistant.use_cases.common import ensure_token_limit
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
    """Tests for app.features.assistant.usage_policy.check_limit."""

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


class TestEnsureTokenLimit(unittest.TestCase):
    """Tests for the assistant token limit policy helper."""

    def test_raises_domain_error_when_limit_exceeded(self):
        session = _make_session(MONTHLY_TOKEN_LIMIT)
        with self.assertRaises(AITokenLimitExceededError):
            ensure_token_limit(session, "user-b")

    def test_no_exception_when_within_limit(self):
        session = _make_session(0)
        # Should not raise
        ensure_token_limit(session, "user-b")
