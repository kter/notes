import asyncio
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.main import app
from app.models import AIEditJob, Folder, Note
from app.services import AIService, AIServiceTimeoutError, get_ai_service
from app.services.edit_jobs import process_edit_job


# Mock AI Service
class MockAIService(AIService):
    async def summarize(
        self, content: str, model_id: str | None = None, language: str = "auto"
    ) -> tuple[str, int]:
        return f"Summary: {content[:10]}...", 20

    async def chat(
        self,
        content: str,
        question: str,
        history: list[dict] | None = None,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        return f"Answer for '{question}' based on {len(content)} chars", 20

    async def edit(
        self,
        content: str,
        instruction: str,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        return f"Edited: {content}", 30


@pytest.fixture
def mock_ai_service():
    service = MockAIService()
    app.dependency_overrides[get_ai_service] = lambda: service
    yield service
    app.dependency_overrides.pop(get_ai_service, None)


def test_summarize_note(client: TestClient, session: Session, mock_ai_service):
    # Setup test data
    user_id = "test-user-123"
    note = Note(title="Test Note", content="Test Content", user_id=user_id)
    session.add(note)
    session.commit()

    response = client.post("/api/ai/summarize", json={"note_id": str(note.id)})
    assert response.status_code == 200
    assert response.json()["summary"] == "Summary: Test Conte..."


def test_summarize_empty_note(client: TestClient, session: Session, mock_ai_service):
    user_id = "test-user-123"
    note = Note(title="Empty Note", content="  ", user_id=user_id)
    session.add(note)
    session.commit()

    response = client.post("/api/ai/summarize", json={"note_id": str(note.id)})
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_summarize_unowned_note(make_client, session: Session, mock_ai_service):
    other_user_id = "other-user"
    note = Note(title="Other's Note", content="Secret content", user_id=other_user_id)
    session.add(note)
    session.commit()

    client = make_client("test-user-123")
    response = client.post("/api/ai/summarize", json={"note_id": str(note.id)})
    assert response.status_code == 404


def test_chat_note_scope(client: TestClient, session: Session, mock_ai_service):
    user_id = "test-user-123"
    note = Note(title="Test Note", content="Sample content for chat", user_id=user_id)
    session.add(note)
    session.commit()

    response = client.post(
        "/api/ai/chat",
        json={
            "scope": "note",
            "note_id": str(note.id),
            "question": "What is in the note?",
        },
    )
    assert response.status_code == 200
    assert "What is in the note?" in response.json()["answer"]


def test_chat_folder_scope(client: TestClient, session: Session, mock_ai_service):
    user_id = "test-user-123"
    folder = Folder(name="Test Folder", user_id=user_id)
    session.add(folder)
    session.commit()

    note1 = Note(
        title="Note 1", content="Content 1", user_id=user_id, folder_id=folder.id
    )
    note2 = Note(
        title="Note 2", content="Content 2", user_id=user_id, folder_id=folder.id
    )
    session.add(note1)
    session.add(note2)
    session.commit()

    response = client.post(
        "/api/ai/chat",
        json={
            "scope": "folder",
            "folder_id": str(folder.id),
            "question": "Ask about folder",
        },
    )
    assert response.status_code == 200
    assert "Ask about folder" in response.json()["answer"]


def test_chat_all_scope(client: TestClient, session: Session, mock_ai_service):
    user_id = "test-user-123"
    note1 = Note(title="Note 1", content="Content 1", user_id=user_id)
    note2 = Note(title="Note 2", content="Content 2", user_id=user_id)
    session.add(note1)
    session.add(note2)
    session.commit()

    response = client.post(
        "/api/ai/chat", json={"scope": "all", "question": "Ask about everything"}
    )
    assert response.status_code == 200


def test_edit_note_content(client: TestClient, session: Session, mock_ai_service):
    response = client.post(
        "/api/ai/edit",
        json={
            "content": "Hello world",
            "instruction": "Fix typos",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "edited_content" in data
    assert data["tokens_used"] == 30


def test_edit_with_note_id(client: TestClient, session: Session, mock_ai_service):
    user_id = "test-user-123"
    note = Note(title="Test Note", content="Test Content", user_id=user_id)
    session.add(note)
    session.commit()

    response = client.post(
        "/api/ai/edit",
        json={
            "content": "Test Content",
            "instruction": "Improve grammar",
            "note_id": str(note.id),
        },
    )
    assert response.status_code == 200
    assert "edited_content" in response.json()


def test_edit_empty_content(client: TestClient, session: Session, mock_ai_service):
    response = client.post(
        "/api/ai/edit",
        json={
            "content": "  ",
            "instruction": "Fix typos",
        },
    )
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_edit_empty_instruction(client: TestClient, session: Session, mock_ai_service):
    response = client.post(
        "/api/ai/edit",
        json={
            "content": "Hello world",
            "instruction": "  ",
        },
    )
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_edit_unowned_note(make_client, session: Session, mock_ai_service):
    other_user_id = "other-user"
    note = Note(title="Other's Note", content="Secret content", user_id=other_user_id)
    session.add(note)
    session.commit()

    client = make_client("test-user-123")
    response = client.post(
        "/api/ai/edit",
        json={
            "content": "Some content",
            "instruction": "Fix typos",
            "note_id": str(note.id),
        },
    )
    assert response.status_code == 404


def test_edit_timeout_returns_504(client: TestClient):
    class TimeoutAIService(AIService):
        async def summarize(
            self, content: str, model_id: str | None = None, language: str = "auto"
        ) -> tuple[str, int]:
            raise AIServiceTimeoutError("timed out")

        async def chat(
            self,
            content: str,
            question: str,
            history: list[dict] | None = None,
            model_id: str | None = None,
            language: str = "auto",
        ) -> tuple[str, int]:
            raise AIServiceTimeoutError("timed out")

        async def edit(
            self,
            content: str,
            instruction: str,
            model_id: str | None = None,
            language: str = "auto",
        ) -> tuple[str, int]:
            raise AIServiceTimeoutError("timed out")

    app.dependency_overrides[get_ai_service] = lambda: TimeoutAIService()
    try:
        response = client.post(
            "/api/ai/edit",
            json={
                "content": "Hello world",
                "instruction": "Fix typos",
            },
        )
    finally:
        app.dependency_overrides.pop(get_ai_service, None)

    assert response.status_code == 504
    assert "timed out" in response.json()["detail"].lower()


def test_create_edit_job_and_poll_result(
    client: TestClient,
    session: Session,
    mock_ai_service,
    monkeypatch: pytest.MonkeyPatch,
):
    async def noop_dispatch(*args, **kwargs):
        return None

    monkeypatch.setattr("app.routers.ai.dispatch_edit_job", noop_dispatch)

    response = client.post(
        "/api/ai/edit-jobs",
        json={
            "content": "Hello world",
            "instruction": "Fix typos",
        },
    )

    assert response.status_code == 202
    job = response.json()["job"]
    assert job["status"] == "pending"

    engine = session.get_bind()
    assert engine is not None
    asyncio.run(
        process_edit_job(
            UUID(job["id"]),
            session_factory=lambda: Session(engine),
            ai_service=mock_ai_service,
        )
    )

    poll_response = client.get(f"/api/ai/edit-jobs/{job['id']}")
    assert poll_response.status_code == 200
    poll_data = poll_response.json()
    assert poll_data["status"] == "completed"
    assert poll_data["edited_content"] == "Edited: Hello world"
    assert poll_data["tokens_used"] == 30


def test_edit_job_not_visible_to_other_user(
    make_client,
    session: Session,
    mock_ai_service,
    monkeypatch: pytest.MonkeyPatch,
):
    async def noop_dispatch(*args, **kwargs):
        return None

    monkeypatch.setattr("app.routers.ai.dispatch_edit_job", noop_dispatch)

    other_client = make_client("other-user-456")
    job = AIEditJob(
        user_id="test-user-123",
        content="Hello world",
        instruction="Fix typos",
    )
    session.add(job)
    session.commit()

    response = other_client.get(f"/api/ai/edit-jobs/{job.id}")
    assert response.status_code == 404


def test_edit_job_failure_is_persisted(
    client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
):
    class TimeoutAIService(AIService):
        async def summarize(
            self, content: str, model_id: str | None = None, language: str = "auto"
        ) -> tuple[str, int]:
            raise AIServiceTimeoutError("timed out")

        async def chat(
            self,
            content: str,
            question: str,
            history: list[dict] | None = None,
            model_id: str | None = None,
            language: str = "auto",
        ) -> tuple[str, int]:
            raise AIServiceTimeoutError("timed out")

        async def edit(
            self,
            content: str,
            instruction: str,
            model_id: str | None = None,
            language: str = "auto",
        ) -> tuple[str, int]:
            raise AIServiceTimeoutError("timed out")

    async def noop_dispatch(*args, **kwargs):
        return None

    monkeypatch.setattr("app.routers.ai.dispatch_edit_job", noop_dispatch)

    app.dependency_overrides[get_ai_service] = lambda: TimeoutAIService()
    try:
        response = client.post(
            "/api/ai/edit-jobs",
            json={
                "content": "Hello world",
                "instruction": "Fix typos",
            },
        )
    finally:
        app.dependency_overrides.pop(get_ai_service, None)

    assert response.status_code == 202
    job_id = response.json()["job"]["id"]

    engine = session.get_bind()
    assert engine is not None
    asyncio.run(
        process_edit_job(
            UUID(job_id),
            session_factory=lambda: Session(engine),
            ai_service=TimeoutAIService(),
        )
    )

    poll_response = client.get(f"/api/ai/edit-jobs/{job_id}")
    assert poll_response.status_code == 200
    poll_data = poll_response.json()
    assert poll_data["status"] == "failed"
    assert "timed out" in poll_data["error_message"].lower()
