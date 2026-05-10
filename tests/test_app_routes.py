"""HTTP smoke tests for FastAPI app — no MongoDB calls."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import app


@pytest.fixture()
def apiClient():
    return TestClient(app)


def test_root_returnsServiceJson(apiClient):
    res = apiClient.get("/")
    assert res.status_code == 200
    body = res.json()
    assert body.get("service") == "saral-job-viewer-api"
    assert "/api/health" in body.get("health", "")


def test_health_ok(apiClient):
    res = apiClient.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_auth_me_requiresBearer(apiClient):
    res = apiClient.get("/api/auth/me")
    assert res.status_code == 401


def test_openapi_docs_available(apiClient):
    res = apiClient.get("/docs")
    assert res.status_code == 200
