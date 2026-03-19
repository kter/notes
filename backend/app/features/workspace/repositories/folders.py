from datetime import UTC, datetime
from uuid import UUID

from sqlmodel import select

from app.core.persistence import UserScopedRepository
from app.models import Folder, FolderCreate, FolderUpdate


class FolderRepository(UserScopedRepository[Folder]):
    """Repository for user-scoped folder persistence."""

    model = Folder
    resource_name = "Folder"

    def list(self, *, include_deleted: bool = False) -> list[Folder]:
        statement = select(Folder).where(Folder.user_id == self.user_id)
        if not include_deleted:
            statement = statement.where(Folder.deleted_at.is_(None))
        statement = statement.order_by(Folder.updated_at.desc())
        return self.session.exec(statement).all()

    def create(self, folder_in: FolderCreate) -> Folder:
        folder = Folder(**folder_in.model_dump(), user_id=self.user_id)
        return self.save(folder)

    def update(self, folder_id: UUID, folder_in: FolderUpdate) -> Folder:
        folder = self.get_owned(folder_id)
        for key, value in folder_in.model_dump(exclude_unset=True).items():
            setattr(folder, key, value)
        return self.save(folder, touch=True, bump=True)

    def soft_delete(self, folder_id: UUID) -> Folder:
        folder = self.get_owned(folder_id)
        folder.deleted_at = datetime.now(UTC)
        return self.save(folder, touch=True, bump=True)
