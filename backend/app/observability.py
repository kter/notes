"""Observability helpers shared across backend entrypoints."""

import logging

import sentry_sdk
from sentry_sdk.integrations.aws_lambda import AwsLambdaIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration

from app.config import get_settings

logger = logging.getLogger(__name__)

_sentry_initialized = False
_fastapi_integration_enabled = False


def init_sentry(*, with_fastapi: bool = False) -> bool:
    """Initialize Sentry once per runtime when a DSN is configured."""
    global _sentry_initialized, _fastapi_integration_enabled

    settings = get_settings()
    if not settings.sentry_dsn:
        return False

    if _sentry_initialized and (not with_fastapi or _fastapi_integration_enabled):
        return False

    integrations = [AwsLambdaIntegration(timeout_warning=True)]
    if with_fastapi:
        integrations.append(FastApiIntegration(transaction_style="endpoint"))

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        send_default_pii=True,
        traces_sample_rate=settings.effective_sentry_traces_sample_rate,
        integrations=integrations,
    )

    _sentry_initialized = True
    _fastapi_integration_enabled = _fastapi_integration_enabled or with_fastapi
    logger.info(
        "Sentry initialized",
        extra={
            "environment": settings.environment,
            "with_fastapi": with_fastapi,
        },
    )
    return True
