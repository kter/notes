import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import Column, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class AppliedMutation(SQLModel, table=True):
    """Persisted client mutation for idempotent workspace sync writes."""

    __tablename__ = "applied_mutations"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "client_mutation_id",
            name="uq_applied_mutations_user_client_mutation",
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()
    client_mutation_id: str = Field(max_length=255)
    entity: str = Field(max_length=32)
    operation: str = Field(max_length=32)
    entity_id: UUID = Field()
    response_payload: str = Field(default="{}", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    def get_response_payload(self) -> dict:
        return json.loads(self.response_payload)
