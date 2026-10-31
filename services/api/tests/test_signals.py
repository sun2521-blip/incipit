import time
from datetime import UTC, datetime, timedelta

import pytest

from api.ranking.signals import (
    clarity,
    clean_body,
    goal_match,
    maintenance,
    skill_match,
    task_match,
)
from api.schemas.issue import TaskType
from api.schemas.profile import Profile

# ---- task_match -------------------------------------------------------------


def test_task_match_unavailable_without_preferences(make_issue):
    issue = make_issue(inferred_task_type=TaskType.BUG)

    assert task_match(issue, Profile()).score is None


def test_task_match_unavailable_without_inferred_type(make_issue):
    profile = Profile(task_types=[TaskType.BUG])

    assert task_match(make_issue(), profile).score is None


def test_task_match_full_score_for_preferred_type(make_issue):
    issue = make_issue(inferred_task_type=TaskType.BUG)
    profile = Profile(task_types=[TaskType.BUG, TaskType.TESTING])

    signal = task_match(issue, profile)

    assert signal.score == 100
    assert "Bug" in signal.reason


def test_task_match_low_but_nonzero_for_other_type(make_issue):
    issue = make_issue(inferred_task_type=TaskType.FEATURE)
    profile = Profile(task_types=[TaskType.BUG])

    assert task_match(issue, profile).score == 20


# ---- clarity ----------------------------------------------------------------


def test_clarity_zero_without_description(make_issue):
    assert clarity(make_issue(body=None)).score == 0
    assert clarity(make_issue(body="   ")).score == 0


def test_clarity_ignores_template_headings_and_comments(make_issue):
    body = "### Describe the bug\n<!-- " + "x" * 500 + " -->\n## Steps\n"

    assert clean_body(body) == ""
    assert clarity(make_issue(body=body)).score == 0


def test_clean_body_strips_every_comment():
    assert clean_body("a<!--x-->b<!--y-->c") == "a b c"


def test_clean_body_drops_text_after_an_unclosed_comment():
    assert clean_body("keep this <!-- never closed") == "keep this"


def test_clean_body_stays_fast_on_pathological_input():
    # Thousands of unclosed "<!--" used to take seconds (quadratic regex).
    started = time.perf_counter()

    assert clean_body("<!--" * 100_000) == ""

    assert time.perf_counter() - started < 1.0


def test_clarity_short_plain_description_scores_low(make_issue):
    assert clarity(make_issue(body="It crashes.")).score == 10


def test_clarity_rewards_reproduction_code_and_lists(make_issue, detailed_body):
    signal = clarity(make_issue(body=detailed_body))

    # 40 (500+ characters) + 30 (repro wording) + 15 (code) + 15 (list)
    assert signal.score == 100
    assert "a code block" in signal.reason
    assert "a list" in signal.reason


def test_clarity_length_alone_is_capped_below_full_score(make_issue):
    signal = clarity(make_issue(body="Some plain words here. " * 40))

    assert signal.score == 40


# ---- goal_match -------------------------------------------------------------


def test_goal_match_unavailable_without_topics(make_issue):
    assert goal_match(make_issue(), Profile()).score is None


def test_goal_match_title_hit_scores_60(make_issue):
    issue = make_issue(title="Improve pandas import speed")

    assert goal_match(issue, Profile(topics=["pandas"])).score == 60


def test_goal_match_label_hit_counts_as_title_hit(make_issue):
    issue = make_issue(labels=["good first issue", "Machine Learning"])

    assert goal_match(issue, Profile(topics=["machine learning"])).score == 60


def test_goal_match_body_only_hit_scores_30(make_issue):
    issue = make_issue(body="This breaks when using pandas with large files.")

    assert goal_match(issue, Profile(topics=["pandas"])).score == 30


def test_goal_match_caps_at_100(make_issue):
    issue = make_issue(title="pandas and numpy and scipy support")
    profile = Profile(topics=["pandas", "numpy", "scipy"])

    assert goal_match(issue, profile).score == 100


