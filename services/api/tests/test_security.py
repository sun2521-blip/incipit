import pytest
from fastapi.testclient import TestClient

from api.main import app, github_limiter, rank_limiter
from api.security import RateLimiter
from api.settings import settings

client = TestClient(app)


# ---- headers ------------------------------------------------------------------


def test_every_response_carries_security_headers():
    response = client.get("/health")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "default-src 'none'" in response.headers["content-security-policy"]


def test_api_docs_still_load_without_the_strict_policy():
    response = client.get("/docs")

    assert response.status_code == 200
    assert "content-security-policy" not in response.headers
    assert response.headers["x-content-type-options"] == "nosniff"


def test_error_responses_carry_security_headers_too():
    response = client.get("/no-such-route")

    assert response.status_code == 404
    assert response.headers["x-content-type-options"] == "nosniff"


# ---- body size ----------------------------------------------------------------


def test_oversized_body_is_refused_with_413():
    body = b"x" * (settings.max_request_bytes + 1)

    response = client.post(
        "/rank", content=body, headers={"content-type": "application/json"}
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "The request body is too large."}


def test_oversized_body_without_a_declared_length_is_refused():
    def chunks():
        chunk = b" " * 1024 * 1024
        for _ in range(settings.max_request_bytes // len(chunk) + 2):
            yield chunk

    response = client.post(
        "/rank", content=chunks(), headers={"content-type": "application/json"}
    )

    assert response.status_code == 413


def test_bogus_content_length_is_refused():
    response = client.post("/rank", content=b"{}", headers={"content-length": "lots"})

    assert response.status_code in (400, 413)


def test_normal_bodies_pass():
    assert client.post("/rank", json={"issues": []}).status_code == 200


# ---- rate limiting --------------------------------------------------------------


def test_limiter_allows_up_to_the_limit_then_says_how_long_to_wait():
    now = [0.0]
    limiter = RateLimiter(3, window=60, clock=lambda: now[0])

    assert [limiter.hit("a") for _ in range(3)] == [None, None, None]
    now[0] = 10
    assert limiter.hit("a") == pytest.approx(50)


def test_limiter_window_slides():
    now = [0.0]
    limiter = RateLimiter(2, window=60, clock=lambda: now[0])
    limiter.hit("a")
    now[0] = 30
    limiter.hit("a")

    now[0] = 60  # the first hit has left the window
    assert limiter.hit("a") is None
    assert limiter.hit("a") is not None


def test_limiter_keeps_clients_apart():
    limiter = RateLimiter(1)

    assert limiter.hit("a") is None
    assert limiter.hit("b") is None
    assert limiter.hit("a") is not None


def test_limiter_memory_stays_bounded():
    now = [0.0]
    limiter = RateLimiter(5, window=60, max_keys=10, clock=lambda: now[0])
    for i in range(10):
        limiter.hit(f"old-{i}")

    now[0] = 120  # all of those are stale now
    limiter.hit("new")

    assert len(limiter._hits) == 1


def test_route_answers_429_with_retry_after(monkeypatch):
    monkeypatch.setattr(rank_limiter, "limit", 2)

    statuses = [client.post("/rank", json={"issues": []}).status_code for _ in range(3)]

    assert statuses == [200, 200, 429]
    response = client.post("/rank", json={})
    assert int(response.headers["retry-after"]) >= 1
    assert "Too many requests" in response.json()["detail"]


def test_429_is_readable_by_the_allowed_frontend(monkeypatch):
    monkeypatch.setattr(rank_limiter, "limit", 0)
    origin = settings.cors_origins[0]

    response = client.post("/rank", json={}, headers={"Origin": origin})

    assert response.status_code == 429
    assert response.headers["access-control-allow-origin"] == origin


def test_preflights_and_health_are_never_limited(monkeypatch):
    monkeypatch.setattr(github_limiter, "limit", 0)
    monkeypatch.setattr(rank_limiter, "limit", 0)
    origin = settings.cors_origins[0]

    preflight = client.options(
        "/rank",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )

    assert preflight.status_code == 200
    assert client.get("/health").status_code == 200


def test_github_routes_have_their_own_budget(monkeypatch):
    monkeypatch.setattr(github_limiter, "limit", 0)

    assert client.get("/issues/a/b/1").status_code == 429
    assert client.post("/rank", json={"issues": []}).status_code == 200


def test_limiter_with_a_zero_limit_blocks_without_crashing():
    assert RateLimiter(0).hit("a") == pytest.approx(60)
