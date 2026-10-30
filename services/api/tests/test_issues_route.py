from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from api.clients.github import GitHubClient
from api.main import app

client = TestClient(app)

EMPTY: dict[str, Any] = {"total_count": 0, "items": []}


def raw_issue(**overrides: Any) -> dict[str, Any]:
    """A hand-written issue shaped like GitHub's search response (not live data)."""
    raw: dict[str, Any] = {
        "id": 1,
        "number": 42,
        "title": "Add dataset validation",
        "html_url": "https://github.com/example/project/issues/42",
        "state": "open",
        "repository_url": "https://api.github.com/repos/example/project",
        "labels": [{"name": "good first issue"}, {"name": "bug"}],
        "assignees": [],
        "body": "Steps to reproduce...",
        "comments": 3,
        "created_at": "2026-10-01T10:00:00Z",
        "updated_at": "2026-10-29T08:30:00Z",
    }
    raw.update(overrides)
    return raw


def fake_search(result: dict[str, Any], seen: list[str] | None = None):
    async def search_issues(self, query, *, per_page=20, page=1):
        if seen is not None:
            seen.append(query)
        return result

    return search_issues


def failing_search(exc: Exception):
    async def search_issues(self, query, *, per_page=20, page=1):
        raise exc

    return search_issues


def test_issues_returns_normalised_items(monkeypatch):
    result = {"total_count": 1, "items": [raw_issue()]}
    monkeypatch.setattr(GitHubClient, "search_issues", fake_search(result))

    response = client.get("/issues")

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] == 1
    item = body["items"][0]
    assert item["repository"] == "example/project"
    assert item["url"] == "https://github.com/example/project/issues/42"
    assert item["labels"] == ["good first issue", "bug"]
    assert item["inferred_task_type"] == "Bug"
    assert "html_url" not in item
    assert "repository_url" not in item


def test_issues_builds_github_query_from_filters(monkeypatch):
    seen: list[str] = []
    monkeypatch.setattr(GitHubClient, "search_issues", fake_search(EMPTY, seen))

    response = client.get(
        "/issues",
        params={"query": "pandas", "language": "Python", "task_type": "Bug"},
    )

    assert response.status_code == 200
    assert seen == [
        'pandas in:title,body label:"good first issue" label:bug language:"Python"'
    ]


def test_issues_accepts_task_type_with_spaces_and_slash(monkeypatch):
    seen: list[str] = []
    monkeypatch.setattr(GitHubClient, "search_issues", fake_search(EMPTY, seen))

    response = client.get("/issues", params={"task_type": "UI / UX"})

    assert response.status_code == 200
    assert "label:ui,ux,design,accessibility" in seen[0]


@pytest.mark.parametrize(
    "params",
    [
        {"language": 'Py"thon'},
        {"language": "Python repo:evil/repo"},
        {"task_type": "Nonsense"},
        {"per_page": 0},
        {"per_page": 51},
        {"page": 0},
    ],
)
def test_issues_rejects_invalid_parameters(params):
    assert client.get("/issues", params=params).status_code == 422


@pytest.mark.parametrize(
    ("status", "headers", "expected"),
    [
        (429, {}, 503),
        (403, {"X-RateLimit-Remaining": "0"}, 503),
        (403, {}, 502),
        (500, {}, 502),
    ],
)
def test_issues_maps_github_errors(monkeypatch, status, headers, expected):
    request = httpx.Request("GET", "https://api.github.com/search/issues")
    upstream = httpx.Response(status, headers=headers, request=request)
    error = httpx.HTTPStatusError("upstream", request=request, response=upstream)
    monkeypatch.setattr(GitHubClient, "search_issues", failing_search(error))

    response = client.get("/issues")

    assert response.status_code == expected


def test_issues_maps_network_failure_to_502(monkeypatch):
    monkeypatch.setattr(
        GitHubClient, "search_issues", failing_search(httpx.ConnectError("boom"))
    )

    response = client.get("/issues")

    assert response.status_code == 502
    assert "Unable to reach" in response.json()["detail"]
