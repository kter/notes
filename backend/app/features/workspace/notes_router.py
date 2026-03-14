from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.features.workspace.note_service import NoteService
from app.models import NoteCreate, NoteRead, NoteUpdate

router = APIRouter()


def get_note_service(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> NoteService:
    return NoteService(session, user_id)


@router.get("", response_model=list[NoteRead])
def list_notes(
    service: Annotated[NoteService, Depends(get_note_service)],
    folder_id: UUID | None = Query(default=None),
):
    """List notes for the current user, optionally filtered by folder."""
    return service.list_notes(folder_id)


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(
    note_in: NoteCreate,
    service: Annotated[NoteService, Depends(get_note_service)],
):
    """Create a new note."""
    return service.create_note(note_in)


@router.get("/{note_id}", response_model=NoteRead)
def get_note(
    note_id: UUID,
    service: Annotated[NoteService, Depends(get_note_service)],
):
    """Get a specific note by ID."""
    return service.get_note(note_id)


@router.patch("/{note_id}", response_model=NoteRead)
def update_note(
    note_id: UUID,
    note_in: NoteUpdate,
    service: Annotated[NoteService, Depends(get_note_service)],
):
    """Update a note."""
    return service.update_note(note_id, note_in)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: UUID,
    service: Annotated[NoteService, Depends(get_note_service)],
):
    """Delete a note."""
    service.delete_note(note_id)


@router.get("/export/all")
def export_notes(
    service: Annotated[NoteService, Depends(get_note_service)],
):
    """Export all notes as a ZIP file, maintaining folder structure."""
    archive = service.export_notes_archive()

    return StreamingResponse(
        iter([archive.data]),
        media_type="application/x-zip-compressed",
        headers={"Content-Disposition": f"attachment; filename={archive.filename}"},
    )
