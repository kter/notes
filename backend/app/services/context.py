from collections.abc import Sequence
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.auth import UserId
from app.auth.dependencies import get_owned_resource
from app.models import Folder, Note
from app.models.enums import ChatScope


class ContextService:
    def __init__(self, session: Session, user_id: UserId):
        self.session = session
        self.user_id = user_id

    def _format_notes(self, notes: Sequence[Note]) -> str:
        return "\n\n".join([f"Note: {n.title}\n{n.content}" for n in notes])

    def get_context(
        self, scope: ChatScope, note_id: UUID | None = None, folder_id: UUID | None = None
    ) -> str:
        content = ""
        if scope == ChatScope.NOTE:
            if not note_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="note_id is required for note scope",
                )
            note = get_owned_resource(
                self.session, Note, note_id, self.user_id, "Note"
            )
            content = note.content
        elif scope == ChatScope.FOLDER:
            if not folder_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="folder_id is required for folder scope",
                )
            # Validate folder ownership
            get_owned_resource(self.session, Folder, folder_id, self.user_id, "Folder")

            # Get all notes in this folder
            statement = (
                select(Note)
                .where(Note.user_id == self.user_id)
                .where(Note.folder_id == folder_id)
            )
            notes = self.session.exec(statement).all()
            content = self._format_notes(notes)
        elif scope == ChatScope.ALL:
            # Get all notes for the user
            statement = select(Note).where(Note.user_id == self.user_id)
            notes = self.session.exec(statement).all()
            content = self._format_notes(notes)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid scope: {scope}",
            )

        if not content.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Context content is empty",
            )

        return content
