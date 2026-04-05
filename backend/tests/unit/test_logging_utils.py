import json
import logging

from app.logging_utils import (
    JsonLogFormatter,
    bind_log_context,
    reset_log_context,
    sanitize_log_value,
)


def test_sanitize_log_value_redacts_sensitive_fields():
    payload = {
        "email": "user@example.com",
        "token": "secret",
        "user_id": "user-123",
        "nested": {
            "authorization": "Bearer token",
        },
    }

    sanitized = sanitize_log_value(payload)

    assert sanitized["email"] == "[REDACTED]"
    assert sanitized["token"] == "[REDACTED]"
    assert sanitized["user_id"] == "user-123"
    assert sanitized["nested"]["authorization"] == "[REDACTED]"


def test_json_log_formatter_includes_context_and_redacts_values():
    logger = logging.getLogger("tests.logging")
    record = logger.makeRecord(
        name=logger.name,
        level=logging.INFO,
        fn=__file__,
        lno=1,
        msg="audit.settings.updated",
        args=(),
        exc_info=None,
        extra={
            "event": "audit.settings.updated",
            "details": {
                "email": "user@example.com",
                "status_code": 200,
            },
        },
    )
    tokens = bind_log_context(
        request_id="req-123",
        trace_id="trace-123",
        user_id="user-123",
        method="PUT",
        path="/api/settings",
    )

    try:
        payload = json.loads(JsonLogFormatter().format(record))
    finally:
        reset_log_context(tokens)

    assert payload["event"] == "audit.settings.updated"
    assert payload["request_id"] == "req-123"
    assert payload["trace_id"] == "trace-123"
    assert payload["user_id"] == "user-123"
    assert payload["method"] == "PUT"
    assert payload["path"] == "/api/settings"
    assert payload["email"] == "[REDACTED]"
    assert payload["status_code"] == 200
    assert payload["timezone"] == "UTC"
