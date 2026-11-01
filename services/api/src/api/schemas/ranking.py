from pydantic import BaseModel, Field

from api.schemas.issue import Issue
from api.schemas.profile import Profile

# Keep in step with MAX_LOADED_ISSUES in the frontend (lib/pagination.ts).
MAX_RANK_ISSUES = 100


class SignalResult(BaseModel):
    """One scored signal. `score` is 0-100, or None if it could not be computed."""

    name: str
    score: int | None
    weight: float
    reason: str


class Penalty(BaseModel):
    """A rule that lowered the score after the signals were combined."""

    reason: str
    factor: float  # the score was multiplied by this, between 0 and 1


class RankedIssue(BaseModel):
    issue: Issue
    score: int
    breakdown: list[SignalResult]
    penalties: list[Penalty] = Field(default_factory=list)


class RankRequest(BaseModel):
    issues: list[Issue] = Field(max_length=MAX_RANK_ISSUES)
    profile: Profile = Field(default_factory=Profile)


class RankResponse(BaseModel):
    items: list[RankedIssue]
