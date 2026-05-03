"""ワークスペーススナップショット構築ユースケース。

責務: 全フォルダ・ノート（soft delete 済みを含む）を取得し、
    カーソルを算出して WorkspaceSnapshotResponse を組み立てる。
主要なエクスポート: WorkspaceSnapshotUseCase
呼び出し関係: snapshot エンドポイントおよび WorkspaceChangesUseCase から
    呼ばれ、WorkspaceQueryUseCases に読み取りを委譲する。
"""

import logging
from datetime import UTC, datetime

from sqlmodel import Session

from app.features.workspace.schemas import WorkspaceSnapshotResponse
from app.features.workspace.use_cases.queries import WorkspaceQueryUseCases
from app.logging_utils import log_event
from app.models import FolderRead, NoteRead

logger = logging.getLogger(__name__)


class WorkspaceSnapshotUseCase:
    """クライアントのブートストラップおよび同期用スナップショットを構築する。"""

    def __init__(self, session: Session, user_id: str):
        self.workspace_queries = WorkspaceQueryUseCases(session, user_id)

    def get_snapshot(self) -> WorkspaceSnapshotResponse:
        """全フォルダ・ノートを取得しスナップショットを返す。

        include_deleted=True を指定することで soft delete 済みエントリも含める。
        クライアントはこの一覧でローカル DB と差分同期を行う。
        失敗時はエラーログを記録して例外を再送出する。
        """
        try:
            folders = [
                FolderRead.model_validate(folder)
                for folder in self.workspace_queries.list_folders(include_deleted=True)
            ]
            notes = [
                NoteRead.model_validate(note)
                for note in self.workspace_queries.list_all_notes(include_deleted=True)
            ]
            server_time = datetime.now(UTC)
            cursor = self._build_cursor(folders, notes, server_time)
            return WorkspaceSnapshotResponse(
                folders=folders,
                notes=notes,
                cursor=cursor,
                server_time=server_time,
            )
        except Exception:
            log_event(
                logger,
                logging.ERROR,
                "workspace.snapshot.build_failed",
                exc_info=True,
            )
            raise

    @staticmethod
    def _build_cursor(
        folders: list[FolderRead], notes: list[NoteRead], server_time: datetime
    ) -> str:
        """スナップショットのカーソルを算出して返す。

        全フォルダ・ノートの updated_at の最大値を ISO 8601 文字列にして返す。
        エントリが1件もない場合は server_time をデフォルト値として使用する。
        """
        latest_updated_at = max(
            [item.updated_at for item in folders] + [item.updated_at for item in notes],
            default=server_time,
        )
        return latest_updated_at.isoformat()
