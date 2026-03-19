from uuid import UUID

from sqlmodel import Session

from app.features.workspace.repositories.notes import NoteRepository
from app.models import Note, NoteCreate, NoteUpdate


class NoteUseCases:
    """Application use cases for note CRUD flows."""

    def __init__(self, session: Session, user_id: str):
        self.repository = NoteRepository(session, user_id)

    def list_notes(self, folder_id: UUID | None = None) -> list[Note]:
        return self.repository.list(folder_id)

    def create_note(self, note_in: NoteCreate) -> Note:
        return self.repository.create(note_in)

    def get_note(self, note_id: UUID) -> Note:
        return self.repository.get_owned(note_id)

    def update_note(self, note_id: UUID, note_in: NoteUpdate) -> Note:
        return self.repository.update(note_id, note_in)

    def delete_note(self, note_id: UUID) -> None:
        self.repository.delete_owned(note_id)
