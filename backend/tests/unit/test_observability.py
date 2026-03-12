from types import SimpleNamespace
from unittest.mock import patch

from sentry_sdk.integrations.aws_lambda import AwsLambdaIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration

from app.observability import get_sentry_dsn, init_sentry


def _reset_sentry_state() -> None:
    import app.observability as observability

    observability._sentry_initialized = False
    observability._fastapi_integration_enabled = False
    observability.get_sentry_dsn.cache_clear()


def test_init_sentry_skips_when_dsn_missing():
    _reset_sentry_state()
    settings = SimpleNamespace(
        sentry_dsn="",
        sentry_dsn_parameter_name="",
        environment="dev",
        effective_sentry_traces_sample_rate=1.0,
    )

    with (
        patch("app.observability.is_test_environment", return_value=False),
        patch("app.observability.get_settings", return_value=settings),
        patch("app.observability.sentry_sdk.init") as mock_init,
    ):
        assert init_sentry() is False
        mock_init.assert_not_called()


def test_init_sentry_configures_lambda_and_fastapi_integrations():
    _reset_sentry_state()
    settings = SimpleNamespace(
        sentry_dsn="https://examplePublicKey@o0.ingest.sentry.io/0",
        sentry_dsn_parameter_name="",
        environment="dev",
        effective_sentry_traces_sample_rate=1.0,
    )

    with (
        patch("app.observability.is_test_environment", return_value=False),
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
        sentry_dsn_parameter_name="",
        environment="prd",
        effective_sentry_traces_sample_rate=0.1,
    )

    with (
        patch("app.observability.is_test_environment", return_value=False),
        patch("app.observability.get_settings", return_value=settings),
        patch("app.observability.sentry_sdk.init") as mock_init,
    ):
        assert init_sentry() is True
        assert init_sentry() is False
        assert init_sentry(with_fastapi=True) is True
        assert init_sentry(with_fastapi=True) is False

    assert mock_init.call_count == 2


def test_get_sentry_dsn_reads_from_ssm_parameter_store():
    _reset_sentry_state()
    settings = SimpleNamespace(
        sentry_dsn="",
        sentry_dsn_parameter_name="/notes-app/dev/sentry-dsn-backend",
        aws_region="ap-northeast-1",
    )
    ssm_client = SimpleNamespace(
        get_parameter=lambda **kwargs: {
            "Parameter": {
                "Value": "https://examplePublicKey@o0.ingest.sentry.io/0",
            },
        },
    )

    with (
        patch("app.observability.get_settings", return_value=settings),
        patch("app.observability.boto3.client", return_value=ssm_client) as mock_client,
    ):
        assert get_sentry_dsn() == "https://examplePublicKey@o0.ingest.sentry.io/0"

    mock_client.assert_called_once_with("ssm", region_name="ap-northeast-1")


def test_init_sentry_is_disabled_during_pytest():
    _reset_sentry_state()
    settings = SimpleNamespace(
        sentry_dsn="https://examplePublicKey@o0.ingest.sentry.io/0",
        sentry_dsn_parameter_name="",
        environment="dev",
        effective_sentry_traces_sample_rate=1.0,
    )

    with (
        patch("app.observability.is_test_environment", return_value=True),
        patch("app.observability.get_settings", return_value=settings),
        patch("app.observability.sentry_sdk.init") as mock_init,
    ):
        assert init_sentry() is False

    mock_init.assert_not_called()
