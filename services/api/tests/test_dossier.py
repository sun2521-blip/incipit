import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from api.clients.github import GitHubClient, GitHubResponseError
from api.dossier import (
    GUIDANCE_NOTE,
    IssueDeleted,
    IssueNotFound,
    NotAnIssue,
    build_dossier,
    build_guidance,
    fetch_dossier,
)
from api.schemas.repository import ContributingGuide, GuideStatus

FIXTURES = Path(__file__).parent / "fixtures"
ISSUES = json.loads((FIXTURES / "issues.json").read_text(encoding="utf-8"))
REPOS = json.loads((FIXTURES / "repositories.json").read_text(encoding="utf-8"))
COMMUNITY = json.loads(
    (FIXTURES / "community_profiles.json").read_text(encoding="utf-8")
)
NOW = datetime(2026, 11, 1, 12, tzinfo=UTC)

FOUND = ContributingGuide(
    status=GuideStatus.FOUND, url="https://github.com/a/b/blob/main/CONTRIBUTING.md"
)


def repo_of(raw_issue) -> str:
    return raw_issue["repository_url"].removeprefix("https://api.github.com/repos/")


def fake_github(issues: dict[str, dict], *, repos=REPOS, community=COMMUNITY):
    """Answer like GitHub from fixtures: issues keyed by "owner/repo#number"."""

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path.removeprefix("/repos/")
        if "/issues/" in path:
            name, number = path.split("/issues/")
            raw = issues.get(f"{name}#{number}")
            return httpx.Response(200, json=raw) if raw else httpx.Response(404)
        if path.endswith("/community/profile"):
            raw = community.get(path.removesuffix("/community/profile"))
            return httpx.Response(200, json=raw) if raw else httpx.Response(404)
        raw = repos.get(path)
        return httpx.Response(200, json=raw) if raw else httpx.Response(404)

    return handler


def dossier_for(handler, name, number):
    client = GitHubClient(
        transport=httpx.MockTransport(handler), cache=None, repo_cache=None
    )
    return asyncio.run(fetch_dossier(client, name, number, now=NOW))


# ---- guidance -----------------------------------------------------------------


def test_guidance_is_labelled_generic():
    guidance = build_guidance(FOUND)

    assert guidance.kind == "generic"
    assert guidance.note == GUIDANCE_NOTE
    assert "not checked against this repository" in guidance.note


def test_guidance_covers_the_blueprint_checklist():
    titles = " / ".join(step.title for step in build_guidance(FOUND).steps).lower()

    for words in ["contributing guide", "set up", "reproduce", "tests", "focused"]:
        assert words in titles


def test_first_step_links_a_found_guide():
    step = build_guidance(FOUND).steps[0]

    assert step.link == FOUND.url


def test_first_step_says_when_no_guide_was_found():
    step = build_guidance(ContributingGuide(status=GuideStatus.NOT_FOUND)).steps[0]

    assert step.link is None
    assert "found no contributing guide" in step.detail


def test_first_step_admits_when_the_guide_could_not_be_checked():
    step = build_guidance(ContributingGuide(status=GuideStatus.UNKNOWN)).steps[0]

    assert step.link is None
    assert "could not check" in step.detail
    assert "found no" not in step.detail  # unknown is never reported as absent


def test_guidance_never_claims_easy_or_unclaimed():
    for status in GuideStatus:
        guidance = build_guidance(
            ContributingGuide(
                status=status, url=FOUND.url if status == "found" else None
            )
        )
        text = " ".join(
            [guidance.note, *(f"{s.title} {s.detail}" for s in guidance.steps)]
        ).lower()
        for claim in ["easy", "unclaimed", "simple", "guaranteed", "beginner"]:
            assert claim not in text


def test_build_dossier_keeps_facts_and_guidance_apart(make_issue):
    issue = make_issue()

    dossier = build_dossier(issue, FOUND, checked_at=NOW)

    assert dossier.issue == issue
    assert dossier.contributing_guide == FOUND
    assert dossier.checked_at == NOW
    assert dossier.moved_from is None
    assert dossier.guidance.kind == "generic"


