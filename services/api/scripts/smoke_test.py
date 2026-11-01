"""Check a running Incipit API end to end, such as a fresh deployment.

    uv run python scripts/smoke_test.py https://incipit-api.onrender.com \
        --origin https://incipit.vercel.app

It calls the real API (and so GitHub through it), and checks health, search,
an issue dossier, ranking, CORS for the web app's origin and the security
headers. Free hosting may be asleep: the first request waits up to two minutes.
Exits non-zero if any check fails.
"""

import argparse
import sys

import httpx

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"{'ok  ' if ok else 'FAIL'} {name}{f': {detail}' if detail else ''}")
    if not ok:
        failures.append(name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "api", help="API base URL, e.g. https://incipit-api.onrender.com"
    )
    parser.add_argument("--origin", help="the web app's origin, to check CORS")
    args = parser.parse_args()
    api = args.api.rstrip("/")

    with httpx.Client(timeout=30) as client:
        # A sleeping free instance can take about a minute to wake up.
        health = client.get(f"{api}/health", timeout=120)
        check("health", health.json() == {"status": "healthy"}, health.text[:80])

        headers = health.headers
        check("nosniff header", headers.get("x-content-type-options") == "nosniff")
        check("frame header", headers.get("x-frame-options") == "DENY")
        check(
            "csp header",
            "default-src 'none'" in headers.get("content-security-policy", ""),
        )

        search = client.get(f"{api}/issues", params={"per_page": 5})
        items = search.json().get("items", []) if search.is_success else []
        check(
            "search", search.is_success and len(items) > 0, f"HTTP {search.status_code}"
        )
        with_context = sum(1 for item in items if item.get("repo_context"))
        check(
            "repository context",
            with_context > 0,
            f"{with_context} of {len(items)} issues (none usually means no GITHUB_TOKEN)",
        )

        if items:
            first = items[0]
            owner, repo = first["repository"].split("/")
            dossier = client.get(f"{api}/issues/{owner}/{repo}/{first['number']}")
            body = dossier.json() if dossier.is_success else {}
            check(
                "dossier",
                dossier.is_success
                and body.get("guidance", {}).get("kind") == "generic",
                f"HTTP {dossier.status_code}",
            )

            rank = client.post(f"{api}/rank", json={"issues": items, "profile": {}})
            ranked = rank.json().get("items", []) if rank.is_success else []
            check("rank", len(ranked) == len(items), f"HTTP {rank.status_code}")

        missing = client.get(f"{api}/issues/octocat/Hello-World/999999999")
        check("missing issue is 404", missing.status_code == 404)

        if args.origin:
            cors = client.get(f"{api}/health", headers={"Origin": args.origin})
            allowed = cors.headers.get("access-control-allow-origin")
            check("cors for the web app", allowed == args.origin, f"got {allowed!r}")

            stranger = client.get(
                f"{api}/health", headers={"Origin": "https://not-incipit.example"}
            )
            check(
                "cors refuses other sites",
                "access-control-allow-origin" not in stranger.headers,
            )

    print("\nAll checks passed." if not failures else f"\n{len(failures)} failed.")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
