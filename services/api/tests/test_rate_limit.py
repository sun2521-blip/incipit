import pytest

from api.rate_limit import describe_wait, is_rate_limited, retry_after_seconds


@pytest.mark.parametrize(
    ("status", "headers", "expected"),
    [
        (429, {}, True),
        (403, {"X-RateLimit-Remaining": "0"}, True),
        (403, {"x-ratelimit-remaining": "0"}, True),  # header case is irrelevant
        (403, {"Retry-After": "60"}, True),  # secondary rate limit
        (403, {"X-RateLimit-Remaining": "12"}, False),  # forbidden, not limited
        (403, {}, False),
        (404, {"X-RateLimit-Remaining": "0"}, False),
        (500, {}, False),
        (200, {}, False),
    ],
)
def test_is_rate_limited(status, headers, expected):
    assert is_rate_limited(status, headers) is expected


@pytest.mark.parametrize(
    ("headers", "expected"),
    [
        ({"Retry-After": "90"}, 90),
        ({"retry-after": "0"}, 0),
        ({"X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "1100"}, 100),
        # Retry-After wins over the reset time
        (
            {
                "Retry-After": "30",
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": "1100",
            },
            30,
        ),
        # reset already in the past: wait nothing
        ({"X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "900"}, 0),
        # quota remains, so the reset time says nothing about waiting
        ({"X-RateLimit-Remaining": "5", "X-RateLimit-Reset": "1100"}, None),
        ({}, None),
        ({"Retry-After": "soon"}, None),  # not a number
        ({"X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "later"}, None),
        ({"Retry-After": "-5"}, 0),
        ({"Retry-After": "999999999"}, 24 * 60 * 60),  # capped
    ],
)
def test_retry_after_seconds(headers, expected):
    assert retry_after_seconds(headers, now=1000) == expected


@pytest.mark.parametrize(
    ("seconds", "expected"),
    [
        (0, "less than a minute"),
        (59, "less than a minute"),
        (60, "about 1 minute"),
        (61, "about 2 minutes"),
        (300, "about 5 minutes"),
        (3540, "about 59 minutes"),
        (3600, "about 1 hour"),
        (3601, "about 2 hours"),
        (7200, "about 2 hours"),
    ],
)
def test_describe_wait(seconds, expected):
    assert describe_wait(seconds) == expected
