"""Helpers for reading GitHub's rate-limit signals from response headers."""

import time
from collections.abc import Mapping

MAX_WAIT_SECONDS = 24 * 60 * 60  # ignore absurd values from a bad header


def _lowered(headers: Mapping[str, str]) -> dict[str, str]:
    return {key.lower(): value for key, value in headers.items()}


def _to_int(value: str | None) -> int | None:
    try:
        return int(value) if value is not None else None
    except ValueError:
        return None


def is_rate_limited(status_code: int, headers: Mapping[str, str]) -> bool:
    """True when GitHub rejected the request because of a rate limit.

    GitHub signals a spent quota with 403 and X-RateLimit-Remaining: 0, and a
    secondary (abuse) limit with 403 or 429 plus a Retry-After header.
    """
    if status_code == 429:
        return True

    lowered = _lowered(headers)
    return status_code == 403 and (
        lowered.get("x-ratelimit-remaining") == "0" or "retry-after" in lowered
    )


def retry_after_seconds(
    headers: Mapping[str, str], now: float | None = None
) -> int | None:
    """How long to wait before retrying, or None when GitHub did not say."""
    lowered = _lowered(headers)

    wait = _to_int(lowered.get("retry-after"))
    if wait is None and lowered.get("x-ratelimit-remaining") == "0":
        reset_at = _to_int(lowered.get("x-ratelimit-reset"))
        if reset_at is not None:
            current = time.time() if now is None else now
            wait = reset_at - int(current)

    if wait is None:
        return None
    return min(max(wait, 0), MAX_WAIT_SECONDS)


def describe_wait(seconds: int) -> str:
    """A short human phrase for a wait time, rounded up to whole minutes."""
    if seconds < 60:
        return "less than a minute"

    minutes = -(-seconds // 60)  # ceiling division
    if minutes < 60:
        return f"about {minutes} minute{'s' if minutes != 1 else ''}"

    hours = -(-minutes // 60)
    return f"about {hours} hour{'s' if hours != 1 else ''}"
