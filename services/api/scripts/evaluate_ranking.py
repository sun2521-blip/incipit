"""Evaluate the ranking on real, rated issues.

Run from services/api:

    uv run python scripts/evaluate_ranking.py report               # metrics per profile
    uv run python scripts/evaluate_ranking.py rate --rater NAME    # rate issues blind
    uv run python scripts/evaluate_ranking.py agree FILE FILE      # do two raters agree?
    uv run python scripts/evaluate_ranking.py review               # issues with their ranks
    uv run python scripts/evaluate_ranking.py capture --pool FILE  # a new pool from GitHub
    uv run python scripts/evaluate_ranking.py fill --pool FILE     # retry missing context

Every command reads the 33-issue pool in tests/fixtures/evaluation_pool.json
unless given --pool. capture always needs --pool, so it can never overwrite
the pool the tests use.

capture searches GitHub the way /issues does (unfiltered, Python and
TypeScript), looks up each repository, and saves the pool with the time it
was captured. Bodies are cut to the 20,000 characters the scorer reads. A
GITHUB_TOKEN in the environment is used for the rate limit only and is never
written anywhere.

Ratings are CSV files (issue, rating, reason), one row per issue: good, okay
or poor as a first contribution. rate shows issues in a shuffled order with
no scores or ranks, and saves after every answer, so it can be stopped and
resumed.
"""

import argparse
import asyncio
import json
import re
import sys
import textwrap
from datetime import UTC, datetime
from pathlib import Path

from api.clients.github import GitHubClient
from api.normalise import normalise_search_response
from api.query import build_issue_query
from api.ranking.evaluation import (
    PROFILES,
    Pool,
    agreement,
    blind_order,
    evaluate,
    issue_key,
    load_pool,
    load_ratings,
    write_rating,
)
from api.ranking.scorer import rank_issues
from api.ranking.signals import MAX_BODY_CHARS, clean_body
from api.repo_context import attach_repo_contexts, fetch_repo_contexts
from api.schemas.issue import Issue
from api.settings import settings

ROOT = Path(__file__).resolve().parents[1]
POOL = ROOT / "tests" / "fixtures" / "evaluation_pool.json"
EVALUATION = ROOT.parents[1] / "docs" / "evaluation"
RATINGS = EVALUATION / "ratings.csv"

# The language filters behind the pool, one search each.
LANGUAGES: list[str | None] = [None, "Python", "TypeScript"]

RUBRIC = """\
Rate each issue as a FIRST contribution for a newcomer:
  good  could start today: clear, small, unassigned, in an active project
  okay  plausible, but vague, bigger than it looks, research rather than code,
        or a brand-new repository with nobody to review
  poor  should not be recommended: assigned, empty or only a link, a crowded
        bounty, or not a beginner's task
Rate the issue, not your interest in it. There are no scores here on purpose."""


def save_pool(path: Path, data: dict) -> None:
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )


async def capture(pool_path: Path, per_search: int) -> None:
    client = GitHubClient(token=settings.github_token, cache=None, repo_cache=None)
    seen: dict[str, Issue] = {}

    for language in LANGUAGES:
        raw = await client.search_issues(
            build_issue_query(language=language), per_page=per_search
        )
        for issue in normalise_search_response(raw).items:
            seen.setdefault(issue_key(issue), issue)

    issues = list(seen.values())
    contexts = await fetch_repo_contexts(client, [i.repository for i in issues])
    issues = attach_repo_contexts(issues, contexts)

    save_pool(
        pool_path,
        {
            "captured_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "issues": [
                {
                    **issue.model_dump(mode="json"),
                    "body": (issue.body or "")[:MAX_BODY_CHARS] or None,
                }
                for issue in issues
            ],
        },
    )
    print(f"Saved {len(issues)} issues to {pool_path}")


async def fill(pool_path: Path) -> None:
    """Look up repositories the capture could not reach, one at a time."""
    raw = json.loads(pool_path.read_text(encoding="utf-8"))
    pool = load_pool(pool_path)
    missing = sorted({i.repository for i in pool.issues if i.repo_context is None})
    client = GitHubClient(token=settings.github_token, cache=None, repo_cache=None)
    contexts = await fetch_repo_contexts(client, missing, concurrency=1)

    for item in raw["issues"]:
        context = contexts.get(item["repository"])
        if item["repo_context"] is None and context is not None:
            item["repo_context"] = context.model_dump(mode="json")
    save_pool(pool_path, raw)
    still = sum(1 for value in contexts.values() if value is None)
    print(f"Filled {len(missing) - still} of {len(missing)} repositories")


