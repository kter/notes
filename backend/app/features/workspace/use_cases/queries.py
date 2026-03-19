from uuid import UUID

from sqlmodel import Session

from app.features.workspace.repositories import FolderRepository, NoteRepository
from app.models import Folder, Note


class WorkspaceQueryUseCases:
    """Read-oriented workspace access for same-feature and cross-feature flows."""

    def __init__(self, session: Session, user_id: str):
        self.note_repository = NoteRepository(session, user_id)
        self.folder_repository = FolderRepository(session, user_id)

    def get_owned_note(self, note_id: UUID) -> Note:
        return self.note_repository.get_owned(note_id)

    def get_owned_folder(self, folder_id: UUID) -> Folder:
        return self.folder_repository.get_owned(folder_id)

    def list_folder_notes(self, folder_id: UUID) -> list[Note]:
        return self.note_repository.list(folder_id)

    def list_all_notes(self) -> list[Note]:
        return self.note_repository.list()
