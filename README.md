# incipit.

open source is cool until you spend 3 hours looking for one issue you can actually solve. incipit helps you find your starting point, minus the existential crisis.

## What is Incipit?

Incipit is an open-source contribution navigator that helps developers discover public GitHub issues suited to their skills and interests.

The goal is to make finding a meaningful first contribution less overwhelming through searchable issues, explainable matching, and a personal shortlist.

**Current status:** Early MVP. The Discovery interface currently uses sample issue data. Live GitHub discovery and ranking are still being developed.

## Tech stack

- **Frontend:** Next.js, TypeScript, Tailwind CSS
- **Backend:** FastAPI, Python, HTTPX, Pydantic Settings
- **Testing:** Vitest, pytest
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

## Project structure

```text
apps/
  web/       Next.js frontend
services/
  api/       FastAPI backend
docs/        Architecture and project documentation
```

## Project principles

- Core discovery and matching should work without a paid AI service.
- Matching should be explainable rather than presented as a probability of success.
- Public GitHub issue metadata should be handled transparently.
- Deployment should use free tiers wherever practical.

## License

MIT