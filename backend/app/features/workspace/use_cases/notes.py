import logging
from uuid import UUID

from sqlmodel import Session

from app.features.workspace.repositories import NoteRepository
from app.logging_utils import log_event
from app.models import Note, NoteCreate, NoteUpdate

logger = logging.getLogger(__name__)


class NoteUseCases:
    """Application use cases for note CRUD flows."""

    def __init__(self, session: Session, user_id: str):
        self.repository = NoteRepository(session, user_id)

    def list_notes(self, folder_id: UUID | None = None) -> list[Note]:
        return self.repository.list(folder_id)

    def create_note(self, note_in: NoteCreate) -> Note:
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
        return self.repository.get_owned(note_id)

    def update_note(self, note_id: UUID, note_in: NoteUpdate) -> Note:
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
        self.repository.soft_delete(note_id)
        log_event(
            logger,
            logging.INFO,
            "audit.note.deleted",
            note_id=note_id,
            outcome="success",
        )
