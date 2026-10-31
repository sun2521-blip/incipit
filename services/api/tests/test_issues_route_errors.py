import time

import httpx
from fastapi.testclient import TestClient

from api.clients.github import GitHubClient, GitHubResponseError
from api.main import app
from api.settings import settings

client = TestClient(app)


def failing_search(exc: Exception):
    async def search_issues(self, query, *, per_page=20, page=1):
        raise exc

    return search_issues


def status_error(status: int, headers: dict[str, str] | None = None):
    request = httpx.Request("GET", "https://api.github.com/search/issues")
    upstream = httpx.Response(status, headers=headers or {}, request=request)
    return httpx.HTTPStatusError("upstream", request=request, response=upstream)


def get_issues(monkeypatch, exc: Exception):
    monkeypatch.setattr(GitHubClient, "search_issues", failing_search(exc))
    return client.get("/issues")


def test_rate_limit_with_retry_after_says_how_long_to_wait(monkeypatch):
    response = get_issues(monkeypatch, status_error(429, {"Retry-After": "120"}))

    assert response.status_code == 503
    assert "about 2 minutes" in response.json()["detail"]
    assert response.headers["Retry-After"] == "120"


def test_rate_limit_with_reset_time_says_how_long_to_wait(monkeypatch):
    reset = str(int(time.time()) + 600)
    headers = {"X-RateLimit-Remaining": "0", "X-RateLimit-Reset": reset}

    response = get_issues(monkeypatch, status_error(403, headers))

    assert response.status_code == 503
    assert "about 10 minutes" in response.json()["detail"]
    assert 590 <= int(response.headers["Retry-After"]) <= 600


def test_rate_limit_without_timing_still_returns_503(monkeypatch):
    response = get_issues(monkeypatch, status_error(429))

    assert response.status_code == 503
    assert "rate limit" in response.json()["detail"].lower()
    assert "retry-after" not in response.headers


def test_plain_forbidden_is_not_treated_as_a_rate_limit(monkeypatch):
    assert get_issues(monkeypatch, status_error(403)).status_code == 502


def test_timeout_maps_to_504(monkeypatch):
    response = get_issues(monkeypatch, httpx.ReadTimeout("too slow"))

    assert response.status_code == 504
    assert "too long" in response.json()["detail"]


def test_connection_failure_still_maps_to_502(monkeypatch):
    response = get_issues(monkeypatch, httpx.ConnectError("boom"))

    assert response.status_code == 502
    assert "Unable to reach" in response.json()["detail"]


def test_unreadable_github_response_maps_to_502(monkeypatch):
    response = get_issues(monkeypatch, GitHubResponseError("invalid JSON"))

    assert response.status_code == 502
    assert "could not read" in response.json()["detail"]


def test_retry_after_header_is_exposed_to_browsers():
    origin = settings.cors_origins[0]

    response = client.get("/health", headers={"Origin": origin})

    assert "Retry-After" in response.headers["access-control-expose-headers"]
