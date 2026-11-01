"""Assemble an issue dossier: verified GitHub facts plus labelled, generic guidance."""

import asyncio
from datetime import UTC, datetime

import httpx

from api.clients.github import GitHubClient, GitHubResponseError
from api.normalise import normalise_issue
from api.repo_context import (
    attach_repo_contexts,
    fetch_repo_contexts,
    find_contributing_guide,
)
from api.schemas.dossier import ChecklistStep, Dossier, Guidance
from api.schemas.issue import Issue
from api.schemas.repository import ContributingGuide, GuideStatus

GUIDANCE_NOTE = (
    "General steps that suit most open-source projects. "
    "They are not checked against this repository."
)


class IssueNotFound(Exception):
    """GitHub has no such issue, or it is in a private repository."""


class IssueDeleted(Exception):
    """GitHub says the issue was deleted (410 Gone)."""


class NotAnIssue(Exception):
    """The number belongs to a pull request."""


def _guide_step(guide: ContributingGuide) -> ChecklistStep:
    if guide.status == GuideStatus.FOUND:
        return ChecklistStep(
            title="Read the contributing guide",
            detail="It explains how this project wants changes made and reviewed.",
            link=guide.url,
        )
    if guide.status == GuideStatus.NOT_FOUND:
        return ChecklistStep(
            title="Look for contribution notes",
            detail=(
                "GitHub found no contributing guide for this repository. "
                "Check the README for setup steps and rules."
            ),
        )
    return ChecklistStep(
        title="Look for a contributing guide",
        detail=(
            "Incipit could not check for one just now. Look for CONTRIBUTING.md "
            "in the repository root, docs/ or .github/."
        ),
    )


def build_guidance(guide: ContributingGuide) -> Guidance:
    return Guidance(
        note=GUIDANCE_NOTE,
        steps=[
            _guide_step(guide),
            ChecklistStep(
                title="Check whether someone is already on it",
                detail=(
                    "Read the comments and any linked pull requests. If it is "
                    "unclear, ask on the issue before you start."
                ),
            ),
            ChecklistStep(
                title="Set up the project",
                detail=(
                    "Fork and clone the repository, then follow its setup steps "
                    "until it builds and its tests run."
                ),
            ),
            ChecklistStep(
                title="Reproduce the behaviour",
                detail=(
                    "Confirm you can see the problem, or understand the missing "
                    "feature, before changing anything."
                ),
            ),
            ChecklistStep(
                title="Read the related tests",
                detail="They show how the code in this area is expected to behave.",
            ),
            ChecklistStep(
                title="Make a focused change",
                detail="Change only what the issue needs, with a test that proves it.",
            ),
            ChecklistStep(
                title="Run the tests and open a pull request",
                detail="Run the full test suite, then link your pull request to the issue.",
            ),
        ],
    )


def build_dossier(
    issue: Issue,
    guide: ContributingGuide,
    *,
    checked_at: datetime,
    moved_from: str | None = None,
) -> Dossier:
    return Dossier(
        checked_at=checked_at,
        moved_from=moved_from,
        issue=issue,
        contributing_guide=guide,
        guidance=build_guidance(guide),
    )


async def fetch_dossier(
    client: GitHubClient,
    full_name: str,
    number: int,
    *,
    now: datetime | None = None,
) -> Dossier:
    """Fetch the issue live, then its repository context and contributing guide.

    Raises IssueNotFound, IssueDeleted or NotAnIssue for those states, and lets
    other GitHub failures through for the route to map. Context and guide
    lookups never fail the dossier: they come back as unavailable or unknown.
    """
    try:
        raw = await client.get_issue(full_name, number)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise IssueNotFound from exc
        if exc.response.status_code == 410:
            raise IssueDeleted from exc
        raise
    checked_at = now or datetime.now(UTC)

    if "pull_request" in raw:
        raise NotAnIssue
    try:
        issue = normalise_issue(raw)
    except ValueError as exc:
        raise GitHubResponseError("GitHub returned a malformed issue") from exc

    moved = (
        issue.repository.casefold() != full_name.casefold() or issue.number != number
    )

    contexts, guide = await asyncio.gather(
        fetch_repo_contexts(client, [issue.repository]),
        find_contributing_guide(client, issue.repository),
    )
    return build_dossier(
        attach_repo_contexts([issue], contexts)[0],
        guide,
        checked_at=checked_at,
        moved_from=f"{full_name}#{number}" if moved else None,
    )
