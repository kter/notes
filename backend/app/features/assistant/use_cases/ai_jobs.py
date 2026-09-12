"""汎用 AI ジョブ（要約・チャット）の作成と取得ユースケース。

責務: 入力検証・所有者確認・トークン上限チェックを行い、AIJob を
    pending 状態で作成・参照する。実行は job_runner が非同期に行う。
主要なエクスポート: AIJobUseCases
呼び出し関係: assistant/router.py から呼ばれ、job_runner.py が処理する。
    既存の EditJobUseCases（編集専用）を要約・チャット向けに一般化したもの。
"""

from uuid import UUID

from sqlmodel import Session

from app.db_commit import commit_with_error_handling
from app.features.assistant.job_payloads import (
    AIJobInput,
    ChatJobInput,
    SummarizeJobInput,
    encode,
)
from app.features.assistant.repositories import AIJobRepository
from app.features.assistant.schemas import BedrockMessage
from app.features.assistant.use_cases.common import (
    ensure_token_limit,
    require_non_empty,
)
from app.features.workspace.use_cases import WorkspaceQueryUseCases
from app.models import AIJob
from app.models.enums import ChatScope


class AIJobUseCases:
    """要約・チャットの非同期ジョブの作成と取得を担うユースケース。"""

    def __init__(
        self,
        session: Session,
        user_id: str,
        workspace_queries: WorkspaceQueryUseCases,
    ):
        self.session = session
        self.user_id = user_id
        self.workspace_queries = workspace_queries
        self.repository = AIJobRepository(session, user_id)

    def _create(self, job_input: AIJobInput) -> AIJob:
        """トークン制限チェック後に pending ジョブを永続化する共通処理。

        kind の正は AIJob.kind 列で、入力モデル側の ClassVar と一致させる。
        """
        ensure_token_limit(self.session, self.user_id)
        job = AIJob(
            user_id=self.user_id,
            kind=job_input.kind,
            status="pending",
            input=encode(job_input),
        )
        self.session.add(job)
        commit_with_error_handling(self.session, "AIJob")
        self.session.refresh(job)
        return job

    def create_summarize_job(self, note_id: UUID) -> AIJob:
        """要約ジョブを作成する。ノートの所有権・存在を作成時に検証する。"""
        self.workspace_queries.get_owned_note(note_id)
        return self._create(SummarizeJobInput(note_id=note_id))

    def create_chat_job(
        self,
        *,
        scope: ChatScope,
        question: str,
        history: list[BedrockMessage] | None = None,
        note_id: UUID | None = None,
        folder_id: UUID | None = None,
        selected_content: str | None = None,
    ) -> AIJob:
        """チャットジョブを作成する。入力検証と（ノート指定時）所有権確認を行う。"""
        require_non_empty(question, "Question is empty")
        if scope == ChatScope.SELECTION:
            require_non_empty(selected_content or "", "Selected content is empty")
        if note_id is not None:
            self.workspace_queries.get_owned_note(note_id)

        return self._create(
            ChatJobInput(
                scope=scope,
                question=question,
                history=history or None,
                note_id=note_id,
                folder_id=folder_id,
                selected_content=selected_content,
            )
        )

    def get_job(self, job_id: UUID) -> AIJob:
        """指定 ID の AI ジョブを取得する。所有者でない場合は NotFound を送出。"""
        return self.repository.get_owned(job_id)
