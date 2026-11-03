import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { checkSavedIssues, describeCheck } from "@/lib/check-saved";
import { snapshotOf, type CheckOutcome, type SavedIssue } from "@/lib/saved";
import type { ApiIssue } from "@/lib/schemas";

function apiIssue(id: number, state = "open"): ApiIssue {
  return {
    id,
    number: id,
    title: `Issue ${id}`,
    url: `https://github.com/example/project/issues/${id}`,
    state,
    repository: "example/project",
    labels: [],
    body: null,
    comments: 0,
    assignees: [],
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-29T08:30:00Z",
    inferred_task_type: null,
    repo_context: null,
  };
}

const items = (...ids: number[]): SavedIssue[] => ids.map((id) => snapshotOf(apiIssue(id)));

describe("checkSavedIssues", () => {
  it("checks every issue, a few at a time, and reports progress", async () => {
    let inFlight = 0;
    let most = 0;
    const progress: number[] = [];

    const { outcomes, stoppedBecause } = await checkSavedIssues(items(1, 2, 3, 4, 5, 6, 7), {
      concurrency: 3,
      onProgress: (done) => progress.push(done),
      check: async (item) => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return apiIssue(item.id);
      },
    });

    expect(outcomes.size).toBe(7);
    expect(most).toBe(3);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(stoppedBecause).toBeNull();
  });

  it("records deleted and missing issues as gone", async () => {
    const { outcomes } = await checkSavedIssues(items(1, 2), {
      check: async (item) => {
        throw new ApiError("nope", item.id === 1 ? 410 : 404);
      },
    });

    expect(outcomes.get(1)).toEqual({ kind: "gone", state: "deleted" });
    expect(outcomes.get(2)).toEqual({ kind: "gone", state: "not found" });
  });

  it("stops at a rate limit instead of asking about every remaining issue", async () => {
    const asked: number[] = [];

    const { outcomes, stoppedBecause } = await checkSavedIssues(items(1, 2, 3, 4), {
      concurrency: 1,
      check: async (item) => {
        asked.push(item.id);
        if (item.id === 2) throw new ApiError("Too many requests. Try again in 40 seconds.", 429);
        return apiIssue(item.id);
      },
    });

    expect(asked).toEqual([1, 2]);
    expect(outcomes.get(2)).toEqual({ kind: "failed" });
    expect(outcomes.has(3)).toBe(false);
    expect(stoppedBecause).toBe("Too many requests. Try again in 40 seconds.");
  });

  it("stops when the API can't be reached", async () => {
    const { stoppedBecause } = await checkSavedIssues(items(1, 2), {
      concurrency: 1,
      check: async () => {
        throw new ApiError("Couldn't reach the Incipit API.", 0);
      },
    });

    expect(stoppedBecause).toBe("Couldn't reach the Incipit API.");
  });

  it("records nothing more once cancelled", async () => {
    const controller = new AbortController();

    const { outcomes } = await checkSavedIssues(items(1, 2, 3), {
      concurrency: 1,
      signal: controller.signal,
      check: async (item) => {
        controller.abort();
        throw new DOMException(`aborted ${item.id}`, "AbortError");
      },
    });

    expect(outcomes.size).toBe(0);
  });

  it("copes with an empty shortlist", async () => {
    const { outcomes } = await checkSavedIssues([], { check: async () => apiIssue(1) });

    expect(outcomes.size).toBe(0);
  });
});

describe("describeCheck", () => {
  const found = (state: string): CheckOutcome => ({ kind: "found", issue: apiIssue(1, state) });
  const result = (outcomes: CheckOutcome[], stoppedBecause: string | null = null) => ({
    outcomes: new Map(outcomes.map((outcome, index) => [index, outcome])),
    stoppedBecause,
  });

  it("says when everything is still open", () => {
    expect(describeCheck(result([found("open")]), 1)).toBe("Checked just now: still open.");
    expect(describeCheck(result([found("open"), found("open")]), 2)).toBe(
      "Checked all 2 just now: all still open.",
    );
  });

  it("counts closed, deleted and missing issues as no longer open", () => {
    const outcomes = [found("open"), found("closed"), { kind: "gone", state: "deleted" } as const];

    expect(describeCheck(result(outcomes), 3)).toBe("Checked all 3 just now: 2 are no longer open.");
    expect(describeCheck(result([found("closed")]), 1)).toBe(
      "Checked just now: 1 is no longer open.",
    );
  });

  it("says which ones could not be checked", () => {
    expect(describeCheck(result([found("open"), { kind: "failed" }]), 2)).toBe(
      "Checked 1 of 2. 1 couldn't be checked, so it shows what was last known.",
    );
  });

  it("passes on why it stopped", () => {
    expect(describeCheck(result([found("open")], "Too many requests."), 4)).toBe(
      "Checked 1 of 4, then stopped: Too many requests.",
    );
  });
});
