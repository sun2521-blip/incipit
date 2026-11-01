from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict

from api.schemas.repository import RepoContext


class TaskType(StrEnum):
    BUG = "Bug"
    FEATURE = "Feature"
    DOCUMENTATION = "Documentation"
    UI_UX = "UI / UX"
    TESTING = "Testing"


class Issue(BaseModel):
    """A GitHub issue in Incipit's own shape.

    Fields in the first group are copied from GitHub (verified).
    Fields in the second group are derived by Incipit (inferred).
    """

    model_config = ConfigDict(frozen=True)

    # --- verified: copied from GitHub ---
    id: int
    number: int
    title: str
    url: str
    state: str
    repository: str  # "owner/name"
    labels: list[str]
    body: str | None
    comments: int
    assignees: list[str]
    created_at: datetime
    updated_at: datetime

    # --- inferred by Incipit from labels; a heuristic, not a fact ---
    inferred_task_type: TaskType | None

    # --- verified facts about the repository, fetched separately ---
    # None when the lookup failed or has not happened; never guessed.
    repo_context: RepoContext | None = None


class IssueSearchResult(BaseModel):
    total_count: int
    items: list[Issue]
