from datetime import UTC, datetime
from uuid import UUID

from sqlmodel import Session, select

from app.auth.dependencies import get_owned_resource
from app.db_commit import commit_with_error_handling
from app.models import Folder, FolderCreate, FolderUpdate


class FolderService:
    """Application service for folder CRUD flows."""

    def __init__(self, session: Session, user_id: str):
        self.session = session
        self.user_id = user_id

    def list_folders(self) -> list[Folder]:
        statement = (
            select(Folder)
            .where(Folder.user_id == self.user_id)
            .order_by(Folder.updated_at.desc())
        )
        return self.session.exec(statement).all()

    def create_folder(self, folder_in: FolderCreate) -> Folder:
        folder = Folder(**folder_in.model_dump(), user_id=self.user_id)
        self.session.add(folder)
        commit_with_error_handling(self.session, "Folder")
        self.session.refresh(folder)
        return folder

    def get_folder(self, folder_id: UUID) -> Folder:
        return get_owned_resource(
            self.session, Folder, folder_id, self.user_id, "Folder"
        )

    def update_folder(self, folder_id: UUID, folder_in: FolderUpdate) -> Folder:
        folder = self.get_folder(folder_id)
        for key, value in folder_in.model_dump(exclude_unset=True).items():
            setattr(folder, key, value)

        folder.updated_at = datetime.now(UTC)
        self.session.add(folder)
        commit_with_error_handling(self.session, "Folder")
        self.session.refresh(folder)
        return folder

    def delete_folder(self, folder_id: UUID) -> None:
        folder = self.get_folder(folder_id)
        self.session.delete(folder)
        commit_with_error_handling(self.session, "Folder")
