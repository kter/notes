from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session, select

from app.auth import UserId
from app.auth.dependencies import get_owned_resource
from app.database import get_session
from app.models import Note, NoteCreate, NoteRead, NoteUpdate
from app.routers.db_exceptions import commit_with_error_handling

router = APIRouter()


@router.get("/", response_model=list[NoteRead])
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


@router.post("/", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
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
