import asyncio
import json
import logging
from datetime import datetime
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.features.assistant.errors import (
    AI_EDIT_JOB_TIMEOUT_MESSAGE,
    AI_TIMEOUT_MESSAGE,
    TOKEN_LIMIT_EXCEEDED_MESSAGE,
)
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
from app.features.assistant.usage_policy import get_or_create_current_period
from app.main import app
from app.models import MONTHLY_TOKEN_LIMIT, AIEditJob, AIJob, Folder, Note
from tests.conftest import TEST_USER_ID


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
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def summarize(
        self, content: str, model_id: str | None = None, language: str = "auto"
    ) -> tuple[str, int]:
        self.calls.append("summarize")
        return f"Summary: {content[:10]}...", 20

    async def chat(
        self,
        content: str,
        question: str,
        history: list[dict] | None = None,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        self.calls.append("chat")
        return f"Answer for '{question}' based on {len(content)} chars", 20

    async def edit(
        self,
        content: str,
        instruction: str,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        self.calls.append("edit")
        return f"Edited: {content}", 30


@pytest.fixture
def mock_ai_service():
    service = MockAIGateway()
    app.dependency_overrides[get_ai_gateway] = lambda: service
    yield service
    app.dependency_overrides.pop(get_ai_gateway, None)


def _create_job_for_runner(
    session: Session,
    job_kind: str,
    *,
    status: str = "pending",
    updated_at: datetime | None = None,
):
    """共通ランナーのテスト対象ジョブと公開処理関数を生成する。"""
    if job_kind == "edit":
        job = AIEditJob(
            user_id="test-user-123",
            content="Hello world",
            instruction="Fix typos",
            status=status,
        )
        process_fn = process_edit_job
        gateway_call = "edit"
    else:
        note = Note(
            title="Runner test note",
            content="Content for runner tests",
            user_id="test-user-123",
        )
        session.add(note)
        session.flush()
        job = AIJob(
            user_id="test-user-123",
            kind="summarize",
            input=json.dumps({"note_id": str(note.id)}),
            status=status,
        )
        process_fn = process_summarize_job
        gateway_call = "summarize"

    if updated_at is not None:
        job.updated_at = updated_at
    session.add(job)
    session.commit()
    return job, process_fn, gateway_call


@pytest.mark.parametrize("job_kind", ["edit", "generic"])
@pytest.mark.parametrize("status", ["running", "completed"])
def test_ai_job_runner_skips_already_started_jobs(
    session: Session,
    mock_ai_service: MockAIGateway,
    job_kind: str,
    status: str,
):
    original_updated_at = datetime(2000, 1, 1)
    job, process_fn, gateway_call = _create_job_for_runner(
        session,
        job_kind,
        status=status,
        updated_at=original_updated_at,
    )

    _run_ai_job(process_fn, str(job.id), session, mock_ai_service)

    session.expire_all()
    persisted_job = session.get(type(job), job.id)
    assert persisted_job is not None
    assert persisted_job.status == status
    assert persisted_job.updated_at == original_updated_at
    assert gateway_call not in mock_ai_service.calls


@pytest.mark.parametrize("job_kind", ["edit", "generic"])
def test_ai_job_runner_persists_timeout_failure(
    session: Session,
    mock_ai_service: MockAIGateway,
    monkeypatch: pytest.MonkeyPatch,
    job_kind: str,
):
    original_updated_at = datetime(2000, 1, 1)
    job, process_fn, gateway_call = _create_job_for_runner(
        session,
        job_kind,
        updated_at=original_updated_at,
    )

    async def raise_timeout(*args, **kwargs):
        raise AIGatewayTimeoutError("timed out")

    monkeypatch.setattr(mock_ai_service, gateway_call, raise_timeout)
    _run_ai_job(process_fn, str(job.id), session, mock_ai_service)

    session.expire_all()
    persisted_job = session.get(type(job), job.id)
    assert persisted_job is not None
    assert persisted_job.status == "failed"
    assert persisted_job.error_message == AI_EDIT_JOB_TIMEOUT_MESSAGE
    assert persisted_job.completed_at is not None
    assert persisted_job.updated_at > original_updated_at


@pytest.mark.parametrize("job_kind", ["edit", "generic"])
def test_ai_job_runner_refreshes_completion_timestamps_on_success(
    session: Session,
    mock_ai_service: MockAIGateway,
    job_kind: str,
):
    original_updated_at = datetime(2000, 1, 1)
    job, process_fn, _ = _create_job_for_runner(
        session,
        job_kind,
        updated_at=original_updated_at,
    )

    _run_ai_job(process_fn, str(job.id), session, mock_ai_service)

    session.expire_all()
    persisted_job = session.get(type(job), job.id)
    assert persisted_job is not None
    assert persisted_job.status == "completed"
    assert persisted_job.completed_at is not None
    assert persisted_job.updated_at > original_updated_at


@pytest.mark.parametrize(
    ("process_fn", "expected_event"),
    [
        (process_edit_job, "ops.ai_job.not_found"),
        (process_summarize_job, "ops.ai_job.not_found"),
    ],
)
def test_ai_job_runner_logs_missing_job(
    session: Session,
    mock_ai_service: MockAIGateway,
    caplog: pytest.LogCaptureFixture,
    process_fn,
    expected_event: str,
):
    missing_job_id = UUID("00000000-0000-0000-0000-000000000000")

    with caplog.at_level(logging.WARNING):
        _run_ai_job(process_fn, str(missing_job_id), session, mock_ai_service)

    matching_records = [
        record
        for record in caplog.records
        if getattr(record, "event", None) == expected_event
    ]
    assert len(matching_records) == 1
    assert matching_records[0].levelno == logging.WARNING
    assert matching_records[0].details == {
        "job_id": missing_job_id,
        "outcome": "failure",
    }
    assert mock_ai_service.calls == []


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


def test_edit_timeout_returns_exact_detail(
    client: TestClient,
    mock_ai_service,
    monkeypatch: pytest.MonkeyPatch,
):
    async def timeout_edit(
        content: str,
        instruction: str,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        raise AIGatewayTimeoutError("timed out")

    monkeypatch.setattr(mock_ai_service, "edit", timeout_edit)

    response = client.post(
        "/api/ai/edit",
        json={
            "content": "Hello world",
            "instruction": "Fix typos",
        },
    )

    assert response.status_code == 504
    assert response.json() == {"detail": AI_TIMEOUT_MESSAGE}


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


def test_create_edit_job_token_limit_returns_exact_detail(
    client: TestClient,
    session: Session,
):
    usage = get_or_create_current_period(session, TEST_USER_ID)
    usage.tokens_used = MONTHLY_TOKEN_LIMIT
    session.add(usage)
    session.commit()

    response = client.post(
        "/api/ai/edit-jobs",
        json={
            "content": "Hello world",
            "instruction": "Fix typos",
        },
    )

    assert response.status_code == 429
    assert response.json() == {"detail": TOKEN_LIMIT_EXCEEDED_MESSAGE}


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
