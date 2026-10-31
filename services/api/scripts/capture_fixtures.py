"""Capture a small, real GitHub search response for use as a test fixture.

Run it once from services/api, then commit the file it writes:

    uv run python scripts/capture_fixtures.py

Needs network access. If GITHUB_TOKEN is set in your environment it is used
(only to raise the rate limit); the token is never written to the fixture.
Issue bodies are cut to 300 characters to keep the file small.
"""

import json
import os
from pathlib import Path

import httpx

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
MAX_BODY_CHARS = 300


def main() -> None:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    response = httpx.get(
        "https://api.github.com/search/issues",
        params={
            "q": 'label:"good first issue" is:issue is:open',
            "per_page": 5,
            "sort": "updated",
            "order": "desc",
        },
        headers=headers,
        timeout=20,
    )
    response.raise_for_status()
    data = response.json()

    for item in data["items"]:
        if isinstance(item.get("body"), str):
            item["body"] = item["body"][:MAX_BODY_CHARS]

    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    path = FIXTURES_DIR / "search_issues.json"
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Saved {len(data['items'])} issues to {path}")


if __name__ == "__main__":
    main()
