# Incipit — Architecture

## 1. Overview

Incipit is an open-source contribution navigator. It helps developers discover public GitHub issues, understand why an issue may suit their skills, and maintain a shortlist of potential contributions.

The MVP uses deterministic, explainable matching. An AI service is optional and is not required for core functionality.

## 2. System architecture

```text
┌────────────────────────────┐
│       Next.js frontend     │
│                            │
│ Discovery · Search · Filters│
│ Issue cards · Shortlist    │
└──────────────┬─────────────┘
               │ HTTP / JSON
               ▼
┌────────────────────────────┐
│        FastAPI API         │
│                            │
│ Routes · Validation        │
│ Issue normalization        │
│ Ranking · Issue dossier    │
└──────────────┬─────────────┘
               │ HTTP
               ▼
┌────────────────────────────┐
│        GitHub REST API     │
│                            │
│ Public repositories/issues │
└────────────────────────────┘
```

The diagram describes the intended architecture. Live discovery, repository context and ranking work end to end today; the issue dossier is not built yet.

## 3. Frontend

**Location:** `apps/web`

**Technology:** Next.js, TypeScript, Tailwind CSS.

Responsibilities:

- Render the issue discovery interface.
- Let users search and filter issue results.
- Display issue summaries and matching explanations.
- Allow users to save issues to a local shortlist.
- Communicate with the backend through HTTP requests.

The shortlist will use browser storage rather than a database. For now it is kept in memory and is lost on refresh. The contributor profile is already saved in browser storage.

Every API response is validated with Zod before the UI uses it; a single malformed issue is dropped instead of breaking the page.

## 4. Backend

**Location:** `services/api`

**Technology:** Python, FastAPI, HTTPX, Pydantic Settings.

Responsibilities:

- Expose API endpoints to the frontend.
- Fetch public issue and repository metadata from GitHub.
- Normalize upstream data into consistent internal models.
- Rank candidate issues using deterministic rules.
- Produce an issue dossier with metadata and contribution guidance (planned).

Identical GitHub searches are cached in memory for 60 seconds, because the search API has the tightest rate limit. When GitHub rate-limits a request, the API answers 503 and says how long to wait.

Each issue carries `repo_context`: verified facts from GitHub's `/repos` endpoint (main language, stars, last push, archived flag, topics, licence). `/issues` looks up each distinct repository on the page once, at most five at a time, and caches the answers for 30 minutes. A failed lookup (missing repository, rate limit, network error) leaves that issue's `repo_context` as null; it never fails the search.

The contributing guide is read from GitHub's community profile and reported as found (with a link), not found, or unknown when the lookup failed. It is never guessed. The issue dossier will show it.

Route handlers should remain thin. GitHub communication, normalization, ranking, and dossier generation should be separate modules.

## 5. Intended issue discovery flow

1. The user searches or applies filters in the frontend.
2. The frontend requests candidate issues from the backend.
3. The backend queries GitHub's public API.
4. GitHub responses are normalized into internal issue models.
5. Candidate issues are ranked against the contributor's profile.
6. The API returns structured results and matching explanations.
7. The frontend displays the results and lets the user save a shortlist.

Steps 1 to 6 work today. Step 7 works only for the current session until the shortlist is saved in browser storage.

## 6. Ranking model

The ranking model uses these weights, which are hypotheses to evaluate rather than settled values:

| Signal | Weight |
| --- | ---: |
| Skill and language match | 30% |
| Task-type match | 25% |
| Issue clarity | 20% |
| Repository maintenance signals | 15% |
| Contributor goal relevance | 10% |

Skill/language match compares the repository's main language with the profile's languages. Maintenance falls as the last push ages, and is 0 for archived repositories. A signal that cannot be computed (for example, no languages in the profile, or no repository context) is left out and the remaining weights are rescaled, so missing data neither helps nor hurts an issue.

The score is a heuristic for prioritization, not a probability that a contribution will be accepted or completed successfully.

The system must not promise that an issue is easy, unclaimed, or guaranteed to result in an accepted pull request.

## 7. Configuration and security

- Frontend API base URL: `NEXT_PUBLIC_API_BASE_URL`.
- Optional GitHub token: `GITHUB_TOKEN`.
- Allowed browser origins: `ALLOWED_ORIGINS`.
- Local secrets belong in ignored environment files.
- `.env.example` documents configuration without containing real credentials.
- CORS should allow only explicitly configured frontend origins.

## 8. Testing and deployment

- Backend tests: pytest.
- Frontend tests: Vitest.
- Linting: Ruff and the configured frontend ESLint setup.
- CI: GitHub Actions runs Ruff, pytest with coverage, ESLint, the TypeScript check, Vitest and the production build on every pull request and on pushes to `main`.
- Frontend deployment target: Vercel.
- Backend deployment target: Render.

The project prioritizes free tiers and should not require a paid AI provider for core discovery or ranking.

## 9. Current limitations

- Language match uses only the repository's main language as GitHub reports it, so a repository that also uses the contributor's language can still score low.
- Without `GITHUB_TOKEN`, repository lookups hit GitHub's limit of 60 calls an hour quickly; affected issues then show no repository details.
- At most 100 issues are loaded and ranked per search.
- Task type is inferred from labels, which are inconsistent between repositories.
- The issue dossier is not built yet.
- The shortlist is kept in memory and is lost on refresh; once saved, it will be local to the browser and not synchronised across devices.
