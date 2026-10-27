from fastapi import FastAPI
from api.clients.github import GitHubClient

github_client = GitHubClient()

app = FastAPI(
    title="Incipit API",
    description="an open-source contribution navigator",
    version="0.1.0",
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "healthy"}

@app.get("/issues")
async def get_issues(
    q: str = "good first issue",
    per_page: int = 10,
) -> dict:
    return await github_client.search_issues(q, per_page=per_page)