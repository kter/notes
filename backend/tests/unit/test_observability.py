from types import SimpleNamespace
from unittest.mock import patch

from sentry_sdk.integrations.aws_lambda import AwsLambdaIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration

from app.observability import init_sentry


def _reset_sentry_state() -> None:
    import app.observability as observability

    observability._sentry_initialized = False
    observability._fastapi_integration_enabled = False


def test_init_sentry_skips_when_dsn_missing():
    _reset_sentry_state()
    settings = SimpleNamespace(
        sentry_dsn="",
        environment="dev",
        effective_sentry_traces_sample_rate=1.0,
    )

    with (
        patch("app.observability.get_settings", return_value=settings),
        patch("app.observability.sentry_sdk.init") as mock_init,
    ):
        assert init_sentry() is False
        mock_init.assert_not_called()


def test_init_sentry_configures_lambda_and_fastapi_integrations():
    _reset_sentry_state()
    settings = SimpleNamespace(
        sentry_dsn="https://examplePublicKey@o0.ingest.sentry.io/0",
        environment="dev",
        effective_sentry_traces_sample_rate=1.0,
    )

    with (
        patch("app.observability.get_settings", return_value=settings),
        patch("app.observability.sentry_sdk.init") as mock_init,
    ):
        assert init_sentry(with_fastapi=True) is True

    kwargs = mock_init.call_args.kwargs
    assert kwargs["dsn"] == settings.sentry_dsn
    assert kwargs["environment"] == "dev"
    assert kwargs["send_default_pii"] is True
    assert kwargs["traces_sample_rate"] == 1.0
    assert isinstance(kwargs["integrations"][0], AwsLambdaIntegration)
    assert kwargs["integrations"][0].timeout_warning is True
    assert isinstance(kwargs["integrations"][1], FastApiIntegration)
    assert kwargs["integrations"][1].transaction_style == "endpoint"


def test_init_sentry_only_initializes_once_per_runtime_mode():
    _reset_sentry_state()
    settings = SimpleNamespace(
        sentry_dsn="https://examplePublicKey@o0.ingest.sentry.io/0",
        environment="prd",
        effective_sentry_traces_sample_rate=0.1,
    )

    with (
        patch("app.observability.get_settings", return_value=settings),
        patch("app.observability.sentry_sdk.init") as mock_init,
    ):
        assert init_sentry() is True
        assert init_sentry() is False
        assert init_sentry(with_fastapi=True) is True
        assert init_sentry(with_fastapi=True) is False

    assert mock_init.call_count == 2
