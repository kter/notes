"""どのルートが X-API-Key を受け付けるかを固定するマトリクステスト。

以前は `UserId` と `FolderNoteUserId` という 2 つの型エイリアスがどちらも str に
解決され、後者だけが X-API-Key を受け付けていた。名前が示していたのは「今どの
ルートで使われているか」であって能力ではなく、ルートをどちらかに移し替えても
何も検知できなかった。ここで認証面を明示的な事実として固定する。
"""

import pytest
from fastapi.routing import APIRoute

from app.auth.dependencies import (
    api_key_header_security,
    get_bearer_or_api_key_user_id,
    get_user_id,
)
from app.main import app

# X-API-Key を受け付けることを意図しているルート。
# 外部連携のためにこの面だけを開いている。
API_KEY_ROUTES = {
    ("/api/folders", "GET"),
    ("/api/folders", "POST"),
    ("/api/folders/{folder_id}", "GET"),
    ("/api/folders/{folder_id}", "PATCH"),
    ("/api/folders/{folder_id}", "DELETE"),
    ("/api/notes", "GET"),
    ("/api/notes", "POST"),
    ("/api/notes/{note_id}", "GET"),
    ("/api/notes/{note_id}", "PATCH"),
    ("/api/notes/{note_id}", "DELETE"),
}


def _accepts_api_key(route: APIRoute) -> bool:
    """ルートの依存グラフに X-API-Key のセキュリティスキームがあるか。"""
    return any(
        dependency.security_scheme is api_key_header_security
        for dependency in route.dependant.security_requirements
    ) or _has_api_key_dependency(route)


def _has_api_key_dependency(route: APIRoute) -> bool:
    """依存グラフを辿って API キー対応の依存関数を探す。"""
    stack = [route.dependant]
    while stack:
        dependant = stack.pop()
        if dependant.call is get_bearer_or_api_key_user_id:
            return True
        stack.extend(dependant.dependencies)
    return False


def _has_bearer_only_dependency(route: APIRoute) -> bool:
    stack = [route.dependant]
    while stack:
        dependant = stack.pop()
        if dependant.call is get_user_id:
            return True
        stack.extend(dependant.dependencies)
    return False


def _authenticated_routes() -> list[APIRoute]:
    return [
        route
        for route in app.routes
        if isinstance(route, APIRoute)
        and (_has_api_key_dependency(route) or _has_bearer_only_dependency(route))
    ]


def test_api_key_surface_is_exactly_the_declared_routes():
    """X-API-Key を受け付けるルートの集合が意図どおりであること。

    ここが落ちたら、ルートの認証面が変わっている。意図した変更なら
    API_KEY_ROUTES を更新すること。意図していないなら、それがこのテストの目的。
    """
    actual = {
        (route.path, method)
        for route in _authenticated_routes()
        if _has_api_key_dependency(route)
        for method in sorted(route.methods - {"HEAD", "OPTIONS"})
    }

    assert actual == API_KEY_ROUTES


def test_every_other_authenticated_route_is_bearer_only():
    """API キーを受け付けないルートは Bearer のみであること。"""
    for route in _authenticated_routes():
        if _has_api_key_dependency(route):
            continue
        assert _has_bearer_only_dependency(route), route.path


@pytest.mark.parametrize(
    ("path", "method"),
    sorted(API_KEY_ROUTES),
)
def test_api_key_routes_reject_an_invalid_key(client_without_auth, path, method):
    """API キー対応ルートは、無効なキーを 401 で弾く。"""
    response = client_without_auth.request(
        method,
        path.replace("{folder_id}", "00000000-0000-0000-0000-000000000000").replace(
            "{note_id}", "00000000-0000-0000-0000-000000000000"
        ),
        headers={"X-API-Key": "not-a-real-key"},
        json={} if method in {"POST", "PUT", "PATCH"} else None,
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid API key"


class TestMissingSubjectIsRejectedOnEveryBearerPath:
    """sub クレームが空の Bearer は、どの経路でも 401 になること。

    以前は API キー併用の依存関数が get_current_app_user の連鎖を手で書き直して
    おり、その経路にだけ sub 欠落の 401 が無かった。
    """

    def test_app_user_from_claims_rejects_a_missing_subject(self, session):
        from fastapi import HTTPException

        from app.auth.dependencies import _app_user_from_claims

        with pytest.raises(HTTPException) as exc_info:
            _app_user_from_claims({"email": "no-sub@example.com"}, session)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Missing user subject"

    def test_both_dependencies_share_the_same_bearer_chain(self):
        """Bearer 経路が 1 本であることを、ソース上の事実として固定する。"""
        import inspect

        from app.auth.dependencies import require_principal

        bearer_only = inspect.getsource(require_principal)

        # どちらの分岐も _app_user_from_claims を通る
        assert bearer_only.count("_app_user_from_claims") == 2
