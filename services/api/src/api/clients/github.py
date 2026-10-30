from typing import Any

import httpx

GITHUB_API_BASE = "https://api.github.com"


class GitHubClient:
    """Fetch public issues from GitHub."""

    def __init__(
        self,
        timeout: float = 15.0,
        token: str | None = None,
    ) -> None:
        self.timeout = timeout
        self.token = token

    async def search_issues(
        self,
        query: str,
        *,
        per_page: int = 20,
        page: int = 1,
    ) -> dict[str, Any]:
        """Search GitHub issues using GitHub's public search API."""
        params = {
            "q": f"{query} is:issue is:open",
            "per_page": min(max(per_page, 1), 100),
            "page": max(page, 1),
            "sort": "updated",
            "order": "desc",
        }

        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{GITHUB_API_BASE}/search/issues",
                params=params,
                headers=headers,
            )
            response.raise_for_status()
            return response.json()
