from datetime import UTC, datetime

from api.ranking.signals import (
    Signal,
    clarity,
    goal_match,
    maintenance,
    skill_match,
    task_match,
)
from api.schemas.issue import Issue
from api.schemas.profile import Profile
from api.schemas.ranking import Penalty, RankedIssue, SignalResult

# S = 0.30L + 0.25T + 0.20C + 0.15M + 0.10R. Hand-set, not learned: they say
# what should matter most for a first contribution. docs/ranking-evaluation.md
# has how they were checked and what that check cannot show.
WEIGHTS: dict[str, float] = {
    "skill_match": 0.30,
    "task_match": 0.25,
    "clarity": 0.20,
    "maintenance": 0.15,
    "goal_match": 0.10,
}


def combine(breakdown: list[SignalResult]) -> int:
    """Weighted average over the signals that could be computed.

    Unavailable signals (score None) are left out and the remaining weights
    are rescaled, so missing data neither helps nor hurts an issue.
    """
    available = [s for s in breakdown if s.score is not None]
    total_weight = sum(s.weight for s in available)
    if total_weight == 0:
        return 0
    weighted = sum(s.score * s.weight for s in available)  # type: ignore[operator]
    return round(weighted / total_weight)


# Rules applied after the weighted signals, each from a verified GitHub fact.
# Both came from failures seen in the evaluation pool, so that pool cannot also
# prove they help in general (docs/ranking-evaluation.md).
ASSIGNED_FACTOR = 0.5
# (at least this many comments, factor). A long thread on a "good first issue"
# usually means it is being claimed or argued over.
BUSY_DISCUSSION = [(25, 0.5), (10, 0.75)]


def penalties(issue: Issue) -> list[Penalty]:
    """Signs that someone else may already be on the issue. Never a guess:
    an assignee is a fact GitHub reports; its absence proves nothing."""
    found: list[Penalty] = []
    if issue.assignees:
        found.append(
            Penalty(
                reason=(
                    f"GitHub lists {', '.join(issue.assignees[:3])} as assigned, "
                    "so someone may already be working on it."
                ),
                factor=ASSIGNED_FACTOR,
            )
        )
    for threshold, factor in BUSY_DISCUSSION:
        if issue.comments >= threshold:
            found.append(
                Penalty(
                    reason=(
                        f"{issue.comments} comments: it may already be claimed "
                        "or under discussion."
                    ),
                    factor=factor,
                )
            )
            break
    return found


def score_issue(issue: Issue, profile: Profile, now: datetime) -> RankedIssue:
    signals: list[tuple[str, Signal]] = [
        ("skill_match", skill_match(issue, profile)),
        ("task_match", task_match(issue, profile)),
        ("clarity", clarity(issue)),
        ("maintenance", maintenance(issue, now)),
        ("goal_match", goal_match(issue, profile)),
    ]
    breakdown = [
        SignalResult(
            name=name,
            score=signal.score,
            weight=WEIGHTS[name],
            reason=signal.reason,
        )
        for name, signal in signals
    ]
    applied = penalties(issue)
    score = float(combine(breakdown))
    for penalty in applied:
        score *= penalty.factor
    return RankedIssue(
        issue=issue, score=round(score), breakdown=breakdown, penalties=applied
    )


def rank_issues(
    issues: list[Issue], profile: Profile, now: datetime | None = None
) -> list[RankedIssue]:
    """Highest score first. Ties: most recently updated, then lowest id.

    The tie-breaks make the order fully deterministic for any input order.
    `now` is the time maintenance is measured from; pass it to make tests
    independent of the clock.
    """
    now = now or datetime.now(UTC)
    ranked = [score_issue(issue, profile, now) for issue in issues]
    return sorted(
        ranked,
        key=lambda r: (-r.score, -r.issue.updated_at.timestamp(), r.issue.id),
    )
