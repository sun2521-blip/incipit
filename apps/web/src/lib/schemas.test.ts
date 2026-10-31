import { afterEach, describe, expect, it } from "vitest";
import { parseIssueSearchResponse, parseRankResponse } from "@/lib/schemas";

function rawIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    number: 42,
    title: "Add dataset validation",
    url: "https://github.com/example/project/issues/42",
    state: "open",
    repository: "example/project",
    labels: ["good first issue", "bug"],
    body: "Steps to reproduce...",
    comments: 3,
    assignees: [],
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-29T08:30:00Z",
    inferred_task_type: "Bug",
    ...overrides,
  };
}

function rawRanked(overrides: Record<string, unknown> = {}) {
  return {
    issue: rawIssue(),
    score: 72,
    breakdown: [
      { name: "clarity", score: 80, weight: 0.2, reason: "Found: a list." },
      { name: "skill_match", score: null, weight: 0.3, reason: "Not fetched." },
    ],
    ...overrides,
  };
}

const originalWarn = console.warn;

afterEach(() => {
  console.warn = originalWarn;
});

function silenceWarnings(): string[] {
  const messages: string[] = [];
  console.warn = (message: unknown) => {
    messages.push(String(message));
  };
  return messages;
}

describe("parseIssueSearchResponse", () => {
  it("accepts a valid response", () => {
    const result = parseIssueSearchResponse({
      total_count: 1,
      items: [rawIssue()],
    });

    expect(result.total_count).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].repository).toBe("example/project");
  });

  it("drops a single malformed issue and keeps the rest", () => {
    const warnings = silenceWarnings();

    const result = parseIssueSearchResponse({
      total_count: 3,
      items: [rawIssue({ id: 1 }), { id: 2 }, rawIssue({ id: 3 })],
    });

    expect(result.items.map((issue) => issue.id)).toEqual([1, 3]);
    expect(warnings).toHaveLength(1);
  });

  it("rejects issue links that are not GitHub URLs", () => {
    silenceWarnings();

    const result = parseIssueSearchResponse({
      total_count: 2,
      items: [
        rawIssue({ id: 1, url: "javascript:alert(1)" }),
        rawIssue({ id: 2, url: "https://evil.example/issues/2" }),
      ],
    });

    expect(result.items).toEqual([]);
  });

  it("treats an unknown task type as no task type", () => {
    const result = parseIssueSearchResponse({
      total_count: 1,
      items: [rawIssue({ inferred_task_type: "Gardening" })],
    });

    expect(result.items[0].inferred_task_type).toBeNull();
  });

  it("rejects responses that are not the expected envelope", () => {
    expect(() => parseIssueSearchResponse(null)).toThrow();
    expect(() => parseIssueSearchResponse([])).toThrow();
    expect(() => parseIssueSearchResponse({ items: [] })).toThrow();
    expect(() =>
      parseIssueSearchResponse({ total_count: "1", items: [] }),
    ).toThrow();
    expect(() =>
      parseIssueSearchResponse({ total_count: 1, items: "nope" }),
    ).toThrow();
  });
});

describe("parseRankResponse", () => {
  it("accepts ranked issues with unavailable signals", () => {
    const ranked = parseRankResponse({ items: [rawRanked()] });

    expect(ranked).toHaveLength(1);
    expect(ranked[0].score).toBe(72);
    expect(ranked[0].breakdown[1].score).toBeNull();
  });

  it("drops entries with an out-of-range score", () => {
    silenceWarnings();

    const ranked = parseRankResponse({
      items: [rawRanked({ score: 150 }), rawRanked({ score: 50 })],
    });

    expect(ranked.map((entry) => entry.score)).toEqual([50]);
  });

  it("rejects a response without an items list", () => {
    expect(() => parseRankResponse({})).toThrow();
    expect(() => parseRankResponse("nope")).toThrow();
  });
});
