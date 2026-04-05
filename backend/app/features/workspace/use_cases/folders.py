import logging
from uuid import UUID

from sqlmodel import Session

from app.features.workspace.repositories import FolderRepository
from app.logging_utils import log_event
from app.models import Folder, FolderCreate, FolderUpdate

logger = logging.getLogger(__name__)


class FolderUseCases:
    """Application use cases for folder CRUD flows."""

    def __init__(self, session: Session, user_id: str):
        self.repository = FolderRepository(session, user_id)

    def list_folders(self) -> list[Folder]:
        return self.repository.list()

    def create_folder(self, folder_in: FolderCreate) -> Folder:
        folder = self.repository.create(folder_in)
        log_event(
            logger,
            logging.INFO,
            "audit.folder.created",
            folder_id=folder.id,
            outcome="success",
        )
        return folder

    def get_folder(self, folder_id: UUID) -> Folder:
        return self.repository.get_owned(folder_id)

    def update_folder(self, folder_id: UUID, folder_in: FolderUpdate) -> Folder:
        folder = self.repository.update(folder_id, folder_in)
        log_event(
            logger,
            logging.INFO,
            "audit.folder.updated",
            folder_id=folder.id,
            changed_fields=sorted(folder_in.model_dump(exclude_unset=True).keys()),
            outcome="success",
        )
        return folder

    def delete_folder(self, folder_id: UUID) -> None:
        self.repository.soft_delete(folder_id)
        log_event(
            logger,
            logging.INFO,
            "audit.folder.deleted",
            folder_id=folder_id,
            outcome="success",
        )
