"""Observability helpers shared across backend entrypoints."""

import logging
import os
import sys
from functools import lru_cache

import boto3
import sentry_sdk
from sentry_sdk.integrations.aws_lambda import AwsLambdaIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration

from app.config import get_settings
from app.logging_utils import log_event

logger = logging.getLogger(__name__)

_sentry_initialized = False
_fastapi_integration_enabled = False


def is_test_environment() -> bool:
    """Return whether the current process is running under pytest."""
    return bool(os.getenv("PYTEST_CURRENT_TEST")) or "pytest" in sys.modules


@lru_cache(maxsize=1)
def get_sentry_dsn() -> str:
    """Resolve the DSN from local settings or SSM Parameter Store."""
    settings = get_settings()
    if settings.sentry_dsn:
        return settings.sentry_dsn

    if not settings.sentry_dsn_parameter_name:
        return ""

    try:
        ssm_client = boto3.client("ssm", region_name=settings.aws_region)
        response = ssm_client.get_parameter(
            Name=settings.sentry_dsn_parameter_name,
            WithDecryption=True,
        )
    except Exception:
        log_event(
            logger,
            logging.WARNING,
            "ops.sentry.dsn_load_failed",
            parameter_name=settings.sentry_dsn_parameter_name,
            outcome="failure",
            exc_info=True,
        )
        return ""

    return response["Parameter"]["Value"]


def init_sentry(*, with_fastapi: bool = False) -> bool:
    """Initialize Sentry once per runtime when a DSN is configured."""
    global _sentry_initialized, _fastapi_integration_enabled

    if is_test_environment():
        return False

    settings = get_settings()
    dsn = get_sentry_dsn()
    if not dsn:
        return False

    if _sentry_initialized and (not with_fastapi or _fastapi_integration_enabled):
        return False

    integrations = [AwsLambdaIntegration(timeout_warning=True)]
    if with_fastapi:
        integrations.append(FastApiIntegration(transaction_style="endpoint"))

    sentry_sdk.init(
        dsn=dsn,
        environment=settings.environment,
        send_default_pii=False,
        traces_sample_rate=settings.effective_sentry_traces_sample_rate,
        integrations=integrations,
    )

    _sentry_initialized = True
    _fastapi_integration_enabled = _fastapi_integration_enabled or with_fastapi
    log_event(
        logger,
        logging.INFO,
        "ops.sentry.initialized",
        with_fastapi=with_fastapi,
        outcome="success",
    )
    return True


def set_sentry_request_context(
    *,
    request_id: str,
    route: str,
    method: str,
    trace_id: str | None = None,
) -> None:
    """Bind request-scoped metadata to the active Sentry scope."""
    if not _sentry_initialized:
        return

    sentry_sdk.set_tag("request_id", request_id)
    sentry_sdk.set_tag("route", route)
    if trace_id:
        sentry_sdk.set_tag("trace_id", trace_id)
    sentry_sdk.set_context(
        "request",
        {
            "request_id": request_id,
            "route": route,
            "method": method,
        },
    )


def set_sentry_user_context(user_id: str | None) -> None:
    """Bind the authenticated user to the active Sentry scope."""
    if not _sentry_initialized:
        return

    sentry_sdk.set_user({"id": user_id} if user_id else None)
