"""ユーザースコープのフォルダ永続化リポジトリ。

責務: フォルダの一覧取得・作成・更新・ソフトデリートを提供する。
主要なエクスポート: FolderRepository
呼び出し関係: WorkspaceQueryUseCases および NoteExportUseCase から利用され、
    UserScopedRepository の共通 CRUD ヘルパーを継承する。
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlmodel import select

from app.core.persistence import UserScopedRepository, normalize_version
from app.models import Folder, FolderCreate, FolderUpdate


class FolderRepository(UserScopedRepository[Folder]):
    """ユーザースコープのフォルダ永続化リポジトリ。"""

    model = Folder
    resource_name = "Folder"

    def list(self, *, include_deleted: bool = False) -> list[Folder]:
        """ユーザーのフォルダ一覧を更新日時の降順で返す。削除済み除外に対応。"""
        statement = select(Folder).where(Folder.user_id == self.user_id)
        if not include_deleted:
            statement = statement.where(Folder.deleted_at.is_(None))
        folders = self.session.exec(statement).all()
        for folder in folders:
            normalize_version(folder)
        return sorted(
            folders,
            key=lambda folder: (folder.updated_at, str(folder.id)),
            reverse=True,
        )

    def create(self, folder_in: FolderCreate) -> Folder:
        """新規フォルダを作成して保存し、永続化済みのインスタンスを返す。"""
        folder = Folder(**folder_in.model_dump(), user_id=self.user_id)
        return self.save(folder)

    def update(self, folder_id: UUID, folder_in: FolderUpdate) -> Folder:
        """指定フォルダの差分フィールドを更新し、updated_at とバージョンをインクリメントする。"""
        folder = self.get_owned(folder_id)
        for key, value in folder_in.model_dump(exclude_unset=True).items():
            setattr(folder, key, value)
        return self.save(folder, touch=True, bump=True)

    def soft_delete(self, folder_id: UUID) -> Folder:
        """deleted_at を現在時刻に設定してフォルダを論理削除する。"""
        folder = self.get_owned(folder_id)
        folder.deleted_at = datetime.now(UTC)
        return self.save(folder, touch=True, bump=True)
