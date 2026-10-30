from enum import StrEnum

from pydantic import BaseModel, Field, field_validator

from api.schemas.issue import TaskType

MAX_ITEMS = 10
MAX_ITEM_LENGTH = 40


class ExperienceLevel(StrEnum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class Profile(BaseModel):
    """What a contributor tells Incipit about themselves. Every field is optional.

    `experience` is stored but not used by the scorer yet.
    """

    languages: list[str] = Field(default_factory=list, max_length=MAX_ITEMS)
    topics: list[str] = Field(default_factory=list, max_length=MAX_ITEMS)
    experience: ExperienceLevel = ExperienceLevel.BEGINNER
    task_types: list[TaskType] = Field(default_factory=list)

    @field_validator("languages", "topics")
    @classmethod
    def clean_words(cls, values: list[str]) -> list[str]:
        """Trim, drop blanks and duplicates (ignoring case), cap word length."""
        cleaned: list[str] = []
        seen: set[str] = set()
        for value in values:
            word = value.strip()
            if not word:
                continue
            if len(word) > MAX_ITEM_LENGTH:
                raise ValueError(
                    f"Each entry must be at most {MAX_ITEM_LENGTH} characters"
                )
            key = word.casefold()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(word)
        return cleaned
