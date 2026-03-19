from datetime import UTC, datetime

from sqlmodel import Session

from app.features.workspace.schemas import WorkspaceSnapshotResponse
from app.features.workspace.use_cases.queries import WorkspaceQueryUseCases
from app.models import FolderRead, NoteRead


class WorkspaceSnapshotUseCase:
    """Build a consolidated workspace snapshot for client bootstrap and sync."""

    def __init__(self, session: Session, user_id: str):
        self.workspace_queries = WorkspaceQueryUseCases(session, user_id)

    def get_snapshot(self) -> WorkspaceSnapshotResponse:
        folders = [
            FolderRead.model_validate(folder)
            for folder in self.workspace_queries.list_folders(include_deleted=True)
        ]
        notes = [
            NoteRead.model_validate(note)
            for note in self.workspace_queries.list_all_notes(include_deleted=True)
        ]
        server_time = datetime.now(UTC)
        cursor = self._build_cursor(folders, notes, server_time)
        return WorkspaceSnapshotResponse(
            folders=folders,
            notes=notes,
            cursor=cursor,
            server_time=server_time,
        )

    @staticmethod
    def _build_cursor(
        folders: list[FolderRead], notes: list[NoteRead], server_time: datetime
    ) -> str:
        latest_updated_at = max(
            [item.updated_at for item in folders] + [item.updated_at for item in notes],
            default=server_time,
        )
        return latest_updated_at.isoformat()
