"""ノートの CRUD アプリケーションユースケース。

責務: ノートの一覧取得・作成・取得・更新・soft delete を担う。
主要なエクスポート: NoteUseCases
呼び出し関係: WorkspaceChangesUseCase および直接 REST エンドポイントから
    呼ばれ、NoteRepository に処理を委譲する。
"""

import logging
from uuid import UUID

from sqlmodel import Session

from app.features.workspace.repositories import NoteRepository
from app.logging_utils import log_event
from app.models import Note, NoteCreate, NoteUpdate

logger = logging.getLogger(__name__)


class NoteUseCases:
    """ノート CRUD フローのアプリケーションユースケース。"""

    def __init__(self, session: Session, user_id: str):
        self.repository = NoteRepository(session, user_id)

    def list_notes(self, folder_id: UUID | None = None) -> list[Note]:
        """ユーザーが所有するノートを一覧取得する。

        folder_id を指定した場合は該当フォルダのノートのみ返す。
        失敗時はエラーログを記録して例外を再送出する。
        """
        try:
            return self.repository.list(folder_id)
        except Exception:
            log_event(
                logger,
                logging.ERROR,
                "workspace.notes.list_failed",
                exc_info=True,
                folder_id=folder_id,
            )
            raise

    def create_note(self, note_in: NoteCreate) -> Note:
        """ノートを新規作成し、監査ログを記録して返す。"""
        note = self.repository.create(note_in)
        log_event(
            logger,
            logging.INFO,
            "audit.note.created",
            note_id=note.id,
            folder_id=note.folder_id,
            outcome="success",
        )
        return note

    def get_note(self, note_id: UUID) -> Note:
        """指定 ID のノートを所有者確認付きで取得する。"""
        return self.repository.get_owned(note_id)

    def update_note(self, note_id: UUID, note_in: NoteUpdate) -> Note:
        """ノートを更新し、変更フィールドを監査ログに記録して返す。"""
        note = self.repository.update(note_id, note_in)
        log_event(
            logger,
            logging.INFO,
            "audit.note.updated",
            note_id=note.id,
            changed_fields=sorted(note_in.model_dump(exclude_unset=True).keys()),
            outcome="success",
        )
        return note

    def delete_note(self, note_id: UUID) -> None:
        """ノートを soft delete（deleted_at を現在時刻に設定）し、監査ログを記録する。

        物理削除は行わず、スナップショット取得時に削除済みとして返される。
        """
        self.repository.soft_delete(note_id)
        log_event(
            logger,
            logging.INFO,
            "audit.note.deleted",
            note_id=note_id,
            outcome="success",
        )
