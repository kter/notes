"""ユーザースコープのノート永続化リポジトリ。

責務: ノートの一覧取得・作成・更新・ソフトデリートを提供する。
主要なエクスポート: NoteRepository
呼び出し関係: WorkspaceQueryUseCases および NoteExportUseCase から利用され、
    UserScopedRepository の共通 CRUD ヘルパーを継承する。
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlmodel import select

from app.core.persistence import UserScopedRepository, normalize_version
from app.models import Note, NoteCreate, NoteUpdate


class NoteRepository(UserScopedRepository[Note]):
    """ユーザースコープのノート永続化リポジトリ。"""

    model = Note
    resource_name = "Note"

    def list(
        self,
        folder_id: UUID | None = None,
        *,
        include_deleted: bool = False,
    ) -> list[Note]:
        """ユーザーのノート一覧を更新日時の降順で返す。フォルダ絞り込みと削除済み除外に対応。"""
        statement = select(Note).where(Note.user_id == self.user_id)
        if not include_deleted:
            statement = statement.where(Note.deleted_at.is_(None))
        if folder_id is not None:
            statement = statement.where(Note.folder_id == folder_id)
        notes = self.session.exec(statement).all()
        for note in notes:
            normalize_version(note)
        return sorted(
            notes,
            key=lambda note: (note.updated_at, str(note.id)),
            reverse=True,
        )

    def create(self, note_in: NoteCreate) -> Note:
        """新規ノートを作成して保存し、永続化済みのインスタンスを返す。"""
        note = Note(**note_in.model_dump(), user_id=self.user_id)
        return self.save(note)

    def update(self, note_id: UUID, note_in: NoteUpdate) -> Note:
        """指定ノートの差分フィールドを更新し、updated_at とバージョンをインクリメントする。"""
        note = self.get_owned(note_id)
        for key, value in note_in.model_dump(exclude_unset=True).items():
            setattr(note, key, value)
        return self.save(note, touch=True, bump=True)

    def soft_delete(self, note_id: UUID) -> Note:
        """deleted_at を現在時刻に設定してノートを論理削除する。"""
        note = self.get_owned(note_id)
        note.deleted_at = datetime.now(UTC)
        return self.save(note, touch=True, bump=True)
