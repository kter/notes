"""ワークスペース同期に関する Pydantic スキーマ定義。

責務: クライアント↔サーバー間のスナップショット・バッチミューテーション
    リクエスト/レスポンスの形状を定義する。
主要なエクスポート: WorkspaceSnapshotResponse, WorkspaceChangesRequest,
    WorkspaceChangesResponse, WorkspaceAppliedChange, WorkspaceChangeRequest
呼び出し関係: changes/snapshot エンドポイントおよび各 UseCase から参照される。
"""

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models import FolderRead, NoteRead


class WorkspaceSnapshotResponse(BaseModel):
    """同期対応クライアントに返すブートストラップスナップショット。

    folders / notes には soft delete 済み（deleted_at が非 null）の
    エントリも含まれる。クライアントはこれを用いてローカルDBとの
    差分を解消する。cursor は最新 updated_at の ISO 8601 文字列。
    """

    folders: list[FolderRead]
    notes: list[NoteRead]
    cursor: str
    server_time: datetime

    @field_validator("server_time", mode="before")
    @classmethod
    def ensure_utc_timezone(cls, value: datetime) -> datetime:
        """tzinfo が None の datetime を UTC に補完する。"""
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class WorkspaceChangeRequest(BaseModel):
    """クライアントが送信する1件分のワークスペースミューテーション。

    - create: payload 必須、entity_id 不要。
    - update/delete: entity_id 必須。delete は payload 禁止。
    - expected_version: 楽観的ロック用バージョン番号（省略可）。
    """

    entity: Literal["folder", "note"]
    operation: Literal["create", "update", "delete"]
    entity_id: UUID | None = None
    client_mutation_id: str | None = None
    expected_version: int | None = Field(default=None, ge=1)
    payload: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_shape(self) -> "WorkspaceChangeRequest":
        """ミューテーション種別ごとのフィールド制約を検証する。"""
        if self.operation in {"update", "delete"} and self.entity_id is None:
            raise ValueError("entity_id is required for update and delete operations")
        if self.operation == "delete" and self.payload:
            raise ValueError("delete operations do not accept payload")
        if self.operation in {"create", "update"} and not self.payload:
            raise ValueError("create and update operations require payload")
        return self


class WorkspaceChangesRequest(BaseModel):
    """同期対応クライアントが送信するバッチミューテーションリクエスト。

    device_id: 送信元デバイス識別子（省略可）。
    base_cursor: クライアントが保持する直前のカーソル（省略可）。
    changes: 適用するミューテーションのリスト。
    """

    device_id: str | None = None
    base_cursor: str | None = None
    changes: list[WorkspaceChangeRequest]


class WorkspaceAppliedChange(BaseModel):
    """サーバーが適用した1件分のミューテーション結果。

    client_mutation_id が設定されている場合、冪等性確認に使用できる。
    create/update 時は entity 種別に対応する folder または note が
    格納される。delete 時はどちらも None。
    """

    entity: Literal["folder", "note"]
    operation: Literal["create", "update", "delete"]
    entity_id: UUID
    client_mutation_id: str | None = None
    folder: FolderRead | None = None
    note: NoteRead | None = None


class WorkspaceChangesResponse(BaseModel):
    """バッチミューテーション結果と更新済みスナップショットをまとめて返す。

    applied: 各ミューテーションの適用結果リスト。
    snapshot: 全ミューテーション適用後の最新ワークスペーススナップショット。
    """

    applied: list[WorkspaceAppliedChange]
    snapshot: WorkspaceSnapshotResponse
