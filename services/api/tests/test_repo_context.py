import asyncio
import json
from pathlib import Path

import httpx
import pytest

from api.clients.github import GitHubClient
from api.repo_context import (
    attach_repo_contexts,
    fetch_repo_contexts,
    find_contributing_guide,
)
from api.schemas.repository import GuideStatus

FIXTURE = Path(__file__).parent / "fixtures" / "repositories.json"
REAL_REPOS = json.loads(FIXTURE.read_text(encoding="utf-8"))


def real_github(request: httpx.Request) -> httpx.Response:
    """Answer /repos lookups from the captured fixture; anything else is a 404."""
    name = request.url.path.removeprefix("/repos/")
    raw = REAL_REPOS.get(name)
    if raw is None:
        return httpx.Response(404, json={"message": "Not Found"})
    if "status" in raw:
        return httpx.Response(raw["status"])
    return httpx.Response(200, json=raw)


def make_client(handler) -> GitHubClient:
    return GitHubClient(
        transport=httpx.MockTransport(handler), cache=None, repo_cache=None
    )


def fetch(handler, names, **kwargs):
    return asyncio.run(fetch_repo_contexts(make_client(handler), names, **kwargs))


def test_returns_context_for_each_repository():
    names = list(REAL_REPOS)

    contexts = fetch(real_github, names)

    assert set(contexts) == set(names)
    for name, context in contexts.items():
        assert context is not None
        assert context.full_name.casefold() == name.casefold()


def test_looks_each_repository_up_once():
    seen: list[str] = []

    def handler(request):
        seen.append(request.url.path)
        return real_github(request)

    name = next(iter(REAL_REPOS))
    fetch(handler, [name, name, name])

    assert seen == [f"/repos/{name}"]


@pytest.mark.parametrize("status", [403, 404, 429, 500])
def test_errors_make_context_unavailable_not_a_crash(status):
    name = next(iter(REAL_REPOS))

    contexts = fetch(lambda request: httpx.Response(status), [name])

    assert contexts == {name: None}


def test_network_failures_and_bad_answers_make_context_unavailable():
    def handler(request):
        if request.url.path.endswith("/down"):
            raise httpx.ConnectError("offline", request=request)
        if request.url.path.endswith("/garbled"):
            return httpx.Response(200, text="<html>")
        return httpx.Response(200, json={"unexpected": True})

    contexts = fetch(handler, ["a/down", "a/garbled", "a/odd", "not a name"])

    assert contexts == {
        "a/down": None,
        "a/garbled": None,
        "a/odd": None,
        "not a name": None,
    }


def test_one_failure_does_not_affect_the_others():
    good = next(iter(REAL_REPOS))

    contexts = fetch(real_github, [good, "missing/repo"])

    assert contexts[good] is not None
    assert contexts["missing/repo"] is None


def test_never_runs_more_lookups_at_once_than_the_limit():
    running = 0
    peak = 0

    class SlowTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):
            nonlocal running, peak
            running += 1
            peak = max(peak, running)
            await asyncio.sleep(0.01)
            running -= 1
            return httpx.Response(404)

    client = GitHubClient(transport=SlowTransport(), cache=None, repo_cache=None)
    names = [f"owner/repo{i}" for i in range(12)]

    asyncio.run(fetch_repo_contexts(client, names, concurrency=3))

    assert peak == 3


def test_attach_fills_in_context_by_repository(make_issue):
    name = next(iter(REAL_REPOS))
    contexts = fetch(real_github, [name])
    issues = [
        make_issue(id=1, repository=name),
        make_issue(id=2, repository="other/repo"),
    ]

    attached = attach_repo_contexts(issues, contexts)

    assert attached[0].repo_context == contexts[name]
    assert attached[1].repo_context is None
    assert issues[0].repo_context is None  # the originals are untouched


# ---- contributing guide -----------------------------------------------------

COMMUNITY = json.loads(
    (Path(__file__).parent / "fixtures" / "community_profiles.json").read_text(
        encoding="utf-8"
    )
)


def real_community(request: httpx.Request) -> httpx.Response:
    name = request.url.path.removeprefix("/repos/").removesuffix("/community/profile")
    raw = COMMUNITY.get(name)
    if raw is None:
        return httpx.Response(404, json={"message": "Not Found"})
    return httpx.Response(200, json=raw)


def guide_for(handler, name):
    return asyncio.run(find_contributing_guide(make_client(handler), name))


def test_guide_found():
    guide = guide_for(real_community, "hivecommons/hive")

    assert guide.status == GuideStatus.FOUND
    assert guide.url.endswith("/CONTRIBUTING.md")


def test_guide_not_found():
    assert guide_for(real_community, "octocat/Hello-World").status == (
        GuideStatus.NOT_FOUND
    )


@pytest.mark.parametrize("status", [403, 404, 429, 500])
def test_guide_unknown_when_github_errors(status):
    guide = guide_for(lambda request: httpx.Response(status), "hivecommons/hive")

    assert guide.status == GuideStatus.UNKNOWN
    assert guide.url is None


def test_guide_unknown_when_offline_or_malformed():
    def offline(request):
        raise httpx.ConnectError("offline", request=request)

    assert guide_for(offline, "a/b").status == GuideStatus.UNKNOWN
    assert (
        guide_for(lambda request: httpx.Response(200, json={}), "a/b").status
        == GuideStatus.UNKNOWN
    )
    assert guide_for(real_community, "not a name").status == GuideStatus.UNKNOWN
