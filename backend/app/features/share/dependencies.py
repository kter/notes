"""share 機能の FastAPI 依存関係ファクトリ。

責務: 認証済みフローと公開フローそれぞれの ShareUseCases インスタンスを
    DI コンテナへ提供する。
主要なエクスポート: RequireAuthenticatedUser, get_share_use_cases,
    get_public_share_use_cases
呼び出し関係: share/router.py の Depends から呼ばれる。
"""

from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.auth import get_user_id
from app.database import get_session
from app.features.share.use_cases import ShareUseCases
from app.features.workspace.dependencies import get_workspace_query_use_cases
from app.features.workspace.use_cases import WorkspaceQueryUseCases

# 認証必須ルートに付与する依存。値を使わず認証だけを要求することを宣言する。
RequireAuthenticatedUser = Depends(get_user_id)


def get_share_use_cases(
    session: Annotated[Session, Depends(get_session)],
    workspace_queries: Annotated[
        WorkspaceQueryUseCases, Depends(get_workspace_query_use_cases)
    ],
) -> ShareUseCases:
    """認証済みユーザー向けの ShareUseCases を生成して返す。

    ユーザースコープは workspace_queries が保持する（WorkspaceQueryUseCases が
    UserId に依存し、NoteRepository をユーザースコープで構築する）。所有権チェックは
    そこで行われるため、ここで user_id を受け取って捨てる必要はない。
    各ルートの dependencies=[RequireAuthenticatedUser] は、その経路に依存しない
    多層防御として認証を明示的に要求するものであり、唯一の実施点ではない。
    """
    return ShareUseCases(session, workspace_queries)


def get_public_share_use_cases(
    session: Annotated[Session, Depends(get_session)],
) -> ShareUseCases:
    """認証不要の公開フロー向け ShareUseCases を生成して返す。"""
    return ShareUseCases(session)
