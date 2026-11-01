import httpx
from fastapi import FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware

from api.clients.github import GitHubClient, GitHubResponseError, is_repo_name
from api.dossier import IssueDeleted, IssueNotFound, NotAnIssue, fetch_dossier
from api.normalise import normalise_search_response
from api.query import build_issue_query, repo_filter
from api.ranking.scorer import rank_issues
from api.rate_limit import describe_wait, is_rate_limited, retry_after_seconds
from api.repo_context import attach_repo_contexts, fetch_repo_contexts
from api.schemas.dossier import Dossier
from api.schemas.issue import IssueSearchResult, TaskType
from api.schemas.ranking import RankRequest, RankResponse
from api.security import (
    BodySizeLimitMiddleware,
    RateLimiter,
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
)
from api.settings import settings

app = FastAPI(
    title="Incipit API",
    description="An open-source contribution navigator",
    version="0.1.0",
)

github_limiter = RateLimiter(settings.github_requests_per_minute)
rank_limiter = RateLimiter(settings.rank_requests_per_minute)

# Starlette runs the middleware added last first. CORS goes last so that it
# wraps everything else: even a 413 or 429 reaches the browser readable.
app.add_middleware(RateLimitMiddleware, limiter=rank_limiter, prefixes=("/rank",))
app.add_middleware(RateLimitMiddleware, limiter=github_limiter, prefixes=("/issues",))
app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_request_bytes)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Retry-After"],
)


def github_failure(exc: Exception) -> HTTPException:
    """The error the browser sees when a call to GitHub fails."""
    if isinstance(exc, httpx.HTTPStatusError):
        upstream = exc.response
        if is_rate_limited(upstream.status_code, upstream.headers):
            wait = retry_after_seconds(upstream.headers)
            detail = "GitHub API rate limit reached."
            headers: dict[str, str] = {}
            if wait is None:
                detail += " Please try again in a little while."
            else:
                detail += f" Try again in {describe_wait(wait)}."
                headers["Retry-After"] = str(wait)
            return HTTPException(status_code=503, detail=detail, headers=headers)
        return HTTPException(
            status_code=502, detail="GitHub returned an unsuccessful response."
        )
    if isinstance(exc, GitHubResponseError):
        return HTTPException(
            status_code=502,
            detail="GitHub returned a response Incipit could not read.",
        )
    if isinstance(exc, httpx.TimeoutException):
        return HTTPException(
            status_code=504,
            detail="GitHub took too long to respond. Please try again.",
        )
    return HTTPException(status_code=502, detail="Unable to reach the GitHub API.")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "healthy"}


@app.get("/issues")
async def get_issues(
    query: str | None = Query(default=None, max_length=200),
    language: str | None = Query(
        default=None, max_length=40, pattern=r"^[A-Za-z0-9+#. -]+$"
    ),
    task_type: TaskType | None = None,
    per_page: int = Query(default=20, ge=1, le=50),
    page: int = Query(default=1, ge=1),
) -> IssueSearchResult:
    search = build_issue_query(keywords=query, language=language, task_type=task_type)
    repo = repo_filter(query)
    async with GitHubClient(token=settings.github_token) as client:
        return await _search(client, search, repo, language, task_type, per_page, page)


async def _search(
    client: GitHubClient,
    search: str,
    repo: str | None,
    language: str | None,
    task_type: TaskType | None,
    per_page: int,
    page: int,
) -> IssueSearchResult:
    try:
        raw = await client.search_issues(search, per_page=per_page, page=page)
    except (httpx.HTTPError, GitHubResponseError) as exc:
        # GitHub answers 422 when a repo: filter names a repository it cannot
        # search: it does not exist, or it is private. That is not an outage.
        if (
            repo
            and isinstance(exc, httpx.HTTPStatusError)
            and exc.response.status_code == 422
        ):
            return IssueSearchResult(
                total_count=0,
                items=[],
                notice=f"GitHub has no public repository called {repo}.",
            )
        raise github_failure(exc) from exc

    result = normalise_search_response(raw)
    if repo and not result.items:
        filtered = " that match these filters" if language or task_type else ""
        result = result.model_copy(
            update={
                "notice": (
                    f'{repo} has no open issues labelled "good first issue"'
                    f"{filtered} yet."
                )
            }
        )

    # Repository facts are extra: a failed lookup leaves that issue's
    # repo_context as None instead of failing the whole search.
    contexts = await fetch_repo_contexts(
        client, [issue.repository for issue in result.items]
    )
    return result.model_copy(
        update={"items": attach_repo_contexts(result.items, contexts)}
    )


@app.get("/issues/{owner}/{repo}/{number}")
async def get_issue_dossier(
    owner: str = Path(pattern=r"^[A-Za-z0-9-]{1,39}$"),
    repo: str = Path(pattern=r"^[A-Za-z0-9._-]{1,100}$"),
    number: int = Path(ge=1, le=2**31 - 1),
) -> Dossier:
    """One issue, checked live, with repository context and generic guidance."""
    full_name = f"{owner}/{repo}"
    # The patterns above cannot express "not . or .." (no look-ahead there).
    if not is_repo_name(full_name):
        raise HTTPException(status_code=422, detail="Not a GitHub repository name.")
    try:
        async with GitHubClient(token=settings.github_token) as client:
            return await fetch_dossier(client, full_name, number)
    except IssueNotFound as exc:
        raise HTTPException(
            status_code=404,
            detail=(
                f"GitHub has no issue #{number} in {full_name}. It may never "
                "have existed, or the repository may be private."
            ),
        ) from exc
    except IssueDeleted as exc:
        raise HTTPException(
            status_code=410,
            detail=f"Issue #{number} in {full_name} was deleted on GitHub.",
        ) from exc
    except NotAnIssue as exc:
        raise HTTPException(
            status_code=404,
            detail=f"#{number} in {full_name} is a pull request, not an issue.",
        ) from exc
    except (httpx.HTTPError, GitHubResponseError) as exc:
        raise github_failure(exc) from exc


@app.post("/rank")
def rank(request: RankRequest) -> RankResponse:
    """Score and order issues for a profile. Pure computation: no GitHub calls."""
    return RankResponse(items=rank_issues(request.issues, request.profile))
