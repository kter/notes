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

    def get_snapshot(
        self, since_cursor: str | None = None
    ) -> WorkspaceSnapshotResponse:
        """フォルダ・ノートのスナップショットを返す。

        since_cursor が指定された場合は、そのカーソル時刻より後に更新された
        エントリのみ（削除済みの tombstone を含む）を差分として返す。未指定の
        場合は全件を返す（初回ブートストラップ用）。いずれも soft delete 済みを
        含めることで、クライアントは削除も含めてローカル DB と同期できる。
        失敗時はエラーログを記録して例外を再送出する。
        """
        try:
            updated_after = self._parse_cursor(since_cursor)
            folders = [
                FolderRead.model_validate(folder)
                for folder in self.workspace_queries.list_folders(
                    include_deleted=True, updated_after=updated_after
                )
            ]
            notes = [
                NoteRead.model_validate(note)
                for note in self.workspace_queries.list_all_notes(
                    include_deleted=True, updated_after=updated_after
                )
            ]
            server_time = datetime.now(UTC)
            # 差分が空のときは起点カーソルを維持し、巻き戻りを防ぐ。
            fallback = updated_after or server_time
            cursor = self._build_cursor(folders, notes, fallback)
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
    def _parse_cursor(since_cursor: str | None) -> datetime | None:
        """カーソル文字列を tz-aware な datetime に変換する。

        None・空文字・解析不能な値は None（差分なし＝全件取得）として扱う。
        tzinfo が欠落している場合は UTC を補完する。
        """
        if not since_cursor:
            return None
        try:
            parsed = datetime.fromisoformat(since_cursor)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed

    @staticmethod
    def _build_cursor(
        folders: list[FolderRead], notes: list[NoteRead], fallback: datetime
    ) -> str:
        """スナップショットのカーソルを算出して返す。

        返却したフォルダ・ノートの updated_at の最大値を ISO 8601 文字列にして返す。
        差分が空の場合は fallback（起点カーソルまたはサーバー時刻）を使用し、
        カーソルが過去に巻き戻らないようにする。
        """
        latest_updated_at = max(
            [item.updated_at for item in folders] + [item.updated_at for item in notes],
            default=fallback,
        )
        return latest_updated_at.isoformat()
