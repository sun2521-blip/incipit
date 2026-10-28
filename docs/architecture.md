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

The diagram describes the intended architecture. The current Discovery interface still uses sample issue data; live issue discovery and ranking are not yet complete.

## 3. Frontend

**Location:** `apps/web`

**Technology:** Next.js, TypeScript, Tailwind CSS.

Responsibilities:

- Render the issue discovery interface.
- Let users search and filter issue results.
- Display issue summaries and matching explanations.
- Allow users to save issues to a local shortlist.
- Communicate with the backend through HTTP requests.

The local shortlist initially uses browser storage rather than a database.

## 4. Backend

**Location:** `services/api`

**Technology:** Python, FastAPI, HTTPX, Pydantic Settings.

Responsibilities:

- Expose API endpoints to the frontend.
- Fetch public issue and repository metadata from GitHub.
- Normalize upstream data into consistent internal models.
- Rank candidate issues using deterministic rules.
- Produce an issue dossier with metadata and contribution guidance.

Route handlers should remain thin. GitHub communication, normalization, ranking, and dossier generation should be separate modules.

## 5. Intended issue discovery flow

1. The user searches or applies filters in the frontend.
2. The frontend requests candidate issues from the backend.
3. The backend queries GitHub's public API.
4. GitHub responses are normalized into internal issue models.
5. Candidate issues are ranked against the contributor's profile.
6. The API returns structured results and matching explanations.
7. The frontend displays the results and lets the user save a shortlist.

This flow is the target design; it is not yet fully implemented.

## 6. Ranking model

The planned ranking model uses these illustrative weights:

| Signal | Weight |
| --- | ---: |
| Skill and language match | 30% |
| Task-type match | 25% |
| Issue clarity | 20% |
| Repository maintenance signals | 15% |
| Contributor goal relevance | 10% |

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
- Frontend deployment target: Vercel.
- Backend deployment target: Render.

The project prioritizes free tiers and should not require a paid AI provider for core discovery or ranking.

## 9. Current limitations

- Discovery cards currently use sample data.
- Live GitHub discovery and ranking remain to be completed.
- Issue normalization and rate-limit handling need dedicated implementation and tests.
- The shortlist is local to the browser and is not synchronized across devices.
