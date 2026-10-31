import type { ApiIssue } from "@/lib/schemas";

export const PAGE_SIZE = 20;

/**
 * The most issues kept on screen. Keep this in step with MAX_RANK_ISSUES in
 * the API, which rejects ranking requests with more issues than that.
 * It also keeps us well inside GitHub's limit of 1,000 search results.
 */
export const MAX_LOADED_ISSUES = 100;

/** Append `incoming` to `existing`, skipping ids already present. */
export function mergeIssues(
  existing: ApiIssue[],
  incoming: ApiIssue[],
  limit: number = MAX_LOADED_ISSUES,
): ApiIssue[] {
  const seen = new Set(existing.map((issue) => issue.id));
  const merged = [...existing];

  for (const issue of incoming) {
    if (seen.has(issue.id)) continue;
    seen.add(issue.id);
    merged.push(issue);
  }

  return merged.slice(0, limit);
}

export function canLoadMore({
  loaded,
  total,
  exhausted,
}: {
  loaded: number;
  total: number;
  exhausted: boolean;
}): boolean {
  return !exhausted && loaded < Math.min(total, MAX_LOADED_ISSUES);
}
