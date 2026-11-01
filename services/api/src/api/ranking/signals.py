"""Pure scoring signals. Each takes normalised data and returns a Signal.

A signal's score is 0-100, or None when the data needed to compute it is
missing. None means "unknown", never "bad": the scorer leaves it out instead
of guessing a number. All point values here are hypotheses to evaluate on
real issues (blueprint, Day 9), not facts.
"""

import re
from dataclasses import dataclass
from datetime import datetime

from api.schemas.issue import Issue
from api.schemas.profile import Profile

_HEADING = re.compile(r"^#{1,6}\s.*$", re.MULTILINE)
_DETAIL_WORDS = re.compile(
    r"steps to reproduce|how to reproduce|reproduc|expected|actual"
    r"|acceptance criteria",
    re.IGNORECASE,
)
_LIST_ITEM = re.compile(r"^\s*(?:[-*]|\d+\.)\s", re.MULTILINE)


@dataclass(frozen=True)
class Signal:
    score: int | None
    reason: str


# GitHub allows ~65,000 characters per issue body. Only the start is analysed,
# which keeps the work per issue small and bounded.
MAX_BODY_CHARS = 20_000


def _strip_comments(text: str) -> str:
    """Replace each <!-- ... --> with a space, in a single linear pass.

    A regex like <!--[\\s\\S]*?--> gets quadratically slow on text with many
    unclosed "<!--" openers, so this scans with str.find instead.
    An unclosed comment swallows the rest of the text, as in HTML.
    """
    parts: list[str] = []
    position = 0
    while True:
        start = text.find("<!--", position)
        if start == -1:
            parts.append(text[position:])
            break
        parts.append(text[position:start])
        parts.append(" ")
        end = text.find("-->", start + 4)
        if end == -1:
            break
        position = end + 3
    return "".join(parts)


def clean_body(body: str | None) -> str:
    """Remove issue-template comments and headings, which carry no content."""
    text = _strip_comments((body or "")[:MAX_BODY_CHARS])
    text = _HEADING.sub(" ", text)
    return text.strip()


def task_match(issue: Issue, profile: Profile) -> Signal:
    """Does the task type suggested by labels match what the user prefers?"""
    if not profile.task_types:
        return Signal(None, "No preferred task types set.")

    inferred = issue.inferred_task_type
    if inferred is None:
        return Signal(None, "No label suggests a task type.")

    if inferred in profile.task_types:
        return Signal(100, f"Labels suggest a {inferred.value} task, which you prefer.")

    return Signal(
        20,
        f"Labels suggest a {inferred.value} task, which is not in your preferences.",
    )


def clarity(issue: Issue) -> Signal:
    """How much usable detail does the description contain?

    Clarity is not difficulty: a well-written issue can still be hard.
    """
    text = clean_body(issue.body)
    if not text:
        return Signal(0, "The issue has no description.")

    length = len(" ".join(text.split()))
    if length >= 500:
        points = 40
    elif length >= 200:
        points = 30
    elif length >= 50:
        points = 20
    else:
        points = 10

    found = [f"{length} characters of description"]
    if _DETAIL_WORDS.search(text):
        points += 30
        found.append("reproduction or expected-behaviour wording")
    if "```" in text:
        points += 15
        found.append("a code block")
    if _LIST_ITEM.search(text):
        points += 15
        found.append("a list")

    return Signal(points, "Found: " + ", ".join(found) + ".")


def _contains_word(text: str, topic: str) -> bool:
    """Whole-word, case-insensitive match, so 'ai' does not match 'maintain'."""
    pattern = rf"(?<![a-z0-9]){re.escape(topic.casefold())}(?![a-z0-9])"
    return re.search(pattern, text.casefold()) is not None


def goal_match(issue: Issue, profile: Profile) -> Signal:
    """Do the user's topics appear in the issue? Title and labels count double."""
    if not profile.topics:
        return Signal(None, "No topics set.")

    headline = " ".join([issue.title, *issue.labels])
    body = clean_body(issue.body)

    strong = [t for t in profile.topics if _contains_word(headline, t)]
    weak = [t for t in profile.topics if t not in strong and _contains_word(body, t)]

    if not strong and not weak:
        return Signal(
            0, "None of your topics appear in the title, labels or description."
        )

    parts = []
    if strong:
        parts.append("in the title or labels: " + ", ".join(strong))
    if weak:
        parts.append("in the description: " + ", ".join(weak))

    score = min(100, 60 * len(strong) + 30 * len(weak))
    return Signal(score, "Your topics appear " + "; ".join(parts) + ".")


def skill_match(issue: Issue, profile: Profile) -> Signal:
    """Is the repository's main language one the user knows?

    GitHub reports only the main language, so a mismatch is a soft penalty:
    the repository may still use the user's language somewhere.
    """
    if not profile.languages:
        return Signal(None, "No languages set.")

    repo = issue.repo_context
    if repo is None:
        return Signal(None, "Repository details are unavailable.")
    if repo.language is None:
        return Signal(None, "GitHub reports no main language for this repository.")

    known = {language.casefold() for language in profile.languages}
    if repo.language.casefold() in known:
        return Signal(
            100, f"The repository is written mainly in {repo.language}, which you know."
        )
    return Signal(
        20,
        f"The repository is written mainly in {repo.language}, "
        "which is not in your languages.",
    )


# (at most this many days since the last push, points). Activity suggests
# someone is around; it does not promise a maintainer will respond.
_PUSH_AGE_POINTS = [(7, 100), (30, 85), (90, 60), (180, 35), (365, 15)]
_STALE_POINTS = 5


def maintenance(issue: Issue, now: datetime) -> Signal:
    """How recently was code pushed, and is the repository still open to changes?"""
    repo = issue.repo_context
    if repo is None:
        return Signal(None, "Repository details are unavailable.")
    if repo.archived:
        return Signal(0, "The repository is archived, so it no longer accepts changes.")
    if repo.pushed_at is None:
        return Signal(None, "GitHub did not report when code was last pushed.")

    days = max((now - repo.pushed_at).days, 0)
    points = next(
        (points for limit, points in _PUSH_AGE_POINTS if days <= limit),
        _STALE_POINTS,
    )
    if days == 0:
        when = "today"
    elif days == 1:
        when = "yesterday"
    else:
        when = f"{days} days ago"
    return Signal(points, f"Code was last pushed {when}.")
