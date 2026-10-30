import pytest

from api.schemas.issue import TaskType
from api.schemas.profile import ExperienceLevel, Profile


def test_empty_profile_is_valid():
    profile = Profile()

    assert profile.languages == []
    assert profile.topics == []
    assert profile.task_types == []
    assert profile.experience == ExperienceLevel.BEGINNER


def test_words_are_trimmed_and_deduplicated_ignoring_case():
    profile = Profile(
        languages=["  Python ", "python", "", "Go"],
        topics=["Machine Learning", "machine learning", "  "],
    )

    assert profile.languages == ["Python", "Go"]
    assert profile.topics == ["Machine Learning"]


def test_overlong_entry_is_rejected():
    with pytest.raises(ValueError):
        Profile(topics=["x" * 41])


def test_task_types_accept_enum_values():
    profile = Profile(task_types=[TaskType.BUG, "Documentation"])

    assert profile.task_types == [TaskType.BUG, TaskType.DOCUMENTATION]
