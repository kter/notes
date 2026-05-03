"""クライアントミューテーションの冪等性追跡リポジトリ。

責務: client_mutation_id を使って同一ミューテーションの重複適用を防ぎ、
    結果を AppliedMutation テーブルに永続化する。
主要なエクスポート: AppliedMutationRepository
呼び出し関係: workspace のミューテーション系ユースケースから呼ばれ、
    ConflictDetected 発生時はリカバリとして既存レコードを返す。
"""

import json

from sqlmodel import select

from app.db_commit import commit_with_error_handling
from app.features.workspace.schemas import WorkspaceAppliedChange
from app.models import AppliedMutation
from app.shared import ConflictDetected


class AppliedMutationRepository:
    """クライアントミューテーションの冪等性を追跡するリポジトリ。"""

    def __init__(self, session, user_id: str):
        self.session = session
        self.user_id = user_id

    def get_by_client_mutation_id(
        self, client_mutation_id: str
    ) -> AppliedMutation | None:
        """指定の client_mutation_id に対応する既適用ミューテーションを返す。"""
        statement = select(AppliedMutation).where(
            AppliedMutation.user_id == self.user_id,
            AppliedMutation.client_mutation_id == client_mutation_id,
        )
        return self.session.exec(statement).first()

    def record(
        self,
        *,
        client_mutation_id: str,
        applied_change: WorkspaceAppliedChange,
    ) -> AppliedMutation:
        """ミューテーションを記録する。既に適用済みの場合は既存レコードを返す (冪等)。"""
        existing = self.get_by_client_mutation_id(client_mutation_id)
        if existing is not None:
            return existing

        mutation = AppliedMutation(
            user_id=self.user_id,
            client_mutation_id=client_mutation_id,
            entity=applied_change.entity,
            operation=applied_change.operation,
            entity_id=applied_change.entity_id,
            response_payload=json.dumps(
                applied_change.model_dump(mode="json"),
                ensure_ascii=True,
                sort_keys=True,
            ),
        )
        self.session.add(mutation)
        try:
            commit_with_error_handling(self.session, "AppliedMutation")
        except ConflictDetected:
            # 同時書き込みによる競合時は再クエリして既存レコードを返す
            existing = self.get_by_client_mutation_id(client_mutation_id)
            if existing is not None:
                return existing
            raise
        self.session.refresh(mutation)
        return mutation
