# incipit.

open source is cool until you spend 3 hours looking for one issue you can actually solve. incipit helps you find your starting point, minus the existential crisis.

## What is Incipit?

Incipit is an open-source contribution navigator that helps developers discover public GitHub issues suited to their skills and interests.

The goal is to make finding a meaningful first contribution less overwhelming through searchable issues, explainable matching, and a personal shortlist.

**Current status:** Early MVP. Discovery shows live open GitHub issues labelled `good first issue`, with language and task-type filters, "Load more" pagination, and a transparent fit score you can expand to see why. Cards show each repository's main language and stars, and the score uses all five signals, including language match and repository activity. If the API is unreachable, the page falls back to clearly labelled sample issues. The issue dossier and a shortlist that survives a refresh are still to come; see [docs/checkpoints.md](docs/checkpoints.md) for the roadmap.

## Tech stack

- **Frontend:** Next.js, TypeScript, Tailwind CSS
- **Backend:** FastAPI, Python, HTTPX, Pydantic Settings
- **Testing:** Vitest + Testing Library, pytest
- **CI:** GitHub Actions (lint, type checks, tests and build on every pull request)
- **Deployment:** Vercel (frontend), Render (backend)

## Getting started

### Prerequisites

- Node.js and npm
- Python 3.12+
- [uv](https://docs.astral.sh/uv/)

### 1. Start the backend

Open a terminal at the repository root:

```bash
cd services/api
uv sync
uv run uvicorn api.main:app --reload --port 8001
```

Backend health check: http://localhost:8001/health

Interactive API docs: http://localhost:8001/docs

### 2. Start the frontend

Open a **second terminal** at the repository root:

```bash
cd apps/web
npm install
```

Create `apps/web/.env.local` with:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
```

Then start Next.js:

```bash
npm run dev
```

Frontend: http://localhost:3000

## Environment variables

See the root `.env.example` for the environment variables used across the project. Keep real credentials in local environment files; never commit secrets.

`GITHUB_TOKEN` is optional for trying Incipit locally, but practically required for a deployment. Each page of results also looks up every repository on it, up to 20 extra GitHub calls, and without a token GitHub allows only 60 calls an hour (5,000 with one). Repository details are cached for 30 minutes. A fine-grained token with no extra permissions (read-only access to public repositories) is enough. It stays on the backend and is never sent to the browser.

## Project structure

```text
apps/
  web/       Next.js frontend
services/
  api/       FastAPI backend
docs/        Architecture, roadmap and project documentation
```

## Project principles

- Core discovery and matching should work without a paid AI service.
- Matching should be explainable rather than presented as a probability of success.
- Public GitHub issue metadata should be handled transparently.
- Deployment should use free tiers wherever practical.

## License

MIT