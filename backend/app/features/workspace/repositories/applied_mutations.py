import json

from sqlmodel import select

from app.db_commit import commit_with_error_handling
from app.features.workspace.schemas import WorkspaceAppliedChange
from app.models import AppliedMutation
from app.shared import ConflictDetected


class AppliedMutationRepository:
    """Repository for idempotent client mutation tracking."""

    def __init__(self, session, user_id: str):
        self.session = session
        self.user_id = user_id

    def get_by_client_mutation_id(
        self, client_mutation_id: str
    ) -> AppliedMutation | None:
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
            existing = self.get_by_client_mutation_id(client_mutation_id)
            if existing is not None:
                return existing
            raise
        self.session.refresh(mutation)
        return mutation
