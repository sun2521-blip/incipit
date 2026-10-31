import { afterEach, describe, expect, it } from "vitest";
import { fetchIssues, rankIssues } from "@/lib/api";
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
  const profile = { topics: ["api"], task_types: ["Bug" as const] };

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
