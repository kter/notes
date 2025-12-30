import io
import zipfile
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.auth import UserId
from app.auth.dependencies import get_owned_resource
from app.database import get_session
from app.models import Folder, Note, NoteCreate, NoteRead, NoteUpdate
from app.routers.db_exceptions import commit_with_error_handling

router = APIRouter()


@router.get("", response_model=list[NoteRead])
def list_notes(
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
    folder_id: UUID | None = Query(default=None),
):
    """List notes for the current user, optionally filtered by folder."""
    statement = select(Note).where(Note.user_id == user_id)

    if folder_id is not None:
        statement = statement.where(Note.folder_id == folder_id)

    statement = statement.order_by(Note.updated_at.desc())
    notes = session.exec(statement).all()
    return notes


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(
    note_in: NoteCreate,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Create a new note."""
    note = Note(**note_in.model_dump(), user_id=user_id)
    session.add(note)
    commit_with_error_handling(session, "Note")
    session.refresh(note)
    return note


@router.get("/{note_id}", response_model=NoteRead)
def get_note(
    note_id: UUID,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Get a specific note by ID."""
    note = get_owned_resource(session, Note, note_id, user_id, "Note")
    return note


@router.patch("/{note_id}", response_model=NoteRead)
def update_note(
    note_id: UUID,
    note_in: NoteUpdate,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Update a note."""
    note = get_owned_resource(session, Note, note_id, user_id, "Note")

    update_data = note_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(note, key, value)

    note.updated_at = datetime.now(UTC)
    session.add(note)
    commit_with_error_handling(session, "Note")
    session.refresh(note)
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: UUID,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Delete a note."""
    note = get_owned_resource(session, Note, note_id, user_id, "Note")

    session.delete(note)
    commit_with_error_handling(session, "Note")


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