def test_goal_match_no_hits_is_zero_not_unavailable(make_issue):
    issue = make_issue(title="Fix typo", body="A typo in the readme.")

    signal = goal_match(issue, Profile(topics=["rust"]))

    assert signal.score == 0


@pytest.mark.parametrize(
    ("topic", "title", "expected"),
    [
        ("ai", "Maintain the changelog", 0),  # whole words only
        ("ai", "Add AI helper", 60),  # case-insensitive
        ("c++", "Fix C++ parser warning", 60),  # punctuation in topics works
        ("go", "Good first fix", 0),  # "go" is not inside "good"
    ],
)
def test_goal_match_whole_word_matching(make_issue, topic, title, expected):
    issue = make_issue(title=title, labels=[])

    assert goal_match(issue, Profile(topics=[topic])).score == expected


# ---- skill match (repository language) ---------------------------------------


def test_skill_match_unavailable_without_languages(make_issue, make_repo):
    issue = make_issue(repo_context=make_repo())

    assert skill_match(issue, Profile()).score is None


def test_skill_match_unavailable_without_repository_context(make_issue):
    signal = skill_match(make_issue(), Profile(languages=["Python"]))

    assert signal.score is None
    assert "unavailable" in signal.reason


def test_skill_match_unavailable_when_github_reports_no_language(make_issue, make_repo):
    issue = make_issue(repo_context=make_repo(language=None))

    assert skill_match(issue, Profile(languages=["Python"])).score is None


def test_skill_match_full_score_ignoring_case(make_issue, make_repo):
    issue = make_issue(repo_context=make_repo(language="TypeScript"))

    signal = skill_match(issue, Profile(languages=["typescript"]))

    assert signal.score == 100
    assert "TypeScript" in signal.reason


def test_skill_match_low_but_nonzero_for_another_language(make_issue, make_repo):
    issue = make_issue(repo_context=make_repo(language="Rust"))

    signal = skill_match(issue, Profile(languages=["Python", "Go"]))

    assert signal.score == 20
    assert "Rust" in signal.reason


# ---- maintenance (repository activity) ---------------------------------------

NOW = datetime(2026, 10, 31, 12, tzinfo=UTC)


def pushed(make_issue, make_repo, days_ago: float):
    return make_issue(repo_context=make_repo(pushed_at=NOW - timedelta(days=days_ago)))


def test_maintenance_unavailable_without_repository_context(make_issue):
    assert maintenance(make_issue(), NOW).score is None


def test_maintenance_unavailable_without_push_date(make_issue, make_repo):
    issue = make_issue(repo_context=make_repo(pushed_at=None))

    assert maintenance(issue, NOW).score is None


def test_maintenance_zero_for_archived_repository(make_issue, make_repo):
    issue = make_issue(repo_context=make_repo(archived=True, pushed_at=NOW))

    signal = maintenance(issue, NOW)

    assert signal.score == 0
    assert "archived" in signal.reason


@pytest.mark.parametrize(
    ("days_ago", "points"),
    [
        (0, 100),
        (7, 100),
        (8, 85),
        (30, 85),
        (31, 60),
        (90, 60),
        (91, 35),
        (180, 35),
        (181, 15),
        (365, 15),
        (366, 5),
        (2000, 5),
    ],
)
def test_maintenance_points_fall_as_the_last_push_ages(
    make_issue, make_repo, days_ago, points
):
    assert maintenance(pushed(make_issue, make_repo, days_ago), NOW).score == points


@pytest.mark.parametrize(
    ("days_ago", "words"),
    [(0, "today"), (1, "yesterday"), (12, "12 days ago")],
)
def test_maintenance_reason_says_when(make_issue, make_repo, days_ago, words):
    signal = maintenance(pushed(make_issue, make_repo, days_ago), NOW)

    assert signal.reason == f"Code was last pushed {words}."


def test_maintenance_treats_a_future_push_date_as_today(make_issue, make_repo):
    # Clock skew between GitHub and this server must not break the signal.
    assert maintenance(pushed(make_issue, make_repo, -1), NOW).score == 100
