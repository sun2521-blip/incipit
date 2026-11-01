"""Capture small, real GitHub responses for use as test fixtures.

Run it from services/api, then commit the files it writes:

    uv run python scripts/capture_fixtures.py                    # repositories only
    uv run python scripts/capture_fixtures.py --refresh-search   # search too

The search response is captured only when it is missing or --refresh-search is
given, so refreshing repositories never churns the search fixture. The
repositories captured are the ones behind the issues in that search fixture,
with their community profiles (which say where the contributing guide is),
plus one open and one closed issue as the single-issue endpoint returns them.

Needs network access. If GITHUB_TOKEN is set in your environment it is used
(only to raise the rate limit); the token is never written to a fixture.
Issue bodies are cut to 300 characters to keep the files small.
"""

import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
SEARCH_FIXTURE = FIXTURES_DIR / "search_issues.json"
REPOS_FIXTURE = FIXTURES_DIR / "repositories.json"
COMMUNITY_FIXTURE = FIXTURES_DIR / "community_profiles.json"
ISSUES_FIXTURE = FIXTURES_DIR / "issues.json"
# A real repository with no contributing guide, for the not-found case.
NO_GUIDE_REPO = "octocat/Hello-World"
MAX_BODY_CHARS = 300
REPO_PREFIX = "https://api.github.com/repos/"


def headers() -> dict[str, str]:
    result = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        result["Authorization"] = f"Bearer {token}"
    return result


def save(path: Path, data: Any) -> None:
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",  # LF on every OS, matching .gitattributes
    )


def capture_search() -> None:
    response = httpx.get(
        "https://api.github.com/search/issues",
        params={
            "q": 'label:"good first issue" is:issue is:open',
            "per_page": 5,
            "sort": "updated",
            "order": "desc",
        },
        headers=headers(),
        timeout=20,
    )
    response.raise_for_status()
    data = response.json()

    for item in data["items"]:
        if isinstance(item.get("body"), str):
            item["body"] = item["body"][:MAX_BODY_CHARS]

    save(SEARCH_FIXTURE, data)
    print(f"Saved {len(data['items'])} issues to {SEARCH_FIXTURE}")


def capture_repositories() -> None:
    """Save each repository's response, keyed by "owner/name".

    A repository GitHub would not return (deleted, private, renamed) is saved
    as {"status": <code>} so tests can cover that case with real data too.
    """
    search = json.loads(SEARCH_FIXTURE.read_text(encoding="utf-8"))
    names = dict.fromkeys(
        item["repository_url"].removeprefix(REPO_PREFIX) for item in search["items"]
    )

    repos: dict[str, Any] = {}
    for name in names:
        response = httpx.get(
            f"https://api.github.com/repos/{name}", headers=headers(), timeout=20
        )
        repos[name] = (
            response.json() if response.is_success else {"status": response.status_code}
        )

    save(REPOS_FIXTURE, repos)
    print(f"Saved {len(repos)} repositories to {REPOS_FIXTURE}")

    profiles: dict[str, Any] = {}
    for name in [*names, NO_GUIDE_REPO]:
        response = httpx.get(
            f"https://api.github.com/repos/{name}/community/profile",
            headers=headers(),
            timeout=20,
        )
        profiles[name] = (
            response.json() if response.is_success else {"status": response.status_code}
        )

    save(COMMUNITY_FIXTURE, profiles)
    print(f"Saved {len(profiles)} community profiles to {COMMUNITY_FIXTURE}")


def trim_body(issue: dict[str, Any]) -> dict[str, Any]:
    if isinstance(issue.get("body"), str):
        issue["body"] = issue["body"][:MAX_BODY_CHARS]
    return issue


def first_search_hit(state: str) -> dict[str, Any]:
    """The most recently updated good-first-issue in `state`, fetched exactly as
    GET /repos/{owner}/{repo}/issues/{number} returns it."""
    response = httpx.get(
        "https://api.github.com/search/issues",
        params={
            "q": f'label:"good first issue" is:issue is:{state}',
            "per_page": 1,
            "sort": "updated",
        },
        headers=headers(),
        timeout=20,
    )
    response.raise_for_status()
    item = response.json()["items"][0]

    response = httpx.get(item["url"], headers=headers(), timeout=20)
    response.raise_for_status()
    return trim_body(response.json())


def capture_issues() -> None:
    """One open and one closed issue, as the single-issue endpoint returns them."""
    save(
        ISSUES_FIXTURE,
        {"open": first_search_hit("open"), "closed": first_search_hit("closed")},
    )
    print(f"Saved an open and a closed issue to {ISSUES_FIXTURE}")


def main() -> None:
    if "--refresh-search" in sys.argv or not SEARCH_FIXTURE.exists():
        capture_search()
    capture_repositories()
    capture_issues()


if __name__ == "__main__":
    main()
