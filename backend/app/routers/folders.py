from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlmodel import Session, select

from app.auth import UserId
from app.auth.dependencies import get_owned_resource
from app.database import get_session
from app.models import Folder, FolderCreate, FolderRead, FolderUpdate
from app.routers.db_exceptions import commit_with_error_handling

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
    commit_with_error_handling(session, "Folder")
    session.refresh(folder)
    return folder


@router.get("/{folder_id}", response_model=FolderRead)
def get_folder(
    folder_id: UUID,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Get a specific folder by ID."""
    folder = get_owned_resource(session, Folder, folder_id, user_id, "Folder")
    return folder


@router.patch("/{folder_id}", response_model=FolderRead)
def update_folder(
    folder_id: UUID,
    folder_in: FolderUpdate,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Update a folder."""
    folder = get_owned_resource(session, Folder, folder_id, user_id, "Folder")

    update_data = folder_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(folder, key, value)

    folder.updated_at = datetime.now(UTC)
    session.add(folder)
    commit_with_error_handling(session, "Folder")
    session.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(
    folder_id: UUID,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Delete a folder."""
    folder = get_owned_resource(session, Folder, folder_id, user_id, "Folder")

    session.delete(folder)
    commit_with_error_handling(session, "Folder")
