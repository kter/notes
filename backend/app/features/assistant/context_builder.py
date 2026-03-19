from collections.abc import Sequence
from uuid import UUID

from app.features.workspace.use_cases.queries import WorkspaceQueryUseCases
from app.models import Note
from app.models.enums import ChatScope
from app.shared import ValidationFailed


class ContextBuilder:
    def __init__(self, workspace_queries: WorkspaceQueryUseCases):
        self.workspace_queries = workspace_queries

    def _format_notes(self, notes: Sequence[Note]) -> str:
        return "\n\n".join([f"Note: {n.title}\n{n.content}" for n in notes])

    def build(
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
