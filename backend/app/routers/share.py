"""Share router for public note sharing."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.models import NoteShareRead, SharedNoteRead
from app.services.share_service import ShareService

router = APIRouter()


def get_share_service(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> ShareService:
    return ShareService(session, user_id)


def get_public_share_service(
    session: Annotated[Session, Depends(get_session)],
) -> ShareService:
    return ShareService(session)


# ----- Authenticated Endpoints -----


@router.post(
    "/notes/{note_id}/share",
    response_model=NoteShareRead,
    status_code=status.HTTP_201_CREATED,
)
def create_share(
    note_id: UUID,
    service: Annotated[ShareService, Depends(get_share_service)],
):
    """Create a share link for a note. Only the note owner can share."""
    return service.create_share(note_id)


@router.get("/notes/{note_id}/share", response_model=NoteShareRead | None)
def get_share(
    note_id: UUID,
    service: Annotated[ShareService, Depends(get_share_service)],
):
    """Get the share info for a note. Returns null if not shared."""
    return service.get_share(note_id)


@router.delete("/notes/{note_id}/share", status_code=status.HTTP_204_NO_CONTENT)
def delete_share(
    note_id: UUID,
    service: Annotated[ShareService, Depends(get_share_service)],
):
    """Revoke a share link for a note."""
    service.delete_share(note_id)


# ----- Public Endpoint (No Auth Required) -----


@router.get("/shared/{token}", response_model=SharedNoteRead)
def get_shared_note(
    token: UUID,
    service: Annotated[ShareService, Depends(get_public_share_service)],
):
    """Get a shared note by its token. No authentication required."""
    return service.get_shared_note(token)
