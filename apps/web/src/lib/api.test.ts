import { afterEach, describe, expect, it } from "vitest";
import { ApiError, fetchDossier, fetchIssues, rankIssues } from "@/lib/api";
import type { ApiIssue } from "@/lib/schemas";

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
});

type Call = { url: string; init: RequestInit | undefined };

/** Replace fetch with a fake that records calls and answers with `respond`. */
function mockFetch(respond: () => Response): Call[] {
  const calls: Call[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return respond();
  }) as typeof fetch;

  return calls;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function apiIssue(overrides: Partial<ApiIssue> = {}): ApiIssue {
  return {
    id: 1,
    number: 1,
    title: "Fix parser crash",
    url: "https://github.com/example/project/issues/1",
    state: "open",
    repository: "example/project",
    labels: [],
    body: null,
    comments: 0,
    assignees: [],
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-29T08:30:00Z",
    inferred_task_type: null,
    repo_context: null,
    ...overrides,
  };
}

describe("fetchIssues", () => {
  it("sends only the filters that are set", async () => {
    const calls = mockFetch(() => json({ total_count: 0, items: [] }));

    await fetchIssues();
    await fetchIssues({
      query: "dark mode",
      language: "C++",
      taskType: "UI / UX",
      page: 2,
    });

    expect(calls[0].url).toBe(
      "http://localhost:8001/issues?per_page=20&page=1",
    );
    expect(calls[1].url).toBe(
      "http://localhost:8001/issues?per_page=20&page=2&query=dark+mode&language=C%2B%2B&task_type=UI+%2F+UX",
    );
  });

  it("returns validated issues", async () => {
    mockFetch(() => json({ total_count: 1, items: [apiIssue()] }));

    const result = await fetchIssues();

    expect(result.total_count).toBe(1);
    expect(result.items[0].title).toBe("Fix parser crash");
  });

  it("passes the API's error message through", async () => {
    mockFetch(() => json({ detail: "GitHub API rate limit reached." }, 503));

    await expect(fetchIssues()).rejects.toThrow(/rate limit reached/);
  });

  it("falls back to a status message when the error has no detail", async () => {
    mockFetch(() => json({ detail: [{ msg: "bad" }] }, 422));

    await expect(fetchIssues()).rejects.toThrow(/Issue search failed \(422\)/);
  });

  it("rejects a response that is not valid JSON", async () => {
    mockFetch(() => new Response("<html>oops</html>", { status: 200 }));

    await expect(fetchIssues()).rejects.toThrow(/unreadable search response/);
  });

  it("rejects a response with the wrong shape without leaking it", async () => {
    mockFetch(() => json({ secret: "do not show", items: 5 }));

    const error = await fetchIssues().catch((caught: unknown) => caught);

    expect((error as Error).message).toMatch(/unexpected search response/);
    expect((error as Error).message.includes("do not show")).toBe(false);
  });
});

describe("rankIssues", () => {
  const profile = {
    languages: [],
    topics: ["api"],
    task_types: ["Bug" as const],
  };

  it("posts the issues and profile as JSON", async () => {
    const calls = mockFetch(() => json({ items: [] }));

    await rankIssues({ issues: [apiIssue()], profile });

    expect(calls[0].url).toBe("http://localhost:8001/rank");
    expect(calls[0].init?.method).toBe("POST");
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.profile).toEqual(profile);
    expect(body.issues).toHaveLength(1);
  });

  it("sends at most 20,000 characters of each body and leaves the input alone", async () => {
    const calls = mockFetch(() => json({ items: [] }));
    const issue = apiIssue({ body: "x".repeat(50_000) });

    await rankIssues({ issues: [issue], profile });

    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.issues[0].body).toHaveLength(20_000);
    expect(issue.body).toHaveLength(50_000);
  });

  it("returns validated ranked issues", async () => {
    mockFetch(() =>
      json({
        items: [
          {
            issue: apiIssue(),
            score: 61,
            breakdown: [
              { name: "clarity", score: 61, weight: 0.2, reason: "Found: a list." },
            ],
          },
        ],
      }),
    );

    const ranked = await rankIssues({ issues: [apiIssue()], profile });

    expect(ranked[0].score).toBe(61);
  });

  it("reports API errors and malformed responses", async () => {
    mockFetch(() => json({ detail: "Ranking is down." }, 500));
    await expect(rankIssues({ issues: [], profile })).rejects.toThrow(/Ranking is down/);

    mockFetch(() => json({ nope: true }));
    await expect(rankIssues({ issues: [], profile })).rejects.toThrow(
      /unexpected ranking response/,
    );
  });
});

