from collections.abc import Awaitable, Callable
from uuid import UUID

from sqlmodel import Session

from app.features.assistant.context_builder import ContextBuilder
from app.features.assistant.errors import AI_TIMEOUT_MESSAGE, AIApplicationTimeoutError
from app.features.assistant.gateway import AIGateway, AIGatewayTimeoutError
from app.features.assistant.usage_policy import record_usage
from app.features.assistant.use_cases.common import (
    ensure_token_limit,
    get_user_settings,
    require_non_empty,
)
from app.features.workspace.use_cases import WorkspaceQueryUseCases
from app.models.enums import ChatScope


class AIInteractionUseCases:
    """Application use cases for AI-backed note interactions."""

    def __init__(
        self,
        session: Session,
        user_id: str,
        ai_gateway: AIGateway,
        workspace_queries: WorkspaceQueryUseCases,
    ):
        self.session = session
        self.user_id = user_id
        self.ai_gateway = ai_gateway
        self.workspace_queries = workspace_queries
        self.context_builder = ContextBuilder(workspace_queries)

    async def summarize_note(self, note_id: UUID) -> tuple[str, int]:
        note = self.workspace_queries.get_owned_note(note_id)
        require_non_empty(note.content, "Note content is empty")
        return await self._run_ai_call(
            lambda model_id, language: self.ai_gateway.summarize(
                note.content,
                model_id=model_id,
                language=language,
            )
        )

    async def chat_with_context(
        self,
        *,
        scope: ChatScope,
        question: str,
        history: list[dict] | None = None,
        note_id: UUID | None = None,
        folder_id: UUID | None = None,
    ) -> tuple[str, int]:
        content = self.context_builder.build(
            scope=scope, note_id=note_id, folder_id=folder_id
        )
        return await self._run_ai_call(
            lambda model_id, language: self.ai_gateway.chat(
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
        require_non_empty(content, "Content is empty")
        require_non_empty(instruction, "Instruction is empty")
        if note_id is not None:
            self.workspace_queries.get_owned_note(note_id)
        return await self.execute_edit(content=content, instruction=instruction)

    async def execute_edit(self, *, content: str, instruction: str) -> tuple[str, int]:
        return await self._run_ai_call(
            lambda model_id, language: self.ai_gateway.edit(
                content=content,
                instruction=instruction,
                model_id=model_id,
                language=language,
            )
        )

    async def _run_ai_call(
        self,
        ai_call: Callable[[str, str], Awaitable[tuple[str, int]]],
    ) -> tuple[str, int]:
        ensure_token_limit(self.session, self.user_id)
        model_id, language = get_user_settings(self.session, self.user_id)

        try:
            response, tokens_used = await ai_call(model_id, language)
        except AIGatewayTimeoutError as exc:
            raise AIApplicationTimeoutError(AI_TIMEOUT_MESSAGE) from exc

        if tokens_used > 0:
            record_usage(self.session, self.user_id, tokens_used)
        return response, tokens_used
