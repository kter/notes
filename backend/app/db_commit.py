"""Database commit helpers shared across routers, services, and auth dependencies."""

import time
from collections.abc import Callable

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlmodel import Session


def is_retryable_commit_error(error: Exception) -> bool:
    """Return whether a commit error is safe to retry/recover from."""
    message = str(error).lower()
    return (
        "change conflicts with another transaction" in message
        or "serializationfailure" in message
        or "oc000" in message
        or "duplicate" in message
        or "unique" in message
    )


def commit_with_retry[T](
    session: Session,
    *,
    max_retries: int = 1,
    recovery: Callable[[], T | None] | None = None,
) -> T | None:
    """Commit a session with limited retry support for transient write conflicts."""
    for attempt in range(max_retries):
        try:
            session.commit()
            return None
        except (IntegrityError, OperationalError) as error:
            session.rollback()
            if not is_retryable_commit_error(error):
                raise

            if recovery is not None:
                recovered = recovery()
                if recovered is not None:
                    return recovered

            if attempt == max_retries - 1:
                raise

            time.sleep(0.05 * (attempt + 1))

    raise RuntimeError("Commit retries exhausted without returning or raising")


def commit_with_error_handling(
    session: Session,
    resource_name: str = "Resource",
    *,
    max_retries: int = 1,
) -> None:
    """Commit the session and convert database errors to appropriate HTTP errors."""
    try:
        commit_with_retry(session, max_retries=max_retries)
    except IntegrityError as e:
        session.rollback()
        error_message = str(e.orig).lower() if e.orig else str(e).lower()

        if "foreign key" in error_message or "fk_" in error_message:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{resource_name} references a non-existent resource",
            )
        if "unique" in error_message or "duplicate" in error_message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{resource_name} already exists",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Database constraint violation for {resource_name}",
        )
    except OperationalError as e:
        session.rollback()
        if is_retryable_commit_error(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Concurrent update conflict for {resource_name}. Please retry.",
            )
        raise
