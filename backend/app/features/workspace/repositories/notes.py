"""ユーザースコープのノート永続化リポジトリ。

責務: ノートの一覧取得・作成・更新・ソフトデリートを提供する。
主要なエクスポート: NoteRepository
呼び出し関係: WorkspaceQueryUseCases および NoteExportUseCase から利用され、
    UserScopedRepository の共通 CRUD ヘルパーを継承する。
"""

# `list` メソッド定義後にクラス名前空間で組み込み list が隠蔽されるため、
# 後続メソッドの `list[Note]` 注釈を遅延評価（文字列化）して解決する。
from __future__ import annotations

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
        updated_after: datetime | None = None,
    ) -> list[Note]:
        """ユーザーのノート一覧を更新日時の降順で返す。

        フォルダ絞り込み・削除済み除外に加え、updated_after を指定すると
        その時刻より後に更新されたノートのみを返す（差分同期用）。
        """
        statement = select(Note).where(Note.user_id == self.user_id)
        if not include_deleted:
            statement = statement.where(Note.deleted_at.is_(None))
        if folder_id is not None:
            statement = statement.where(Note.folder_id == folder_id)
        if updated_after is not None:
            statement = statement.where(Note.updated_at > updated_after)
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
        """指定ノートの差分フィールドを更新し、updated_at とバージョンをインクリメントする。

        クライアントが明示的に送ったフィールドのみを適用する。model_fields_set を
        用いることで、`folder_id` を `null` に明示設定して「フォルダ外（全ノート）」へ
        移動するケースも正しく反映できる（exclude_unset の dump では既定値 None と
        区別できず、明示的な null が握り潰されていた）。
        """
        note = self.get_owned(note_id)
        for key in note_in.model_fields_set:
            setattr(note, key, getattr(note_in, key))
        return self.save(note, touch=True, bump=True)

    def soft_delete(self, note_id: UUID) -> Note:
        """deleted_at を現在時刻に設定してノートを論理削除する。"""
        note = self.get_owned(note_id)
        note.deleted_at = datetime.now(UTC)
        return self.save(note, touch=True, bump=True)

    def clear_folder(self, folder_id: UUID) -> list[Note]:
        """指定フォルダに属する未削除ノートの folder_id を解除する。

        フォルダの論理削除時に呼び出し、子ノートが存在しないフォルダを参照し続ける
        「孤立」状態を防ぐ。Aurora DSQL には外部キー制約がないため、この整合性は
        アプリケーション層で明示的に担保する必要がある。
        更新したノートは version / updated_at をインクリメントしてクライアントへ
        同期されるようにする。
        """
        notes = self.list(folder_id=folder_id)
        for note in notes:
            note.folder_id = None
            self.save(note, touch=True, bump=True)
        return notes
