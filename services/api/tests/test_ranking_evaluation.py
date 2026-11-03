"""Golden ordering and quality floors on real, rated issues.

If one of these fails after a deliberate change to the scorer, run
`uv run python scripts/evaluate_ranking.py report`, record the before and after
in docs/ranking-evaluation.md, and only then update GOLDEN and FLOORS.
"""

import io
from pathlib import Path

import pytest

from api.ranking.evaluation import (
    PROFILES,
    agreement,
    blind_order,
    evaluate,
    fits,
    issue_key,
    load_pool,
    load_ratings,
    parse_ratings,
    write_rating,
)
from api.ranking.scorer import rank_issues
from api.schemas.profile import Profile

POOL = load_pool(Path(__file__).parent / "fixtures" / "evaluation_pool.json")
RATINGS = load_ratings(
    Path(__file__).resolve().parents[3] / "docs" / "evaluation" / "ratings.csv"
)

GOLDEN = {
    "python-docs": [
        "layer8labs8/ci-agent-audit#9",
        "layer8labs8/ci-agent-audit#23",
        "layer8labs8/ci-agent-audit#22",
        "slayerlabs/benchmarks-fabryka-ai#54",
        "slayerlabs/benchmarks-fabryka-ai#53",
        "slayerlabs/benchmarks-fabryka-ai#52",
        "slayerlabs/benchmarks-fabryka-ai#51",
        "slayerlabs/benchmarks-fabryka-ai#50",
        "slayerlabs/benchmarks-fabryka-ai#49",
        "slayerlabs/benchmarks-fabryka-ai#48",
    ],
    "typescript-ui": [
        "trustflow-protocol/trustflow-sdk#772",
        "toasty-kj/docusaurus-plugin-pagefind#37",
        "desplega-ai/agent-swarm#2623",
        "JExcellence/privalint#76",
        "JExcellence/privalint#71",
        "reticlehq/reticle#1682",
        "wylan24/mockgen#20",
        "wylan24/mockgen#18",
        "wylan24/mockgen#17",
        "reticlehq/reticle#1851",
    ],
    "no-profile": [
        "trustflow-protocol/trustflow-sdk#772",
        "toasty-kj/docusaurus-plugin-pagefind#37",
        "desplega-ai/agent-swarm#2623",
        "layer8labs8/ci-agent-audit#23",
        "layer8labs8/ci-agent-audit#22",
        "layer8labs8/ci-agent-audit#9",
        "slayerlabs/benchmarks-fabryka-ai#54",
        "slayerlabs/benchmarks-fabryka-ai#53",
        "slayerlabs/benchmarks-fabryka-ai#52",
        "slayerlabs/benchmarks-fabryka-ai#51",
    ],
}

# (precision@5, precision@10, at most this many poor in the top 5, mean@10)
FLOORS = {
    "python-docs": (0.2, 0.1, 0, 1.1),
    "typescript-ui": (0.6, 0.6, 1, 1.5),
    "no-profile": (0.4, 0.3, 1, 1.2),
}


def test_every_issue_in_the_pool_is_rated():
    assert {issue_key(issue) for issue in POOL.issues} == set(RATINGS)


@pytest.mark.parametrize("profile", PROFILES)
def test_golden_ordering(profile):
    ranked = rank_issues(POOL.issues, PROFILES[profile], now=POOL.captured_at)

    assert [issue_key(r.issue) for r in ranked[:10]] == GOLDEN[profile]


@pytest.mark.parametrize("profile", PROFILES)
def test_quality_never_drops_below_the_recorded_floor(profile):
    result = evaluate(POOL, RATINGS, profile)
    p5, p10, max_poor, mean10 = FLOORS[profile]

    assert result.precision_at_5 >= p5
    assert result.precision_at_10 >= p10
    assert result.poor_in_top_5 <= max_poor
    assert result.mean_rating_top_10 >= mean10 - 1e-9  # float rounding


def test_assigned_and_crowded_issues_stay_out_of_every_top_five():
    flagged = {
        issue_key(issue)
        for issue in POOL.issues
        if issue.assignees or issue.comments >= 10
    }

    for profile in PROFILES:
        assert not flagged & set(GOLDEN[profile][:5])


