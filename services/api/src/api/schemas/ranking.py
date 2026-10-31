from pydantic import BaseModel, Field

from api.schemas.issue import Issue
from api.schemas.profile import Profile

MAX_RANK_ISSUES = 50


class SignalResult(BaseModel):
    """One scored signal. `score` is 0-100, or None if it could not be computed."""

    name: str
    score: int | None
    weight: float
    reason: str


class RankedIssue(BaseModel):
    issue: Issue
    score: int
    breakdown: list[SignalResult]


class RankRequest(BaseModel):
    issues: list[Issue] = Field(max_length=MAX_RANK_ISSUES)
    profile: Profile = Field(default_factory=Profile)


class RankResponse(BaseModel):
    items: list[RankedIssue]
