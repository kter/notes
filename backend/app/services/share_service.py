from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.auth.dependencies import get_owned_resource
from app.db_commit import commit_with_error_handling
from app.models import Note, NoteShare, SharedNoteRead


class ShareService:
    """Application service for note sharing flows."""

    def __init__(self, session: Session, user_id: str | None = None):
        self.session = session
        self.user_id = user_id

    def create_share(self, note_id: UUID) -> NoteShare:
        self._ensure_owned_note(note_id)

        existing = self.session.exec(
            select(NoteShare).where(NoteShare.note_id == note_id)
        ).first()
        if existing is not None:
            return existing

        share = NoteShare(note_id=note_id)
        self.session.add(share)
        commit_with_error_handling(self.session, "NoteShare")
        self.session.refresh(share)
        return share

    def get_share(self, note_id: UUID) -> NoteShare | None:
        self._ensure_owned_note(note_id)
        return self.session.exec(
            select(NoteShare).where(NoteShare.note_id == note_id)
        ).first()

    def delete_share(self, note_id: UUID) -> None:
        self._ensure_owned_note(note_id)
        share = self.session.exec(
            select(NoteShare).where(NoteShare.note_id == note_id)
        ).first()
        if share is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Share not found",
            )

        self.session.delete(share)
        commit_with_error_handling(self.session, "NoteShare")

    def get_shared_note(self, token: UUID) -> SharedNoteRead:
        share = self.session.exec(
            select(NoteShare).where(NoteShare.share_token == token)
        ).first()
        if share is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Shared note not found",
            )

        if share.expires_at and share.expires_at < datetime.now(UTC):
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Share link has expired",
            )

        note = self.session.get(Note, share.note_id)
        if note is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Shared note not found",
            )

        return SharedNoteRead(
            title=note.title,
            content=note.content,
            updated_at=note.updated_at,
        )

    def _ensure_owned_note(self, note_id: UUID) -> Note:
        if self.user_id is None:
            raise RuntimeError("user_id is required for authenticated share flows")
        return get_owned_resource(self.session, Note, note_id, self.user_id, "Note")
