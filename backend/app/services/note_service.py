from datetime import UTC, datetime
from uuid import UUID

from sqlmodel import Session, select

from app.auth.dependencies import get_owned_resource
from app.db_commit import commit_with_error_handling
from app.models import Note, NoteCreate, NoteUpdate


class NoteService:
    """Application service for note CRUD flows."""

    def __init__(self, session: Session, user_id: str):
        self.session = session
        self.user_id = user_id

    def list_notes(self, folder_id: UUID | None = None) -> list[Note]:
        statement = select(Note).where(Note.user_id == self.user_id)
        if folder_id is not None:
            statement = statement.where(Note.folder_id == folder_id)
        statement = statement.order_by(Note.updated_at.desc())
        return self.session.exec(statement).all()

    def create_note(self, note_in: NoteCreate) -> Note:
        note = Note(**note_in.model_dump(), user_id=self.user_id)
        self.session.add(note)
        commit_with_error_handling(self.session, "Note")
        self.session.refresh(note)
        return note

    def get_note(self, note_id: UUID) -> Note:
        return get_owned_resource(self.session, Note, note_id, self.user_id, "Note")

    def update_note(self, note_id: UUID, note_in: NoteUpdate) -> Note:
        note = self.get_note(note_id)
        for key, value in note_in.model_dump(exclude_unset=True).items():
            setattr(note, key, value)

        note.updated_at = datetime.now(UTC)
        self.session.add(note)
        commit_with_error_handling(self.session, "Note")
        self.session.refresh(note)
        return note

    def delete_note(self, note_id: UUID) -> None:
        note = self.get_note(note_id)
        self.session.delete(note)
        commit_with_error_handling(self.session, "Note")
