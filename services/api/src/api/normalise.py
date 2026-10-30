import logging
import re
from typing import Any

from pydantic import ValidationError

from api.schemas.issue import Issue, IssueSearchResult, TaskType

logger = logging.getLogger(__name__)

_REPO_URL = re.compile(r"^https://api\.github\.com/repos/([^/]+/[^/]+)/?$")
_TOKEN_SPLIT = re.compile(r"[^a-z0-9]+")

# Checked in order: the first rule that matches wins.
_TASK_RULES: list[tuple[TaskType, frozenset[str]]] = [
    (TaskType.DOCUMENTATION, frozenset({"documentation", "docs", "doc"})),
    (TaskType.TESTING, frozenset({"test", "tests", "testing"})),
    (TaskType.BUG, frozenset({"bug", "defect", "regression"})),
    (TaskType.UI_UX, frozenset({"ui", "ux", "design", "accessibility", "a11y"})),
    (TaskType.FEATURE, frozenset({"feature", "enhancement"})),
]


def parse_repository(repository_url: str) -> str:
    """'https://api.github.com/repos/owner/name' -> 'owner/name'."""
    match = _REPO_URL.match(repository_url)
    if match is None:
        raise ValueError(f"Unrecognised repository_url: {repository_url!r}")
    return match.group(1)


def infer_task_type(labels: list[str]) -> TaskType | None:
    """Guess the task type from label words. Labels are noisy: this is a hint.

    Labels are split into whole words so "debug" does not match "bug".
    """
    tokens = {
        token
        for label in labels
        for token in _TOKEN_SPLIT.split(label.lower())
        if token
    }
    for task_type, keywords in _TASK_RULES:
        if tokens & keywords:
            return task_type
    return None


def normalise_issue(raw: dict[str, Any]) -> Issue:
    """Convert one raw GitHub issue into an Issue. Raises ValueError if malformed."""
    labels = [
        label["name"]
        for label in raw.get("labels") or []
        if isinstance(label, dict) and isinstance(label.get("name"), str)
    ]
    assignees = [
        user["login"]
        for user in raw.get("assignees") or []
        if isinstance(user, dict) and isinstance(user.get("login"), str)
    ]
    try:
        return Issue(
            id=raw["id"],
            number=raw["number"],
            title=raw["title"],
            url=raw["html_url"],
            state=raw["state"],
            repository=parse_repository(raw["repository_url"]),
            labels=labels,
            body=raw.get("body"),
            comments=raw.get("comments", 0),
            assignees=assignees,
            created_at=raw["created_at"],
            updated_at=raw["updated_at"],
            inferred_task_type=infer_task_type(labels),
        )
    except (KeyError, ValidationError) as exc:
        raise ValueError(f"Malformed GitHub issue: {exc}") from exc


def normalise_search_response(raw: dict[str, Any]) -> IssueSearchResult:
    """Normalise a GitHub /search/issues response, skipping PRs and bad items."""
    items: list[Issue] = []
    for raw_item in raw.get("items") or []:
        if "pull_request" in raw_item:
            continue
        try:
            items.append(normalise_issue(raw_item))
        except ValueError as exc:
            logger.warning("Skipping malformed issue: %s", exc)
    return IssueSearchResult(
        total_count=raw.get("total_count", len(items)),
        items=items,
    )
