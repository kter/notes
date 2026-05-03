"""チャット・要約リクエスト用のコンテキスト文字列を構築するモジュール。

責務: ChatScope に応じてノートまたはフォルダのコンテンツを取得し、
    AIゲートウェイに渡す文字列に整形する。
主要なエクスポート: ContextBuilder。
呼び出し関係: use_cases/ai_interactions.py から生成され、
    WorkspaceQueryUseCases を通じてDBからノートを取得する。
"""

from collections.abc import Sequence
from uuid import UUID

from app.features.workspace.use_cases import WorkspaceQueryUseCases
from app.models import Note
from app.models.enums import ChatScope
from app.shared import ValidationFailed


class ContextBuilder:
    """ChatScope に基づいてAIに渡すコンテキスト文字列を構築するクラス。"""

    def __init__(self, workspace_queries: WorkspaceQueryUseCases):
        self.workspace_queries = workspace_queries

    def _format_notes(self, notes: Sequence[Note]) -> str:
        """複数ノートをタイトル付きの文字列に整形して連結する。"""
        return "\n\n".join([f"Note: {n.title}\n{n.content}" for n in notes])

    def build(
        self,
        scope: ChatScope,
        note_id: UUID | None = None,
        folder_id: UUID | None = None,
    ) -> str:
        """スコープに応じてコンテキスト文字列を生成して返す。

        NOTE: 指定ノートの本文のみ。
        FOLDER: フォルダ内全ノートを結合したテキスト。
        ALL: ユーザーの全ノートを結合したテキスト。
        コンテンツが空の場合は ValidationFailed を送出する。
        """
        content = ""
        if scope == ChatScope.NOTE:
            if not note_id:
                raise ValidationFailed("note_id is required for note scope")
            note = self.workspace_queries.get_owned_note(note_id)
            content = note.content
        elif scope == ChatScope.FOLDER:
            if not folder_id:
                raise ValidationFailed("folder_id is required for folder scope")
            # フォルダの所有権を確認してからノート一覧を取得する
            self.workspace_queries.get_owned_folder(folder_id)
            notes = self.workspace_queries.list_folder_notes(folder_id)
            content = self._format_notes(notes)
        elif scope == ChatScope.ALL:
            notes = self.workspace_queries.list_all_notes()
            content = self._format_notes(notes)
        else:
            raise ValidationFailed(f"Invalid scope: {scope}")

        # コンテキストが空の場合はAI呼び出しを行わずに早期エラーを返す
        if not content.strip():
            raise ValidationFailed("Context content is empty")

        return content
