"""Look up repository context for a page of issues without ever failing the page."""

import asyncio
import logging

import httpx

from api.clients.github import GitHubClient, GitHubResponseError
from api.normalise import contributing_guide, normalise_repository
from api.schemas.issue import Issue
from api.schemas.repository import ContributingGuide, GuideStatus, RepoContext

logger = logging.getLogger(__name__)

# Lookups run in parallel, but only this many at once, to stay polite to GitHub
# and avoid tripping its secondary (burst) rate limit.
MAX_CONCURRENT_LOOKUPS = 5


async def fetch_repo_contexts(
    client: GitHubClient,
    full_names: list[str],
    *,
    concurrency: int = MAX_CONCURRENT_LOOKUPS,
) -> dict[str, RepoContext | None]:
    """Context for each distinct repository, or None where it is unavailable.

    A missing, private or rate-limited repository, a network failure or a
    malformed answer all give None: the issues still show, just without
    repository facts.
    """
    unique = list(dict.fromkeys(full_names))  # one lookup per repository
    limit = asyncio.Semaphore(concurrency)

    async def lookup(full_name: str) -> RepoContext | None:
        async with limit:
            try:
                raw = await client.get_repository(full_name)
                return normalise_repository(raw)
            except httpx.HTTPStatusError as exc:
                logger.info(
                    "Repository context unavailable for %s (HTTP %s)",
                    full_name,
                    exc.response.status_code,
                )
            except (httpx.RequestError, GitHubResponseError, ValueError) as exc:
                logger.warning(
                    "Repository context unavailable for %s: %s", full_name, exc
                )
            return None

    contexts = await asyncio.gather(*(lookup(name) for name in unique))
    return dict(zip(unique, contexts, strict=True))


def attach_repo_contexts(
    issues: list[Issue], contexts: dict[str, RepoContext | None]
) -> list[Issue]:
    """Return copies of the issues with their repository context filled in."""
    return [
        issue.model_copy(update={"repo_context": contexts.get(issue.repository)})
        for issue in issues
    ]


async def find_contributing_guide(
    client: GitHubClient, full_name: str
) -> ContributingGuide:
    """Found (with a link), not found, or unknown when GitHub could not say.

    Never guessed: any failure is UNKNOWN, not NOT_FOUND.
    """
    try:
        profile = await client.get_community_profile(full_name)
        return contributing_guide(profile)
    except httpx.HTTPStatusError as exc:
        logger.info(
            "Contributing guide unknown for %s (HTTP %s)",
            full_name,
            exc.response.status_code,
        )
    except (httpx.RequestError, GitHubResponseError, ValueError) as exc:
        logger.warning("Contributing guide unknown for %s: %s", full_name, exc)
    return ContributingGuide(status=GuideStatus.UNKNOWN)
