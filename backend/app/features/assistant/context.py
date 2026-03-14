from collections.abc import Sequence
from uuid import UUID

from sqlmodel import Session

from app.auth import UserId
from app.features.workspace.query_service import WorkspaceQueryService
from app.models import Note
from app.models.enums import ChatScope
from app.shared import ValidationFailed


class ContextService:
    def __init__(self, session: Session, user_id: UserId):
        self.workspace_queries = WorkspaceQueryService(session, user_id)

    def _format_notes(self, notes: Sequence[Note]) -> str:
        return "\n\n".join([f"Note: {n.title}\n{n.content}" for n in notes])

    def get_context(
        self,
        scope: ChatScope,
        note_id: UUID | None = None,
        folder_id: UUID | None = None,
    ) -> str:
        content = ""
        if scope == ChatScope.NOTE:
            if not note_id:
                raise ValidationFailed("note_id is required for note scope")
            note = self.workspace_queries.get_owned_note(note_id)
            content = note.content
        elif scope == ChatScope.FOLDER:
            if not folder_id:
                raise ValidationFailed("folder_id is required for folder scope")
            self.workspace_queries.get_owned_folder(folder_id)
            notes = self.workspace_queries.list_folder_notes(folder_id)
            content = self._format_notes(notes)
        elif scope == ChatScope.ALL:
            notes = self.workspace_queries.list_all_notes()
            content = self._format_notes(notes)
        else:
            raise ValidationFailed(f"Invalid scope: {scope}")

        if not content.strip():
            raise ValidationFailed("Context content is empty")

        return content
