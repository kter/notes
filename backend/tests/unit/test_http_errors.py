from fastapi import status

from app.http_errors import to_http_exception
from app.shared import DomainError, UpstreamFailure, UpstreamTimeout


def test_upstream_timeout_maps_to_gateway_timeout():
    error = UpstreamTimeout("x")

    http_error = to_http_exception(error)

    assert http_error.status_code == status.HTTP_504_GATEWAY_TIMEOUT
    assert http_error.detail == "x"
    assert str(error) == error.detail == "x"


def test_upstream_failure_maps_to_internal_server_error():
    """上流呼び出しの失敗は detail を保ったまま 500 になる。

    images 機能だけがルーター内で自前に HTTPException へ変換していたため、
    共有シームに合流させた。
    """
    exc = to_http_exception(UpstreamFailure("Failed to upload image: denied"))

    assert exc.status_code == 500
    assert exc.detail == "Failed to upload image: denied"


def test_unmapped_domain_error_hides_its_detail():
    """未マッピングの DomainError は詳細を漏らさず汎用メッセージを返す。"""

    class SomethingNew(DomainError):
        pass

    exc = to_http_exception(SomethingNew("internal wiring detail"))

    assert exc.status_code == 500
    assert exc.detail == "An internal error occurred."
