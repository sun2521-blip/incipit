from api.clients.github import is_repo_name
from api.schemas.issue import TaskType

# Every Incipit search is scoped to beginner-friendly issues.
BASE_LABEL = "good first issue"

# GitHub's label: qualifier matches exact label names; a comma means OR.
TASK_LABELS: dict[TaskType, tuple[str, ...]] = {
    TaskType.BUG: ("bug",),
    TaskType.FEATURE: ("enhancement", "feature"),
    TaskType.DOCUMENTATION: ("documentation", "docs"),
    TaskType.TESTING: ("tests", "testing"),
    TaskType.UI_UX: ("ui", "ux", "design", "accessibility"),
}


_GITHUB_PREFIXES = ("https://github.com/", "http://github.com/", "github.com/")


def repo_filter(keywords: str | None) -> str | None:
    """ "owner/repo", or a pasted github.com link to one, as "owner/repo".

    Anything else (ordinary keywords, an issue link, a bad name) is None.
    """
    if not keywords:
        return None

    text = keywords.strip()
    for prefix in _GITHUB_PREFIXES:
        if text.casefold().startswith(prefix):
            text = text[len(prefix) :]
            break
    text = text.rstrip("/").removesuffix(".git")

    return text if is_repo_name(text) else None


def _strip_quotes(value: str) -> str:
    """Drop double quotes so user input can't unbalance the search string."""
    return value.replace('"', "").strip()


def build_issue_query(
    *,
    keywords: str | None = None,
    language: str | None = None,
    task_type: TaskType | None = None,
) -> str:
    """Build the GitHub search string for a discovery request."""
    parts: list[str] = []

    repo = repo_filter(keywords)
    cleaned_keywords = _strip_quotes(keywords) if keywords else ""
    if repo:
        # One repository's issues, instead of a keyword search.
        parts.append(f"repo:{repo}")
    elif cleaned_keywords:
        parts.append(f"{cleaned_keywords} in:title,body")

    parts.append(f'label:"{BASE_LABEL}"')

    if task_type is not None:
        parts.append("label:" + ",".join(TASK_LABELS[task_type]))

    cleaned_language = _strip_quotes(language) if language else ""
    if cleaned_language:
        parts.append(f'language:"{cleaned_language}"')

    return " ".join(parts)
