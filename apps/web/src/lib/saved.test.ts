import { describe, expect, it } from "vitest";
import {
  addSaved,
  MAX_SAVED,
  parseSaved,
  removeSaved,
  snapshotOf,
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
