from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from api.schemas.issue import Issue
from api.schemas.repository import ContributingGuide


class ChecklistStep(BaseModel):
    title: str
    detail: str
    link: str | None = None  # a verified GitHub link, such as the contributing guide


class Guidance(BaseModel):
    """Advice written by Incipit. Generic: not checked against this repository."""

    kind: Literal["generic"] = "generic"
    note: str
    steps: list[ChecklistStep]


class Dossier(BaseModel):
    """Everything Incipit knows about one issue, with facts and advice kept apart.

    `issue` and `contributing_guide` come from GitHub (the issue's
    `inferred_task_type` is still labelled as an inference). `guidance` is
    Incipit's own generic advice. There is no score here: ranking needs the
    contributor's profile, which stays in the browser and goes to POST /rank.
    """

    checked_at: datetime  # when GitHub was asked
    # "owner/repo#123" when GitHub said the issue was transferred, else None.
    moved_from: str | None
    issue: Issue
    contributing_guide: ContributingGuide
    guidance: Guidance
