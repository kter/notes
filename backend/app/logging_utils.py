"""バックエンドランタイムおよびテスト向けの構造化ロギングヘルパー群。

責務: JSON 形式のログ出力、リクエストスコープのコンテキスト管理、機密値のサニタイズ。
主要なエクスポート: configure_logging, log_event, bind_log_context,
    reset_log_context, bind_user_id, get_log_context, sanitize_log_value,
    JsonLogFormatter。
呼び出し関係: 全エントリーポイントおよびルーターから参照される。
"""

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
# ログ出力時に値を必ずマスクするキー名のセット
DEFAULT_REDACT_KEYS = {
    "authorization",
    "api_key",
    "token",
    "token_plain",
    "password",
    "email",
    "share_token",
    "x-api-key",
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
    """pytest 実行中かどうかを返す。"""
    return bool(os.getenv("PYTEST_CURRENT_TEST")) or "pytest" in sys.modules


def _is_sensitive_key(key: str | None) -> bool:
    """指定キーが機密情報に該当するかどうかを返す。

    DEFAULT_REDACT_KEYS への完全一致、または "_token" で終わるキーを機密とみなす。
    """
    if not key:
        return False
    normalized = key.lower()
    return normalized in DEFAULT_REDACT_KEYS or normalized.endswith("_token")


def sanitize_log_value(value: Any, *, key: str | None = None) -> Any:
    """機密情報をマスクしつつ、ログ分析に有用な形式に値を変換して返す。

    dict/list/tuple/set は再帰的にサニタイズする。
    datetime は UTC の ISO 8601 文字列に変換する。
    """
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
    """現在のコンテキストに束縛されたリクエスト/ユーザー情報を辞書で返す。"""
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
    """リクエストスコープの値を contextvars に束縛し、リセット用トークンを返す。

    戻り値のトークンを reset_log_context に渡すことで元の値に復元できる。
    """
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
    """現在の実行コンテキストにユーザーIDを束縛する。"""
    return _user_id_var.set(user_id)


def reset_log_context(tokens: Mapping[str, contextvars.Token[str | None]]) -> None:
    """``bind_log_context`` が生成したトークンを使って contextvars を元の値に戻す。"""
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
    """ログレベル文字列を logging モジュールの整数値に変換する。

    未知の文字列が渡された場合は logging.INFO にフォールバックする。
    """
    resolved = getattr(logging, log_level.upper(), None)
    if isinstance(resolved, int):
        return resolved
    return logging.INFO


class JsonLogFormatter(logging.Formatter):
    """バックエンドのログを1行1JSONオブジェクト形式で出力するフォーマッター。"""

    def format(self, record: logging.LogRecord) -> str:
        """LogRecord を JSON 文字列に変換して返す。

        コンテキスト変数・details フィールド・例外情報を一つの JSON にまとめる。
        """
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
    """ランタイムプロセス向けに構造化 JSON ロギングをインストールする。

    テスト環境や設定済みの場合は何もせず False を返す。
    """
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

    # boto3 等のサードパーティロガーはデフォルトで冗長なため WARNING 以上に絞る
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
    """構造化ログイベントを出力する。

    event はドット区切りの識別子（例: "ops.db.engine.created"）を推奨する。
    追加のキーワード引数は details フィールドとして JSON に含められる。
    """
    logger.log(
        level,
        event,
        extra={
            "event": event,
            "details": details,
        },
        exc_info=exc_info,
    )
