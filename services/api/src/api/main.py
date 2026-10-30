import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from api.clients.github import GitHubClient
from api.normalise import normalise_search_response
from api.query import build_issue_query
from api.schemas.issue import IssueSearchResult, TaskType
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
        remaining = upstream.headers.get("X-RateLimit-Remaining")

        if upstream.status_code == 429 or (
            upstream.status_code == 403 and remaining == "0"
        ):
            raise HTTPException(
                status_code=503,
                detail="GitHub API rate limit reached. Try again later or configure GITHUB_TOKEN.",
            ) from exc

        raise HTTPException(
            status_code=502,
            detail="GitHub returned an unsuccessful response.",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to reach the GitHub API.",
        ) from exc

    return normalise_search_response(raw)
