from datetime import datetime

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
