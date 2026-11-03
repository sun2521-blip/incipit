import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  addSaved,
  applyChecks,
  MAX_SAVED,
  outcomeOfError,
  parseSaved,
  removeSaved,
  snapshotOf,
  type CheckOutcome,
  type SavedIssue,
} from "@/lib/saved";
import type { ApiIssue } from "@/lib/schemas";

function apiIssue(id: number): ApiIssue {
  return {
    id,
    number: id,
    title: `Issue ${id}`,
    url: `https://github.com/example/project/issues/${id}`,
    state: "open",
    repository: "example/project",
    labels: [],
    body: "A long description that is not kept in the snapshot.",
    comments: 0,
    assignees: [],
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-29T08:30:00Z",
    inferred_task_type: null,
    repo_context: null,
  };
}

const NOW = new Date("2026-11-01T12:00:00Z");

function saved(id: number): SavedIssue {
  return snapshotOf(apiIssue(id), NOW);
}

describe("snapshotOf", () => {
  it("keeps only what the shortlist needs, with the time it was saved", () => {
    expect(snapshotOf(apiIssue(7), NOW)).toEqual({
      id: 7,
      number: 7,
      title: "Issue 7",
      repository: "example/project",
      url: "https://github.com/example/project/issues/7",
      state: "open",
      savedAt: "2026-11-01T12:00:00.000Z",
    });
  });
});

describe("parseSaved", () => {
  it("round-trips a saved list", () => {
    const list = [saved(1), saved(2)];

    expect(parseSaved(JSON.stringify(list))).toEqual(list);
  });

  it.each(["", "{bad", "null", "42", '{"id":1}'])(
    "treats %j as an empty list",
    (raw) => {
      expect(parseSaved(raw)).toEqual([]);
    },
  );

  it("drops malformed entries and keeps the rest", () => {
    const raw = JSON.stringify([
      saved(1),
      { ...saved(2), url: "javascript:alert(1)" },
      { ...saved(3), repository: "example/.." },
      { ...saved(4), number: -1 },
      "nonsense",
      saved(5),
    ]);

    expect(parseSaved(raw).map((item) => item.id)).toEqual([1, 5]);
  });

  it("drops duplicates", () => {
    expect(parseSaved(JSON.stringify([saved(1), saved(1)]))).toHaveLength(1);
  });

  it("keeps at most the limit", () => {
    const list = Array.from({ length: MAX_SAVED + 20 }, (_, i) => saved(i + 1));

    expect(parseSaved(JSON.stringify(list))).toHaveLength(MAX_SAVED);
  });
});

describe("addSaved and removeSaved", () => {
  it("puts the newest first and never duplicates", () => {
    const list = addSaved(addSaved([saved(1)], saved(2)), saved(1));

    expect(list.map((item) => item.id)).toEqual([1, 2]);
  });

  it("drops the oldest past the limit", () => {
    let list: SavedIssue[] = [];
    for (let id = 1; id <= MAX_SAVED + 1; id++) list = addSaved(list, saved(id));

    expect(list).toHaveLength(MAX_SAVED);
    expect(list[0].id).toBe(MAX_SAVED + 1);
    expect(list.some((item) => item.id === 1)).toBe(false);
  });

  it("removes by id and leaves the input alone", () => {
    const list = [saved(1), saved(2)];

    expect(removeSaved(list, 1).map((item) => item.id)).toEqual([2]);
    expect(list).toHaveLength(2);
  });
});

describe("applyChecks", () => {
  const LATER = new Date("2026-11-03T09:15:00Z");

  it("takes GitHub's current state and keeps when it was saved", () => {
    const closed = { ...apiIssue(1), state: "closed", title: "Renamed on GitHub" };
    const outcomes = new Map<number, CheckOutcome>([[1, { kind: "found", issue: closed }]]);

    expect(applyChecks([saved(1)], outcomes, LATER)).toEqual([
      {
        ...saved(1),
        title: "Renamed on GitHub",
        state: "closed",
        checkedAt: "2026-11-03T09:15:00.000Z",
      },
    ]);
  });

  it("marks deleted and missing issues but keeps their snapshot", () => {
    const outcomes = new Map<number, CheckOutcome>([
      [1, { kind: "gone", state: "deleted" }],
      [2, { kind: "gone", state: "not found" }],
    ]);

    const [first, second] = applyChecks([saved(1), saved(2)], outcomes, LATER);

    expect(first).toMatchObject({ title: "Issue 1", state: "deleted" });
    expect(second).toMatchObject({ title: "Issue 2", state: "not found" });
    expect(first.checkedAt).toBe("2026-11-03T09:15:00.000Z");
  });

  it("leaves failed and unchecked issues exactly as they were", () => {
    const outcomes = new Map<number, CheckOutcome>([[1, { kind: "failed" }]]);

    expect(applyChecks([saved(1), saved(2)], outcomes, LATER)).toEqual([
      saved(1),
      saved(2),
    ]);
  });

  it("follows a transferred issue to its new address, in the same place", () => {
    const moved = { ...apiIssue(9), repository: "example/new-home" };
    const outcomes = new Map<number, CheckOutcome>([[2, { kind: "found", issue: moved }]]);

    const result = applyChecks([saved(1), saved(2), saved(3)], outcomes, LATER);

    expect(result.map((item) => item.id)).toEqual([1, 9, 3]);
    expect(result[1].repository).toBe("example/new-home");
    expect(result[1].savedAt).toBe(saved(2).savedAt);
  });

  it("never duplicates an issue that turns out to be saved already", () => {
    const outcomes = new Map<number, CheckOutcome>([[2, { kind: "found", issue: apiIssue(1) }]]);

    expect(applyChecks([saved(1), saved(2)], outcomes, LATER).map((i) => i.id)).toEqual([1]);
  });

  it("is still read back after a refresh, and older entries without a check are too", () => {
    const checked = applyChecks(
      [saved(1)],
      new Map<number, CheckOutcome>([[1, { kind: "gone", state: "deleted" }]]),
      LATER,
    );

    expect(parseSaved(JSON.stringify([...checked, saved(2)]))).toEqual([
      ...checked,
      saved(2),
    ]);
  });
});

describe("outcomeOfError", () => {
  it("reads 410 as deleted and 404 as not found", () => {
    expect(outcomeOfError(new ApiError("gone", 410))).toEqual({ kind: "gone", state: "deleted" });
    expect(outcomeOfError(new ApiError("no", 404))).toEqual({ kind: "gone", state: "not found" });
  });

  it("treats anything else as not checked, never as gone", () => {
    expect(outcomeOfError(new ApiError("busy", 503))).toEqual({ kind: "failed" });
    expect(outcomeOfError(new ApiError("asleep", 0))).toEqual({ kind: "failed" });
    expect(outcomeOfError(new Error("unreadable"))).toEqual({ kind: "failed" });
  });
});
