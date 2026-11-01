# Incipit: roadmap and checkpoints

The living checklist for the 14-day plan in the original project blueprint (written when the project was still called FirstPR). Last updated: 2026-10-31.

## Rules for this file

1. A checkpoint is ticked only when it is finished **and verified**: a passing test, a command's output, or something visible in the running app.
2. A day is **Done** only when every line of the blueprint's text for that day is met. Anything deferred stays listed under its original day, which then shows as Partial.
3. Nothing is removed silently. Anything dropped on purpose is recorded under Decisions, with a reason.
4. Update this file in the same commit as the work.

## Status

**64 of 140 sub-checkpoints done (46%).** Days 1 to 3 are complete, Days 4, 5, 10 and 12 are partly done, and the rest have not started. Dates are estimates at 3-4 hours a day; Day 1 was Oct 27.

| Day | Goal | Status | Done | Target |
| --- | --- | --- | --- | --- |
| 1 | Foundation | Done | 10/10 | Oct 27 |
| 2 | UI shell | Done | 6/6 | Oct 28 |
| 3 | GitHub client | Done | 21/21 | Oct 29 (completed Oct 31) |
| 4 | Ranking core | Partial | 9/11 | Oct 30 (completion: Nov 2) |
| 5 | Real ranked results | Mostly done | 9/10 | Oct 31 (completion: Nov 2) |
| 6 | Repository context and the missing signals | Not started | 0/17 | Nov 2 |
| 7 | Issue dossier | Not started | 0/13 | Nov 3 |
| 8 | Saved shortlist | Not started | 0/7 | Nov 4 |
| 9 | Evaluation | Not started | 0/6 | Nov 5 |
| 10 | Frontend tests and CI | Partial | 6/9 | Nov 6 |
| 11 | First deployment | Not started | 0/8 | Nov 7 |
| 12 | Failure cases | Partial | 3/8 | Nov 8 |
| 13 | Product polish | Not started | 0/8 | Nov 9 |
| 14 | Documentation and release | Not started | 0/6 | Nov 10 |

### How the order differs from the blueprint

- **Repository context comes before the dossier** (blueprint Days 7 and 6). The dossier needs the contribution-guide lookup, and two ranking signals (language and maintenance) need repository data.
- **Frontend tests start in Day 3 and CI moves before deployment** (blueprint Day 13 CI). The first deployment should be a green build.
- **Day 4 is not closed yet.** It finishes when the language signal lands in Day 6.
- **Some Day 10 and Day 12 work landed early**, with the Day 3 branch: the CI workflow, and the rate-limit, timeout and malformed-response handling.

## Definition of done

From the blueprint. Ticked only when true on the deployed product.

