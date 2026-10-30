from datetime import UTC, datetime
from typing import Any

import pytest

from api.schemas.issue import Issue


@pytest.fixture
def make_issue():
    """Build an Issue with sensible defaults; override any field by keyword."""

    def _make(**overrides: Any) -> Issue:
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
            "created_at": datetime(2026, 10, 1, tzinfo=UTC),
            "updated_at": datetime(2026, 10, 29, tzinfo=UTC),
            "inferred_task_type": None,
        }
        data.update(overrides)
        return Issue(**data)

    return _make


@pytest.fixture
def detailed_body() -> str:
    """A well-written bug report: steps, expected result, code block, list."""
    return (
        "Steps to reproduce:\n"
        "1. Run the parser on an empty file.\n"
        "2. Observe the crash.\n\n"
        "Expected: the parser returns an empty result.\n\n"
        "```\nTraceback (most recent call last)\n```\n\n"
        + "More context about the failure. "
        * 20
    )