# ---- fetching -----------------------------------------------------------------


def test_open_issue_from_real_github_data():
    raw = ISSUES["open"]
    name = repo_of(raw)

    dossier = dossier_for(
        fake_github({f"{name}#{raw['number']}": raw}), name, raw["number"]
    )

    assert dossier.issue.state == "open"
    assert dossier.issue.number == raw["number"]
    assert dossier.issue.url == raw["html_url"]
    assert dossier.checked_at == NOW
    assert dossier.moved_from is None


def test_closed_issue_is_returned_with_its_state():
    raw = ISSUES["closed"]
    name = repo_of(raw)

    dossier = dossier_for(
        fake_github({f"{name}#{raw['number']}": raw}), name, raw["number"]
    )

    assert dossier.issue.state == "closed"


def test_repository_context_and_guide_are_filled_in():
    name = next(iter(REPOS))  # a repository with a real context and guide
    raw = {
        **ISSUES["open"],
        "number": 5,
        "repository_url": f"https://api.github.com/repos/{name}",
    }

    dossier = dossier_for(fake_github({f"{name}#5": raw}), name, 5)

    assert dossier.issue.repo_context is not None
    assert dossier.issue.repo_context.full_name.casefold() == name.casefold()
    assert dossier.contributing_guide.status == GuideStatus.FOUND


def test_missing_context_and_guide_do_not_fail_the_dossier():
    raw = ISSUES["open"]
    name = repo_of(raw)

    dossier = dossier_for(
        fake_github({f"{name}#{raw['number']}": raw}, repos={}, community={}),
        name,
        raw["number"],
    )

    assert dossier.issue.repo_context is None
    assert dossier.contributing_guide.status == GuideStatus.UNKNOWN


def test_repository_with_no_contributing_guide():
    raw = {
        **ISSUES["open"],
        "number": 1,
        "repository_url": "https://api.github.com/repos/octocat/Hello-World",
    }

    dossier = dossier_for(
        fake_github({"octocat/Hello-World#1": raw}), "octocat/Hello-World", 1
    )

    assert dossier.contributing_guide.status == GuideStatus.NOT_FOUND
    assert "found no contributing guide" in dossier.guidance.steps[0].detail


def test_missing_issue_raises_not_found():
    with pytest.raises(IssueNotFound):
        dossier_for(fake_github({}), "example/project", 1)


def test_deleted_issue_raises_deleted():
    with pytest.raises(IssueDeleted):
        dossier_for(lambda request: httpx.Response(410), "example/project", 1)


def test_pull_request_is_not_an_issue():
    raw = {**ISSUES["open"], "pull_request": {"url": "https://example"}}
    name = repo_of(raw)

    with pytest.raises(NotAnIssue):
        dossier_for(fake_github({f"{name}#{raw['number']}": raw}), name, raw["number"])


def test_transferred_issue_says_where_it_came_from():
    raw = ISSUES["open"]
    new_home = repo_of(raw)

    def handler(request):
        if request.url.path == "/repos/old-owner/old-repo/issues/3":
            return httpx.Response(
                301,
                headers={
                    "location": f"https://api.github.com/repos/{new_home}/issues/{raw['number']}"
                },
            )
        return fake_github({f"{new_home}#{raw['number']}": raw})(request)

    dossier = dossier_for(handler, "old-owner/old-repo", 3)

    assert dossier.moved_from == "old-owner/old-repo#3"
    assert dossier.issue.repository == new_home


def test_malformed_issue_is_a_response_error():
    with pytest.raises(GitHubResponseError):
        dossier_for(
            lambda request: httpx.Response(200, json={"title": "no id"}),
            "example/project",
            1,
        )


@pytest.mark.parametrize("status", [403, 429, 500])
def test_other_github_errors_pass_through(status):
    with pytest.raises(httpx.HTTPStatusError):
        dossier_for(lambda request: httpx.Response(status), "example/project", 1)
