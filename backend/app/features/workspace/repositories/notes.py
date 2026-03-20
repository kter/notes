from datetime import UTC, datetime
from uuid import UUID

from sqlmodel import select

from app.core.persistence import UserScopedRepository
from app.models import Note, NoteCreate, NoteUpdate


class NoteRepository(UserScopedRepository[Note]):
    """Repository for user-scoped note persistence."""

    model = Note
    resource_name = "Note"

    def list(
        self,
        folder_id: UUID | None = None,
        *,
        include_deleted: bool = False,
    ) -> list[Note]:
        statement = select(Note).where(Note.user_id == self.user_id)
        if not include_deleted:
            statement = statement.where(Note.deleted_at.is_(None))
        if folder_id is not None:
            statement = statement.where(Note.folder_id == folder_id)
        statement = statement.order_by(Note.updated_at.desc())
        return self.session.exec(statement).all()

    def create(self, note_in: NoteCreate) -> Note:
        note = Note(**note_in.model_dump(), user_id=self.user_id)
        return self.save(note)

    def update(self, note_id: UUID, note_in: NoteUpdate) -> Note:
        note = self.get_owned(note_id)
        for key, value in note_in.model_dump(exclude_unset=True).items():
            setattr(note, key, value)
        return self.save(note, touch=True, bump=True)

    def soft_delete(self, note_id: UUID) -> Note:
        note = self.get_owned(note_id)
        note.deleted_at = datetime.now(UTC)
        return self.save(note, touch=True, bump=True)
