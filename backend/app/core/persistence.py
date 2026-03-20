from datetime import UTC, datetime
from typing import TypeVar
from uuid import UUID

from sqlmodel import Session, SQLModel

from app.db_commit import commit_with_error_handling
from app.shared import NotFound

TModel = TypeVar("TModel", bound=SQLModel)


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(UTC)


def touch_updated_at(resource: object) -> None:
    """Update `updated_at` for resources that expose the field."""
    if hasattr(resource, "updated_at"):
        setattr(resource, "updated_at", utc_now())


def bump_version(resource: object) -> None:
    """Increment `version` for resources that expose the field."""
    if hasattr(resource, "version"):
        setattr(resource, "version", getattr(resource, "version") + 1)


class UserScopedRepository[TModel: SQLModel]:
    """Shared DSQL-friendly repository helpers for user-owned models."""

    model: type[TModel]
    resource_name: str

    def __init__(self, session: Session, user_id: str):
        self.session = session
        self.user_id = user_id

    def get_owned(self, resource_id: UUID, *, include_deleted: bool = False) -> TModel:
        resource = self.session.get(self.model, resource_id)
        if resource is None or getattr(resource, "user_id", None) != self.user_id:
            raise NotFound(f"{self.resource_name} not found")
        if (
            not include_deleted
            and hasattr(resource, "deleted_at")
            and getattr(resource, "deleted_at") is not None
        ):
            raise NotFound(f"{self.resource_name} not found")
        return resource

    def save(
        self,
        resource: TModel,
        *,
        touch: bool = False,
        bump: bool = False,
        resource_name: str | None = None,
    ) -> TModel:
        if touch:
            touch_updated_at(resource)
        if bump:
            bump_version(resource)
        self.session.add(resource)
        commit_with_error_handling(self.session, resource_name or self.resource_name)
        self.session.refresh(resource)
        return resource

    def delete_owned(self, resource_id: UUID) -> None:
        resource = self.get_owned(resource_id)
        self.session.delete(resource)
        commit_with_error_handling(self.session, self.resource_name)
