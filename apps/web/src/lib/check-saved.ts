import { ApiError, fetchDossier } from "@/lib/api";
import { outcomeOfError, type CheckOutcome, type SavedIssue } from "@/lib/saved";
import type { ApiIssue } from "@/lib/schemas";

/** Ask GitHub, through the API, for one saved issue as it is now. */
export async function checkOnGitHub(
  item: SavedIssue,
  signal?: AbortSignal,
): Promise<ApiIssue> {
  const [owner, repo] = item.repository.split("/");
  const dossier = await fetchDossier({ owner, repo, number: item.number, signal });
  return dossier.issue;
}

// Unreachable, too many requests, or GitHub's own limit: asking about the next
// issue would fail the same way, so stop and say why.
const STOP_STATUSES = new Set([0, 429, 503]);

export type CheckResult = {
  outcomes: Map<number, CheckOutcome>;
  stoppedBecause: string | null;
};

/**
 * Check saved issues a few at a time. Each check costs the API about three
 * GitHub calls, so a long shortlist is not sent all at once.
 */
export async function checkSavedIssues(
  items: SavedIssue[],
  {
    check = checkOnGitHub,
    concurrency = 3,
    onProgress,
    signal,
  }: {
    check?: (item: SavedIssue, signal?: AbortSignal) => Promise<ApiIssue>;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<CheckResult> {
  const outcomes = new Map<number, CheckOutcome>();
  let stoppedBecause: string | null = null;
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < items.length && stoppedBecause === null && !signal?.aborted) {
      const item = items[next++];
      try {
        outcomes.set(item.id, { kind: "found", issue: await check(item, signal) });
      } catch (error) {
        if (signal?.aborted) return;
        if (error instanceof ApiError && STOP_STATUSES.has(error.status)) {
          stoppedBecause ??= error.message;
        }
        outcomes.set(item.id, outcomeOfError(error));
      }
      done += 1;
      onProgress?.(done, items.length);
    }
  }

  const workers = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return { outcomes, stoppedBecause };
}

/** One sentence on how a refresh went, for the shortlist's status line. */
export function describeCheck({ outcomes, stoppedBecause }: CheckResult, total: number) {
  const checked = [...outcomes.values()].filter((o) => o.kind !== "failed");
  const notOpen = checked.filter(
    (o) => o.kind === "gone" || o.issue.state !== "open",
  ).length;

  if (stoppedBecause) {
    return `Checked ${checked.length} of ${total}, then stopped: ${stoppedBecause}`;
  }
  if (checked.length < total) {
    const failed = total - checked.length;
    return `Checked ${checked.length} of ${total}. ${failed} couldn't be checked, so ${
      failed === 1 ? "it shows" : "they show"
    } what was last known.`;
  }
  if (notOpen === 0) {
    return total === 1
      ? "Checked just now: still open."
      : `Checked all ${total} just now: all still open.`;
  }
  const all = total === 1 ? "Checked just now" : `Checked all ${total} just now`;
  return `${all}: ${notOpen === 1 ? "1 is" : `${notOpen} are`} no longer open.`;
}