- [ ] A user can discover real open GitHub issues and navigate to the canonical issue URL. *(works locally; confirm on the live URL)*
- [ ] Ranking is deterministic, explainable, tested and tied to the user's profile. *(3 of 5 signals so far)*
- [ ] Closed issues are filtered appropriately and errors do not crash the application. *(closed issues are filtered and malformed responses are handled; confirm on the live URL)*
- [ ] The dossier separates verified source facts from generated or inferred guidance.
- [ ] Saved issues survive a refresh in the same browser.
- [ ] Loading, empty, failure and rate-limit states are present. *(all present, and the rate-limit message says when to retry; confirm on the live URL)*
- [ ] Backend tests, frontend tests, lint and type checks, and the production build pass in CI. *(green on PR #1 and `main`; tick at release)*
- [ ] The public deployment works without a paid AI API key.
- [ ] README includes features, screenshots, architecture, local setup, environment variables, limitations and deployment notes.
- [ ] A short demo shows the deployed product rather than only mockups.

## Day-by-day checkpoints

### Day 1: Foundation

**Status:** Done (10/10), target Oct 27  
**Blueprint:** Create repo, frontend shell, FastAPI app and /health endpoint; establish architecture notes and acceptance criteria. Run both locally and commit.

#### CP1.1 Repository and layout

- [x] Git repo with `apps/web` and `services/api`, remote on GitHub
- [x] `.gitignore` covers env files, virtual environments, caches and build output
- [x] MIT licence

#### CP1.2 Both apps run locally

- [x] Next.js app (TypeScript, Tailwind, App Router, `src/`) runs on port 3000
- [x] FastAPI app with `GET /health` runs on port 8001
- [x] Health-check test passes

#### CP1.3 Configuration and docs

- [x] `.env.example` contains no secrets; the real `.env` is untracked
- [x] GitHub token is backend-only and never in a `NEXT_PUBLIC_` variable
- [x] README and `docs/architecture.md` exist
- [x] Acceptance criteria written down in the repo (the Definition of done below)

### Day 2: UI shell

**Status:** Done (6/6), target Oct 28  
**Blueprint:** Build landing/discovery pages, filter controls, issue cards, loading/empty/error states using fixtures.

#### CP2.1 Page and layout

- [x] Landing hero and discovery section on a single page
- [x] Header, footer and a card grid

#### CP2.2 Controls and cards

- [x] Search box, language filter and task-type filter
- [x] Issue cards: repository, updated date, labels, language, task type, save button

#### CP2.3 States

- [x] Loading, empty (with "Clear all filters") and error states
- [x] Sample-data fallback that is clearly labelled ("Sample" badge and status line)

### Day 3: GitHub client

**Status:** Done (21/21), target Oct 29, completed Oct 31  
**Blueprint:** Fetch public issue data; implement pagination, timeouts, normalisation, rate-limit/error handling.

#### CP3.1 Client basics

- [x] HTTPX client with timeouts and a bounded `per_page`
- [x] Optional server-side `GITHUB_TOKEN`
- [x] Errors mapped: 429, or 403 with no quota left, becomes 503 with a clear message; other upstream errors and network failures become 502

#### CP3.2 Normalisation

- [x] Typed `Issue` model keeps GitHub fields separate from inferred ones
- [x] Normaliser skips pull requests and malformed items (logged); whole-word task-type inference
- [x] Unit tests for normalisation

#### CP3.3 Search

- [x] Real `label:"good first issue"` query instead of free text; keywords search title and body only
- [x] Language and task-type filters become GitHub qualifiers; inputs validated
- [x] Route tests with mocked GitHub: success, filters, 422s, 429, 403, 500, network failure

#### CP3.4 Pagination

- [x] "Load more" fetches the next page and appends it, skipping issues already loaded
- [x] Decide how ranking works across pages: up to 100 issues are ranked together (`/rank` limit raised from 50 to 100), and ranking only reorders within each loaded page so cards on screen stay put (D9)
- [x] Stop offering more when results run out or a page brings nothing new; the UI explains the 100-issue cap, which is reached long before GitHub's 1,000-result limit (D10)
- [x] Tests for page parameters (route validation, client clamping, merge and stop rules)

#### CP3.5 Rate limits and caching

- [x] Read `Retry-After` / `X-RateLimit-Reset` and tell the user when to retry (`Retry-After` passed through and exposed via CORS; secondary limits, 403 with `Retry-After`, caught too)
- [x] Short-lived cache for identical searches: 60 seconds, 128 entries, successful answers only, copies handed out
- [x] Tests for both

#### CP3.6 Client tests and contract validation

- [x] Capture real GitHub responses as fixtures in `tests/fixtures/` (`scripts/capture_fixtures.py`)
- [x] GitHub-client unit tests: timeouts, 403, 404, 422, 429, malformed JSON
- [x] Zod schemas validate API responses in the frontend; malformed data shows an error instead of crashing, and a single bad issue is dropped
- [x] Vitest and Testing Library installed; `npm test` runs (component tests opt into jsdom per file)
- [x] First frontend tests: profile parsing, schema validation, API client, pagination and the score breakdown

### Day 4: Ranking core

**Status:** Partial (9/11), target Oct 30 (completion: Nov 2)  
**Blueprint:** Write pure scoring functions and tests for language/task match, clarity, missing signals and deterministic ordering.

#### CP4.1 Profile

- [x] `Profile` model: languages, topics, experience, task types; input trimmed, de-duplicated and length-capped
- [ ] Decide what `experience` does: use it in scoring or remove it

#### CP4.2 Signals

- [x] Task match: 100 for a preferred type, 20 for another type, unknown when no label suggests one
- [x] Clarity: length, reproduction wording, code block, list; template headings and comments ignored
- [x] Topic match: whole-word and case-insensitive; title and labels count double
- [ ] Language match (needs repository language, built in Day 6)

#### CP4.3 Scoring

- [x] Blueprint weights: 0.30 language, 0.25 task, 0.20 clarity, 0.15 maintenance, 0.10 topics
- [x] Missing signals are left out and the remaining weights rescaled; every signal returns a reason
- [x] Deterministic order: score, then most recently updated, then lowest id

#### CP4.4 Tests and safety

- [x] Unit tests for signals, scorer, ordering and independence from input order
- [x] Body processing is bounded: linear comment stripping and a 20,000-character cap (a quadratic regex was fixed)

### Day 5: Real ranked results

**Status:** Mostly done (9/10), target Oct 31 (completion: Nov 2)  
**Blueprint:** Add /issues and /rank integration; display score breakdowns and functional filters.

#### CP5.1 API

- [x] `POST /rank`: issues plus optional profile returns ordered items with score and breakdown
- [x] Validation: at most 100 issues (was 50, raised for "Load more") and a valid profile, otherwise 422; route tests

#### CP5.2 UI

- [x] "Fit" score badge and "Why this score" breakdown with counted signals, weights and reasons
- [x] Profile panel (topics, task types) saved in localStorage; corrupted storage handled
- [x] Changing the profile re-ranks without a new GitHub request; stale responses are cancelled
- [x] Status line says which ordering is in use (clarity only, or your profile)

#### CP5.3 Verification still owed

- [x] Frontend type check (`npm run typecheck`), `npm run lint` and `npm run build` confirmed clean locally
- [ ] Manual check of the profile flow: persistence after refresh, re-ranking, API-down state; also click through "Load more"
- [x] Bug, Feature and Documentation filters confirmed to return results against live GitHub on Oct 31 (UI / UX and Testing too). Note: some UI / UX results are inferred as Bug because the bug rule is checked first
- [x] Open a pull request so CI runs once on the current code; fix whatever it reports (PR #1: the first run failed on `LayoutProps`, fixed with `next typegen`, then green)

### Day 6: Repository context and the missing signals

**Status:** Not started (0/17), target Nov 2  
**Blueprint:** Fetch repository metadata and contribution-guide links; distinguish unavailable context from inferred guidance. (Blueprint Day 7, moved earlier because the dossier and two signals need it.)

#### CP6.1 Repository metadata client

- [ ] `RepoContext` model: language, stars, last push, archived flag, topics, licence
- [ ] Fetch and normalise `GET /repos/{owner}/{repo}`, keeping verified facts separate
- [ ] 404, 403 and rate limits become "context unavailable", never a crash
- [ ] Tests with real captured fixtures

#### CP6.2 Caching and rate-limit safety

- [ ] In-memory cache with expiry, keyed by repository
- [ ] One lookup per repository per page, with limited concurrency
- [ ] Document `GITHUB_TOKEN` as practically required for deployment (20 issues can mean 20 lookups)

#### CP6.3 Signals

- [ ] Language match from repository language and profile languages
- [ ] Maintenance from last push and archived flag
- [ ] Tests including missing-data cases; breakdown labels updated

#### CP6.4 Wire it through

- [ ] `/issues` returns repository context per issue (null when unavailable)
- [ ] Cards show real language and stars instead of "Unknown" and blank
- [ ] Profile panel gets a languages field
- [ ] Decide on a topic filter using verified repository topics: include or drop

#### CP6.5 Contribution guide

- [ ] Detect the repository's contributing guide
- [ ] Result is found, not found or unknown, and is never guessed
- [ ] Tests

### Day 7: Issue dossier

**Status:** Not started (0/13), target Nov 3  
**Blueprint:** Build dossier page with canonical links, metadata and contribution checklist. (Blueprint Day 6.)

#### CP7.1 Backend

- [ ] `GET /issues/{owner}/{repo}/{number}` validates identifiers and fetches the live issue
- [ ] Closed, deleted, transferred and missing issues return clear states
- [ ] Response includes a "checked at" timestamp

#### CP7.2 Content

- [ ] Verified facts (title, state, labels, timestamps, repository, assignees, comment count) kept apart from inferred guidance
- [ ] Never says "unclaimed" or "easy" without evidence; assignees and comments shown as facts
- [ ] Score breakdown reused with its reasons
- [ ] Generic investigation checklist, labelled as generic: read the guide, set up, reproduce, inspect tests, make a focused change, run tests

#### CP7.3 Frontend

- [ ] Route `/issues/[owner]/[repo]/[number]`
- [ ] Cards link to the dossier; clear link to continue on GitHub
- [ ] Loading, not-found and error states; issue text rendered as plain text
- [ ] Save button on the dossier

#### CP7.4 Tests

- [ ] Dossier builder unit tests
- [ ] Route tests: open issue, closed issue, missing issue, no contributing guide

### Day 8: Saved shortlist

**Status:** Not started (0/7), target Nov 4  
**Blueprint:** Persist saved issues in localStorage; avoid accounts/database unless truly necessary.

#### CP8.1 Persistence

- [ ] Save a full issue snapshot and the saved time in localStorage, using the profile's safe pattern
- [ ] Validate stored data, cap the list, survive blocked or full storage

#### CP8.2 UI

- [ ] Saved list with remove, working from the snapshot
- [ ] Cross-tab sync
- [ ] "Refresh status" re-checks whether saved issues are still open and shows when
- [ ] Header count and card buttons reflect saved state after a refresh

#### CP8.3 Tests

- [ ] Storage validation, and save, remove and restore after reload

### Day 9: Evaluation

**Status:** Not started (0/6), target Nov 5  
**Blueprint:** Manually assess 30-50 real issues; document bad results, adjust weights and record limitations.

#### CP9.1 Evaluation set

- [ ] Script exports 30-50 real ranked issues across several profiles (no secrets committed)
- [ ] Each issue labelled good, okay or poor, with a reason

#### CP9.2 Analysis and tuning

- [ ] Systematic failures listed (label noise, empty templates, stale repositories, and so on)
- [ ] One change at a time to weights or rules, with before and after recorded

#### CP9.3 Documentation and guard

- [ ] `docs/ranking-evaluation.md`: method, results, limits
- [ ] Golden-ordering regression tests

### Day 10: Frontend tests and CI

**Status:** Partial (6/9), target Nov 6  
**Blueprint:** (Blueprint Day 13 CI, moved before deployment so the first deploy is a green build.)

#### CP10.1 Frontend tests

- [ ] Component tests: profile panel, score breakdown, discovery states (loading, empty, error, rate limit) with mocked fetch *(score breakdown done)*
- [ ] Dossier and saved-list tests

#### CP10.2 CI

- [x] Workflow in `.github/workflows/ci.yml`: runs on pull requests and pushes to `main`, uses the lockfiles
- [x] Backend job: `uv sync --locked` (stricter than `--frozen`: it also fails if the lockfile is stale), ruff check and format check, pytest with coverage (`--cov=api`, 99% on Oct 31)
- [x] Frontend job: `npm ci`, lint, `npm run typecheck` (`next typegen` then `tsc --noEmit`), tests, build
- [x] Green on a pull request and on `main` (PR #1 and its merge, Oct 31)

#### CP10.3 Hygiene

- [x] Stop tracking the generated `next-env.d.ts` (ignored; `next typegen` recreates it)
- [x] Confirm `.gitattributes` (`* text=auto eol=lf`) is committed
- [ ] Branch-and-pull-request habit; optionally require CI on `main`

### Day 11: First deployment

**Status:** Not started (0/8), target Nov 7  
**Blueprint:** Deploy frontend to Vercel and API to Render; verify end-to-end flow and environment configuration. (Blueprint Day 10.)

#### CP11.1 API on Render

- [ ] Build `uv sync --frozen`; start `uv run uvicorn api.main:app --host 0.0.0.0 --port $PORT` (the blueprint says `app.main:app`, our package is `api`)
- [ ] Environment: allowed origin set to the frontend URL; `GITHUB_TOKEN` server-side only
- [ ] `/health` and `/issues` work on the public URL

#### CP11.2 Frontend on Vercel

- [ ] Root directory `apps/web`; `NEXT_PUBLIC_API_BASE_URL` set to the API URL
- [ ] Production requests go to the API, not localhost; no secret in any `NEXT_PUBLIC_` variable

#### CP11.3 Smoke test

- [ ] Fresh browser: discover, rank, and the profile and saved list persist
- [ ] Cold start (free tier sleeps): friendly loading message and a labelled sample fallback
- [ ] CORS verified; works without any AI key

### Day 12: Failure cases

**Status:** Partial (3/8), target Nov 8  
**Blueprint:** Test closed/deleted issues, malformed input, timeouts, rate limits, empty results and API downtime. (Blueprint Day 11.)

#### CP12.1 GitHub failures

- [x] Rate-limit state shows when to retry (API message tested; the frontend shows the API's message)
- [x] Timeouts and upstream 5xx produce clear messages (504 for timeouts, 502 for errors and unreadable responses)
- [ ] Empty results state

#### CP12.2 Bad input and stale data

- [ ] Malformed or oversized input rejected cleanly, with 422s handled in the UI
- [ ] Closed and deleted issues handled in the dossier and shortlist
- [x] Malformed API responses handled (Zod in the frontend, `GitHubResponseError` in the API)

#### CP12.3 Downtime

- [ ] Friendly message instead of "Failed to fetch"
- [ ] A test for every failure path above

### Day 13: Product polish

**Status:** Not started (0/8), target Nov 9  
**Blueprint:** Improve responsive layout, keyboard accessibility, typography, feedback states and interaction details. (Blueprint Day 12.)

#### CP13.1 Structure and decisions

- [ ] Split `page.tsx` into `components/` and `features/`
- [ ] Decide: separate `/discover` route or the current single page
- [ ] Decide: adopt or drop TanStack Query, shadcn/ui and lucide-react, and make the docs match

#### CP13.2 Responsive and accessible

- [ ] Mobile layout checked at about 375 px
- [ ] Keyboard navigation, visible focus, labels, and `details`/`summary` behaviour
- [ ] Contrast and reduced-motion check

#### CP13.3 Visual details

- [ ] Use the loaded Geist font and settle dark mode
- [ ] Page titles, metadata and favicon

### Day 14: Documentation and release

**Status:** Not started (0/6), target Nov 10  
**Blueprint:** Run release gate, verify live URL, record demo, document known limitations and create a release tag if desired. (Blueprint Days 13 and 14.)

#### CP14.1 Docs

- [ ] README: features, screenshots, architecture diagram, local setup, environment variables, limitations, deployment notes
- [ ] `docs/architecture.md` matches the code, and the README claims only what exists

#### CP14.2 Release gate

- [ ] Every item in the Definition of done passes on the live URL
- [ ] CI green on `main`; third-party Actions pinned to commit SHAs

#### CP14.3 Ship

- [ ] 2-3 minute demo of the deployed app
- [ ] Tag `v0.1.0` with the known limitations written down

## Decisions and deliberate differences

| # | Item | State | Reason or next step |
| --- | --- | --- | --- |
| D1 | Separate `/discover` route (blueprint structure) | Open | Currently one page; decide on Day 13 |
| D2 | TanStack Query, shadcn/ui, lucide-react | Open | Not installed; the UI uses hand-written state and Tailwind. Adopt or drop on Day 13 |
| D3 | `experience` field in the profile | Open | Stored but unused; decide in CP4.1 |
| D4 | Topic filter from repository topics | Open | Decide in CP6.4 |
| D5 | Score breakdown shape | Decided | A list of signals with weight and reason, richer than the blueprint's flat object |
| D6 | Ports and package name | Decided | API on port 8001; Python package `api` under `src/`. The blueprint's `app.main:app` and port 8000 do not apply |
| D7 | Optional LLM adapter | Out of scope | Optional and off by default in the blueprint; the product must work without an AI key |
| D8 | `GET /saved` endpoint | Out of scope | The blueprint keeps saved issues in localStorage |
| D9 | Ranking across pages | Decided | All loaded issues (up to 100) are ranked together, but ranking only reorders within each page, so cards already on screen never move. Trade-off: a strong match on page 2 stays below page 1 |
| D10 | 100-issue cap | Decided | Keeps the `/rank` request bounded and is far below GitHub's 1,000-result limit, so the UI explains the cap rather than GitHub's limit |

## Known limitations right now

- Scores use 3 of 5 signals; language and maintenance are unavailable until Day 6.
- At most 100 issues load per search ("Load more", 20 at a time).
- Task type comes from labels, which are inconsistent.
- Cards show a language only when a language filter is selected, and no star counts yet.
- The saved list is in memory only and is lost on refresh.
- The search cache is per process: it is lost on restart and not shared between server instances.

## If time runs short

Cut in this order, and record each cut under Decisions: the shortlist's "Refresh status" (CP8.2), the `page.tsx` split (CP13.1), dark mode (CP13.3). Do not cut the evaluation (Day 9): it is what makes the ranking credible.
