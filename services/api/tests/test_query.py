import pytest

from api.query import build_issue_query, repo_filter
from api.schemas.issue import TaskType


def test_default_query_is_scoped_to_good_first_issue_label():
    assert build_issue_query() == 'label:"good first issue"'


def test_keywords_search_title_and_body_only():
    assert (
        build_issue_query(keywords="pandas")
        == 'pandas in:title,body label:"good first issue"'
    )


def test_blank_keywords_are_ignored():
    assert build_issue_query(keywords="   ") == 'label:"good first issue"'


def test_language_is_quoted():
    assert (
        build_issue_query(language="C++") == 'label:"good first issue" language:"C++"'
    )


def test_task_type_becomes_an_or_list_of_labels():
    assert (
        build_issue_query(task_type=TaskType.UI_UX)
        == 'label:"good first issue" label:ui,ux,design,accessibility'
    )


def test_all_filters_together():
    query = build_issue_query(
        keywords="pandas", language="Python", task_type=TaskType.BUG
    )

    assert query == (
        'pandas in:title,body label:"good first issue" label:bug language:"Python"'
    )


def test_quotes_are_stripped_from_user_input():
    assert build_issue_query(language='Py"thon') == (
        'label:"good first issue" language:"Python"'
    )
    assert build_issue_query(keywords=' "dark mode" ') == (
        'dark mode in:title,body label:"good first issue"'
    )


@pytest.mark.parametrize(
    "typed",
    [
        "pallets/flask",
        "  pallets/flask  ",
        "https://github.com/pallets/flask",
        "https://github.com/pallets/flask/",
        "github.com/pallets/flask",
        "https://github.com/pallets/flask.git",
        "HTTPS://GITHUB.COM/pallets/flask",
    ],
)
def test_a_repository_name_or_link_becomes_a_repo_filter(typed):
    assert repo_filter(typed) == "pallets/flask"
    assert build_issue_query(keywords=typed) == (
        'repo:pallets/flask label:"good first issue"'
    )


@pytest.mark.parametrize(
    "typed",
    [
        "pandas",
        "dark mode",
        "https://github.com/pallets/flask/issues/5",
        "https://gitlab.com/pallets/flask",
        "pallets/..",
        "a/b/c",
        'pallets/"flask"',
        "",
        None,
    ],
)
def test_anything_else_stays_a_keyword_search(typed):
    assert repo_filter(typed) is None


def test_repo_filter_keeps_the_other_filters():
    query = build_issue_query(
        keywords="pallets/flask", language="Python", task_type=TaskType.BUG
    )

    assert (
        query
        == 'repo:pallets/flask label:"good first issue" label:bug language:"Python"'
    )
