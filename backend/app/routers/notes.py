import io
import zipfile
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.auth import UserId
from app.database import get_session
from app.models import Folder, Note, NoteCreate, NoteRead, NoteUpdate
from app.services.note_service import NoteService

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
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Export all notes as a ZIP file, maintaining folder structure."""
    # Fetch all folders and notes for the user
    folders = session.exec(select(Folder).where(Folder.user_id == user_id)).all()
    notes = session.exec(select(Note).where(Note.user_id == user_id)).all()

    folder_map = {folder.id: folder.name for folder in folders}

    # Create ZIP in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # Track used filenames to handle duplicates
        used_paths = set()

        for note in notes:
            # Determine folder path
            folder_name = folder_map.get(note.folder_id) if note.folder_id else None

            # Sanitize folder name
            if folder_name:
                folder_path = "".join(
                    c for c in folder_name if c.isalnum() or c in (" ", "-", "_")
                ).strip()
            else:
                folder_path = ""

            # Determine filename
            title = note.title.strip() if note.title else "Untitled"
            base_filename = "".join(
                c for c in title if c.isalnum() or c in (" ", "-", "_")
            ).strip()
            if not base_filename:
                base_filename = "Untitled"

            # Ensure unique path
            rel_path = (
                f"{folder_path}/{base_filename}.md"
                if folder_path
                else f"{base_filename}.md"
            )
            counter = 1
            while rel_path in used_paths:
                new_filename = f"{base_filename} ({counter})"
                rel_path = (
                    f"{folder_path}/{new_filename}.md"
                    if folder_path
                    else f"{new_filename}.md"
                )
                counter += 1

            used_paths.add(rel_path)

            # Write to ZIP
            zip_file.writestr(rel_path, note.content)

    zip_buffer.seek(0)

    filename = f"notes_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"

    return StreamingResponse(
        zip_buffer,
        media_type="application/x-zip-compressed",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
