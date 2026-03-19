from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.features.workspace.dependencies import get_folder_use_cases
from app.features.workspace.use_cases.folders import FolderUseCases
from app.models import FolderCreate, FolderRead, FolderUpdate

router = APIRouter()


@router.get("", response_model=list[FolderRead])
def list_folders(
    use_cases: Annotated[FolderUseCases, Depends(get_folder_use_cases)],
):
    """List all folders for the current user."""
    return use_cases.list_folders()


@router.post("", response_model=FolderRead, status_code=status.HTTP_201_CREATED)
def create_folder(
    folder_in: FolderCreate,
    use_cases: Annotated[FolderUseCases, Depends(get_folder_use_cases)],
):
    """Create a new folder."""
    return use_cases.create_folder(folder_in)


@router.get("/{folder_id}", response_model=FolderRead)
def get_folder(
    folder_id: UUID,
    use_cases: Annotated[FolderUseCases, Depends(get_folder_use_cases)],
):
    """Get a specific folder by ID."""
    return use_cases.get_folder(folder_id)


@router.patch("/{folder_id}", response_model=FolderRead)
def update_folder(
    folder_id: UUID,
    folder_in: FolderUpdate,
    use_cases: Annotated[FolderUseCases, Depends(get_folder_use_cases)],
):
    """Update a folder."""
    return use_cases.update_folder(folder_id, folder_in)


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(
    folder_id: UUID,
    use_cases: Annotated[FolderUseCases, Depends(get_folder_use_cases)],
):
    """Delete a folder."""
    use_cases.delete_folder(folder_id)
