import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from api.normalise import contributing_guide, normalise_repository
from api.schemas.repository import ContributingGuide, GuideStatus

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


# ---- contributing guide -----------------------------------------------------

COMMUNITY = json.loads(
    (Path(__file__).parent / "fixtures" / "community_profiles.json").read_text(
        encoding="utf-8"
    )
)


def test_guide_found_in_a_real_profile():
    guide = contributing_guide(COMMUNITY["hivecommons/hive"])

    assert guide.status == GuideStatus.FOUND
    assert guide.url == "https://github.com/hivecommons/hive/blob/v5/CONTRIBUTING.md"


def test_guide_not_found_in_a_real_profile():
    guide = contributing_guide(COMMUNITY["octocat/Hello-World"])

    assert guide.status == GuideStatus.NOT_FOUND
    assert guide.url is None


def test_guide_found_when_contributing_lives_outside_the_root():
    # Flask keeps its guide in docs/contributing.rst; GitHub still reports it.
    url = "https://github.com/pallets/flask/blob/main/docs/contributing.rst"

    guide = contributing_guide({"files": {"contributing": {"html_url": url}}})

    assert guide == ContributingGuide(status=GuideStatus.FOUND, url=url)


@pytest.mark.parametrize(
    "profile",
    [
        {},
        {"files": None},
        {"files": {"contributing": {"html_url": "javascript:alert(1)"}}},
        {"files": {"contributing": {}}},
        {"files": {"contributing": "CONTRIBUTING.md"}},
    ],
)
def test_malformed_profiles_raise_instead_of_claiming_no_guide(profile):
    with pytest.raises(ValueError):
        contributing_guide(profile)
