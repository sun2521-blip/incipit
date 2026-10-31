from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def issue_json(**overrides: Any) -> dict[str, Any]:
    """An issue in the shape /issues returns (hand-written, not live data)."""
    data: dict[str, Any] = {
        "id": 1,
        "number": 1,
        "title": "Fix parser crash",
        "url": "https://github.com/example/project/issues/1",
        "state": "open",
        "repository": "example/project",
        "labels": ["good first issue"],
        "body": None,
        "comments": 0,
        "assignees": [],
        "created_at": "2026-10-01T10:00:00Z",
        "updated_at": "2026-10-29T08:30:00Z",
        "inferred_task_type": None,
    }
    data.update(overrides)
    return data


def test_rank_orders_issues_best_first():
    weak = issue_json(id=1, inferred_task_type="Feature", body="Short.")
    strong = issue_json(
        id=2,
        title="Fix pandas import",
        inferred_task_type="Bug",
        body="Steps to reproduce:\n1. Import pandas.\nExpected: no error.",
    )
    profile = {"task_types": ["Bug"], "topics": ["pandas"]}

    response = client.post("/rank", json={"issues": [weak, strong], "profile": profile})

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["issue"]["id"] for item in items] == [2, 1]
    assert items[0]["score"] > items[1]["score"]


def test_rank_explains_each_score():
    response = client.post("/rank", json={"issues": [issue_json()]})

    breakdown = response.json()["items"][0]["breakdown"]
    assert [signal["name"] for signal in breakdown] == [
        "skill_match",
        "task_match",
        "clarity",
        "maintenance",
        "goal_match",
    ]
    assert all(signal["reason"] for signal in breakdown)
    assert breakdown[0]["score"] is None  # no repository context was sent


def test_rank_works_without_a_profile():
    response = client.post("/rank", json={"issues": [issue_json()]})

    assert response.status_code == 200
    assert response.json()["items"][0]["breakdown"][1]["score"] is None


def test_rank_accepts_an_empty_list():
    response = client.post("/rank", json={"issues": []})

    assert response.status_code == 200
    assert response.json() == {"items": []}


@pytest.mark.parametrize(
    "payload",
    [
        {"issues": [issue_json(id=i) for i in range(101)]},  # over the limit
        {"issues": [issue_json()], "profile": {"topics": ["x" * 41]}},
        {"issues": [issue_json()], "profile": {"task_types": ["Nonsense"]}},
        {"issues": [{"id": 1}]},  # not a valid issue
        {},  # issues is required
    ],
)
def test_rank_rejects_invalid_requests(payload):
    assert client.post("/rank", json=payload).status_code == 422
