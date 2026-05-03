"""share 機能の FastAPI 依存関係ファクトリ。

責務: 認証済みフローと公開フローそれぞれの ShareUseCases インスタンスを
    DI コンテナへ提供する。
主要なエクスポート: get_share_use_cases, get_public_share_use_cases
呼び出し関係: share/router.py の Depends から呼ばれる。
"""

from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.features.share.use_cases import ShareUseCases
from app.features.workspace.dependencies import get_workspace_query_use_cases
from app.features.workspace.use_cases import WorkspaceQueryUseCases


def get_share_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
    workspace_queries: Annotated[
        WorkspaceQueryUseCases, Depends(get_workspace_query_use_cases)
    ],
) -> ShareUseCases:
    """認証済みユーザー向けの ShareUseCases を生成して返す。"""
    del user_id  # 認証チェックのためだけに注入するが直接は使わない
    return ShareUseCases(session, workspace_queries)


def get_public_share_use_cases(
    session: Annotated[Session, Depends(get_session)],
) -> ShareUseCases:
    """認証不要の公開フロー向け ShareUseCases を生成して返す。"""
    return ShareUseCases(session)
