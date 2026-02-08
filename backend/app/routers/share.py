"""Share router for public note sharing."""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.auth import UserId
from app.auth.dependencies import get_owned_resource
from app.database import get_session
from app.models import Note, NoteShare, NoteShareRead, SharedNoteRead
from app.routers.db_exceptions import commit_with_error_handling

router = APIRouter()


# ----- Authenticated Endpoints -----


@router.post("/notes/{note_id}/share", response_model=NoteShareRead, status_code=status.HTTP_201_CREATED)
def create_share(
    note_id: UUID,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Create a share link for a note. Only the note owner can share."""
    # Verify ownership
    get_owned_resource(session, Note, note_id, user_id, "Note")

    # Check if share already exists
    existing = session.exec(
        select(NoteShare).where(NoteShare.note_id == note_id)
    ).first()

    if existing:
        return existing

    # Create new share
    share = NoteShare(note_id=note_id)
    session.add(share)
    commit_with_error_handling(session, "NoteShare")
    session.refresh(share)
    return share


@router.get("/notes/{note_id}/share", response_model=NoteShareRead | None)
def get_share(
    note_id: UUID,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Get the share info for a note. Returns null if not shared."""
    # Verify ownership
    get_owned_resource(session, Note, note_id, user_id, "Note")

    share = session.exec(
        select(NoteShare).where(NoteShare.note_id == note_id)
    ).first()

    return share


@router.delete("/notes/{note_id}/share", status_code=status.HTTP_204_NO_CONTENT)
def delete_share(
    note_id: UUID,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Revoke a share link for a note."""
    # Verify ownership
    get_owned_resource(session, Note, note_id, user_id, "Note")

    share = session.exec(
        select(NoteShare).where(NoteShare.note_id == note_id)
    ).first()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found",
        )

    session.delete(share)
    commit_with_error_handling(session, "NoteShare")


# ----- Public Endpoint (No Auth Required) -----


@router.get("/shared/{token}", response_model=SharedNoteRead)
def get_shared_note(
    token: UUID,
    session: Annotated[Session, Depends(get_session)],
):
    """Get a shared note by its token. No authentication required."""
    # Find the share record
    share = session.exec(
        select(NoteShare).where(NoteShare.share_token == token)
    ).first()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared note not found",
        )

    # Check expiration
    if share.expires_at and share.expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Share link has expired",
        )

    # Get the note
    note = session.get(Note, share.note_id)
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared note not found",
        )

    return SharedNoteRead(
        title=note.title,
        content=note.content,
        updated_at=note.updated_at,
    )
