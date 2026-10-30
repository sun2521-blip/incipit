from datetime import UTC, datetime

import pytest

from api.ranking.scorer import WEIGHTS, combine, rank_issues, score_issue
from api.schemas.issue import TaskType
from api.schemas.profile import Profile
from api.schemas.ranking import SignalResult


def test_weights_sum_to_one():
    assert sum(WEIGHTS.values()) == pytest.approx(1.0)


def test_unavailable_signals_are_reported_not_scored(make_issue):
    ranked = score_issue(make_issue(), Profile())

    by_name = {s.name: s for s in ranked.breakdown}
    assert [s.name for s in ranked.breakdown] == [
        "skill_match",
        "task_match",
        "clarity",
        "maintenance",
        "goal_match",
    ]
    assert by_name["skill_match"].score is None
    assert by_name["maintenance"].score is None
    assert by_name["task_match"].score is None  # no preferences set
    assert by_name["goal_match"].score is None  # no topics set
    assert all(s.reason for s in ranked.breakdown)


def test_score_rescales_weights_over_available_signals(make_issue):
    issue = make_issue(inferred_task_type=TaskType.BUG, body=None)
    profile = Profile(task_types=[TaskType.BUG])

    ranked = score_issue(issue, profile)

    # task_match 100 (weight .25) and clarity 0 (weight .20) are available:
    # (100 * .25 + 0 * .20) / (.25 + .20) = 55.56 -> 56
    assert ranked.score == 56


def test_score_uses_all_available_signals(make_issue, detailed_body):
    issue = make_issue(
        title="Fix pandas import",
        inferred_task_type=TaskType.BUG,
        body=detailed_body,
    )
    profile = Profile(task_types=[TaskType.BUG], topics=["pandas"])

    ranked = score_issue(issue, profile)

    # task 100 * .25 + clarity 100 * .20 + goal 60 * .10 = 51; weights = .55
    # 51 / .55 = 92.7 -> 93
    assert ranked.score == 93


def test_combine_is_zero_when_nothing_is_available():
    breakdown = [
        SignalResult(name="skill_match", score=None, weight=0.3, reason="n/a"),
    ]

    assert combine(breakdown) == 0


def test_better_match_ranks_first(make_issue, detailed_body):
    profile = Profile(task_types=[TaskType.BUG], topics=["pandas"])
    strong = make_issue(
        id=1,
        title="Fix pandas import",
        inferred_task_type=TaskType.BUG,
        body=detailed_body,
    )
    weak = make_issue(id=2, inferred_task_type=TaskType.FEATURE, body="Short.")
    empty = make_issue(id=3, body=None)

    ranked = rank_issues([empty, weak, strong], profile)

    assert [r.issue.id for r in ranked] == [1, 2, 3]
    assert ranked[0].score > ranked[1].score > ranked[2].score


def test_ties_break_by_recency_then_id(make_issue):
    older = make_issue(id=5, updated_at=datetime(2026, 10, 1, tzinfo=UTC))
    newer = make_issue(id=9, updated_at=datetime(2026, 10, 20, tzinfo=UTC))
    same_time_low_id = make_issue(id=2, updated_at=datetime(2026, 10, 20, tzinfo=UTC))

    ranked = rank_issues([older, newer, same_time_low_id], Profile())

    assert [r.issue.id for r in ranked] == [2, 9, 5]


def test_order_does_not_depend_on_input_order(make_issue, detailed_body):
    profile = Profile(task_types=[TaskType.BUG])
    issues = [
        make_issue(id=1, inferred_task_type=TaskType.BUG, body=detailed_body),
        make_issue(id=2, inferred_task_type=TaskType.FEATURE, body="Short."),
        make_issue(id=3, body=None),
        make_issue(id=4, inferred_task_type=TaskType.BUG, body="A bug."),
    ]

    forward = [r.issue.id for r in rank_issues(issues, profile)]
    backward = [r.issue.id for r in rank_issues(list(reversed(issues)), profile)]

    assert forward == backward
