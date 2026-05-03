"""AI 編集ジョブの作成と取得ユースケース。

責務: ジョブの入力検証・所有者確認・トークン上限チェックを行い、
    AIEditJob レコードを作成・参照する。
主要なエクスポート: EditJobUseCases
呼び出し関係: assistant/router.py から呼ばれ、
    job_runner.py によってジョブがバックグラウンド処理される。
"""

from uuid import UUID

from sqlmodel import Session

from app.features.assistant.use_cases.common import (
    ensure_token_limit,
    require_non_empty,
)
from app.features.workspace.use_cases import WorkspaceQueryUseCases
from app.models import AIEditJob, AIEditJobCreate
from app.shared import NotFound


class EditJobUseCases:
    """AI 編集ジョブの作成と取得を担うアプリケーションユースケース。"""

    def __init__(
        self,
        session: Session,
        user_id: str,
        workspace_queries: WorkspaceQueryUseCases,
    ):
        self.session = session
        self.user_id = user_id
        self.workspace_queries = workspace_queries

    def create_job(self, job_in: AIEditJobCreate) -> AIEditJob:
        """入力検証とトークン制限チェックを行い、pending 状態の AI 編集ジョブを作成する。"""
        require_non_empty(job_in.content, "Content is empty")
        require_non_empty(job_in.instruction, "Instruction is empty")
        if job_in.note_id is not None:
            self.workspace_queries.get_owned_note(job_in.note_id)

        ensure_token_limit(self.session, self.user_id)

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

    def get_job(self, job_id: UUID) -> AIEditJob:
        """指定 ID の AI 編集ジョブを取得する。所有者でない場合は NotFound を送出。"""
        job = self.session.get(AIEditJob, job_id)
        if job is None or job.user_id != self.user_id:
            raise NotFound("Edit job not found")
        return job
