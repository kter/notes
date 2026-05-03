"""AI バックエンドを使ったノートインタラクションのユースケース。

責務: 要約・チャット・編集の各 AI 呼び出しを統一インターフェースで提供し、
    トークン上限チェックと使用量記録を担う。
主要なエクスポート: AIInteractionUseCases
呼び出し関係: job_runner.py およびルーターから呼ばれ、
    AIGateway と usage_policy を通じて AI 処理を実行する。
"""

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
    """AI バックエンドを使ったノートインタラクションのユースケース。"""

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
        """指定ノートを AI で要約し、(要約テキスト, 使用トークン数) を返す。"""
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
        selected_content: str | None = None,
    ) -> tuple[str, int]:
        """スコープに応じたコンテキストで AI チャットを実行し、(回答, 使用トークン数) を返す。"""
        if scope == ChatScope.SELECTION:
            require_non_empty(selected_content or "", "Selected content is empty")
            content = selected_content or ""
        else:
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
        """入力検証とオーナーチェックを行ってから AI 編集を実行する。"""
        require_non_empty(content, "Content is empty")
        require_non_empty(instruction, "Instruction is empty")
        if note_id is not None:
            self.workspace_queries.get_owned_note(note_id)
        return await self.execute_edit(content=content, instruction=instruction)

    async def execute_edit(self, *, content: str, instruction: str) -> tuple[str, int]:
        """AI 編集を直接実行し、(編集済みコンテンツ, 使用トークン数) を返す。"""
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
        """トークン制限チェック・設定取得・使用量記録を行い AI 呼び出しを実行する。"""
        ensure_token_limit(self.session, self.user_id)
        model_id, language = get_user_settings(self.session, self.user_id)

        try:
            response, tokens_used = await ai_call(model_id, language)
        except AIGatewayTimeoutError as exc:
            raise AIApplicationTimeoutError(AI_TIMEOUT_MESSAGE) from exc

        if tokens_used > 0:
            record_usage(self.session, self.user_id, tokens_used)
        return response, tokens_used
