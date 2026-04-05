import io
import logging
import zipfile
from dataclasses import dataclass
from datetime import datetime

from sqlmodel import Session

from app.features.workspace.repositories import FolderRepository, NoteRepository
from app.logging_utils import log_event

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class NoteExportArchive:
    filename: str
    data: bytes


class NoteExportUseCase:
    """Build a ZIP archive for all notes owned by the current user."""

    def __init__(self, session: Session, user_id: str):
        self.note_repository = NoteRepository(session, user_id)
        self.folder_repository = FolderRepository(session, user_id)

    def export_archive(self) -> NoteExportArchive:
        folders = self.folder_repository.list()
        folder_map = {folder.id: folder.name for folder in folders}
        notes = sorted(
            self.note_repository.list(),
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
        log_event(
            logger,
            logging.INFO,
            "audit.notes.exported",
            note_count=len(notes),
            folder_count=len(folders),
            outcome="success",
        )
        return NoteExportArchive(filename=filename, data=zip_buffer.getvalue())

    @staticmethod
    def _sanitize_export_segment(value: str) -> str:
        return "".join(
            char for char in value if char.isalnum() or char in (" ", "-", "_")
        ).strip()
