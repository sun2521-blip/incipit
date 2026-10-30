from pydantic import BaseModel

from api.schemas.issue import Issue


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