function dossier(overrides: Record<string, unknown> = {}) {
  return {
    checked_at: "2026-11-01T12:00:00Z",
    moved_from: null,
    issue: apiIssue(),
    contributing_guide: {
      status: "found",
      url: "https://github.com/example/project/blob/main/CONTRIBUTING.md",
    },
    guidance: {
      kind: "generic",
      note: "General steps.",
      steps: [{ title: "Read the guide", detail: "It helps.", link: null }],
    },
    ...overrides,
  };
}

describe("fetchDossier", () => {
  it("asks for the issue's address, each part encoded", async () => {
    const calls = mockFetch(() => json(dossier()));

    await fetchDossier({ owner: "example", repo: "my.repo", number: 7 });

    expect(calls[0].url).toBe("http://localhost:8001/issues/example/my.repo/7");
  });

  it("returns a validated dossier", async () => {
    mockFetch(() => json(dossier()));

    const result = await fetchDossier({ owner: "a", repo: "b", number: 1 });

    expect(result.issue.title).toBe("Fix parser crash");
    expect(result.contributing_guide.status).toBe("found");
  });

  it("reports a malformed guide as unknown instead of failing", async () => {
    mockFetch(() =>
      json(dossier({ contributing_guide: { status: "found", url: "javascript:x" } })),
    );

    const result = await fetchDossier({ owner: "a", repo: "b", number: 1 });

    expect(result.contributing_guide).toEqual({ status: "unknown", url: null });
  });

  it("drops step links that are not GitHub links", async () => {
    mockFetch(() =>
      json(
        dossier({
          guidance: {
            kind: "generic",
            note: "n",
            steps: [{ title: "t", detail: "d", link: "https://evil.example" }],
          },
        }),
      ),
    );

    const result = await fetchDossier({ owner: "a", repo: "b", number: 1 });

    expect(result.guidance.steps[0].link).toBeNull();
  });

  it("carries the API's status and message on errors", async () => {
    mockFetch(() => json({ detail: "GitHub has no issue #1 in a/b." }, 404));

    const error = await fetchDossier({ owner: "a", repo: "b", number: 1 }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: "GitHub has no issue #1 in a/b." });
  });

  it("explains an unreachable API, which may be asleep", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    const error = await fetchDossier({ owner: "a", repo: "b", number: 1 }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({ status: 0 });
    expect((error as Error).message).toMatch(/Couldn't reach the Incipit API/);
  });

  it("rejects a response that is not a dossier", async () => {
    mockFetch(() => json({ issue: "nope" }));

    await expect(
      fetchDossier({ owner: "a", repo: "b", number: 1 }),
    ).rejects.toThrow("The API returned an unexpected issue response.");
  });
});

describe("an unreachable API", () => {
  it("gives every call the same message people can act on", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    for (const call of [
      () => fetchIssues(),
      () =>
        rankIssues({
          issues: [],
          profile: { languages: [], topics: [], task_types: [] },
        }),
    ]) {
      const error = await call().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 0 });
      expect((error as Error).message).not.toContain("Failed to fetch");
    }
  });

  it("lets a cancelled request stay cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = (async () => {
      throw new DOMException("Aborted", "AbortError");
    }) as typeof fetch;

    await expect(fetchIssues({ signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
