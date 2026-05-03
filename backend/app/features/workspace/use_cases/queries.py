"""ワークスペースの読み取り専用クエリユースケース。

責務: 同一フィーチャーおよびクロスフィーチャーから利用される
    ユーザー所有リソースへの読み取りアクセスを提供する。
主要なエクスポート: WorkspaceQueryUseCases
呼び出し関係: share/use_cases.py・assistant ユースケース等のクロスフィーチャー呼び出しと、
    ワークスペース自身のルーターから利用される。
"""

from uuid import UUID

from sqlmodel import Session

from app.features.workspace.repositories import FolderRepository, NoteRepository
from app.models import Folder, Note


class WorkspaceQueryUseCases:
    """同一フィーチャー・クロスフィーチャー両用の読み取り専用ワークスペースアクセス。"""

    def __init__(self, session: Session, user_id: str):
        self.note_repository = NoteRepository(session, user_id)
        self.folder_repository = FolderRepository(session, user_id)

    def get_owned_note(self, note_id: UUID) -> Note:
        """ユーザーが所有するノートを取得する。存在しない場合は NotFound を送出。"""
        return self.note_repository.get_owned(note_id)

    def get_owned_folder(self, folder_id: UUID) -> Folder:
        """ユーザーが所有するフォルダを取得する。存在しない場合は NotFound を送出。"""
        return self.folder_repository.get_owned(folder_id)

    def list_folders(self, *, include_deleted: bool = False) -> list[Folder]:
        """ユーザーのフォルダ一覧を返す。削除済みを含めるかは include_deleted で制御。"""
        return self.folder_repository.list(include_deleted=include_deleted)

    def list_folder_notes(self, folder_id: UUID) -> list[Note]:
        """指定フォルダ内のノート一覧を返す。"""
        return self.note_repository.list(folder_id)

    def list_all_notes(self, *, include_deleted: bool = False) -> list[Note]:
        """全ノート一覧を返す。削除済みを含めるかは include_deleted で制御。"""
        return self.note_repository.list(include_deleted=include_deleted)