def describe(issue: Issue, pool: Pool, body_chars: int) -> None:
    """The facts a rater needs, and nothing the scorer made up."""
    repo = issue.repo_context
    days = (pool.captured_at - repo.pushed_at).days if repo and repo.pushed_at else None
    text = " ".join(clean_body(issue.body).split())
    print(f"\n## {issue_key(issue)}: {issue.title}")
    print(f"   {issue.url}")
    print(
        f"   repo: {repo.language if repo else '?'}, {repo.stars if repo else '?'} stars, "
        f"pushed {days} days before capture{', ARCHIVED' if repo and repo.archived else ''}"
    )
    print(
        f"   labels: {', '.join(issue.labels) or 'none'} | assignees: {len(issue.assignees)} "
        f"| comments: {issue.comments} | body: {len(text)} chars"
    )
    excerpt = text[:body_chars] + ("…" if len(text) > body_chars else "")
    print(textwrap.indent(textwrap.fill(excerpt or "(no description)", 88), "   "))


def review(pool_path: Path) -> None:
    """Every issue once, with its facts and each profile's rank. Not blind."""
    pool = load_pool(pool_path)
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
        describe(issue, pool, body_chars=420)
        print(
            "   ranks: "
            + ", ".join(f"{n} #{r[key][0]} ({r[key][1]})" for n, r in ranks.items())
        )


def rate(pool_path: Path, rater: str) -> None:
    pool = load_pool(pool_path)
    out = EVALUATION / f"ratings-{rater}.csv"
    done = load_ratings(out) if out.exists() else {}
    todo = [i for i in blind_order(pool.issues, rater) if issue_key(i) not in done]

    print(RUBRIC)
    print(f"\n{len(done)} rated, {len(todo)} to go, saving to {out}")
    print("Answer g, o or p, then a short reason. s skips for now, q stops.")
    choices = {"g": "good", "o": "okay", "p": "poor"}

    for count, issue in enumerate(todo, start=len(done) + 1):
        describe(issue, pool, body_chars=1500)
        while True:
            answer = input(f"[{count}/{len(pool.issues)}] good, okay or poor? ")
            answer = answer.strip().lower()[:1]
            if answer == "q":
                return
            if answer in ("s", *choices):
                break
        if answer == "s":
            continue
        reason = input("   why, in a few words? ").strip()
        with out.open("a", encoding="utf-8", newline="") as handle:
            write_rating(handle, issue_key(issue), choices[answer], reason)
    print(f"\nAll rated. Compare: evaluate_ranking.py agree {RATINGS} {out}")


# Landis and Koch's usual reading of kappa.
KAPPA_WORDS = [
    (0.8, "almost perfect"),
    (0.6, "substantial"),
    (0.4, "moderate"),
    (0.2, "fair"),
    (0.0, "slight"),
]


def agree(first_path: Path, second_path: Path) -> None:
    first, second = load_ratings(first_path), load_ratings(second_path)
    result = agreement(first, second)
    words = next((w for floor, w in KAPPA_WORDS if result.kappa >= floor), "none")
    print(
        f"{result.shared} issues rated by both: {result.exact:.0%} the same, "
        f"Cohen's kappa {result.kappa:.2f} ({words})"
    )
    for key in sorted(first.keys() & second.keys()):
        if first[key][0] != second[key][0]:
            print(f"   {key}: {first[key][0]} vs {second[key][0]}")


def report(pool_path: Path, ratings_path: Path) -> None:
    pool = load_pool(pool_path)
    ratings = load_ratings(ratings_path)
    counts = {
        r: sum(v[0] == r for v in ratings.values()) for r in ("good", "okay", "poor")
    }
    print(
        f"Pool: {len(pool.issues)} issues captured {pool.captured_at:%Y-%m-%d}; "
        f"ratings from {ratings_path.name}: {counts}"
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


def rater_name(value: str) -> str:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,30}", value):
        raise argparse.ArgumentTypeError("use lowercase letters, digits and dashes")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    commands = parser.add_subparsers(dest="command", required=True)

    def command(name: str, pool_required: bool = False) -> argparse.ArgumentParser:
        sub = commands.add_parser(name)
        if pool_required:
            sub.add_argument("--pool", type=Path, required=True)
        else:
            sub.add_argument("--pool", type=Path, default=POOL)
        return sub

    command("capture", pool_required=True).add_argument(
        "--per-search", type=int, default=15, choices=range(1, 101), metavar="1-100"
    )
    command("fill", pool_required=True)
    command("review")
    command("rate").add_argument("--rater", type=rater_name, required=True)
    command("report").add_argument("--ratings", type=Path, default=RATINGS)
    agree_parser = commands.add_parser("agree")
    agree_parser.add_argument("first", type=Path)
    agree_parser.add_argument("second", type=Path)

    args = parser.parse_args()
    if args.command == "capture":
        asyncio.run(capture(args.pool, args.per_search))
    elif args.command == "fill":
        asyncio.run(fill(args.pool))
    elif args.command == "review":
        review(args.pool)
    elif args.command == "rate":
        rate(args.pool, args.rater)
    elif args.command == "agree":
        agree(args.first, args.second)
    else:
        report(args.pool, args.ratings)


if __name__ == "__main__":
    # Issue titles can hold any character; Windows consoles default to cp1252.
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    main()
