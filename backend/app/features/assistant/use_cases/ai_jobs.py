"""汎用 AI ジョブ（要約・チャット）の作成と取得ユースケース。

責務: 入力検証・所有者確認・トークン上限チェックを行い、AIJob を
    pending 状態で作成・参照する。実行は job_runner が非同期に行う。
主要なエクスポート: AIJobUseCases
呼び出し関係: assistant/router.py から呼ばれ、job_runner.py が処理する。
    既存の EditJobUseCases（編集専用）を要約・チャット向けに一般化したもの。
"""

import json
from uuid import UUID

from sqlmodel import Session

from app.db_commit import commit_with_error_handling
from app.features.assistant.use_cases.common import (
    ensure_token_limit,
    require_non_empty,
)
from app.features.workspace.use_cases import WorkspaceQueryUseCases
from app.models import AIJob
from app.models.enums import ChatScope
from app.shared import NotFound


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

    def _create(self, kind: str, payload: dict) -> AIJob:
        """トークン制限チェック後に pending ジョブを永続化する共通処理。"""
        ensure_token_limit(self.session, self.user_id)
        job = AIJob(
            user_id=self.user_id,
            kind=kind,
            status="pending",
            input=json.dumps(payload),
        )
        self.session.add(job)
        commit_with_error_handling(self.session, "AIJob")
        self.session.refresh(job)
        return job

    def create_summarize_job(self, note_id: UUID) -> AIJob:
        """要約ジョブを作成する。ノートの所有権・存在を作成時に検証する。"""
        self.workspace_queries.get_owned_note(note_id)
        return self._create("summarize", {"note_id": str(note_id)})

    def create_chat_job(
        self,
        *,
        scope: ChatScope,
        question: str,
        history: list | None = None,
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

        payload = {
            "scope": scope.value,
            "question": question,
            # BedrockMessage 等の pydantic オブジェクト or dict を JSON 化する
            "history": [
                msg.model_dump() if hasattr(msg, "model_dump") else dict(msg)
                for msg in history
            ]
            if history
            else None,
            "note_id": str(note_id) if note_id else None,
            "folder_id": str(folder_id) if folder_id else None,
            "selected_content": selected_content,
        }
        return self._create("chat", payload)

    def get_job(self, job_id: UUID) -> AIJob:
        """指定 ID の AI ジョブを取得する。所有者でない場合は NotFound を送出。"""
        job = self.session.get(AIJob, job_id)
        if job is None or job.user_id != self.user_id:
            raise NotFound("AI job not found")
        return job
