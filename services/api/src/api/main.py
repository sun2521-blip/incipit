import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from api.clients.github import GitHubClient, GitHubResponseError
from api.normalise import normalise_search_response
from api.query import build_issue_query
from api.ranking.scorer import rank_issues
from api.rate_limit import describe_wait, is_rate_limited, retry_after_seconds
from api.schemas.issue import IssueSearchResult, TaskType
from api.schemas.ranking import RankRequest, RankResponse
from api.settings import settings

app = FastAPI(
    title="Incipit API",
    description="An open-source contribution navigator",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Retry-After"],
)


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
    client = GitHubClient(token=settings.github_token)

    try:
        raw = await client.search_issues(search, per_page=per_page, page=page)
    except httpx.HTTPStatusError as exc:
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
            raise HTTPException(
                status_code=503, detail=detail, headers=headers
            ) from exc

        raise HTTPException(
            status_code=502,
            detail="GitHub returned an unsuccessful response.",
        ) from exc
    except GitHubResponseError as exc:
        raise HTTPException(
            status_code=502,
            detail="GitHub returned a response Incipit could not read.",
        ) from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail="GitHub took too long to respond. Please try again.",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to reach the GitHub API.",
        ) from exc

    return normalise_search_response(raw)


@app.post("/rank")
def rank(request: RankRequest) -> RankResponse:
    """Score and order issues for a profile. Pure computation: no GitHub calls."""
    return RankResponse(items=rank_issues(request.issues, request.profile))
