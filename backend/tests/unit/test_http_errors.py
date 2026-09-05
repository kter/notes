from fastapi import status

from app.http_errors import to_http_exception
from app.shared import UpstreamTimeout


def test_upstream_timeout_maps_to_gateway_timeout():
    error = UpstreamTimeout("x")

    http_error = to_http_exception(error)

    assert http_error.status_code == status.HTTP_504_GATEWAY_TIMEOUT
    assert http_error.detail == "x"
    assert str(error) == error.detail == "x"
