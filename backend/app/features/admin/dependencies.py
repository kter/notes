"""管理者機能の FastAPI 依存関数を定義するモジュール。

責務: DBセッションを受け取り AdminUseCases インスタンスを生成して提供する。
主要なエクスポート: get_admin_use_cases
呼び出し関係: admin/router.py の Depends() から呼ばれる。
"""

from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.database import get_session
from app.features.admin.use_cases import AdminUseCases


def get_admin_use_cases(
    session: Annotated[Session, Depends(get_session)],
) -> AdminUseCases:
    """DBセッションから AdminUseCases を生成して返す依存関数。"""
    return AdminUseCases(session)
