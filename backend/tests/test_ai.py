import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.main import app
from app.models import Folder, Note
from app.services import AIService, get_ai_service


# Mock AI Service
class MockAIService(AIService):
    async def summarize(
        self, content: str, model_id: str | None = None, language: str = "auto"
    ) -> str:
        return f"Summary: {content[:10]}..."

    async def chat(
        self,
        content: str,
        question: str,
        history: list[dict] | None = None,
        model_id: str | None = None,
        language: str = "auto",
    ) -> str:
        return f"Answer for '{question}' based on {len(content)} chars"

    async def generate_title(
        self, content: str, model_id: str | None = None, language: str = "auto"
    ) -> str:
        return "Generated Title"


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


def test_generate_title(client: TestClient, session: Session, mock_ai_service):
    user_id = "test-user-123"
    note = Note(
        title="Untitled", content="Long content that needs a title", user_id=user_id
    )
    session.add(note)
    session.commit()

    response = client.post("/api/ai/generate-title", json={"note_id": str(note.id)})
    assert response.status_code == 200
    assert response.json()["title"] == "Generated Title"
