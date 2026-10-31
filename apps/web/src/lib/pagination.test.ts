import { describe, expect, it } from "vitest";
import {
  canLoadMore,
  MAX_LOADED_ISSUES,
  mergeIssues,
  orderWithinPages,
} from "@/lib/pagination";
import type { ApiIssue, RankedIssue } from "@/lib/schemas";

function issue(id: number): ApiIssue {
  return {
    id,
    number: id,
    title: `Issue ${id}`,
    url: `https://github.com/example/project/issues/${id}`,
    state: "open",
    repository: "example/project",
    labels: [],
    body: null,
    comments: 0,
    assignees: [],
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-29T08:30:00Z",
    inferred_task_type: null,
  };
}

describe("mergeIssues", () => {
  it("appends new issues in order", () => {
    const merged = mergeIssues([issue(1), issue(2)], [issue(3), issue(4)]);

    expect(merged.map((item) => item.id)).toEqual([1, 2, 3, 4]);
  });

  it("skips issues that are already loaded", () => {
    // Issues can move between pages when GitHub's ordering changes.
    const merged = mergeIssues([issue(1), issue(2)], [issue(2), issue(3)]);

    expect(merged.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it("skips duplicates inside the incoming page too", () => {
    const merged = mergeIssues([], [issue(1), issue(1)]);

    expect(merged).toHaveLength(1);
  });

  it("never returns more than the limit", () => {
    const existing = Array.from({ length: 95 }, (_, i) => issue(i + 1));
    const incoming = Array.from({ length: 20 }, (_, i) => issue(i + 200));

    expect(mergeIssues(existing, incoming)).toHaveLength(MAX_LOADED_ISSUES);
    expect(mergeIssues(existing, incoming, 96)).toHaveLength(96);
  });

  it("does not change its inputs", () => {
    const existing = [issue(1)];

    mergeIssues(existing, [issue(2)]);

    expect(existing).toHaveLength(1);
  });
});

describe("canLoadMore", () => {
  it("is true while there are more results and room for them", () => {
    expect(canLoadMore({ loaded: 20, total: 500, exhausted: false })).toBe(true);
  });

  it("is false once every result is loaded", () => {
    expect(canLoadMore({ loaded: 35, total: 35, exhausted: false })).toBe(false);
  });

  it("is false at the on-screen limit, however many results exist", () => {
    expect(
      canLoadMore({ loaded: MAX_LOADED_ISSUES, total: 5000, exhausted: false }),
    ).toBe(false);
  });

  it("is false once a page came back with nothing new", () => {
    expect(canLoadMore({ loaded: 20, total: 500, exhausted: true })).toBe(false);
  });
});

function rankedAs(...ids: number[]): RankedIssue[] {
  return ids.map((id) => ({ issue: issue(id), score: 50, breakdown: [] }));
}

function idsOf(entries: { issue: ApiIssue }[]): number[] {
  return entries.map((entry) => entry.issue.id);
}

describe("orderWithinPages", () => {
  const items = [1, 2, 3, 4, 5].map(issue);

  it("sorts a single page by rank", () => {
    expect(idsOf(orderWithinPages(items, [0], rankedAs(3, 1, 5, 2, 4)))).toEqual(
      [3, 1, 5, 2, 4],
    );
  });

  it("never moves an issue into an earlier page", () => {
    // 5 and 4 rank best overall, but they arrived with the second page.
    const ordered = orderWithinPages(items, [0, 3], rankedAs(5, 4, 2, 3, 1));

    expect(idsOf(ordered)).toEqual([2, 3, 1, 5, 4]);
  });

  it("puts unranked issues last in their page, in load order", () => {
    const ordered = orderWithinPages(items, [0, 3], rankedAs(2, 1, 3));

    expect(idsOf(ordered)).toEqual([2, 1, 3, 4, 5]);
    expect(ordered[3].ranked).toBeUndefined();
  });

  it("attaches each issue's ranking", () => {
    const ordered = orderWithinPages([issue(1)], [0], rankedAs(1));

    expect(ordered[0].ranked?.score).toBe(50);
  });

  it("does not change its inputs", () => {
    const input = [issue(2), issue(1)];

    orderWithinPages(input, [0], rankedAs(1, 2));

    expect(input.map((item) => item.id)).toEqual([2, 1]);
  });
});
