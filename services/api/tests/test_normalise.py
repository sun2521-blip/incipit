from datetime import UTC, datetime
from typing import Any

import pytest

from api.normalise import (
    infer_task_type,
    normalise_issue,
    normalise_search_response,
    parse_repository,
)
from api.schemas.issue import TaskType


def make_raw_issue(**overrides: Any) -> dict[str, Any]:
    """A hand-written issue shaped like GitHub's search response (not live data)."""
    raw: dict[str, Any] = {
        "id": 1,
        "number": 42,
        "title": "Add dataset validation",
        "html_url": "https://github.com/example/project/issues/42",
        "state": "open",
        "repository_url": "https://api.github.com/repos/example/project",
        "labels": [{"name": "good first issue"}, {"name": "bug"}],
        "assignees": [{"login": "octocat"}],
        "body": "Steps to reproduce...",
        "comments": 3,
        "created_at": "2026-10-01T10:00:00Z",
        "updated_at": "2026-10-29T08:30:00Z",
    }
    raw.update(overrides)
    return raw


def test_normalise_issue_copies_github_fields():
    issue = normalise_issue(make_raw_issue())

    assert issue.id == 1
    assert issue.number == 42
    assert issue.title == "Add dataset validation"
    assert issue.url == "https://github.com/example/project/issues/42"
    assert issue.state == "open"
    assert issue.repository == "example/project"
    assert issue.labels == ["good first issue", "bug"]
    assert issue.assignees == ["octocat"]
    assert issue.comments == 3
    assert issue.created_at == datetime(2026, 10, 1, 10, 0, tzinfo=UTC)
    assert issue.inferred_task_type == TaskType.BUG


def test_normalise_issue_handles_missing_optional_fields():
    raw = make_raw_issue(body=None, labels=None, assignees=None)
    del raw["comments"]

    issue = normalise_issue(raw)

    assert issue.body is None
    assert issue.labels == []
    assert issue.assignees == []
    assert issue.comments == 0
    assert issue.inferred_task_type is None


def test_normalise_issue_rejects_missing_required_field():
    raw = make_raw_issue()
    del raw["title"]

    with pytest.raises(ValueError):
        normalise_issue(raw)


def test_normalise_issue_rejects_unrecognised_repository_url():
    raw = make_raw_issue(repository_url="https://example.com/not-github")

    with pytest.raises(ValueError):
        normalise_issue(raw)


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://api.github.com/repos/example/project", "example/project"),
        ("https://api.github.com/repos/example/project/", "example/project"),
    ],
)
def test_parse_repository(url, expected):
    assert parse_repository(url) == expected


@pytest.mark.parametrize(
    ("labels", "expected"),
    [
        (["bug"], TaskType.BUG),
        (["type: bug"], TaskType.BUG),
        (["Bug-Report"], TaskType.BUG),
        (["documentation"], TaskType.DOCUMENTATION),
        (["area/docs"], TaskType.DOCUMENTATION),
        (["enhancement"], TaskType.FEATURE),
        (["kind/feature"], TaskType.FEATURE),
        (["tests"], TaskType.TESTING),
        (["a11y"], TaskType.UI_UX),
        (["bug", "docs"], TaskType.DOCUMENTATION),  # rule order decides
        (["good first issue"], None),  # not evidence of any task type
        (["debug"], None),  # whole words only: "debug" is not "bug"
        (["latest"], None),  # "latest" is not "test"
        ([], None),
    ],
)
def test_infer_task_type(labels, expected):
    assert infer_task_type(labels) == expected


def test_search_response_skips_pull_requests_and_malformed_items():
    raw = {
        "total_count": 3,
        "items": [
            make_raw_issue(id=1),
            make_raw_issue(id=2, pull_request={"url": "https://example.com"}),
            {"id": 3},
        ],
    }

    result = normalise_search_response(raw)

    assert result.total_count == 3
    assert [issue.id for issue in result.items] == [1]
