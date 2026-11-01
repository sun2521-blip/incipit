"""Tools for checking the ranking against real issues rated by a person.

The pool is a frozen snapshot of real GitHub issues (with repository context),
so every run ranks exactly the same data. Each issue carries one rating for how
good a first contribution it is. Whether it fits a profile is not rated: it is
read from verified facts (the repository's main language), so the same ratings
work for every profile and for any future change to the scorer.
"""

import csv
import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from api.ranking.scorer import rank_issues
from api.schemas.issue import Issue, TaskType
from api.schemas.profile import Profile

RATING_VALUES = {"good": 2, "okay": 1, "poor": 0}

# Three people who might use Incipit. "No profile" is what a first visit sees.
PROFILES: dict[str, Profile] = {
    "python-docs": Profile(
        languages=["Python"],
        topics=["documentation", "testing", "cli"],
        task_types=[TaskType.DOCUMENTATION, TaskType.TESTING, TaskType.BUG],
    ),
    "typescript-ui": Profile(
        languages=["TypeScript", "JavaScript"],
        topics=["ui", "accessibility", "react", "css"],
        task_types=[TaskType.UI_UX, TaskType.BUG, TaskType.FEATURE],
    ),
    "no-profile": Profile(),
}


@dataclass(frozen=True)
class Pool:
    captured_at: datetime
    issues: list[Issue]


def issue_key(issue: Issue) -> str:
    return f"{issue.repository}#{issue.number}"


def load_pool(path: Path) -> Pool:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return Pool(
        captured_at=datetime.fromisoformat(raw["captured_at"]),
        issues=[Issue.model_validate(item) for item in raw["issues"]],
    )


def parse_ratings(lines: Iterable[str]) -> dict[str, tuple[str, str]]:
    """issue key -> (rating, reason). Unknown ratings raise, so typos surface."""
    ratings: dict[str, tuple[str, str]] = {}
    for row in csv.DictReader(lines):
        rating = row["rating"].strip().lower()
        if rating not in RATING_VALUES:
            raise ValueError(f"Unknown rating {rating!r} for {row['issue']}")
        ratings[row["issue"].strip()] = (rating, row["reason"].strip())
    return ratings


def load_ratings(path: Path) -> dict[str, tuple[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return parse_ratings(handle)


def fits(issue: Issue, profile: Profile) -> bool:
    """Verified fit only: with languages set, the repository's must be one."""
    if not profile.languages:
        return True
    language = issue.repo_context.language if issue.repo_context else None
    known = {item.casefold() for item in profile.languages}
    return language is not None and language.casefold() in known


@dataclass(frozen=True)
class ProfileResult:
    profile: str
    top: list[str]  # issue keys, best first
    precision_at_5: float  # share of the top 5 that are good and fit
    precision_at_10: float
    poor_in_top_5: int
    mean_rating_top_10: float  # good=2, okay=1, poor=0


def evaluate(
    pool: Pool, ratings: dict[str, tuple[str, str]], profile_name: str
) -> ProfileResult:
    profile = PROFILES[profile_name]
    ranked = [r.issue for r in rank_issues(pool.issues, profile, now=pool.captured_at)]
    missing = [issue_key(i) for i in ranked if issue_key(i) not in ratings]
    if missing:
        raise ValueError(f"Unrated issues in the pool: {missing}")

    def relevant(issue: Issue) -> bool:
        return ratings[issue_key(issue)][0] == "good" and fits(issue, profile)

    top5, top10 = ranked[:5], ranked[:10]
    return ProfileResult(
        profile=profile_name,
        top=[issue_key(i) for i in top10],
        precision_at_5=sum(map(relevant, top5)) / len(top5),
        precision_at_10=sum(map(relevant, top10)) / len(top10),
        poor_in_top_5=sum(ratings[issue_key(i)][0] == "poor" for i in top5),
        mean_rating_top_10=sum(RATING_VALUES[ratings[issue_key(i)][0]] for i in top10)
        / len(top10),
    )
