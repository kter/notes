from uuid import UUID

from sqlmodel import Session

from app.models import Folder, FolderCreate, FolderUpdate
from app.repositories.folder_repository import FolderRepository


class FolderService:
    """Application service for folder CRUD flows."""

    def __init__(self, session: Session, user_id: str):
        self.repository = FolderRepository(session, user_id)

    def list_folders(self) -> list[Folder]:
        return self.repository.list()

    def create_folder(self, folder_in: FolderCreate) -> Folder:
        return self.repository.create(folder_in)

    def get_folder(self, folder_id: UUID) -> Folder:
        return self.repository.get_owned(folder_id)

    def update_folder(self, folder_id: UUID, folder_in: FolderUpdate) -> Folder:
        return self.repository.update(folder_id, folder_in)

    def delete_folder(self, folder_id: UUID) -> None:
        self.repository.delete_owned(folder_id)
