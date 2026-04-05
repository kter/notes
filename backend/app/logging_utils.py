"""Structured logging helpers for backend runtime and tests."""

from __future__ import annotations

import contextvars
import json
import logging
import os
import sys
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from app.config import get_settings

SERVICE_NAME = "notes-backend"
TIMEZONE_NAME = "UTC"
REDACTED = "[REDACTED]"
DEFAULT_REDACT_KEYS = {
    "authorization",
    "token",
    "token_plain",
    "password",
    "email",
    "share_token",
    "prompt",
    "instruction",
    "content",
    "body",
}

_request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id",
    default=None,
)
_trace_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "trace_id",
    default=None,
)
_user_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "user_id",
    default=None,
)
_method_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "http_method",
    default=None,
)
_path_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "http_path",
    default=None,
)

_logging_configured = False


def _is_test_environment() -> bool:
    return bool(os.getenv("PYTEST_CURRENT_TEST")) or "pytest" in sys.modules


def _is_sensitive_key(key: str | None) -> bool:
    if not key:
        return False
    normalized = key.lower()
    return normalized in DEFAULT_REDACT_KEYS or normalized.endswith("_token")


def sanitize_log_value(value: Any, *, key: str | None = None) -> Any:
    """Remove sensitive values while keeping logs useful for analysis."""
    if _is_sensitive_key(key):
        return REDACTED

    if isinstance(value, Mapping):
        return {
            str(item_key): sanitize_log_value(item_value, key=str(item_key))
            for item_key, item_value in value.items()
        }

    if isinstance(value, (list, tuple, set)):
        return [sanitize_log_value(item) for item in value]

    if isinstance(value, datetime):
        value = value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
        return value.isoformat().replace("+00:00", "Z")

    if value is None or isinstance(value, (bool, int, float)):
        return value

    return str(value)


def get_log_context() -> dict[str, str]:
    """Return the currently bound request/user logging context."""
    context: dict[str, str] = {}
    for key, value in (
        ("request_id", _request_id_var.get()),
        ("trace_id", _trace_id_var.get()),
        ("user_id", _user_id_var.get()),
        ("method", _method_var.get()),
        ("path", _path_var.get()),
    ):
        if value:
            context[key] = value
    return context


def bind_log_context(
    *,
    request_id: str | None = None,
    trace_id: str | None = None,
    user_id: str | None = None,
    method: str | None = None,
    path: str | None = None,
) -> dict[str, contextvars.Token[str | None]]:
    """Bind request-scoped values to contextvars and return reset tokens."""
    tokens: dict[str, contextvars.Token[str | None]] = {}
    updates = {
        "request_id": (request_id, _request_id_var),
        "trace_id": (trace_id, _trace_id_var),
        "user_id": (user_id, _user_id_var),
        "method": (method, _method_var),
        "path": (path, _path_var),
    }

    for name, (value, variable) in updates.items():
        tokens[name] = variable.set(value)
    return tokens


def bind_user_id(user_id: str) -> contextvars.Token[str | None]:
    """Bind a user ID to the current execution context."""
    return _user_id_var.set(user_id)


def reset_log_context(tokens: Mapping[str, contextvars.Token[str | None]]) -> None:
    """Reset contextvars created by ``bind_log_context``."""
    variables = {
        "request_id": _request_id_var,
        "trace_id": _trace_id_var,
        "user_id": _user_id_var,
        "method": _method_var,
        "path": _path_var,
    }
    for name, token in reversed(list(tokens.items())):
        variables[name].reset(token)


def _coerce_log_level(log_level: str) -> int:
    resolved = getattr(logging, log_level.upper(), None)
    if isinstance(resolved, int):
        return resolved
    return logging.INFO


class JsonLogFormatter(logging.Formatter):
    """Emit backend logs as one JSON object per line."""

    def format(self, record: logging.LogRecord) -> str:
        settings = get_settings()
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "timezone": TIMEZONE_NAME,
            "level": record.levelname.lower(),
            "event": getattr(record, "event", record.getMessage()),
            "message": record.getMessage(),
            "service": SERVICE_NAME,
            "component": getattr(record, "component", record.name),
            "environment": settings.environment,
        }
        payload.update(get_log_context())

        details = getattr(record, "details", None)
        if isinstance(details, Mapping):
            payload.update(
                {
                    key: sanitize_log_value(value, key=key)
                    for key, value in details.items()
                    if value is not None
                }
            )

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(
            {key: sanitize_log_value(value, key=key) for key, value in payload.items()},
            ensure_ascii=True,
            sort_keys=True,
        )


def configure_logging() -> bool:
    """Install structured JSON logging for runtime processes."""
    global _logging_configured

    if _logging_configured or _is_test_environment():
        return False

    settings = get_settings()
    root_logger = logging.getLogger()
    root_logger.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonLogFormatter())
    root_logger.addHandler(handler)
    root_logger.setLevel(_coerce_log_level(settings.effective_log_level))

    for noisy_logger in ("boto3", "botocore", "s3transfer", "urllib3"):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)

    _logging_configured = True
    return True


def log_event(
    logger: logging.Logger,
    level: int,
    event: str,
    *,
    exc_info: bool | BaseException = False,
    **details: Any,
) -> None:
    """Emit a structured log event."""
    logger.log(
        level,
        event,
        extra={
            "event": event,
            "details": details,
        },
        exc_info=exc_info,
    )
