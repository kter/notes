import io
import zipfile
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlmodel import Session

from app.features.workspace.folder_repository import FolderRepository
from app.features.workspace.note_repository import NoteRepository
from app.models import Note, NoteCreate, NoteUpdate


@dataclass(frozen=True)
class NoteExportArchive:
    filename: str
    data: bytes


class NoteService:
    """Application service for note CRUD flows."""

    def __init__(self, session: Session, user_id: str):
        self.repository = NoteRepository(session, user_id)
        self.folder_repository = FolderRepository(session, user_id)

    def list_notes(self, folder_id: UUID | None = None) -> list[Note]:
        return self.repository.list(folder_id)

    def create_note(self, note_in: NoteCreate) -> Note:
        return self.repository.create(note_in)

    def get_note(self, note_id: UUID) -> Note:
        return self.repository.get_owned(note_id)

    def update_note(self, note_id: UUID, note_in: NoteUpdate) -> Note:
        return self.repository.update(note_id, note_in)

    def delete_note(self, note_id: UUID) -> None:
        self.repository.delete_owned(note_id)

    def export_notes_archive(self) -> NoteExportArchive:
        folders = self.folder_repository.list()
        folder_map = {folder.id: folder.name for folder in folders}
        notes = sorted(
            self.repository.list(),
            key=lambda note: (
                folder_map.get(note.folder_id, ""),
                note.title,
                note.created_at,
                str(note.id),
            ),
        )

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            used_paths: set[str] = set()

            for note in notes:
                folder_name = folder_map.get(note.folder_id) if note.folder_id else None
                folder_path = (
                    self._sanitize_export_segment(folder_name) if folder_name else ""
                )

                title = note.title.strip() if note.title else "Untitled"
                base_filename = self._sanitize_export_segment(title) or "Untitled"

                rel_path = (
                    f"{folder_path}/{base_filename}.md"
                    if folder_path
                    else f"{base_filename}.md"
                )
                counter = 1
                while rel_path in used_paths:
                    new_filename = f"{base_filename} ({counter})"
                    rel_path = (
                        f"{folder_path}/{new_filename}.md"
                        if folder_path
                        else f"{new_filename}.md"
                    )
                    counter += 1

                used_paths.add(rel_path)
                zip_file.writestr(rel_path, note.content)

        filename = f"notes_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        return NoteExportArchive(filename=filename, data=zip_buffer.getvalue())

    @staticmethod
    def _sanitize_export_segment(value: str) -> str:
        return "".join(
            char for char in value if char.isalnum() or char in (" ", "-", "_")
        ).strip()
