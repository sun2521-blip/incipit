import type { ApiIssue, RankedIssue } from "@/lib/schemas";

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

/**
 * Sort issues by rank, but only inside the page they arrived with, so cards
 * already on screen stay put when another page loads. `pageStarts` holds the
 * index in `items` where each loaded page begins. Issues the ranking does not
 * cover yet go last in their page, in the order they were loaded.
 */
export function orderWithinPages(
  items: ApiIssue[],
  pageStarts: number[],
  ranked: RankedIssue[],
): { issue: ApiIssue; ranked?: RankedIssue }[] {
  const byId = new Map(ranked.map((entry) => [entry.issue.id, entry]));
  const position = new Map(
    ranked.map((entry, index) => [entry.issue.id, index]),
  );
  const rankOf = (issue: ApiIssue) => position.get(issue.id) ?? ranked.length;
  const ends = [...pageStarts.slice(1), items.length];

  return pageStarts.flatMap((start, page) =>
    items
      .slice(start, ends[page])
      .sort((a, b) => rankOf(a) - rankOf(b))
      .map((issue) => ({ issue, ranked: byId.get(issue.id) })),
  );
}
