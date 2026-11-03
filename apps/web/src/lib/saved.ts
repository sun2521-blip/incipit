import { z } from "zod";
import { ApiError } from "@/lib/api";
import { dossierPath } from "@/lib/issue-path";
import { githubUrl, type ApiIssue } from "@/lib/schemas";

/** The most issues the shortlist keeps; older ones drop off the end. */
export const MAX_SAVED = 100;

/**
 * What the shortlist keeps about an issue: a snapshot, so the list works
 * offline and after the issue changes. `state` is as last seen: when it was
 * saved, or at `checkedAt` once "Refresh status" has asked GitHub.
 */
const savedIssueSchema = z.object({
  id: z.number().int(),
  number: z.number().int().positive(),
  title: z.string().max(500),
  repository: z.string().max(141),
  url: githubUrl,
  // GitHub's "open" or "closed", or Incipit's "deleted" or "not found".
  state: z.string().max(20),
  savedAt: z.string().max(40),
  checkedAt: z.string().max(40).optional(),
});

export type SavedIssue = z.infer<typeof savedIssueSchema>;

export function snapshotOf(issue: ApiIssue, now: Date = new Date()): SavedIssue {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title.slice(0, 500),
    repository: issue.repository,
    url: issue.url,
    state: issue.state,
    savedAt: now.toISOString(),
  };
}

/**
 * Read the shortlist back from localStorage. Anything stored there can be
 * missing, corrupted or edited by hand: bad entries and duplicates are dropped,
 * and an entry must still point at a valid dossier.
 */
export function parseSaved(raw: string): SavedIssue[] {
  if (!raw) return [];

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const seen = new Set<number>();
  const saved: SavedIssue[] = [];

  for (const entry of data) {
    const parsed = savedIssueSchema.safeParse(entry);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    if (!dossierPath(parsed.data.repository, parsed.data.number)) continue;

    seen.add(parsed.data.id);
    saved.push(parsed.data);
    if (saved.length === MAX_SAVED) break;
  }

  return saved;
}

/** Newest first; saving again moves it to the front. */
export function addSaved(list: SavedIssue[], issue: SavedIssue): SavedIssue[] {
  return [issue, ...list.filter((item) => item.id !== issue.id)].slice(
    0,
    MAX_SAVED,
  );
}

export function removeSaved(list: SavedIssue[], id: number): SavedIssue[] {
  return list.filter((item) => item.id !== id);
}

/** What asking GitHub about one saved issue found. */
export type CheckOutcome =
  | { kind: "found"; issue: ApiIssue }
  | { kind: "gone"; state: "deleted" | "not found" }
  | { kind: "failed" };

/** The answer behind a failed check: gone for good, or just not checked. */
export function outcomeOfError(error: unknown): CheckOutcome {
  if (error instanceof ApiError && error.status === 410) {
    return { kind: "gone", state: "deleted" };
  }
  if (error instanceof ApiError && error.status === 404) {
    return { kind: "gone", state: "not found" };
  }
  return { kind: "failed" };
}

/**
 * Fold fresh checks into the shortlist. A found issue takes GitHub's current
 * title, state and, if it was transferred, its new address; a gone one keeps
 * its snapshot with the new state; a failed check changes nothing. The saved
 * time and order always stay.
 */
export function applyChecks(
  list: SavedIssue[],
  outcomes: Map<number, CheckOutcome>,
  now: Date = new Date(),
): SavedIssue[] {
  const checkedAt = now.toISOString();
  const seen = new Set<number>();
  const next: SavedIssue[] = [];

  for (const item of list) {
    const outcome = outcomes.get(item.id);
    let updated = item;
    if (outcome?.kind === "found") {
      updated = { ...snapshotOf(outcome.issue), savedAt: item.savedAt, checkedAt };
    } else if (outcome?.kind === "gone") {
      updated = { ...item, state: outcome.state, checkedAt };
    }
    // A transferred issue can turn out to be one that is already saved.
    if (seen.has(updated.id)) continue;
    seen.add(updated.id);
    next.push(updated);
  }

  return next;
}
