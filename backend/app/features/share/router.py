"""Share router for public note sharing."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.features.share.dependencies import (
    get_public_share_use_cases,
    get_share_use_cases,
)
from app.features.share.use_cases import ShareUseCases
from app.models import NoteShareRead, SharedNoteRead

router = APIRouter()


@router.post(
    "/notes/{note_id}/share",
    response_model=NoteShareRead,
    status_code=status.HTTP_201_CREATED,
)
def create_share(
    note_id: UUID,
    use_cases: Annotated[ShareUseCases, Depends(get_share_use_cases)],
):
    """Create a share link for a note. Only the note owner can share."""
    return use_cases.create_share(note_id)


@router.get("/notes/{note_id}/share", response_model=NoteShareRead | None)
def get_share(
    note_id: UUID,
    use_cases: Annotated[ShareUseCases, Depends(get_share_use_cases)],
):
    """Get the share info for a note. Returns null if not shared."""
    return use_cases.get_share(note_id)


@router.delete("/notes/{note_id}/share", status_code=status.HTTP_204_NO_CONTENT)
def delete_share(
    note_id: UUID,
    use_cases: Annotated[ShareUseCases, Depends(get_share_use_cases)],
):
    """Revoke a share link for a note."""
    use_cases.delete_share(note_id)


@router.get("/shared/{token}", response_model=SharedNoteRead)
def get_shared_note(
    token: UUID,
    use_cases: Annotated[ShareUseCases, Depends(get_public_share_use_cases)],
):
    """Get a shared note by its token. No authentication required."""
    return use_cases.get_shared_note(token)
