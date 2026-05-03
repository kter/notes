"""バッチワークスペースミューテーション適用ユースケース。

責務: クライアントから送られたミューテーションリストを順に適用し、
    冪等性チェック・楽観的ロック検証を行ったうえで最新スナップショットを返す。
主要なエクスポート: WorkspaceChangesUseCase
呼び出し関係: changes エンドポイントから呼ばれ、FolderUseCases /
    NoteUseCases / WorkspaceSnapshotUseCase / AppliedMutationRepository
    を組み合わせて処理する。
"""

import logging

from sqlmodel import Session

from app.features.workspace.repositories import AppliedMutationRepository
from app.features.workspace.schemas import (
    WorkspaceAppliedChange,
    WorkspaceChangesRequest,
    WorkspaceChangesResponse,
)
from app.features.workspace.use_cases.folders import FolderUseCases
from app.features.workspace.use_cases.notes import NoteUseCases
from app.features.workspace.use_cases.snapshot import WorkspaceSnapshotUseCase
from app.logging_utils import log_event
from app.models import (
    FolderCreate,
    FolderRead,
    FolderUpdate,
    NoteCreate,
    NoteRead,
    NoteUpdate,
)
from app.shared import ConflictDetected, ValidationFailed

logger = logging.getLogger(__name__)


class WorkspaceChangesUseCase:
    """バッチワークスペースミューテーションを適用し、更新済みスナップショットを返す。"""

    def __init__(self, session: Session, user_id: str):
        self.mutation_repository = AppliedMutationRepository(session, user_id)
        self.folder_use_cases = FolderUseCases(session, user_id)
        self.note_use_cases = NoteUseCases(session, user_id)
        self.snapshot_use_case = WorkspaceSnapshotUseCase(session, user_id)

    def apply_changes(
        self, request: WorkspaceChangesRequest
    ) -> WorkspaceChangesResponse:
        """リクエスト内の全ミューテーションを適用し、スナップショットと共に返す。"""
        applied = [self._apply_change(change) for change in request.changes]
        log_event(
            logger,
            logging.INFO,
            "audit.workspace.changes.applied",
            change_count=len(request.changes),
            outcome="success",
        )
        return WorkspaceChangesResponse(
            applied=applied,
            snapshot=self.snapshot_use_case.get_snapshot(),
        )

    def _apply_change(self, change) -> WorkspaceAppliedChange:
        """1件のミューテーションを適用する。

        client_mutation_id が指定されている場合、まず AppliedMutation テーブルを
        照会して冪等性チェックを行う。既存レコードがあれば再実行せずに
        キャッシュされたレスポンスを返す。
        適用後、client_mutation_id が存在すれば結果をテーブルに記録する。
        """
        if change.client_mutation_id is not None:
            # 冪等性確認: 同じ client_mutation_id が既に処理済みか照会する
            applied_mutation = self.mutation_repository.get_by_client_mutation_id(
                change.client_mutation_id
            )
            if applied_mutation is not None:
                # 既に適用済みのミューテーション: 保存済みレスポンスを返して終了
                return WorkspaceAppliedChange.model_validate(
                    applied_mutation.get_response_payload()
                )

        if change.entity == "folder":
            applied_change = self._apply_folder_change(change)
        elif change.entity == "note":
            applied_change = self._apply_note_change(change)
        else:
            raise ValidationFailed(f"Unsupported workspace entity: {change.entity}")

        if change.client_mutation_id is not None:
            # 適用結果を AppliedMutation テーブルに記録して次回の冪等性に備える
            self.mutation_repository.record(
                client_mutation_id=change.client_mutation_id,
                applied_change=applied_change,
            )
        return applied_change

    def _apply_folder_change(self, change) -> WorkspaceAppliedChange:
        """フォルダへのミューテーション（create / update / delete）を適用する。

        update / delete 時は expected_version が指定されていれば楽観的ロックを検証する。
        """
        if change.operation == "create":
            folder = self.folder_use_cases.create_folder(
                FolderCreate.model_validate(change.payload)
            )
            return WorkspaceAppliedChange(
                entity="folder",
                operation="create",
                entity_id=folder.id,
                client_mutation_id=change.client_mutation_id,
                folder=FolderRead.model_validate(folder),
            )

        if change.operation == "update":
            # 楽観的ロック: クライアントが期待するバージョンとサーバーの現在バージョンを照合
            self._ensure_expected_version(folder_id=change.entity_id, change=change)
            folder = self.folder_use_cases.update_folder(
                change.entity_id,
                FolderUpdate.model_validate(change.payload),
            )
            return WorkspaceAppliedChange(
                entity="folder",
                operation="update",
                entity_id=folder.id,
                client_mutation_id=change.client_mutation_id,
                folder=FolderRead.model_validate(folder),
            )

        # delete 操作: バージョン照合後に soft delete を実行
        self._ensure_expected_version(folder_id=change.entity_id, change=change)
        self.folder_use_cases.delete_folder(change.entity_id)
        return WorkspaceAppliedChange(
            entity="folder",
            operation="delete",
            entity_id=change.entity_id,
            client_mutation_id=change.client_mutation_id,
        )

    def _apply_note_change(self, change) -> WorkspaceAppliedChange:
        """ノートへのミューテーション（create / update / delete）を適用する。

        update / delete 時は expected_version が指定されていれば楽観的ロックを検証する。
        """
        if change.operation == "create":
            note = self.note_use_cases.create_note(
                NoteCreate.model_validate(change.payload)
            )
            return WorkspaceAppliedChange(
                entity="note",
                operation="create",
                entity_id=note.id,
                client_mutation_id=change.client_mutation_id,
                note=NoteRead.model_validate(note),
            )

        if change.operation == "update":
            # 楽観的ロック: クライアントが期待するバージョンとサーバーの現在バージョンを照合
            self._ensure_expected_version(note_id=change.entity_id, change=change)
            note = self.note_use_cases.update_note(
                change.entity_id,
                NoteUpdate.model_validate(change.payload),
            )
            return WorkspaceAppliedChange(
                entity="note",
                operation="update",
                entity_id=note.id,
                client_mutation_id=change.client_mutation_id,
                note=NoteRead.model_validate(note),
            )

        # delete 操作: バージョン照合後に soft delete を実行
        self._ensure_expected_version(note_id=change.entity_id, change=change)
        self.note_use_cases.delete_note(change.entity_id)
        return WorkspaceAppliedChange(
            entity="note",
            operation="delete",
            entity_id=change.entity_id,
            client_mutation_id=change.client_mutation_id,
        )

    def _ensure_expected_version(
        self,
        change,
        *,
        folder_id=None,
        note_id=None,
    ) -> None:
        """楽観的ロックの検証を行う。

        change.expected_version が None の場合は何もしない。
        サーバーのリソースバージョンとクライアントの期待値が一致しない場合は
        ConflictDetected を送出する。
        Aurora DSQL には外部キー制約がないため、バージョン管理は
        アプリケーション層でこのメソッドが担う。
        """
        if change.expected_version is None:
            return

        if folder_id is not None:
            resource = self.folder_use_cases.get_folder(folder_id)
        elif note_id is not None:
            resource = self.note_use_cases.get_note(note_id)
        else:
            raise ValidationFailed("expected_version check requires a target resource")

        if resource.version != change.expected_version:
            raise ConflictDetected(
                f"{change.entity.capitalize()} version mismatch: "
                f"expected {change.expected_version}, found {resource.version}"
            )
