"""ドメインエラーを HTTP 例外へ変換するユーティリティ。

責務: DomainError のサブクラスを対応する HTTPException にマッピングする。
主要なエクスポート: to_http_exception
呼び出し関係: ルーターおよびミドルウェアから呼ばれ、
    app.shared のドメインエラー群を参照する。
"""

import logging

from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

from app.shared import (
    ConflictDetected,
    DomainError,
    Forbidden,
    NotFound,
    QuotaExceeded,
    ShareExpired,
    ValidationFailed,
)


def to_http_exception(error: DomainError) -> HTTPException:
    """ドメインエラーを対応する HTTP 例外に変換して返す。"""
    if isinstance(error, NotFound):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=error.detail)
    if isinstance(error, Forbidden):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=error.detail)
    if isinstance(error, ConflictDetected):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=error.detail)
    if isinstance(error, QuotaExceeded):
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=error.detail,
        )
    if isinstance(error, ShareExpired):
        return HTTPException(status_code=status.HTTP_410_GONE, detail=error.detail)
    if isinstance(error, ValidationFailed):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error.detail,
        )
    logger.error("Unhandled DomainError type %s: %s", type(error).__name__, error.detail)
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="An internal error occurred.",
    )
