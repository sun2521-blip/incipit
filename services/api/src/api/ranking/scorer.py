from api.ranking.signals import Signal, clarity, goal_match, task_match
from api.schemas.issue import Issue
from api.schemas.profile import Profile
from api.schemas.ranking import RankedIssue, SignalResult

# Blueprint formula: S = 0.30L + 0.25T + 0.20C + 0.15M + 0.10R
# These weights are hypotheses to evaluate on Day 9, not scientific truth.
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


def score_issue(issue: Issue, profile: Profile) -> RankedIssue:
    signals: list[tuple[str, Signal]] = [
        # Needs repository metadata, which is fetched in a later step.
        ("skill_match", Signal(None, "Repository language is not fetched yet.")),
        ("task_match", task_match(issue, profile)),
        ("clarity", clarity(issue)),
        ("maintenance", Signal(None, "Repository activity is not fetched yet.")),
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
    return RankedIssue(issue=issue, score=combine(breakdown), breakdown=breakdown)


def rank_issues(issues: list[Issue], profile: Profile) -> list[RankedIssue]:
    """Highest score first. Ties: most recently updated, then lowest id.

    The tie-breaks make the order fully deterministic for any input order.
    """
    ranked = [score_issue(issue, profile) for issue in issues]
    return sorted(
        ranked,
        key=lambda r: (-r.score, -r.issue.updated_at.timestamp(), r.issue.id),
    )
