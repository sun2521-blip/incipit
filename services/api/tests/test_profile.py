import pytest

from api.schemas.issue import TaskType
from api.schemas.profile import Profile


def test_empty_profile_is_valid():
    profile = Profile()

    assert profile.languages == []
    assert profile.topics == []
    assert profile.task_types == []


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
    # Plain strings arrive from JSON, so validate a dict as the API does.
    profile = Profile.model_validate({"task_types": [TaskType.BUG, "Documentation"]})

    assert profile.task_types == [TaskType.BUG, TaskType.DOCUMENTATION]


def test_unknown_fields_such_as_the_old_experience_are_ignored():
    profile = Profile.model_validate({"experience": "advanced", "topics": ["api"]})

    assert profile.topics == ["api"]
    assert not hasattr(profile, "experience")