# ---- the evaluation helpers ------------------------------------------------------


def test_fit_is_read_from_the_verified_repository_language(make_issue, make_repo):
    python_issue = make_issue(repo_context=make_repo(language="Python"))

    assert fits(python_issue, Profile(languages=["python"]))
    assert not fits(python_issue, Profile(languages=["Rust"]))
    assert not fits(make_issue(), Profile(languages=["Python"]))  # no context
    assert fits(make_issue(), Profile())  # no languages: everything fits


def test_ratings_with_a_typo_are_refused():
    with pytest.raises(ValueError, match="great"):
        parse_ratings(["issue,rating,reason", "a/b#1,great,typo"])


def test_an_unrated_issue_in_the_pool_is_reported():
    with pytest.raises(ValueError, match="Unrated"):
        evaluate(POOL, {}, "no-profile")


# ---- rating tools ---------------------------------------------------------------


def test_blind_order_is_the_same_on_every_visit_and_new_for_each_rater():
    keys = [issue_key(i) for i in blind_order(POOL.issues, "rater-one")]

    assert keys == [issue_key(i) for i in blind_order(POOL.issues[::-1], "rater-one")]
    assert keys != [issue_key(i) for i in blind_order(POOL.issues, "rater-two")]
    assert sorted(keys) == sorted(issue_key(i) for i in POOL.issues)


def test_written_ratings_read_back_with_one_header():
    handle = io.StringIO()
    write_rating(handle, "a/b#1", "good", "Clear, small, with steps")
    write_rating(handle, "a/b#2", "poor", 'Says "assigned" on GitHub')

    assert handle.getvalue().count("issue,rating,reason") == 1
    assert parse_ratings(handle.getvalue().splitlines()) == {
        "a/b#1": ("good", "Clear, small, with steps"),
        "a/b#2": ("poor", 'Says "assigned" on GitHub'),
    }


def test_writing_an_unknown_rating_is_refused():
    with pytest.raises(ValueError, match="great"):
        write_rating(io.StringIO(), "a/b#1", "great", "")


def rated(*ratings: str) -> dict[str, tuple[str, str]]:
    return {f"a/b#{n}": (rating, "") for n, rating in enumerate(ratings, start=1)}


def test_identical_ratings_agree_perfectly():
    result = agreement(rated("good", "okay", "poor"), rated("good", "okay", "poor"))

    assert (result.shared, result.exact, result.kappa) == (3, 1.0, 1.0)


def test_kappa_gives_no_credit_for_agreement_chance_would_give():
    # Same on 2 of 4, and each rater split good/poor evenly, so chance alone
    # agrees 0.5 * 0.5 + 0.5 * 0.5 = 0.5 of the time: kappa (0.5 - 0.5) / 0.5 = 0.
    result = agreement(
        rated("good", "good", "poor", "poor"), rated("good", "poor", "good", "poor")
    )

    assert result.exact == 0.5
    assert result.kappa == pytest.approx(0.0)


def test_kappa_on_partial_agreement():
    # Same on 4 of 6. First rater: 3 good, 2 okay, 1 poor; second: 2 of each.
    # Chance: 3/6 * 2/6 + 2/6 * 2/6 + 1/6 * 2/6 = 1/3, so kappa = (2/3 - 1/3) / (2/3).
    result = agreement(
        rated("good", "good", "good", "okay", "okay", "poor"),
        rated("good", "good", "okay", "okay", "poor", "poor"),
    )

    assert result.exact == pytest.approx(2 / 3)
    assert result.kappa == pytest.approx(0.5)


def test_agreement_counts_only_issues_both_raters_rated():
    result = agreement(rated("good", "poor", "okay"), rated("good", "poor"))

    assert result.shared == 2


def test_agreement_with_nothing_in_common_is_an_error():
    with pytest.raises(ValueError, match="both"):
        agreement(rated("good"), {"c/d#9": ("good", "")})


def test_raters_who_both_used_one_rating_for_everything_agree():
    assert agreement(rated("good", "good"), rated("good", "good")).kappa == 1.0
