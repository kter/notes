from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlmodel import Session

from app.features.workspace.repositories import FolderRepository, NoteRepository
from app.models import Folder, FolderCreate, FolderUpdate, Note, NoteCreate, NoteUpdate
from app.shared import NotFound


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
    original_version = note.version

    updated = repository.update(
        note.id,
        NoteUpdate(title="after", content="after"),
    )

    assert updated.title == "after"
    assert updated.content == "after"
    assert updated.updated_at > original_updated_at
    assert updated.version == original_version + 1


def test_folder_repository_get_owned_enforces_user_scope(session: Session):
    folder = Folder(name="private", user_id="owner-user")
    session.add(folder)
    session.commit()

    repository = FolderRepository(session, "other-user")

    with pytest.raises(NotFound) as exc_info:
        repository.get_owned(folder.id)

    assert exc_info.value.detail == "Folder not found"


def test_folder_repository_update_touches_timestamp(session: Session):
    repository = FolderRepository(session, "test-user-123")
    folder = repository.create(FolderCreate(name="before"))
    original_updated_at = folder.updated_at
    original_version = folder.version

    updated = repository.update(folder.id, FolderUpdate(name="after"))

    assert updated.name == "after"
    assert updated.updated_at > original_updated_at
    assert updated.version == original_version + 1


def test_note_repository_soft_delete_hides_from_default_queries(session: Session):
    repository = NoteRepository(session, "test-user-123")
    note = repository.create(NoteCreate(title="before", content="before"))

    deleted = repository.soft_delete(note.id)

    assert deleted.deleted_at is not None
    assert deleted.version == 2
    assert repository.list() == []
    assert repository.list(include_deleted=True)[0].id == note.id


def test_folder_repository_soft_delete_hides_from_default_queries(session: Session):
    repository = FolderRepository(session, "test-user-123")
    folder = repository.create(FolderCreate(name="before"))

    deleted = repository.soft_delete(folder.id)

    assert deleted.deleted_at is not None
    assert deleted.version == 2
    assert repository.list() == []
    assert repository.list(include_deleted=True)[0].id == folder.id
