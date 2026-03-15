from collections.abc import Awaitable, Callable
from uuid import UUID

from sqlmodel import Session

from app.features.assistant.context import ContextService
from app.features.workspace.query_service import WorkspaceQueryService
from app.models import (
    DEFAULT_LLM_MODEL_ID,
    AIEditJob,
    AIEditJobCreate,
    UserSettings,
)
from app.models.enums import ChatScope
from app.services import AIService, AIServiceTimeoutError
from app.services.token_usage import check_limit, record_usage
from app.shared import NotFound, ValidationFailed

TOKEN_LIMIT_EXCEEDED_MESSAGE = "Monthly token limit exceeded. Your usage will reset at the beginning of next month."  # noqa: S105
AI_TIMEOUT_MESSAGE = (
    "AI request timed out. Try a shorter note or edit a smaller section."
)
AI_EDIT_JOB_TIMEOUT_MESSAGE = "AI request timed out. Try editing a smaller section."


class AITokenLimitExceededError(RuntimeError):
    """Raised when a user has no remaining AI quota."""


class AIApplicationTimeoutError(RuntimeError):
    """Raised when the upstream AI provider times out."""


class AIApplicationService:
    """Application service for AI-backed note workflows."""

    def __init__(
        self, session: Session, user_id: str, ai_service: AIService | None = None
    ):
        self.session = session
        self.user_id = user_id
        self.ai_service = ai_service
        self.context_service = ContextService(session, user_id)
        self.workspace_queries = WorkspaceQueryService(session, user_id)

    async def summarize_note(self, note_id: UUID) -> tuple[str, int]:
        note = self.workspace_queries.get_owned_note(note_id)
        self._require_non_empty(note.content, "Note content is empty")
        return await self._summarize_content(note.content)

    async def chat_with_context(
        self,
        *,
        scope: ChatScope,
        question: str,
        history: list[dict] | None = None,
        note_id: UUID | None = None,
        folder_id: UUID | None = None,
    ) -> tuple[str, int]:
        content = self.context_service.get_context(
            scope=scope, note_id=note_id, folder_id=folder_id
        )
        return await self._run_ai_call(
            lambda model_id, language: self._require_ai_service().chat(
                content=content,
                question=question,
                history=history,
                model_id=model_id,
                language=language,
            )
        )

    async def edit_content(
        self,
        *,
        content: str,
        instruction: str,
        note_id: UUID | None = None,
    ) -> tuple[str, int]:
        self._require_non_empty(content, "Content is empty")
        self._require_non_empty(instruction, "Instruction is empty")
        if note_id is not None:
            self.workspace_queries.get_owned_note(note_id)
        return await self.execute_edit(content=content, instruction=instruction)

    async def execute_edit(self, *, content: str, instruction: str) -> tuple[str, int]:
        return await self._run_ai_call(
            lambda model_id, language: self._require_ai_service().edit(
                content=content,
                instruction=instruction,
                model_id=model_id,
                language=language,
            )
        )

    def create_edit_job(self, job_in: AIEditJobCreate) -> AIEditJob:
        self._require_non_empty(job_in.content, "Content is empty")
        self._require_non_empty(job_in.instruction, "Instruction is empty")
        if job_in.note_id is not None:
            self.workspace_queries.get_owned_note(job_in.note_id)

        self._ensure_token_limit()

        job = AIEditJob(
            user_id=self.user_id,
            note_id=job_in.note_id,
            content=job_in.content,
            instruction=job_in.instruction,
            status="pending",
        )
        self.session.add(job)
        self.session.commit()
        self.session.refresh(job)
        return job

    def get_edit_job(self, job_id: UUID) -> AIEditJob:
        job = self.session.get(AIEditJob, job_id)
        if job is None or job.user_id != self.user_id:
            raise NotFound("Edit job not found")
        return job

    def get_user_settings(self) -> tuple[str, str]:
        settings = self.session.get(UserSettings, self.user_id)
        if settings:
            return settings.llm_model_id, settings.language
        return DEFAULT_LLM_MODEL_ID, "auto"

    def _ensure_token_limit(self) -> None:
        if not check_limit(self.session, self.user_id):
            raise AITokenLimitExceededError(TOKEN_LIMIT_EXCEEDED_MESSAGE)

    def _record_usage(self, tokens_used: int) -> None:
        if tokens_used > 0:
            record_usage(self.session, self.user_id, tokens_used)

    def _require_ai_service(self) -> AIService:
        if self.ai_service is None:
            raise RuntimeError("AI service is required for this operation")
        return self.ai_service

    async def _summarize_content(self, content: str) -> tuple[str, int]:
        return await self._run_ai_call(
            lambda model_id, language: self._require_ai_service().summarize(
                content,
                model_id=model_id,
                language=language,
            )
        )

    async def _run_ai_call(
        self,
        ai_call: Callable[[str, str], Awaitable[tuple[str, int]]],
    ) -> tuple[str, int]:
        self._ensure_token_limit()
        model_id, language = self.get_user_settings()

        try:
            response, tokens_used = await ai_call(model_id, language)
        except AIServiceTimeoutError as exc:
            raise AIApplicationTimeoutError(AI_TIMEOUT_MESSAGE) from exc

        self._record_usage(tokens_used)
        return response, tokens_used

    @staticmethod
    def _require_non_empty(value: str, detail: str) -> None:
        if not value.strip():
            raise ValidationFailed(detail)
