from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.auth import UserId
from app.database import get_session
from app.models import Note, NoteCreate, NoteRead, NoteUpdate

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
    session.commit()
    session.refresh(note)
    return note


@router.get("/{note_id}", response_model=NoteRead)
def get_note(
    note_id: UUID,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Get a specific note by ID."""
    note = session.get(Note, note_id)
    if not note or note.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )
    return note


@router.patch("/{note_id}", response_model=NoteRead)
def update_note(
    note_id: UUID,
    note_in: NoteUpdate,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Update a note."""
    note = session.get(Note, note_id)
    if not note or note.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )

    update_data = note_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(note, key, value)

    note.updated_at = datetime.utcnow()
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: UUID,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Delete a note."""
    note = session.get(Note, note_id)
    if not note or note.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )

    session.delete(note)
    session.commit()
