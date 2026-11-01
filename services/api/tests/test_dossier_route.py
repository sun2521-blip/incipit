import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from api.clients.github import GitHubClient
from api.main import app

client = TestClient(app)

ISSUES = json.loads(
    (Path(__file__).parent / "fixtures" / "issues.json").read_text(encoding="utf-8")
)


def status_error(status: int, headers: dict[str, str] | None = None):
    request = httpx.Request("GET", "https://api.github.com/repos/a/b/issues/1")
    response = httpx.Response(status, headers=headers or {}, request=request)
    return httpx.HTTPStatusError("upstream", request=request, response=response)


@pytest.fixture(autouse=True)
def github(monkeypatch):
    """Route tests never reach GitHub. By default: no context, no guide."""
    state = {"issue": ISSUES["open"], "issue_error": None, "community": None}

    async def get_issue(self, full_name, number):
        if state["issue_error"] is not None:
            raise state["issue_error"]
        return state["issue"]

    async def get_repository(self, full_name):
        raise status_error(404)

    async def get_community_profile(self, full_name):
        if state["community"] is None:
            raise status_error(404)
        return state["community"]

    monkeypatch.setattr(GitHubClient, "get_issue", get_issue)
    monkeypatch.setattr(GitHubClient, "get_repository", get_repository)
    monkeypatch.setattr(GitHubClient, "get_community_profile", get_community_profile)
    return state


def test_open_issue_dossier():
    raw = ISSUES["open"]

    response = client.get(f"/issues/a/b/{raw['number']}")

    assert response.status_code == 200
    body = response.json()
    assert body["issue"]["state"] == "open"
    assert body["issue"]["url"] == raw["html_url"]
    assert body["checked_at"]
    assert body["guidance"]["kind"] == "generic"
    assert body["contributing_guide"] == {"status": "unknown", "url": None}
    assert "score" not in body  # ranking needs the profile: POST /rank


def test_closed_issue_dossier(github):
    github["issue"] = ISSUES["closed"]

    response = client.get("/issues/a/b/1")

    assert response.status_code == 200
    assert response.json()["issue"]["state"] == "closed"


def test_repository_without_a_contributing_guide(github):
    github["community"] = {"files": {"contributing": None}}

    body = client.get("/issues/a/b/1").json()

    assert body["contributing_guide"]["status"] == "not_found"
    assert "found no contributing guide" in body["guidance"]["steps"][0]["detail"]


def test_missing_issue_is_404(github):
    github["issue_error"] = status_error(404)

    response = client.get("/issues/example/project/99")

    assert response.status_code == 404
    assert "no issue #99 in example/project" in response.json()["detail"]


def test_deleted_issue_is_410(github):
    github["issue_error"] = status_error(410)

    response = client.get("/issues/example/project/5")

    assert response.status_code == 410
    assert "deleted" in response.json()["detail"]


def test_pull_request_is_404_with_a_clear_message(github):
    github["issue"] = {**ISSUES["open"], "pull_request": {"url": "https://x"}}

    response = client.get("/issues/example/project/5")

    assert response.status_code == 404
    assert "pull request" in response.json()["detail"]


@pytest.mark.parametrize(
    "path",
    [
        "/issues/example/project/0",
        "/issues/example/project/-1",
        "/issues/example/project/abc",
        "/issues/example/project/99999999999",
        "/issues/bad_owner!/project/1",
        "/issues/example/pro%20ject/1",
        "/issues/example/../1",
        "/issues/example/%2E%2E/1",
        "/issues/example/./1",
        "/issues/" + "o" * 40 + "/project/1",
    ],
)
def test_invalid_identifiers_never_reach_github(github, path):
    github["issue_error"] = AssertionError("GitHub must not be called")

    response = client.get(path)

    assert response.status_code in (404, 422)


def test_rate_limit_says_when_to_retry(github):
    github["issue_error"] = status_error(429, {"Retry-After": "90"})

    response = client.get("/issues/a/b/1")

    assert response.status_code == 503
    assert "about 2 minutes" in response.json()["detail"]
    assert response.headers["Retry-After"] == "90"


def test_timeout_is_504(github):
    github["issue_error"] = httpx.ReadTimeout("slow")

    assert client.get("/issues/a/b/1").status_code == 504


def test_malformed_issue_is_502(github):
    github["issue"] = {"title": "no id"}

    assert client.get("/issues/a/b/1").status_code == 502
