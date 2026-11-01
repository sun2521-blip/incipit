"""Evaluate the ranking on real issues (roadmap Day 9).

Run from services/api:

    uv run python scripts/evaluate_ranking.py capture  # new pool from GitHub
    uv run python scripts/evaluate_ranking.py fill     # retry missing context
    uv run python scripts/evaluate_ranking.py review   # issues to rate
    uv run python scripts/evaluate_ranking.py report   # metrics per profile

capture searches GitHub the way /issues does (unfiltered, Python and
TypeScript), looks up each repository, and saves the pool with the time it
was captured to tests/fixtures/evaluation_pool.json. Bodies are cut to the
20,000 characters the scorer reads. A GITHUB_TOKEN in the environment is used
for the rate limit only and is never written anywhere.

Ratings live in docs/evaluation/ratings.csv (issue, rating, reason), one per
issue: good, okay or poor as a first contribution.
"""

import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from api.clients.github import GitHubClient
from api.normalise import normalise_search_response
from api.query import build_issue_query
from api.ranking.evaluation import (
    PROFILES,
    evaluate,
    issue_key,
    load_pool,
    load_ratings,
)
from api.ranking.scorer import rank_issues
from api.ranking.signals import MAX_BODY_CHARS, clean_body
from api.repo_context import attach_repo_contexts, fetch_repo_contexts
from api.settings import settings

ROOT = Path(__file__).resolve().parents[1]
POOL = ROOT / "tests" / "fixtures" / "evaluation_pool.json"
RATINGS = ROOT.parents[1] / "docs" / "evaluation" / "ratings.csv"

# (language filter, how many) for each search that feeds the pool.
SEARCHES: list[tuple[str | None, int]] = [
    (None, 15),
    ("Python", 15),
    ("TypeScript", 15),
]


async def capture() -> None:
    client = GitHubClient(token=settings.github_token, cache=None, repo_cache=None)
    seen: dict[str, object] = {}

    for language, count in SEARCHES:
        raw = await client.search_issues(
            build_issue_query(language=language), per_page=count
        )
        for issue in normalise_search_response(raw).items:
            seen.setdefault(issue_key(issue), issue)

    issues = list(seen.values())
    contexts = await fetch_repo_contexts(client, [i.repository for i in issues])  # type: ignore[attr-defined]
    issues = attach_repo_contexts(issues, contexts)  # type: ignore[arg-type]

    data = {
        "captured_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "issues": [
            {
                **issue.model_dump(mode="json"),
                "body": (issue.body or "")[:MAX_BODY_CHARS] or None,
            }
            for issue in issues
        ],
    }
    POOL.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"Saved {len(issues)} issues to {POOL}")


async def fill() -> None:
    """Look up repositories the capture could not reach, one at a time."""
    raw = json.loads(POOL.read_text(encoding="utf-8"))
    pool = load_pool(POOL)
    missing = sorted({i.repository for i in pool.issues if i.repo_context is None})
    client = GitHubClient(token=settings.github_token, cache=None, repo_cache=None)
    contexts = await fetch_repo_contexts(client, missing, concurrency=1)

    for item in raw["issues"]:
        context = contexts.get(item["repository"])
        if item["repo_context"] is None and context is not None:
            item["repo_context"] = context.model_dump(mode="json")
    POOL.write_text(
        json.dumps(raw, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    still = sum(1 for value in contexts.values() if value is None)
    print(f"Filled {len(missing) - still} of {len(missing)} repositories")


def review() -> None:
    """Every issue once, with the facts a rater needs and each profile's rank."""
    pool = load_pool(POOL)
    ranks = {
        name: {
            issue_key(r.issue): (position + 1, r.score)
            for position, r in enumerate(
                rank_issues(pool.issues, profile, now=pool.captured_at)
            )
        }
        for name, profile in PROFILES.items()
    }

    for issue in pool.issues:
        key = issue_key(issue)
        repo = issue.repo_context
        days = (
            (pool.captured_at - repo.pushed_at).days
            if repo and repo.pushed_at
            else None
        )
        text = " ".join(clean_body(issue.body).split())
        print(f"\n## {key}: {issue.title}")
        print(
            f"   repo: {repo.language if repo else '?'}, {repo.stars if repo else '?'} stars, "
            f"pushed {days} days ago{', ARCHIVED' if repo and repo.archived else ''}"
        )
        print(
            f"   labels: {', '.join(issue.labels)} | assignees: {len(issue.assignees)} "
            f"| comments: {issue.comments} | body: {len(text)} chars"
        )
        print(
            "   ranks: "
            + ", ".join(f"{n} #{r[key][0]} ({r[key][1]})" for n, r in ranks.items())
        )
        print(f"   {text[:420]}{'…' if len(text) > 420 else ''}")


def report() -> None:
    pool = load_pool(POOL)
    ratings = load_ratings(RATINGS)
    counts = {
        r: sum(v[0] == r for v in ratings.values()) for r in ("good", "okay", "poor")
    }
    print(
        f"Pool: {len(pool.issues)} issues captured {pool.captured_at:%Y-%m-%d}; ratings {counts}"
    )
    print(f"{'profile':15} {'P@5':>5} {'P@10':>5} {'poor@5':>7} {'mean@10':>8}")
    for name in PROFILES:
        result = evaluate(pool, ratings, name)
        print(
            f"{name:15} {result.precision_at_5:5.2f} {result.precision_at_10:5.2f} "
            f"{result.poor_in_top_5:7d} {result.mean_rating_top_10:8.2f}"
        )
        for position, key in enumerate(result.top[:5], start=1):
            rating, reason = ratings[key]
            print(f"   {position}. [{rating}] {key}: {reason[:90]}")


if __name__ == "__main__":
    # Issue titles can hold any character; Windows consoles default to cp1252.
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "capture":
        asyncio.run(capture())
    elif command == "fill":
        asyncio.run(fill())
    elif command == "review":
        review()
    elif command == "report":
        report()
    else:
        sys.exit(__doc__)
