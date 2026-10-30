import pytest

from api.ranking.signals import clarity, clean_body, goal_match, task_match
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
