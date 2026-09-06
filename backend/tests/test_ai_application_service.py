import pytest
from sqlmodel import Session

from app.features.assistant.errors import AITokenLimitExceededError
from app.features.assistant.gateway import AIGateway, AIRequest
from app.features.assistant.usage_policy import get_usage_info, record_usage
from app.features.assistant.use_cases import (
    AIInteractionUseCases,
    AIJobUseCases,
    EditJobUseCases,
)
from app.features.workspace.use_cases import WorkspaceQueryUseCases
from app.models import (
    AVAILABLE_MODELS,
    DEFAULT_LLM_MODEL_ID,
    AIEditJob,
    AIJob,
    Note,
    UserSettings,
)
from app.models.enums import ChatScope
from app.shared import NotFound, ValidationFailed
from tests.conftest import OTHER_USER_ID, TEST_USER_ID


class CapturingAIGateway(AIGateway):
    def __init__(self) -> None:
        self.calls: list[dict[str, str]] = []

    async def summarize(self, content: str, request: AIRequest) -> tuple[str, int]:
        self.calls.append(
            {
                "operation": "summarize",
                "content": content,
                "model_id": request.model_id or "",
                "language": request.language,
            }
        )
        return "summary", 12

    async def chat(
        self,
        content: str,
        question: str,
        request: AIRequest,
        history: list[dict] | None = None,
    ) -> tuple[str, int]:
        self.calls.append(
            {
                "operation": "chat",
                "content": content,
                "model_id": request.model_id or "",
                "language": request.language,
            }
        )
        return "answer", 8

    async def edit(
        self,
        content: str,
        instruction: str,
        request: AIRequest,
    ) -> tuple[str, int]:
        self.calls.append(
            {
                "operation": "edit",
                "content": content,
                "model_id": request.model_id or "",
                "language": request.language,
            }
        )
        return f"edited: {content}", 5


@pytest.mark.asyncio
async def test_summarize_note_uses_user_settings_and_records_usage(session: Session):
    note = Note(title="Test", content="Hello world", user_id=TEST_USER_ID)
    session.add(note)
    session.add(
        UserSettings(
            user_id=TEST_USER_ID,
            llm_model_id=AVAILABLE_MODELS[0]["id"],
            language="ja",
        )
    )
    session.commit()

    ai_gateway = CapturingAIGateway()
    use_cases = AIInteractionUseCases(
        session,
        TEST_USER_ID,
        ai_gateway,
        WorkspaceQueryUseCases(session, TEST_USER_ID),
    )

    summary, tokens_used = await use_cases.summarize_note(note.id)

    assert summary == "summary"
    assert tokens_used == 12
    assert ai_gateway.calls == [
        {
            "operation": "summarize",
            "content": "Hello world",
            "model_id": AVAILABLE_MODELS[0]["id"],
            "language": "ja",
        }
    ]
    assert get_usage_info(session, TEST_USER_ID).tokens_used == 12


@pytest.mark.asyncio
async def test_summarize_note_falls_back_when_stored_model_is_retired(session: Session):
    """選択可能でなくなったモデル ID を保存済みのユーザーが既定値に寄せられること。

    退役やリージョン移行で AVAILABLE_MODELS からモデルを外すと、その ID を保存して
    いたユーザーは InvokeModel で失敗し続ける。実際にこれで AI 機能が全面停止したため
    回帰テストとして固定する。
    """
    note = Note(title="Test", content="Hello world", user_id=TEST_USER_ID)
    session.add(note)
    session.add(
        UserSettings(
            user_id=TEST_USER_ID,
            llm_model_id="us.anthropic.claude-3-5-haiku-20241022-v1:0",  # 2026-02-19 退役
            language="ja",
        )
    )
    session.commit()

    ai_gateway = CapturingAIGateway()
    use_cases = AIInteractionUseCases(
        session,
        TEST_USER_ID,
        ai_gateway,
        WorkspaceQueryUseCases(session, TEST_USER_ID),
    )

    await use_cases.summarize_note(note.id)

    assert ai_gateway.calls[0]["model_id"] == DEFAULT_LLM_MODEL_ID


@pytest.mark.asyncio
async def test_execute_edit_rejects_users_over_token_limit(session: Session):
    session.add(
        UserSettings(
            user_id=TEST_USER_ID,
            llm_model_id="custom-model",
            language="en",
            token_limit=1,
        )
    )
    session.commit()
    record_usage(session, TEST_USER_ID, 1)

    use_cases = AIInteractionUseCases(
        session,
        TEST_USER_ID,
        CapturingAIGateway(),
        WorkspaceQueryUseCases(session, TEST_USER_ID),
    )

    with pytest.raises(AITokenLimitExceededError):
        await use_cases.execute_edit(content="Hello", instruction="Fix typos")


def test_get_edit_job_enforces_user_scope(session: Session):
    job = AIEditJob(user_id=OTHER_USER_ID, content="Hello", instruction="Fix typos")
    session.add(job)
    session.commit()

    use_cases = EditJobUseCases(
        session,
        TEST_USER_ID,
        WorkspaceQueryUseCases(session, TEST_USER_ID),
    )

    with pytest.raises(NotFound) as exc_info:
        use_cases.get_job(job.id)

    assert exc_info.value.detail == "Edit job not found"


def test_get_ai_job_enforces_user_scope(session: Session):
    job = AIJob(user_id=OTHER_USER_ID, kind="chat", input="{}")
    session.add(job)
    session.commit()

    use_cases = AIJobUseCases(
        session,
        TEST_USER_ID,
        WorkspaceQueryUseCases(session, TEST_USER_ID),
    )

    with pytest.raises(NotFound) as exc_info:
        use_cases.get_job(job.id)

    assert exc_info.value.detail == "AI job not found"


@pytest.mark.asyncio
async def test_chat_with_selection_scope_uses_selected_content(session: Session):
    session.add(UserSettings(user_id=TEST_USER_ID, llm_model_id="model", language="en"))
    session.commit()

    ai_gateway = CapturingAIGateway()
    use_cases = AIInteractionUseCases(
        session,
        TEST_USER_ID,
        ai_gateway,
        WorkspaceQueryUseCases(session, TEST_USER_ID),
    )

    answer, _ = await use_cases.chat_with_context(
        scope=ChatScope.SELECTION,
        question="What does this mean?",
        selected_content="# Hello\nThis is selected text.",
    )

    assert answer == "answer"
    assert ai_gateway.calls[0]["content"] == "# Hello\nThis is selected text."
    assert ai_gateway.calls[0]["operation"] == "chat"


@pytest.mark.asyncio
async def test_chat_with_selection_scope_raises_when_content_empty(session: Session):
    session.add(UserSettings(user_id=TEST_USER_ID, llm_model_id="model", language="en"))
    session.commit()

    use_cases = AIInteractionUseCases(
        session,
        TEST_USER_ID,
        CapturingAIGateway(),
        WorkspaceQueryUseCases(session, TEST_USER_ID),
    )

    with pytest.raises(ValidationFailed):
        await use_cases.chat_with_context(
            scope=ChatScope.SELECTION,
            question="What does this mean?",
            selected_content="",
        )
