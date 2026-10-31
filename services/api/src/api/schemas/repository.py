from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class RepoContext(BaseModel):
    """Facts about a repository, copied from GitHub's /repos endpoint (verified).

    Missing values stay None: Incipit never guesses a language or a licence.
    """

    model_config = ConfigDict(frozen=True)

    full_name: str  # "owner/name"
    url: str
    description: str | None
    language: str | None  # GitHub's guess at the main language; may be None
    stars: int
    pushed_at: datetime | None  # last push to any branch
    archived: bool
    topics: list[str]
    license: str | None  # SPDX id such as "MIT", when GitHub recognised one


class GuideStatus(StrEnum):
    FOUND = "found"  # GitHub reported a guide; `url` links to it
    NOT_FOUND = "not_found"  # GitHub answered and reported no guide
    UNKNOWN = "unknown"  # the lookup failed, so nothing is claimed either way


class ContributingGuide(BaseModel):
    """Where the repository's contributing guide is, as reported by GitHub."""

    model_config = ConfigDict(frozen=True)

    status: GuideStatus
    url: str | None = None
