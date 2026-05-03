"""ノート共有フローのアプリケーションユースケース。

責務: 共有リンクの作成・取得・削除と、トークンによる公開ノート取得を実装する。
主要なエクスポート: ShareUseCases
呼び出し関係: share/router.py から呼ばれ、SQLModel セッションおよび
    WorkspaceQueryUseCases を依存として受け取る。
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlmodel import Session, select

from app.db_commit import commit_with_error_handling
from app.features.workspace.use_cases import WorkspaceQueryUseCases
from app.logging_utils import log_event
from app.models import Note, NoteShare, SharedNoteRead
from app.shared import NotFound, ShareExpired, ValidationFailed

logger = logging.getLogger(__name__)


class ShareUseCases:
    """ノート共有フローのアプリケーションユースケース。"""

    def __init__(
        self,
        session: Session,
        workspace_queries: WorkspaceQueryUseCases | None = None,
    ):
        self.session = session
        self.workspace_queries = workspace_queries

    def create_share(self, note_id: UUID) -> NoteShare:
        """ノートの共有レコードを作成する。既存の共有がある場合はそれを返す。"""
        self._ensure_owned_note(note_id)

        existing = self.session.exec(
            select(NoteShare).where(NoteShare.note_id == note_id)
        ).first()
        if existing is not None:
            log_event(
                logger,
                logging.INFO,
                "audit.share.created",
                note_id=note_id,
                share_id=existing.id,
                outcome="success",
            )
            return existing

        share = NoteShare(note_id=note_id)
        self.session.add(share)
        commit_with_error_handling(self.session, "NoteShare")
        self.session.refresh(share)
        log_event(
            logger,
            logging.INFO,
            "audit.share.created",
            note_id=note_id,
            share_id=share.id,
            outcome="success",
        )
        return share

    def get_share(self, note_id: UUID) -> NoteShare | None:
        """ノートの共有レコードを取得する。存在しない場合は None を返す。"""
        self._ensure_owned_note(note_id)
        return self.session.exec(
            select(NoteShare).where(NoteShare.note_id == note_id)
        ).first()

    def delete_share(self, note_id: UUID) -> None:
        """ノートの共有レコードを削除して共有リンクを無効化する。"""
        self._ensure_owned_note(note_id)
        share = self.session.exec(
            select(NoteShare).where(NoteShare.note_id == note_id)
        ).first()
        if share is None:
            raise NotFound("Share not found")

        self.session.delete(share)
        commit_with_error_handling(self.session, "NoteShare")
        log_event(
            logger,
            logging.INFO,
            "audit.share.revoked",
            note_id=note_id,
            share_id=share.id,
            outcome="success",
        )

    def get_shared_note(self, token: UUID) -> SharedNoteRead:
        """トークンで共有ノートを取得する。期限切れまたは削除済みの場合は例外を送出。"""
        share = self.session.exec(
            select(NoteShare).where(NoteShare.share_token == token)
        ).first()
        if share is None:
            raise NotFound("Shared note not found")

        if share.expires_at and share.expires_at < datetime.now(UTC):
            raise ShareExpired("Share link has expired")

        note = self.session.get(Note, share.note_id)
        if note is None or note.deleted_at is not None:
            raise NotFound("Shared note not found")

        log_event(
            logger,
            logging.INFO,
            "audit.share.accessed",
            note_id=note.id,
            share_id=share.id,
            outcome="success",
        )
        return SharedNoteRead(
            title=note.title,
            content=note.content,
            updated_at=note.updated_at,
        )

    def _ensure_owned_note(self, note_id: UUID) -> Note:
        """呼び出し元ユーザーが所有するノートを検証して返す。認証済みフロー専用。"""
        if self.workspace_queries is None:
            raise ValidationFailed(
                "workspace queries are required for authenticated share flows"
            )
        return self.workspace_queries.get_owned_note(note_id)
