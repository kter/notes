from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlmodel import Session

from app.models import Folder, FolderCreate, FolderUpdate, Note, NoteCreate, NoteUpdate
from app.repositories import FolderRepository, NoteRepository


def test_note_repository_lists_only_owned_notes_and_respects_folder_filter(
    session: Session,
):
    user_id = "test-user-123"
    other_user_id = "other-user-456"
    folder_id = uuid4()
    older = datetime.now(UTC) - timedelta(days=1)
    newer = datetime.now(UTC)

    session.add(
        Note(
            title="older",
            content="",
            user_id=user_id,
            folder_id=folder_id,
            updated_at=older,
        )
    )
    session.add(
        Note(
            title="newer",
            content="",
            user_id=user_id,
            folder_id=None,
            updated_at=newer,
        )
    )
    session.add(
        Note(
            title="other-user",
            content="",
            user_id=other_user_id,
            folder_id=folder_id,
            updated_at=newer,
        )
    )
    session.commit()

    repository = NoteRepository(session, user_id)

    all_notes = repository.list()
    folder_notes = repository.list(folder_id)

    assert [note.title for note in all_notes] == ["newer", "older"]
    assert [note.title for note in folder_notes] == ["older"]


def test_note_repository_update_touches_timestamp(session: Session):
    repository = NoteRepository(session, "test-user-123")
    note = repository.create(NoteCreate(title="before", content="before"))
    original_updated_at = note.updated_at

    updated = repository.update(
        note.id,
        NoteUpdate(title="after", content="after"),
    )

    assert updated.title == "after"
    assert updated.content == "after"
    assert updated.updated_at > original_updated_at


def test_folder_repository_get_owned_enforces_user_scope(session: Session):
    folder = Folder(name="private", user_id="owner-user")
    session.add(folder)
    session.commit()

    repository = FolderRepository(session, "other-user")

    with pytest.raises(HTTPException) as exc_info:
        repository.get_owned(folder.id)

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Folder not found"


def test_folder_repository_update_touches_timestamp(session: Session):
    repository = FolderRepository(session, "test-user-123")
    folder = repository.create(FolderCreate(name="before"))
    original_updated_at = folder.updated_at

    updated = repository.update(folder.id, FolderUpdate(name="after"))

    assert updated.name == "after"
    assert updated.updated_at > original_updated_at
