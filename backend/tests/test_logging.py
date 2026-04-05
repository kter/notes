import logging

from fastapi.testclient import TestClient


def _events(caplog) -> list[str]:
    return [getattr(record, "event", "") for record in caplog.records]


def test_settings_response_includes_request_id_header(client: TestClient):
    response = client.get("/api/settings")

    assert response.status_code == 200
    assert response.headers["X-Request-ID"]


def test_settings_update_emits_access_and_audit_logs(client: TestClient, caplog):
    with caplog.at_level(logging.INFO):
        response = client.put("/api/settings", json={"language": "ja"})

    assert response.status_code == 200
    assert "ops.http.request.completed" in _events(caplog)
    assert "audit.settings.updated" in _events(caplog)


def test_admin_forbidden_emits_authorization_log(client: TestClient, caplog):
    with caplog.at_level(logging.WARNING):
        response = client.get("/api/admin/users")

    assert response.status_code == 403
    assert "security.authorization.denied" in _events(caplog)
