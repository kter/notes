"""ユーザースコープのリポジトリ共通ヘルパーと永続化ユーティリティ。

責務: updated_at・version フィールドの管理と、ユーザー所有リソースの
    CRUD 基盤を提供する。
主要なエクスポート: UserScopedRepository, utc_now, touch_updated_at,
    bump_version, normalize_version
呼び出し関係: NoteRepository・FolderRepository から継承され、
    app.db_commit を介してデータベースに書き込む。
"""

from datetime import UTC, datetime
from typing import TypeVar
from uuid import UUID

from sqlmodel import Session, SQLModel

from app.db_commit import commit_with_error_handling
from app.shared import NotFound

TModel = TypeVar("TModel", bound=SQLModel)


def utc_now() -> datetime:
    """タイムゾーン付き UTC タイムスタンプを返す。"""
    return datetime.now(UTC)


def touch_updated_at(resource: object) -> None:
    """`updated_at` フィールドを持つリソースの更新日時を現在時刻に更新する。"""
    if hasattr(resource, "updated_at"):
        setattr(resource, "updated_at", utc_now())


def normalize_version(resource: object) -> None:
    """`version` が予期せず NULL のレガシーリソースを 1 に補正する。"""
    if hasattr(resource, "version") and getattr(resource, "version") is None:
        setattr(resource, "version", 1)


def bump_version(resource: object) -> None:
    """`version` フィールドを持つリソースのバージョンを 1 インクリメントする。"""
    if hasattr(resource, "version"):
        normalize_version(resource)
        setattr(resource, "version", getattr(resource, "version") + 1)


class UserScopedRepository[TModel: SQLModel]:
    """ユーザー所有モデル向けの DSQL 対応リポジトリ共通ヘルパー。"""

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
        normalize_version(resource)
        return resource

    def save(
        self,
        resource: TModel,
        *,
        touch: bool = False,
        bump: bool = False,
        resource_name: str | None = None,
    ) -> TModel:
        normalize_version(resource)
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
