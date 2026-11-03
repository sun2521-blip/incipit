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

The diagram describes the intended architecture. Live discovery, repository context, ranking and the issue dossier work end to end today.

## 3. Frontend

**Location:** `apps/web`

**Technology:** Next.js, TypeScript, Tailwind CSS.

Responsibilities:

- Render the issue discovery interface.
- Let users search and filter issue results.
- Display issue summaries and matching explanations.
- Allow users to save issues to a local shortlist.
- Communicate with the backend through HTTP requests.

The shortlist and the contributor profile are saved in browser storage (localStorage) rather than a database. The shortlist keeps a validated snapshot of each issue (title, repository, number, link, state and when it was saved), stays in step across tabs, and falls back to memory when the browser blocks storage. "Refresh status" re-checks each saved issue through the dossier route, three at a time, and stores GitHub's current state with the time it was checked: closed, deleted (410) and not found (404) are flagged, and a transferred issue moves to its new address. It stops early, saying why, if the API is unreachable or a rate limit is hit.

Each live issue opens a dossier at `/issues/[owner]/[repo]/[number]`. The page validates the address before calling the API, renders the issue text as plain text, and only links to `https://github.com/` addresses. Its fit score comes from `POST /rank` with the profile stored in the browser, so the profile never appears in a URL.

Every API response is validated with Zod before the UI uses it; a single malformed issue is dropped instead of breaking the page.

Code layout: pages in `src/app` (the home page keeps the search state; the dossier route reads its parameters inside Suspense, as Cache Components requires), presentational pieces in `src/components` (header, footer, issue card, score breakdown, profile panel, shortlist, loading placeholders), and logic in `src/lib` (API client and schemas, card shaping, pagination, saved-issue storage and re-checking). While a search or dossier loads, the page shows placeholders shaped like the content and a spinner, tells screen readers it is searching, and after five seconds explains that the free API may be waking up.

## 4. Backend

**Location:** `services/api`

**Technology:** Python, FastAPI, HTTPX, Pydantic Settings.

Responsibilities:

- Expose API endpoints to the frontend.
- Fetch public issue and repository metadata from GitHub.
- Normalize upstream data into consistent internal models.
- Rank candidate issues using deterministic rules.
- Produce an issue dossier with metadata and contribution guidance.

Identical GitHub searches are cached in memory for 60 seconds, because the search API has the tightest rate limit. When GitHub rate-limits a request, the API answers 503 and says how long to wait.

Each issue carries `repo_context`: verified facts from GitHub's `/repos` endpoint (main language, stars, last push, archived flag, topics, licence). `/issues` looks up each distinct repository on the page once, at most five at a time, and caches the answers for 30 minutes. A failed lookup (missing repository, rate limit, network error) leaves that issue's `repo_context` as null; it never fails the search.

The contributing guide is read from GitHub's community profile and reported as found (with a link), not found, or unknown when the lookup failed. It is never guessed. The issue dossier shows it.

`GET /issues` also accepts `owner/repo`, or a pasted github.com link to a repository, as the query; it becomes a `repo:` filter. A repository GitHub cannot search (missing or private), or one with no beginner issues, comes back as an empty result with a plain-language `notice` instead of an error. All of a request's GitHub calls share one connection pool.

`GET /issues/{owner}/{repo}/{number}` builds the dossier. It validates the owner, repository and number before anything reaches GitHub, fetches the issue live (never cached) and records `checked_at`. A transferred issue (GitHub answers 301) is followed once, and only to another GitHub API issue address; the dossier then says where it moved from. Missing issues and pull-request numbers answer 404, deleted issues 410, each with a plain-language message. The dossier keeps GitHub's facts (`issue`, `contributing_guide`) apart from Incipit's own advice (`guidance`, marked `generic`).

Route handlers should remain thin. GitHub communication, normalization, ranking, and dossier generation should be separate modules.

## 5. Intended issue discovery flow

1. The user searches or applies filters in the frontend.
2. The frontend requests candidate issues from the backend.
3. The backend queries GitHub's public API.
4. GitHub responses are normalized into internal issue models.
5. Candidate issues are ranked against the contributor's profile.
6. The API returns structured results and matching explanations.
7. The frontend displays the results and lets the user save a shortlist.

All seven steps work today. From step 7, any issue can be opened as a dossier.

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

After the weighted signals, two rules can lower a score, each from a verified GitHub fact and each shown with its reason: an assigned issue is halved, and a busy discussion (10 or more comments) lowers it by a quarter, or by half at 25 or more. Both came out of the evaluation of real issues in [ranking-evaluation.md](ranking-evaluation.md), which also lists the ranking's known weaknesses.

The score is a heuristic for prioritization, not a probability that a contribution will be accepted or completed successfully.

The system must not promise that an issue is easy, unclaimed, or guaranteed to result in an accepted pull request.

## 7. Configuration and security

- Frontend API base URL: `NEXT_PUBLIC_API_BASE_URL`.
- Optional GitHub token: `GITHUB_TOKEN`.
- Allowed browser origins: `ALLOWED_ORIGINS`.
- Local secrets belong in ignored environment files.
- `.env.example` documents configuration without containing real credentials.
- CORS should allow only explicitly configured frontend origins.
- The API sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and, outside the API docs, a `default-src 'none'` Content-Security-Policy.
- Request bodies over 4 MB are refused with 413, counted as they arrive. Each client gets 60 requests a minute to GitHub-backed routes and 120 to `/rank` (`GITHUB_REQUESTS_PER_MINUTE`, `RANK_REQUESTS_PER_MINUTE`); limits live in memory per process and are a fairness guard, with GitHub's own limit as the backstop.
- Repository names are checked against GitHub's rules before they reach a URL, and `.` and `..` are refused, because HTTP clients collapse them into a different path.
- The web app sends a Content-Security-Policy that only lets the browser call itself and the configured API, plus `nosniff`, `DENY` framing, a strict referrer policy and a restrictive Permissions-Policy.

## 8. Testing and deployment

- Backend tests: pytest.
- Frontend tests: Vitest.
- Linting: Ruff and the configured frontend ESLint setup.
- Type checks: Pyright (configured in `pyrightconfig.json` at the repository root, which also points VS Code at the API's virtual environment) and the TypeScript compiler.
- CI: GitHub Actions runs Ruff, Pyright, pytest with coverage, ESLint, the TypeScript check, Vitest and the production build on every pull request and on pushes to `main`.
- Deployment: [deployment.md](deployment.md) and the Render blueprint in `render.yaml`; `services/api/scripts/smoke_test.py` checks a live API.
- Frontend deployment target: Vercel.
- Backend deployment target: Render.

The project prioritizes free tiers and should not require a paid AI provider for core discovery or ranking.

## 9. Current limitations

- Language match uses only the repository's main language as GitHub reports it, so a repository that also uses the contributor's language can still score low.
- Without `GITHUB_TOKEN`, repository lookups hit GitHub's limit of 60 calls an hour quickly; affected issues then show no repository details.
- At most 100 issues are loaded and ranked per search.
- Task type is inferred from labels, which are inconsistent between repositories.
- The dossier's checklist is generic: it is not checked against each repository.
- The shortlist is local to one browser and not synchronised across devices. It shows each issue's state as of the last "Refresh status" (or when it was saved), not live.
- Rate limits and caches live in memory: they reset when the API restarts, and free hosting restarts it after it sleeps.
