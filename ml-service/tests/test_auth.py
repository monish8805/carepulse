import pytest
from fastapi.testclient import TestClient

import auth
from api import app

KEY = "test-key-for-pytest"
BODY = {"age": 67, "gender": 1, "history": [{"hour": 10, "HR": 92, "O2Sat": 96, "Temp": 37.4, "Resp": 20}]}
PROTECTED = [("post", "/predict"), ("post", "/predict_all"), ("post", "/predict_series"), ("get", "/models"), ("get", "/comparison")]

client = TestClient(app)


def call(method, path, headers=None):
    return client.request(method, path, json=BODY if method == "post" else None, headers=headers or {})


def test_health_needs_no_key():
    assert client.get("/health").status_code == 200


@pytest.mark.parametrize("method,path", PROTECTED)
def test_missing_key_is_401(method, path):
    response = call(method, path)
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or missing API key."}
    assert response.headers["www-authenticate"] == "ApiKey"


@pytest.mark.parametrize("method,path", PROTECTED)
@pytest.mark.parametrize("wrong", ["wrong", KEY[:-1], KEY + "x", "", " " + KEY])
def test_invalid_key_is_401(method, path, wrong):
    assert call(method, path, {"X-API-Key": wrong}).status_code == 401


@pytest.mark.parametrize("method,path", PROTECTED)
def test_valid_key_is_accepted(method, path):
    assert call(method, path, {"X-API-Key": KEY}).status_code == 200


def test_valid_key_returns_a_real_score():
    response = call("post", "/predict", {"X-API-Key": KEY})
    assert response.json()["risk_level"] in ("LOW", "ELEVATED", "HIGH")


def test_key_is_never_echoed_back():
    for headers in ({}, {"X-API-Key": "wrong"}, {"X-API-Key": KEY}):
        response = call("post", "/predict", headers)
        assert KEY not in response.text
        assert KEY not in str(response.headers)


def test_docs_are_hidden_when_a_key_is_set():
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


def test_non_ascii_key_is_401_not_500():
    assert call("post", "/predict", {"X-API-Key": "é".encode("utf-8")}).status_code == 401


def test_startup_refuses_to_run_without_a_key(monkeypatch):
    monkeypatch.delenv("ML_API_KEY")
    monkeypatch.delenv("ML_AUTH_DISABLED", raising=False)
    with pytest.raises(RuntimeError, match="ML_API_KEY"):
        auth.check_auth_configured()


def test_requests_fail_closed_if_the_key_disappears(monkeypatch):
    monkeypatch.delenv("ML_API_KEY")
    monkeypatch.delenv("ML_AUTH_DISABLED", raising=False)
    assert call("post", "/predict").status_code == 401


def test_auth_can_be_turned_off_only_explicitly(monkeypatch):
    monkeypatch.delenv("ML_API_KEY")
    monkeypatch.setenv("ML_AUTH_DISABLED", "true")
    auth.check_auth_configured()
    assert call("post", "/predict").status_code == 200
