import asyncio

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from api.main import app, github_limiter, rank_limiter
from api.security import ClientAddressMiddleware, RateLimiter, client_address
from api.settings import Settings, settings

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


# ---- the visitor's address ------------------------------------------------------


def scope_with(*forwarded: str, client=("10.0.0.9", 1234)):
    headers = [(b"x-forwarded-for", value.encode()) for value in forwarded]
    return {"type": "http", "headers": headers, "client": client}


@pytest.mark.parametrize(
    ("forwarded", "hops", "expected"),
    [
        # No trusted proxies: the header is ignored, whatever it says.
        (["203.0.113.7"], 0, None),
        # One proxy: its entry, the last one, is the visitor.
        (["198.51.100.4"], 1, "198.51.100.4"),
        # A visitor's made-up entries sit in front of the proxy's.
        (["203.0.113.7, 198.51.100.4"], 1, "198.51.100.4"),
        (["1.1.1.1, 2.2.2.2, 198.51.100.4"], 1, "198.51.100.4"),
        # Two proxies: the first of the last two.
        (["203.0.113.7, 198.51.100.4, 10.1.2.3"], 2, "198.51.100.4"),
        # Repeated headers read as one list, in order.
        (["203.0.113.7", "198.51.100.4"], 1, "198.51.100.4"),
        # Too short to have passed through the proxies, or missing: not trusted.
        (["198.51.100.4"], 2, None),
        ([], 1, None),
        ([" , "], 1, None),
    ],
)
def test_client_address_trusts_only_what_the_proxies_added(forwarded, hops, expected):
    assert client_address(scope_with(*forwarded), hops) == expected


def seen_client(trusted_hops: int, *forwarded: str):
    seen = {}

    async def app(scope, receive, send):
        seen["client"] = scope["client"]

    scope = scope_with(*forwarded)
    asyncio.run(ClientAddressMiddleware(app, trusted_hops)(scope, None, None))  # type: ignore[arg-type]
    return seen["client"]


def test_middleware_replaces_the_connection_address_with_the_visitors():
    assert seen_client(1, "203.0.113.7, 198.51.100.4") == ("198.51.100.4", 0)


def test_middleware_keeps_the_connection_address_without_a_usable_header():
    assert seen_client(1) == ("10.0.0.9", 1234)
    assert seen_client(0, "203.0.113.7") == ("10.0.0.9", 1234)


def test_a_made_up_header_no_longer_buys_a_fresh_rate_limit():
    limiter = RateLimiter(1)

    def key(*forwarded):
        return client_address(scope_with(*forwarded), 1) or "peer"

    assert limiter.hit(key("198.51.100.4")) is None
    # The same visitor, now pretending to be someone else each time.
    assert limiter.hit(key("203.0.113.7, 198.51.100.4")) is not None
    assert limiter.hit(key("203.0.113.8, 198.51.100.4")) is not None
    # A different visitor still has their own budget.
    assert limiter.hit(key("198.51.100.5")) is None


# ---- the edge proxy's address header (Cloudflare's CF-Connecting-IP) ---------------

CF = b"cf-connecting-ip"


def scope_with_headers(*headers: tuple[str, str]):
    return {
        "type": "http",
        "headers": [(name.encode(), value.encode()) for name, value in headers],
        "client": ("10.0.0.9", 1234),
    }


@pytest.mark.parametrize(
    ("headers", "expected"),
    [
        # It wins over whatever X-Forwarded-For holds.
        (
            [
                ("x-forwarded-for", "203.0.113.7, 198.51.100.4, 10.1.2.3"),
                ("cf-connecting-ip", "198.51.100.4"),
            ],
            "198.51.100.4",
        ),
        ([("cf-connecting-ip", " 2001:DB8::1 ")], "2001:db8::1"),  # tidied
        # If a visitor's copy ever slipped through, the proxy's, added last, counts.
        (
            [("cf-connecting-ip", "203.0.113.7"), ("cf-connecting-ip", "198.51.100.4")],
            "198.51.100.4",
        ),
        # Not an address, or missing: ignored, so the fallback decides (none here).
        ([("cf-connecting-ip", "not-an-ip")], None),
        ([("cf-connecting-ip", "")], None),
        ([("x-forwarded-for", "203.0.113.7")], None),
    ],
)
def test_the_address_header_wins_whenever_it_holds_an_address(headers, expected):
    assert client_address(scope_with_headers(*headers), 0, CF) == expected


def test_without_the_address_header_the_forwarded_count_still_applies():
    scope = scope_with_headers(("x-forwarded-for", "203.0.113.7, 198.51.100.4"))

    assert client_address(scope, 1, CF) == "198.51.100.4"


def test_middleware_matches_the_configured_header_in_any_case():
    seen = {}

    async def app(scope, receive, send):
        seen["client"] = scope["client"]

    scope = scope_with_headers(("cf-connecting-ip", "198.51.100.4"))
    asyncio.run(ClientAddressMiddleware(app, 0, "CF-Connecting-IP")(scope, None, None))  # type: ignore[arg-type]

    assert seen["client"] == ("198.51.100.4", 0)


def test_made_up_forwarded_headers_cannot_move_a_visitor_to_a_fresh_limit():
    limiter = RateLimiter(1)

    def key(forwarded: str):
        scope = scope_with_headers(
            ("x-forwarded-for", forwarded), ("cf-connecting-ip", "198.51.100.4")
        )
        return client_address(scope, 0, CF) or "peer"

    assert limiter.hit(key("203.0.113.7")) is None
    assert limiter.hit(key("203.0.113.8")) is not None


def test_the_address_header_setting_must_be_a_plain_header_name():
    with pytest.raises(ValidationError):
        Settings(client_ip_header="cf-connecting-ip\r\nx-evil")
