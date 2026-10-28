
# Incipit API

The FastAPI backend for Incipit, an open-source contribution navigator.

## Local development

Install dependencies:

```bash
uv sync
```

Start the development server:

```bash
uv run uvicorn api.main:app --reload --port 8001
```

Health check: http://localhost:8001/health

API documentation: http://localhost:8001/docs
