import asyncio
from typing import Any

import httpx
import pytest

from api.cache import TTLCache
from api.clients.github import GitHubClient, GitHubResponseError

PAYLOAD: dict[str, Any] = {"total_count": 1, "items": [{"id": 1}]}


def make_client(handler, **kwargs: Any) -> GitHubClient:
    """A client wired to a fake network. Caching is off unless a test asks."""
    kwargs.setdefault("cache", None)
    kwargs.setdefault("repo_cache", None)
    return GitHubClient(transport=httpx.MockTransport(handler), **kwargs)


def ok(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json=PAYLOAD)


def search(client: GitHubClient, query: str = "q", **kwargs: Any) -> dict[str, Any]:
    return asyncio.run(client.search_issues(query, **kwargs))


def recording(response_for) -> tuple[list[httpx.Request], Any]:
    """A handler that remembers every request it saw."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return response_for(request)

    return seen, handler


# ---- requests ---------------------------------------------------------------


def test_returns_the_parsed_json():
    assert search(make_client(ok)) == PAYLOAD


def test_sends_the_search_parameters():
    seen, handler = recording(ok)

    search(make_client(handler), "pandas", per_page=20, page=2)

    params = seen[0].url.params
    assert seen[0].url.host == "api.github.com"
    assert seen[0].url.path == "/search/issues"
    assert params["q"] == "pandas is:issue is:open"
    assert params["per_page"] == "20"
    assert params["page"] == "2"
    assert params["sort"] == "updated"
    assert params["order"] == "desc"


def test_sends_github_headers_and_no_token_by_default():
    seen, handler = recording(ok)

    search(make_client(handler))

    assert seen[0].headers["Accept"] == "application/vnd.github+json"
    assert seen[0].headers["X-GitHub-Api-Version"] == "2022-11-28"
    assert "Authorization" not in seen[0].headers


def test_sends_the_token_when_configured():
    seen, handler = recording(ok)

    search(make_client(handler, token="secret-token"))

    assert seen[0].headers["Authorization"] == "Bearer secret-token"


@pytest.mark.parametrize(
    ("per_page", "page", "expected_per_page", "expected_page"),
    [
        (0, 1, "1", "1"),
        (-5, 1, "1", "1"),
        (500, 1, "100", "1"),
        (20, 0, "20", "1"),
        (20, -3, "20", "1"),
    ],
)
def test_per_page_and_page_are_clamped(
    per_page, page, expected_per_page, expected_page
):
    seen, handler = recording(ok)

    search(make_client(handler), per_page=per_page, page=page)

    assert seen[0].url.params["per_page"] == expected_per_page
    assert seen[0].url.params["page"] == expected_page


# ---- failures ---------------------------------------------------------------


@pytest.mark.parametrize("status", [403, 404, 422, 429, 500, 503])
def test_error_statuses_raise(status):
    def handler(request):
        return httpx.Response(status, json={"message": "nope"})

    with pytest.raises(httpx.HTTPStatusError) as info:
        search(make_client(handler))

    assert info.value.response.status_code == status


def test_rate_limit_headers_are_available_to_the_caller():
    def handler(request):
        return httpx.Response(
            429, headers={"Retry-After": "42"}, json={"message": "slow down"}
        )

    with pytest.raises(httpx.HTTPStatusError) as info:
        search(make_client(handler))

    assert info.value.response.headers["Retry-After"] == "42"


def test_timeouts_propagate():
    def handler(request):
        raise httpx.ReadTimeout("too slow")

    with pytest.raises(httpx.TimeoutException):
        search(make_client(handler))


def test_network_failures_propagate():
    def handler(request):
        raise httpx.ConnectError("boom")

    with pytest.raises(httpx.RequestError):
        search(make_client(handler))


def test_invalid_json_is_reported_as_a_response_error():
    def handler(request):
        return httpx.Response(200, content=b"<html>not json</html>")

    with pytest.raises(GitHubResponseError):
        search(make_client(handler))


def test_json_that_is_not_an_object_is_a_response_error():
    def handler(request):
        return httpx.Response(200, json=[1, 2, 3])

    with pytest.raises(GitHubResponseError):
        search(make_client(handler))


# ---- caching ----------------------------------------------------------------


def test_identical_searches_are_answered_from_the_cache():
    seen, handler = recording(ok)
    client = make_client(handler, cache=TTLCache(ttl_seconds=60))

    first = search(client, "pandas")
    second = search(client, "pandas")

    assert first == second == PAYLOAD
    assert len(seen) == 1


def test_different_searches_are_cached_separately():
    seen, handler = recording(ok)
    client = make_client(handler, cache=TTLCache(ttl_seconds=60))

    search(client, "pandas")
    search(client, "numpy")
    search(client, "pandas", page=2)
    search(client, "pandas", per_page=10)

    assert len(seen) == 4


def test_errors_are_never_cached():
    answers = iter([httpx.Response(500), httpx.Response(200, json=PAYLOAD)])
    seen, handler = recording(lambda request: next(answers))
    client = make_client(handler, cache=TTLCache(ttl_seconds=60))

    with pytest.raises(httpx.HTTPStatusError):
        search(client)
    assert search(client) == PAYLOAD

    assert len(seen) == 2


def test_expired_entries_are_fetched_again():
    now = [0.0]
    seen, handler = recording(ok)
    cache = TTLCache(ttl_seconds=60, clock=lambda: now[0])
    client = make_client(handler, cache=cache)

    search(client)
    now[0] = 61
    search(client)

    assert len(seen) == 2


def test_cache_can_be_disabled():
    seen, handler = recording(ok)
    client = make_client(handler, cache=None)

    search(client)
    search(client)

    assert len(seen) == 2


# ---- repositories -----------------------------------------------------------

REPO: dict[str, Any] = {"full_name": "example/project", "language": "Python"}


def repo_ok(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json=REPO)


def get_repo(client: GitHubClient, full_name: str = "example/project"):
    return asyncio.run(client.get_repository(full_name))


def test_fetches_a_repository():
    seen, handler = recording(repo_ok)

    assert get_repo(make_client(handler)) == REPO
    assert seen[0].url.path == "/repos/example/project"


@pytest.mark.parametrize(
    "name",
    ["example", "example/project/issues", "../etc/passwd", "a/b?x=1", "", "a/b c"],
)
def test_rejects_names_that_are_not_owner_slash_repo(name):
    seen, handler = recording(repo_ok)

    with pytest.raises(ValueError):
        get_repo(make_client(handler), name)
    assert seen == []  # nothing was sent


def test_accepts_dots_and_underscores_in_repository_names():
    seen, handler = recording(repo_ok)

    get_repo(make_client(handler), "some-org/my_repo.js")

    assert seen[0].url.path == "/repos/some-org/my_repo.js"


@pytest.mark.parametrize("status", [403, 404, 429, 500])
def test_repository_errors_raise(status):
    client = make_client(lambda request: httpx.Response(status))

    with pytest.raises(httpx.HTTPStatusError):
        get_repo(client)


def test_repository_lookups_are_cached_ignoring_case():
    seen, handler = recording(repo_ok)
    client = make_client(handler, repo_cache=TTLCache(ttl_seconds=60))

    get_repo(client, "example/project")
    get_repo(client, "Example/Project")

    assert len(seen) == 1


def test_repository_and_search_caches_are_separate():
    seen, handler = recording(
        lambda request: (
            repo_ok(request) if request.url.path.startswith("/repos/") else ok(request)
        )
    )
    client = make_client(
        handler, cache=TTLCache(ttl_seconds=60), repo_cache=TTLCache(ttl_seconds=60)
    )

    assert search(client, "example/project") == PAYLOAD
    assert get_repo(client, "example/project") == REPO
    assert len(seen) == 2
