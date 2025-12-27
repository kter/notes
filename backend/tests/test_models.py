"""Tests for model validation."""


from app.models import Folder, FolderCreate, FolderUpdate, Note, NoteCreate, NoteUpdate


class TestFolderModels:
    """Tests for Folder models."""

    def test_folder_create(self):
        """Test FolderCreate schema."""
        folder = FolderCreate(name="Test Folder")
        assert folder.name == "Test Folder"

    def test_folder_update_partial(self):
        """Test FolderUpdate allows partial updates."""
        update = FolderUpdate(name="Updated Name")
        assert update.name == "Updated Name"

        update_empty = FolderUpdate()
        assert update_empty.name is None

    def test_folder_model_defaults(self):
        """Test Folder model default values."""
        folder = Folder(name="Test", user_id="user-123")
        
        assert folder.name == "Test"
        assert folder.user_id == "user-123"
        assert folder.id is not None
        assert folder.created_at is not None
        assert folder.updated_at is not None


class TestNoteModels:
    """Tests for Note models."""

    def test_note_create_minimal(self):
        """Test NoteCreate with minimal fields."""
        note = NoteCreate()
        assert note.title == ""
        assert note.content == ""
        assert note.folder_id is None

    def test_note_create_full(self):
        """Test NoteCreate with all fields."""
        from uuid import uuid4
        folder_id = uuid4()
        
        note = NoteCreate(
            title="Test Title",
            content="Test Content",
            folder_id=folder_id,
        )
        assert note.title == "Test Title"
        assert note.content == "Test Content"
        assert note.folder_id == folder_id

    def test_note_update_partial(self):
        """Test NoteUpdate allows partial updates."""
        update = NoteUpdate(title="New Title")
        assert update.title == "New Title"
        assert update.content is None
        assert update.folder_id is None

    def test_note_model_defaults(self):
        """Test Note model default values."""
        note = Note(user_id="user-123")
        
        assert note.title == ""
        assert note.content == ""
        assert note.user_id == "user-123"
        assert note.folder_id is None
        assert note.id is not None
        assert note.created_at is not None
        assert note.updated_at is not None
