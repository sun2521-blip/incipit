import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from api.normalise import normalise_repository

FIXTURE = Path(__file__).parent / "fixtures" / "repositories.json"


def make_raw_repo(**overrides: Any) -> dict[str, Any]:
    """A hand-written repository shaped like GitHub's /repos response (not live data)."""
    raw: dict[str, Any] = {
        "full_name": "example/project",
        "html_url": "https://github.com/example/project",
        "description": "An example project",
        "language": "Python",
        "stargazers_count": 1200,
        "pushed_at": "2026-10-29T08:30:00Z",
        "archived": False,
        "topics": ["testing", "cli"],
        "license": {"key": "mit", "spdx_id": "MIT", "name": "MIT License"},
    }
    raw.update(overrides)
    return raw


def test_copies_the_verified_fields():
    repo = normalise_repository(make_raw_repo())

    assert repo.full_name == "example/project"
    assert repo.url == "https://github.com/example/project"
    assert repo.language == "Python"
    assert repo.stars == 1200
    assert repo.pushed_at == datetime(2026, 10, 29, 8, 30, tzinfo=UTC)
    assert repo.archived is False
    assert repo.topics == ["testing", "cli"]
    assert repo.license == "MIT"


def test_missing_optional_fields_stay_unknown():
    raw = make_raw_repo()
    for key in ("description", "language", "pushed_at", "topics", "license"):
        del raw[key]

    repo = normalise_repository(raw)

    assert repo.description is None
    assert repo.language is None
    assert repo.pushed_at is None
    assert repo.topics == []
    assert repo.license is None


def test_unrecognised_licence_is_not_reported():
    repo = normalise_repository(
        make_raw_repo(license={"key": "other", "spdx_id": "NOASSERTION"})
    )

    assert repo.license is None


def test_non_string_topics_are_dropped():
    repo = normalise_repository(make_raw_repo(topics=["cli", 3, None]))

    assert repo.topics == ["cli"]


@pytest.mark.parametrize("missing", ["full_name", "html_url"])
def test_missing_required_fields_raise_value_error(missing):
    raw = make_raw_repo()
    del raw[missing]

    with pytest.raises(ValueError, match="Malformed GitHub repository"):
        normalise_repository(raw)


def test_wrong_types_raise_value_error():
    with pytest.raises(ValueError):
        normalise_repository(make_raw_repo(stargazers_count="lots"))


def test_handles_real_github_responses():
    repos = json.loads(FIXTURE.read_text(encoding="utf-8"))
    found = {name: raw for name, raw in repos.items() if "status" not in raw}

    assert found, "the fixture should contain at least one repository"
    for name, raw in found.items():
        repo = normalise_repository(raw)
        assert repo.full_name.casefold() == name.casefold()
        assert repo.url.startswith("https://github.com/")
        assert repo.stars >= 0
