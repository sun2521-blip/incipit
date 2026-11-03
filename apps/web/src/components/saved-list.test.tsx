// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SavedList } from "@/components/saved-list";
import { applyChecks, snapshotOf, type CheckOutcome, type SavedIssue } from "@/lib/saved";
import type { ApiIssue } from "@/lib/schemas";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function dossier(issue: ApiIssue) {
  return {
    checked_at: "2026-11-03T09:15:00Z",
    moved_from: null,
    issue,
    contributing_guide: { status: "unknown", url: null },
    guidance: { kind: "generic", note: "General advice.", steps: [] },
  };
}

/** Issue 1 is open, 2 was closed, 3 was deleted, anything else is missing. */
function mockGitHub() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const number = Number(new URL(String(input)).pathname.split("/").pop());
    if (number === 1) return json(dossier(apiIssue(1)));
    if (number === 2) return json(dossier(apiIssue(2, "closed")));
    if (number === 3) return json({ detail: "Issue #3 was deleted on GitHub." }, 410);
    return json({ detail: "No such issue." }, 404);
  }) as typeof fetch;
}

const shortlist = (...ids: number[]): SavedIssue[] => ids.map((id) => snapshotOf(apiIssue(id)));

describe("SavedList", () => {
  it("re-checks every saved issue and says what changed", async () => {
    mockGitHub();
    const onChecked = vi.fn<(outcomes: Map<number, CheckOutcome>) => void>();
    render(<SavedList saved={shortlist(1, 2, 3, 4)} onRemove={() => {}} onChecked={onChecked} />);

    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));

    expect(
      await screen.findByText("Checked all 4 just now: 3 are no longer open."),
    ).toBeTruthy();
    const outcomes = onChecked.mock.calls[0][0];
    expect(outcomes.get(1)).toMatchObject({ kind: "found", issue: { state: "open" } });
    expect(outcomes.get(2)).toMatchObject({ kind: "found", issue: { state: "closed" } });
    expect(outcomes.get(3)).toEqual({ kind: "gone", state: "deleted" });
    expect(outcomes.get(4)).toEqual({ kind: "gone", state: "not found" });
  });

  it("shows when each issue was checked, and flags the ones that are not open", () => {
    const checked = applyChecks(
      shortlist(1, 2, 3, 4),
      new Map<number, CheckOutcome>([
        [1, { kind: "found", issue: apiIssue(1) }],
        [2, { kind: "found", issue: apiIssue(2, "closed") }],
        [3, { kind: "gone", state: "deleted" }],
        [4, { kind: "gone", state: "not found" }],
      ]),
    );

    render(<SavedList saved={checked} onRemove={() => {}} onChecked={() => {}} />);

    expect(screen.getAllByText(/checked /)).toHaveLength(4);
    expect(screen.getByText("Closed on GitHub")).toBeTruthy();
    expect(screen.getByText("Deleted on GitHub")).toBeTruthy();
    expect(screen.getByText("Not found on GitHub")).toBeTruthy();
  });

  it("says plainly when the API can't be reached, and changes nothing", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    render(<SavedList saved={shortlist(1, 2)} onRemove={() => {}} onChecked={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));

    expect(await screen.findByText(/^Checked 0 of 2, then stopped: Couldn't reach/)).toBeTruthy();
    expect(screen.queryByText(/on GitHub$/)).toBeNull();
  });

  it("has nothing to refresh when the shortlist is empty", () => {
    render(<SavedList saved={[]} onRemove={() => {}} onChecked={() => {}} />);

    expect(screen.queryByRole("button", { name: "Refresh status" })).toBeNull();
  });
});
