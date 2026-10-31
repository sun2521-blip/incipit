"""Check the normaliser against a real GitHub response.

Skipped until you capture one:  uv run python scripts/capture_fixtures.py
"""

import json
import re
from pathlib import Path

import pytest

from api.normalise import normalise_search_response

FIXTURE = Path(__file__).parent / "fixtures" / "search_issues.json"


@pytest.mark.skipif(
    not FIXTURE.exists(),
    reason="run scripts/capture_fixtures.py to capture a real response",
)
def test_normaliser_handles_a_real_github_response():
    raw = json.loads(FIXTURE.read_text(encoding="utf-8"))
    real_issues = [item for item in raw["items"] if "pull_request" not in item]

    result = normalise_search_response(raw)

    assert real_issues, "the fixture should contain at least one issue"
    assert len(result.items) == len(real_issues)
    for issue in result.items:
        assert re.fullmatch(r"[^/]+/[^/]+", issue.repository)
        assert issue.url.startswith("https://github.com/")
        assert issue.state == "open"
        assert "good first issue" in [label.lower() for label in issue.labels]
