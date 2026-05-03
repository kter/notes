"""フォルダの CRUD アプリケーションユースケース。

責務: フォルダの一覧取得・作成・取得・更新・soft delete を担う。
主要なエクスポート: FolderUseCases
呼び出し関係: WorkspaceChangesUseCase および直接 REST エンドポイントから
    呼ばれ、FolderRepository に処理を委譲する。
"""

import logging
from uuid import UUID

from sqlmodel import Session

from app.features.workspace.repositories import FolderRepository
from app.logging_utils import log_event
from app.models import Folder, FolderCreate, FolderUpdate

logger = logging.getLogger(__name__)


class FolderUseCases:
    """フォルダ CRUD フローのアプリケーションユースケース。"""

    def __init__(self, session: Session, user_id: str):
        self.repository = FolderRepository(session, user_id)

    def list_folders(self) -> list[Folder]:
        """ユーザーが所有するフォルダを一覧取得する。

        失敗時はエラーログを記録して例外を再送出する。
        """
        try:
            return self.repository.list()
        except Exception:
            log_event(
                logger,
                logging.ERROR,
                "workspace.folders.list_failed",
                exc_info=True,
            )
            raise

    def create_folder(self, folder_in: FolderCreate) -> Folder:
        """フォルダを新規作成し、監査ログを記録して返す。"""
        folder = self.repository.create(folder_in)
        log_event(
            logger,
            logging.INFO,
            "audit.folder.created",
            folder_id=folder.id,
            outcome="success",
        )
        return folder

    def get_folder(self, folder_id: UUID) -> Folder:
        """指定 ID のフォルダを所有者確認付きで取得する。"""
        return self.repository.get_owned(folder_id)

    def update_folder(self, folder_id: UUID, folder_in: FolderUpdate) -> Folder:
        """フォルダを更新し、変更フィールドを監査ログに記録して返す。"""
        folder = self.repository.update(folder_id, folder_in)
        log_event(
            logger,
            logging.INFO,
            "audit.folder.updated",
            folder_id=folder.id,
            changed_fields=sorted(folder_in.model_dump(exclude_unset=True).keys()),
            outcome="success",
        )
        return folder

    def delete_folder(self, folder_id: UUID) -> None:
        """フォルダを soft delete（deleted_at を現在時刻に設定）し、監査ログを記録する。

        物理削除は行わず、スナップショット取得時に削除済みとして返される。
        """
        self.repository.soft_delete(folder_id)
        log_event(
            logger,
            logging.INFO,
            "audit.folder.deleted",
            folder_id=folder_id,
            outcome="success",
        )
