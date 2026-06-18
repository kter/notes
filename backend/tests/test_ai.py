import asyncio
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.features.assistant.gateway import (
    AIGateway,
    AIGatewayTimeoutError,
    get_ai_gateway,
)
from app.features.assistant.job_runner import (
    process_chat_job,
    process_edit_job,
    process_summarize_job,
)
from app.main import app
from app.models import AIEditJob, Folder, Note


def _run_ai_job(process_fn, job_id, session, ai_gateway):
    """非同期 AI ジョブをテスト内で同期実行するヘルパー。

    SNS 未設定のテストでは dispatch をモックし、worker 相当の処理を直接走らせる。
    """
    engine = session.get_bind()
    assert engine is not None
    asyncio.run(
        process_fn(
            UUID(job_id),
            session_factory=lambda: Session(engine),
            ai_gateway=ai_gateway,
        )
    )


# Mock AI Service
class MockAIGateway(AIGateway):
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
    service = MockAIGateway()
    app.dependency_overrides[get_ai_gateway] = lambda: service
    yield service
    app.dependency_overrides.pop(get_ai_gateway, None)


def test_summarize_note(
    client: TestClient,
    session: Session,
    mock_ai_service,
    monkeypatch: pytest.MonkeyPatch,
):
    async def noop_dispatch(*args, **kwargs):
        return None

    monkeypatch.setattr("app.features.assistant.router.dispatch_ai_job", noop_dispatch)

    user_id = "test-user-123"
    note = Note(title="Test Note", content="Test Content", user_id=user_id)
    session.add(note)
    session.commit()

    response = client.post("/api/ai/summarize-jobs", json={"note_id": str(note.id)})
    assert response.status_code == 202
    job = response.json()
    assert job["status"] == "pending"
    assert job["kind"] == "summarize"

    _run_ai_job(process_summarize_job, job["id"], session, mock_ai_service)

    poll = client.get(f"/api/ai/jobs/{job['id']}")
    assert poll.status_code == 200
    data = poll.json()
    assert data["status"] == "completed"
    assert data["result"] == "Summary: Test Conte..."
    assert data["tokens_used"] == 20


def test_summarize_empty_note(
    client: TestClient,
    session: Session,
    mock_ai_service,
    monkeypatch: pytest.MonkeyPatch,
):
    async def noop_dispatch(*args, **kwargs):
        return None

    monkeypatch.setattr("app.features.assistant.router.dispatch_ai_job", noop_dispatch)

    user_id = "test-user-123"
    note = Note(title="Empty Note", content="  ", user_id=user_id)
    session.add(note)
    session.commit()

    # 空ノートの検証は worker 処理時に行われるため、ジョブは受理(202)後に failed になる
    response = client.post("/api/ai/summarize-jobs", json={"note_id": str(note.id)})
    assert response.status_code == 202
    job = response.json()

    _run_ai_job(process_summarize_job, job["id"], session, mock_ai_service)

    poll = client.get(f"/api/ai/jobs/{job['id']}")
    assert poll.status_code == 200
    data = poll.json()
    assert data["status"] == "failed"
    assert "empty" in (data["error_message"] or "").lower()


def test_summarize_unowned_note(make_client, session: Session, mock_ai_service):
    other_user_id = "other-user"
    note = Note(title="Other's Note", content="Secret content", user_id=other_user_id)
    session.add(note)
    session.commit()

    # 所有権チェックはジョブ作成時に行われるため 404 で即拒否される
    client = make_client("test-user-123")
    response = client.post("/api/ai/summarize-jobs", json={"note_id": str(note.id)})
    assert response.status_code == 404


def test_chat_note_scope(
    client: TestClient,
    session: Session,
    mock_ai_service,
    monkeypatch: pytest.MonkeyPatch,
):
    async def noop_dispatch(*args, **kwargs):
        return None

    monkeypatch.setattr("app.features.assistant.router.dispatch_ai_job", noop_dispatch)

    user_id = "test-user-123"
    note = Note(title="Test Note", content="Sample content for chat", user_id=user_id)
    session.add(note)
    session.commit()

    response = client.post(
        "/api/ai/chat-jobs",
        json={
            "scope": "note",
            "note_id": str(note.id),
            "question": "What is in the note?",
        },
    )
    assert response.status_code == 202
    job = response.json()
    assert job["kind"] == "chat"

    _run_ai_job(process_chat_job, job["id"], session, mock_ai_service)

    poll = client.get(f"/api/ai/jobs/{job['id']}")
    assert poll.status_code == 200
    data = poll.json()
    assert data["status"] == "completed"
    assert "What is in the note?" in data["result"]


def test_chat_folder_scope(
    client: TestClient,
    session: Session,
    mock_ai_service,
    monkeypatch: pytest.MonkeyPatch,
):
    async def noop_dispatch(*args, **kwargs):
        return None

    monkeypatch.setattr("app.features.assistant.router.dispatch_ai_job", noop_dispatch)

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
        "/api/ai/chat-jobs",
        json={
            "scope": "folder",
            "folder_id": str(folder.id),
            "question": "Ask about folder",
        },
    )
    assert response.status_code == 202
    job = response.json()

    _run_ai_job(process_chat_job, job["id"], session, mock_ai_service)

    poll = client.get(f"/api/ai/jobs/{job['id']}")
    assert poll.status_code == 200
    data = poll.json()
    assert data["status"] == "completed"
    assert "Ask about folder" in data["result"]


