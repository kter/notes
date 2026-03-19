import pytest
from sqlmodel import Session

from app.features.assistant.ai_service import AIService
from app.features.assistant.errors import AITokenLimitExceededError
from app.features.assistant.token_usage_service import get_usage_info, record_usage
from app.features.assistant.use_cases.ai_interactions import AIInteractionUseCases
from app.features.assistant.use_cases.edit_jobs import EditJobUseCases
from app.models import AIEditJob, Note, UserSettings
from app.shared import NotFound
from tests.conftest import OTHER_USER_ID, TEST_USER_ID


class CapturingAIService(AIService):
    def __init__(self) -> None:
        self.calls: list[dict[str, str]] = []

    async def summarize(
        self, content: str, model_id: str | None = None, language: str = "auto"
    ) -> tuple[str, int]:
        self.calls.append(
            {
                "operation": "summarize",
                "content": content,
                "model_id": model_id or "",
                "language": language,
            }
        )
        return "summary", 12

    async def chat(
        self,
        content: str,
        question: str,
        history: list[dict] | None = None,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        self.calls.append(
            {
                "operation": "chat",
                "content": content,
                "model_id": model_id or "",
                "language": language,
            }
        )
        return "answer", 8

    async def edit(
        self,
        content: str,
        instruction: str,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        self.calls.append(
            {
                "operation": "edit",
                "content": content,
                "model_id": model_id or "",
                "language": language,
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
            llm_model_id="custom-model",
            language="ja",
        )
    )
    session.commit()

    ai_service = CapturingAIService()
    use_cases = AIInteractionUseCases(session, TEST_USER_ID, ai_service)

    summary, tokens_used = await use_cases.summarize_note(note.id)

    assert summary == "summary"
    assert tokens_used == 12
    assert ai_service.calls == [
        {
            "operation": "summarize",
            "content": "Hello world",
            "model_id": "custom-model",
            "language": "ja",
        }
    ]
    assert get_usage_info(session, TEST_USER_ID).tokens_used == 12


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

    use_cases = AIInteractionUseCases(session, TEST_USER_ID, CapturingAIService())

    with pytest.raises(AITokenLimitExceededError):
        await use_cases.execute_edit(content="Hello", instruction="Fix typos")


def test_get_edit_job_enforces_user_scope(session: Session):
    job = AIEditJob(user_id=OTHER_USER_ID, content="Hello", instruction="Fix typos")
    session.add(job)
    session.commit()

    use_cases = EditJobUseCases(session, TEST_USER_ID)

    with pytest.raises(NotFound) as exc_info:
        use_cases.get_job(job.id)

    assert exc_info.value.detail == "Edit job not found"
