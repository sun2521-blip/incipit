import re
from typing import Any

import httpx

from api.cache import TTLCache

GITHUB_API_BASE = "https://api.github.com"

# GitHub's search API has the tightest rate limit, so identical searches made
# within a minute are answered from memory.
SEARCH_CACHE = TTLCache(ttl_seconds=60, max_entries=128)

# Repository facts change slowly, and one page of issues can need 20 lookups,
# so they are kept longer than searches.
REPO_CACHE = TTLCache(ttl_seconds=30 * 60, max_entries=512)

# GitHub owner and repository names: letters, digits, '-', and for repository
# names also '.' and '_'. Anything else never reaches the URL.
_REPO_NAME = re.compile(r"^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$")


class GitHubResponseError(Exception):
    """GitHub answered successfully, but not with JSON Incipit can use."""


class GitHubClient:
    """Fetch public issues and repositories from GitHub."""

    def __init__(
        self,
        timeout: float = 15.0,
        token: str | None = None,
        *,
        cache: TTLCache | None = SEARCH_CACHE,
        repo_cache: TTLCache | None = REPO_CACHE,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.timeout = timeout
        self.token = token
        self.cache = cache  # pass None to disable caching
        self.repo_cache = repo_cache
        self.transport = transport  # lets tests replace the network

    async def search_issues(
        self,
        query: str,
        *,
        per_page: int = 20,
        page: int = 1,
    ) -> dict[str, Any]:
        """Search GitHub issues using GitHub's public search API."""
        per_page = min(max(per_page, 1), 100)
        page = max(page, 1)

        cache_key = (query, per_page, page)
        if self.cache is not None:
            cached = self.cache.get(cache_key)
            if cached is not None:
                return cached

        params: dict[str, str | int] = {
            "q": f"{query} is:issue is:open",
            "per_page": per_page,
            "page": page,
            "sort": "updated",
            "order": "desc",
        }
        data = await self._get_json("/search/issues", params)

        # Only successful answers are cached, never errors.
        if self.cache is not None:
            self.cache.set(cache_key, data)
        return data

    async def get_repository(self, full_name: str) -> dict[str, Any]:
        """Fetch one repository's metadata, e.g. full_name="owner/name"."""
        if not _REPO_NAME.match(full_name):
            raise ValueError(f"Not a GitHub repository name: {full_name!r}")

        # GitHub names are case-insensitive, so "Owner/Name" shares a cache entry.
        cache_key = full_name.casefold()
        if self.repo_cache is not None:
            cached = self.repo_cache.get(cache_key)
            if cached is not None:
                return cached

        data = await self._get_json(f"/repos/{full_name}")

        if self.repo_cache is not None:
            self.repo_cache.set(cache_key, data)
        return data

    async def _get_json(
        self, path: str, params: dict[str, str | int] | None = None
    ) -> dict[str, Any]:
        """GET a GitHub API path and return its JSON object.

        Raises httpx.HTTPStatusError for error statuses, httpx.RequestError for
        network failures and GitHubResponseError for unusable bodies.
        """
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        async with httpx.AsyncClient(
            timeout=self.timeout, transport=self.transport
        ) as client:
            response = await client.get(
                f"{GITHUB_API_BASE}{path}", params=params, headers=headers
            )
            response.raise_for_status()

        try:
            data = response.json()
        except ValueError as exc:
            raise GitHubResponseError("GitHub returned invalid JSON") from exc

        if not isinstance(data, dict):
            raise GitHubResponseError("GitHub returned an unexpected JSON shape")
        return data
