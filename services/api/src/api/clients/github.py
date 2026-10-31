from typing import Any

import httpx

from api.cache import TTLCache

GITHUB_API_BASE = "https://api.github.com"

# GitHub's search API has the tightest rate limit, so identical searches made
# within a minute are answered from memory.
SEARCH_CACHE = TTLCache(ttl_seconds=60, max_entries=128)


class GitHubResponseError(Exception):
    """GitHub answered successfully, but not with JSON Incipit can use."""


class GitHubClient:
    """Fetch public issues from GitHub."""

    def __init__(
        self,
        timeout: float = 15.0,
        token: str | None = None,
        *,
        cache: TTLCache | None = SEARCH_CACHE,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.timeout = timeout
        self.token = token
        self.cache = cache  # pass None to disable caching
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
                f"{GITHUB_API_BASE}/search/issues",
                params=params,
                headers=headers,
            )
            response.raise_for_status()

        try:
            data = response.json()
        except ValueError as exc:
            raise GitHubResponseError("GitHub returned invalid JSON") from exc

        if not isinstance(data, dict):
            raise GitHubResponseError("GitHub returned an unexpected JSON shape")

        # Only successful answers are cached, never errors.
        if self.cache is not None:
            self.cache.set(cache_key, data)
        return data
