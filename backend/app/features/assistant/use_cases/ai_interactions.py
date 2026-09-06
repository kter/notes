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
from app.features.assistant.gateway import (
    AIGateway,
    AIGatewayTimeoutError,
    AIRequest,
)
from app.features.assistant.schemas import BedrockMessage
from app.features.assistant.token_budget import BudgetTicket, TokenBudget
from app.features.assistant.use_cases.common import require_non_empty
from app.features.settings.repository import UserSettingsRepository
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
            lambda request, ticket: _settling(
                self.ai_gateway.summarize(note.content, request), ticket
            )
        )

    async def chat_with_context(
        self,
        *,
        scope: ChatScope,
        question: str,
        history: list[BedrockMessage] | None = None,
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
            lambda request, ticket: _settling(
                self.ai_gateway.chat(
                    content=content,
                    question=question,
                    request=request,
                    history=history,
                ),
                ticket,
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
            # 編集はチャンクごとに消費が報告されるため、ここでは settle しない。
            lambda request, ticket: self.ai_gateway.edit(
                content=content,
                instruction=instruction,
                request=request,
                on_usage=ticket.settle,
            )
        )

    async def _run_ai_call(
        self,
        ai_call: Callable[[AIRequest, BudgetTicket], Awaitable[tuple[str, int]]],
    ) -> tuple[str, int]:
        """予算を確保し、ユーザー設定を解決したうえで AI 呼び出しを実行する。

        上限判定と使用量の計上はどちらも TokenBudget が持つ。呼び出し側は
        チケットに実消費を報告するだけでよい。
        """
        model_id, language = UserSettingsRepository(
            self.session, self.user_id
        ).resolve_for_ai()
        request = AIRequest(model_id=model_id, language=language)

        with TokenBudget(self.session, self.user_id).reserve() as ticket:
            try:
                response, tokens_used = await ai_call(request, ticket)
            except AIGatewayTimeoutError as exc:
                raise AIApplicationTimeoutError(AI_TIMEOUT_MESSAGE) from exc

        return response, tokens_used


async def _settling(
    call: Awaitable[tuple[str, int]], ticket: BudgetTicket
) -> tuple[str, int]:
    """1 回で完結する AI 呼び出しの消費を、完了時にチケットへ報告する。"""
    response, tokens_used = await call
    ticket.settle(tokens_used)
    return response, tokens_used
