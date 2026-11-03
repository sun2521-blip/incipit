"""Small ASGI middlewares that protect the public API.

Plain ASGI rather than BaseHTTPMiddleware, so the body limit can count bytes
as they arrive and nothing buffers a whole oversized request.
"""

import json
import math
import time
from collections import deque
from collections.abc import Callable

from starlette.types import ASGIApp, Message, Receive, Scope, Send

# Swagger UI and ReDoc load scripts and styles, so they get no strict CSP.
_DOCS_PATHS = ("/docs", "/redoc")

_SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
]
_JSON_CSP = (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'")


async def _send_json(send: Send, status: int, detail: str, headers=()) -> None:
    body = json.dumps({"detail": detail}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
                *headers,
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


class SecurityHeadersMiddleware:
    """Add defensive headers to every response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        extra = list(_SECURITY_HEADERS)
        if not scope["path"].startswith(_DOCS_PATHS):
            extra.append(_JSON_CSP)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                message["headers"] = [*message.get("headers", []), *extra]
            await send(message)

        await self.app(scope, receive, send_with_headers)


class _BodyTooLarge(Exception):
    pass


class BodySizeLimitMiddleware:
    """Refuse request bodies over `max_bytes` with 413, without reading them all."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and (
            not declared.isdigit() or int(declared) > self.max_bytes
        ):
            await _send_json(send, 413, "The request body is too large.")
            return

        # The declared length can be missing (chunked) or wrong, so count too.
        # FastAPI turns errors raised while reading a body into its own 400, so
        # the 413 is sent from here, and whatever the app answers is dropped.
        received = 0
        response_started = False
        refused = False

        async def counting_receive() -> Message:
            nonlocal received, refused
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    if not response_started and not refused:
                        refused = True
                        await _send_json(send, 413, "The request body is too large.")
                    raise _BodyTooLarge
            return message

        async def guarded_send(message: Message) -> None:
            nonlocal response_started
            if refused:
                return
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, counting_receive, guarded_send)
        except _BodyTooLarge:
            pass  # already answered with 413


def client_address(scope: Scope, trusted_hops: int) -> str | None:
    """The visitor's address, or None to keep the connection's own.

    Each proxy appends the address it saw to X-Forwarded-For, but keeps whatever
    the visitor sent in front of it. So only the last `trusted_hops` entries come
    from proxies we trust, and the first of those is the visitor. A header too
    short to have passed through them all is ignored.
    """
    if trusted_hops < 1:
        return None
    entries = [
        entry.strip()
        for name, value in scope.get("headers", [])
        if name == b"x-forwarded-for"
        for entry in value.decode("latin-1").split(",")
        if entry.strip()
    ]
    return entries[-trusted_hops] if len(entries) >= trusted_hops else None


class ClientAddressMiddleware:
    """Put the visitor's real address in `scope["client"]` before anything reads it.

    uvicorn's own proxy support takes the first X-Forwarded-For entry, which the
    visitor controls; with it, a made-up header bought a fresh rate limit.
    """

    def __init__(self, app: ASGIApp, trusted_hops: int) -> None:
        self.app = app
        self.trusted_hops = trusted_hops

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            address = client_address(scope, self.trusted_hops)
            if address is not None:
                # In place, so uvicorn's access log shows the same address.
                scope["client"] = (address, 0)
        await self.app(scope, receive, send)


class RateLimiter:
    """Sliding-window limit: at most `limit` hits per `window` seconds per key.

    In memory and per process: it resets on restart and is not shared between
    instances. Keys are visitor addresses from ClientAddressMiddleware.
    """

    def __init__(
        self,
        limit: int,
        window: float = 60.0,
        *,
        max_keys: int = 10_000,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.limit = limit
        self.window = window
        self.max_keys = max_keys
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}

    def hit(self, key: str) -> float | None:
        """Record a hit. Returns None if allowed, else seconds until a slot frees."""
        now = self._clock()
        hits = self._hits.get(key)
        if hits is None:
            if len(self._hits) >= self.max_keys:
                self._sweep(now)
            hits = self._hits.setdefault(key, deque())

        while hits and hits[0] <= now - self.window:
            hits.popleft()

        if len(hits) >= self.limit:
            # With a limit of 0 nothing is ever allowed: wait a whole window.
            return hits[0] + self.window - now if hits else self.window

        hits.append(now)
        return None

    def reset(self) -> None:
        self._hits.clear()

    def _sweep(self, now: float) -> None:
        """Forget clients with no recent hits; if that is not enough, start over."""
        stale = [
            k for k, v in self._hits.items() if not v or v[-1] <= now - self.window
        ]
        for key in stale:
            del self._hits[key]
        if len(self._hits) >= self.max_keys:
            self._hits.clear()


class RateLimitMiddleware:
    """Apply a RateLimiter to requests whose path starts with one of `prefixes`."""

    def __init__(
        self, app: ASGIApp, limiter: RateLimiter, prefixes: tuple[str, ...]
    ) -> None:
        self.app = app
        self.limiter = limiter
        self.prefixes = prefixes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] == "OPTIONS"  # CORS preflights are free
            or not scope["path"].startswith(self.prefixes)
        ):
            await self.app(scope, receive, send)
            return

        client = scope.get("client")
        wait = self.limiter.hit(client[0] if client else "unknown")
        if wait is None:
            await self.app(scope, receive, send)
            return

        seconds = max(1, math.ceil(wait))
        await _send_json(
            send,
            429,
            f"Too many requests. Try again in {seconds} seconds.",
            headers=[(b"retry-after", str(seconds).encode())],
        )
