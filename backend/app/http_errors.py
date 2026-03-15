from fastapi import HTTPException, status

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
    """Convert a domain error into the matching HTTP exception."""
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
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=error.detail,
    )
