from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.auth import UserId
from app.database import get_session
from app.models import Folder, FolderCreate, FolderRead, FolderUpdate

router = APIRouter()


@router.get("/", response_model=list[FolderRead])
def list_folders(
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """List all folders for the current user."""
    statement = (
        select(Folder)
        .where(Folder.user_id == user_id)
        .order_by(Folder.updated_at.desc())
    )
    folders = session.exec(statement).all()
    return folders


@router.post("/", response_model=FolderRead, status_code=status.HTTP_201_CREATED)
def create_folder(
    folder_in: FolderCreate,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Create a new folder."""
    folder = Folder(**folder_in.model_dump(), user_id=user_id)
    session.add(folder)
    session.commit()
    session.refresh(folder)
    return folder


@router.get("/{folder_id}", response_model=FolderRead)
def get_folder(
    folder_id: UUID,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Get a specific folder by ID."""
    folder = session.get(Folder, folder_id)
    if not folder or folder.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder not found",
        )
    return folder


@router.patch("/{folder_id}", response_model=FolderRead)
def update_folder(
    folder_id: UUID,
    folder_in: FolderUpdate,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Update a folder."""
    folder = session.get(Folder, folder_id)
    if not folder or folder.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder not found",
        )

    update_data = folder_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(folder, key, value)

    folder.updated_at = datetime.now(UTC)
    session.add(folder)
    session.commit()
    session.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(
    folder_id: UUID,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Delete a folder."""
    folder = session.get(Folder, folder_id)
    if not folder or folder.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder not found",
        )

    session.delete(folder)
    session.commit()
