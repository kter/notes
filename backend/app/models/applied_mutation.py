"""クライアントミューテーションの冪等性を保証するためのDBモデルを定義するモジュール。

責務: ワークスペース同期書き込みの重複実行を防ぐため、適用済みミューテーションを永続化する。
主要なエクスポート: AppliedMutation.
呼び出し関係: services/sync_service.py などのワークスペース同期処理から参照される。
"""

import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import Column, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class AppliedMutation(SQLModel, table=True):
    """クライアントミューテーションを永続化し、ワークスペース同期書き込みの冪等性を保証するテーブルモデル。

    (user_id, client_mutation_id) の複合ユニーク制約により、同一ミューテーションの
    二重適用を防ぐ。Aurora DSQL の制約からインデックスは使用しない。
    """

    __tablename__ = "applied_mutations"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "client_mutation_id",
            name="uq_applied_mutations_user_client_mutation",
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()  # Cognito ユーザーサブ
    client_mutation_id: str = Field(max_length=255)  # クライアント側で生成した一意ID
    entity: str = Field(max_length=32)  # 操作対象エンティティ種別（例: "note"）
    operation: str = Field(max_length=32)  # 操作種別（例: "create", "update"）
    entity_id: UUID = Field()  # 操作対象エンティティのID
    response_payload: str = Field(
        default="{}", sa_column=Column(Text)
    )  # 応答JSONを文字列で保持
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    def get_response_payload(self) -> dict:
        # response_payload フィールドを JSON デシリアライズして辞書として返す
        return json.loads(self.response_payload)
