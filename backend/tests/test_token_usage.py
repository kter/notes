"""Tests for token usage tracking and limit enforcement."""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.main import app
from app.models import Note
from app.models.token_usage import MONTHLY_TOKEN_LIMIT, TokenUsage
from app.services import AIService, get_ai_service
from app.services.token_usage import (
    check_limit,
    get_or_create_current_period,
    get_usage_info,
    record_usage,
)
from tests.conftest import TEST_USER_ID


# Mock AI Service that returns token counts
class MockAIServiceWithTokens(AIService):
    async def summarize(
        self, content: str, model_id: str | None = None, language: str = "auto"
    ) -> tuple[str, int]:
        return f"Summary: {content[:10]}...", 150

    async def chat(
        self,
        content: str,
        question: str,
        history: list[dict] | None = None,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        return f"Answer for '{question}' based on {len(content)} chars", 200

    async def edit(
        self,
        content: str,
        instruction: str,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        return f"Edited: {content}", 100


@pytest.fixture
def mock_ai_service():
    service = MockAIServiceWithTokens()
    app.dependency_overrides[get_ai_service] = lambda: service
    yield service
    app.dependency_overrides.pop(get_ai_service, None)


class TestTokenUsageService:
    """Tests for the token usage service functions."""

    def test_get_or_create_current_period(self, session: Session):
        """Test creating a new token usage period."""
        usage = get_or_create_current_period(session, TEST_USER_ID)

        assert usage.user_id == TEST_USER_ID
        assert usage.tokens_used == 0
        assert usage.period_start.day == 1

    def test_get_or_create_existing_period(self, session: Session):
        """Test getting an existing token usage period."""
        # Create first
        usage1 = get_or_create_current_period(session, TEST_USER_ID)
        usage1_id = usage1.id

        # Get again - should return same record
        usage2 = get_or_create_current_period(session, TEST_USER_ID)
        assert usage2.id == usage1_id

    def test_record_usage(self, session: Session):
        """Test recording token usage."""
        usage = record_usage(session, TEST_USER_ID, 100)
        assert usage.tokens_used == 100

        # Record more
        usage = record_usage(session, TEST_USER_ID, 50)
        assert usage.tokens_used == 150

    def test_check_limit_within(self, session: Session):
        """Test check_limit returns True when within limit."""
        assert check_limit(session, TEST_USER_ID) is True

    def test_check_limit_exceeded(self, session: Session):
        """Test check_limit returns False when at or over limit."""
        usage = get_or_create_current_period(session, TEST_USER_ID)
        usage.tokens_used = MONTHLY_TOKEN_LIMIT
        session.add(usage)
        session.commit()

        assert check_limit(session, TEST_USER_ID) is False

    def test_get_usage_info(self, session: Session):
        """Test get_usage_info returns correct data."""
        record_usage(session, TEST_USER_ID, 500)
        info = get_usage_info(session, TEST_USER_ID)

        assert info.tokens_used == 500
        assert info.token_limit == MONTHLY_TOKEN_LIMIT
        assert info.period_start.day == 1
        assert info.period_end.day == 1

    def test_user_isolation(self, session: Session):
        """Test that token usage is isolated per user."""
        record_usage(session, "user-a", 100)
        record_usage(session, "user-b", 200)

        info_a = get_usage_info(session, "user-a")
        info_b = get_usage_info(session, "user-b")

        assert info_a.tokens_used == 100
        assert info_b.tokens_used == 200

    def test_period_boundaries(self, session: Session):
        """Test that different periods get different records."""
        # Create a record for current period
        usage = get_or_create_current_period(session, TEST_USER_ID)
        usage.tokens_used = 500
        session.add(usage)
        session.commit()

        # Create a record for a different period (mock period_start)
        past_usage = TokenUsage(
            user_id=TEST_USER_ID,
            tokens_used=999,
            period_start=datetime(2025, 1, 1, tzinfo=UTC),
            period_end=datetime(2025, 2, 1, tzinfo=UTC),
        )
        session.add(past_usage)
        session.commit()

        # Current period should still show 500
        info = get_usage_info(session, TEST_USER_ID)
        assert info.tokens_used == 500


class TestTokenLimitInAIEndpoints:
    """Tests for token limit enforcement in AI endpoints."""

    def test_summarize_records_tokens(
        self, client: TestClient, session: Session, mock_ai_service
    ):
        """Test that summarize endpoint records token usage."""
        note = Note(title="Test Note", content="Test Content", user_id=TEST_USER_ID)
        session.add(note)
        session.commit()

        response = client.post("/api/ai/summarize", json={"note_id": str(note.id)})
        assert response.status_code == 200
        data = response.json()
        assert data["tokens_used"] == 150

        # Check usage was recorded
        info = get_usage_info(session, TEST_USER_ID)
        assert info.tokens_used == 150

    def test_chat_records_tokens(
        self, client: TestClient, session: Session, mock_ai_service
    ):
        """Test that chat endpoint records token usage."""
        note = Note(title="Test Note", content="Test Content", user_id=TEST_USER_ID)
        session.add(note)
        session.commit()

        response = client.post(
            "/api/ai/chat",
            json={
                "scope": "note",
                "note_id": str(note.id),
                "question": "What is this?",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["tokens_used"] == 200

        info = get_usage_info(session, TEST_USER_ID)
        assert info.tokens_used == 200

    def test_summarize_limit_exceeded(
        self, client: TestClient, session: Session, mock_ai_service
    ):
        """Test that summarize returns 429 when limit is exceeded."""
        note = Note(title="Test Note", content="Test Content", user_id=TEST_USER_ID)
        session.add(note)
        session.commit()

        # Exhaust the limit
        usage = get_or_create_current_period(session, TEST_USER_ID)
        usage.tokens_used = MONTHLY_TOKEN_LIMIT
        session.add(usage)
        session.commit()

        response = client.post("/api/ai/summarize", json={"note_id": str(note.id)})
        assert response.status_code == 429
        assert "token limit" in response.json()["detail"].lower()

    def test_chat_limit_exceeded(
        self, client: TestClient, session: Session, mock_ai_service
    ):
        """Test that chat returns 429 when limit is exceeded."""
        note = Note(title="Test Note", content="Test Content", user_id=TEST_USER_ID)
        session.add(note)
        session.commit()

        # Exhaust the limit
        usage = get_or_create_current_period(session, TEST_USER_ID)
        usage.tokens_used = MONTHLY_TOKEN_LIMIT
        session.add(usage)
        session.commit()

        response = client.post(
            "/api/ai/chat",
            json={
                "scope": "note",
                "note_id": str(note.id),
                "question": "What is this?",
            },
        )
        assert response.status_code == 429

    def test_token_usage_accumulates(
        self, client: TestClient, session: Session, mock_ai_service
    ):
        """Test that token usage accumulates across multiple requests."""
        note = Note(title="Test Note", content="Test Content", user_id=TEST_USER_ID)
        session.add(note)
        session.commit()

        # First request
        client.post("/api/ai/summarize", json={"note_id": str(note.id)})
        # Second request
        client.post(
            "/api/ai/chat",
            json={
                "scope": "note",
                "note_id": str(note.id),
                "question": "What?",
            },
        )

        info = get_usage_info(session, TEST_USER_ID)
        assert info.tokens_used == 350  # 150 + 200


class TestTokenUsageInSettings:
    """Tests for token usage info in settings response."""

    def test_settings_includes_token_usage(self, client: TestClient, session: Session):
        """Test that GET /api/settings includes token_usage."""
        response = client.get("/api/settings")
        assert response.status_code == 200
        data = response.json()

        assert "token_usage" in data
        token_usage = data["token_usage"]
        assert "tokens_used" in token_usage
        assert "token_limit" in token_usage
        assert "period_start" in token_usage
        assert "period_end" in token_usage
        assert token_usage["tokens_used"] == 0
        assert token_usage["token_limit"] == MONTHLY_TOKEN_LIMIT

    def test_settings_reflects_usage(
        self, client: TestClient, session: Session, mock_ai_service
    ):
        """Test that settings token_usage reflects actual usage."""
        note = Note(title="Test Note", content="Test Content", user_id=TEST_USER_ID)
        session.add(note)
        session.commit()

        # Make an AI call
        client.post("/api/ai/summarize", json={"note_id": str(note.id)})

        # Check settings
        response = client.get("/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert data["token_usage"]["tokens_used"] == 150