def test_chat_all_scope(
    client: TestClient,
    session: Session,
    mock_ai_service,
    monkeypatch: pytest.MonkeyPatch,
):
    async def noop_dispatch(*args, **kwargs):
        return None

    monkeypatch.setattr("app.features.assistant.router.dispatch_ai_job", noop_dispatch)

    user_id = "test-user-123"
    note1 = Note(title="Note 1", content="Content 1", user_id=user_id)
    note2 = Note(title="Note 2", content="Content 2", user_id=user_id)
    session.add(note1)
    session.add(note2)
    session.commit()

    response = client.post(
        "/api/ai/chat-jobs", json={"scope": "all", "question": "Ask about everything"}
    )
    assert response.status_code == 202
    job = response.json()

    _run_ai_job(process_chat_job, job["id"], session, mock_ai_service)

    poll = client.get(f"/api/ai/jobs/{job['id']}")
    assert poll.status_code == 200
    assert poll.json()["status"] == "completed"


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


def test_edit_oversized_content_returns_422(
    client: TestClient, session: Session, mock_ai_service
):
    """Content beyond the max size must be rejected before reaching Bedrock.

    Guards against token/cost exhaustion via unbounded AI input payloads.
    """
    response = client.post(
        "/api/ai/edit",
        json={
            "content": "A" * 100_001,
            "instruction": "Summarize",
        },
    )
    assert response.status_code == 422


def test_edit_oversized_instruction_returns_422(
    client: TestClient, session: Session, mock_ai_service
):
    """Instruction beyond the max size must be rejected."""
    response = client.post(
        "/api/ai/edit",
        json={
            "content": "Hello world",
            "instruction": "x" * 2_001,
        },
    )
    assert response.status_code == 422


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
    class TimeoutAIGateway(AIGateway):
        async def summarize(
            self, content: str, model_id: str | None = None, language: str = "auto"
        ) -> tuple[str, int]:
            raise AIGatewayTimeoutError("timed out")

        async def chat(
            self,
            content: str,
            question: str,
            history: list[dict] | None = None,
            model_id: str | None = None,
            language: str = "auto",
        ) -> tuple[str, int]:
            raise AIGatewayTimeoutError("timed out")

        async def edit(
            self,
            content: str,
            instruction: str,
            model_id: str | None = None,
            language: str = "auto",
        ) -> tuple[str, int]:
            raise AIGatewayTimeoutError("timed out")

    app.dependency_overrides[get_ai_gateway] = lambda: TimeoutAIGateway()
    try:
        response = client.post(
            "/api/ai/edit",
            json={
                "content": "Hello world",
                "instruction": "Fix typos",
            },
        )
    finally:
        app.dependency_overrides.pop(get_ai_gateway, None)

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

    monkeypatch.setattr(
        "app.features.assistant.router.dispatch_edit_job", noop_dispatch
    )

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
            ai_gateway=mock_ai_service,
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

    monkeypatch.setattr(
        "app.features.assistant.router.dispatch_edit_job", noop_dispatch
    )

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
    class TimeoutAIGateway(AIGateway):
        async def summarize(
            self, content: str, model_id: str | None = None, language: str = "auto"
        ) -> tuple[str, int]:
            raise AIGatewayTimeoutError("timed out")

        async def chat(
            self,
            content: str,
            question: str,
            history: list[dict] | None = None,
            model_id: str | None = None,
            language: str = "auto",
        ) -> tuple[str, int]:
            raise AIGatewayTimeoutError("timed out")

        async def edit(
            self,
            content: str,
            instruction: str,
            model_id: str | None = None,
            language: str = "auto",
        ) -> tuple[str, int]:
            raise AIGatewayTimeoutError("timed out")

    async def noop_dispatch(*args, **kwargs):
        return None

    monkeypatch.setattr(
        "app.features.assistant.router.dispatch_edit_job", noop_dispatch
    )

    app.dependency_overrides[get_ai_gateway] = lambda: TimeoutAIGateway()
    try:
        response = client.post(
            "/api/ai/edit-jobs",
            json={
                "content": "Hello world",
                "instruction": "Fix typos",
            },
        )
    finally:
        app.dependency_overrides.pop(get_ai_gateway, None)

    assert response.status_code == 202
    job_id = response.json()["job"]["id"]

    engine = session.get_bind()
    assert engine is not None
    asyncio.run(
        process_edit_job(
            UUID(job_id),
            session_factory=lambda: Session(engine),
            ai_gateway=TimeoutAIGateway(),
        )
    )

    poll_response = client.get(f"/api/ai/edit-jobs/{job_id}")
    assert poll_response.status_code == 200
    poll_data = poll_response.json()
    assert poll_data["status"] == "failed"
    assert "timed out" in poll_data["error_message"].lower()
