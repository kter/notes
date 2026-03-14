from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.features.workspace.folder_service import FolderService
from app.models import FolderCreate, FolderRead, FolderUpdate

router = APIRouter()


def get_folder_service(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> FolderService:
    return FolderService(session, user_id)


@router.get("", response_model=list[FolderRead])
def list_folders(
    service: Annotated[FolderService, Depends(get_folder_service)],
):
    """List all folders for the current user."""
    return service.list_folders()


@router.post("", response_model=FolderRead, status_code=status.HTTP_201_CREATED)
def create_folder(
    folder_in: FolderCreate,
    service: Annotated[FolderService, Depends(get_folder_service)],
):
    """Create a new folder."""
    return service.create_folder(folder_in)


@router.get("/{folder_id}", response_model=FolderRead)
def get_folder(
    folder_id: UUID,
    service: Annotated[FolderService, Depends(get_folder_service)],
):
    """Get a specific folder by ID."""
    return service.get_folder(folder_id)


@router.patch("/{folder_id}", response_model=FolderRead)
def update_folder(
    folder_id: UUID,
    folder_in: FolderUpdate,
    service: Annotated[FolderService, Depends(get_folder_service)],
):
    """Update a folder."""
    return service.update_folder(folder_id, folder_in)


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(
    folder_id: UUID,
    service: Annotated[FolderService, Depends(get_folder_service)],
):
    """Delete a folder."""
    service.delete_folder(folder_id)
