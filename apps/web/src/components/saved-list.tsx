"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/loading";
import { checkSavedIssues, describeCheck } from "@/lib/check-saved";
import { formatDateTime } from "@/lib/format";
import { dossierPath } from "@/lib/issue-path";
import type { CheckOutcome, SavedIssue } from "@/lib/saved";

// States that mean someone starting on the issue now would be wasting time.
const NOT_OPEN: Record<string, string> = {
  closed: "Closed on GitHub",
  deleted: "Deleted on GitHub",
  "not found": "Not found on GitHub",
};

type Refresh =
  | { phase: "idle" }
  | { phase: "checking"; done: number; total: number }
  | { phase: "done"; message: string };

function stateLine(item: SavedIssue): string {
  return item.checkedAt
    ? `${item.state}, checked ${formatDateTime(item.checkedAt)}`
    : `${item.state} when saved ${new Date(item.savedAt).toLocaleDateString()}`;
}

export function SavedList({
  saved,
  onRemove,
  onChecked,
}: {
  saved: SavedIssue[];
  onRemove: (id: number) => void;
  onChecked: (outcomes: Map<number, CheckOutcome>) => void;
}) {
  const [refresh, setRefresh] = useState<Refresh>({ phase: "idle" });
  const running = useRef<AbortController | null>(null);

  // Leaving the page stops the checks; nothing is written afterwards.
  useEffect(() => () => running.current?.abort(), []);

  async function refreshStatus() {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    const items = saved;

    setRefresh({ phase: "checking", done: 0, total: items.length });
    const result = await checkSavedIssues(items, {
      signal: controller.signal,
      onProgress: (done, total) => setRefresh({ phase: "checking", done, total }),
    });
    if (controller.signal.aborted) return;

    onChecked(result.outcomes);
    setRefresh({ phase: "done", message: describeCheck(result, items.length) });
  }

  const checking = refresh.phase === "checking";

  return (
    <section
      id="saved"
      aria-labelledby="saved-heading"
      className="mt-12 scroll-mt-6 border-t border-[#e5e0d5] pt-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="saved-heading" className="text-xl font-semibold tracking-tight">
          Your shortlist
        </h2>
        {saved.length > 0 && (
          <button
            onClick={refreshStatus}
            disabled={checking}
            className="inline-flex items-center gap-2 rounded-full border border-[#e5e0d5] px-3 py-1.5 text-xs hover:border-[#a14e35] disabled:cursor-wait disabled:opacity-70"
          >
            {checking && <Spinner className="h-3 w-3" />}
            {checking ? "Checking…" : "Refresh status"}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-[#6b6a61]">
        {saved.length === 0
          ? "Save an issue to keep it here. Your shortlist stays in this browser."
          : `${saved.length} saved ${
              saved.length === 1 ? "issue" : "issues"
            }, kept in this browser. "Refresh status" asks GitHub how they are now.`}
      </p>
      {/* Live, so progress is announced; not role="status", which the search owns. */}
      <p aria-live="polite" className="mt-1 min-h-5 text-sm text-[#5e4a2b]">
        {refresh.phase === "checking"
          ? `Checking ${Math.min(refresh.done + 1, refresh.total)} of ${refresh.total} on GitHub…`
          : refresh.phase === "done"
            ? refresh.message
            : null}
      </p>

      {saved.length > 0 && (
        <ul className="mt-3 divide-y divide-[#eee9df] rounded-2xl border border-[#e5e0d5] bg-white/70">
          {saved.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-xs text-[#6b6a61] [overflow-wrap:anywhere]">
                  {item.repository} · #{item.number} · {stateLine(item)}
                </p>
                <Link
                  href={dossierPath(item.repository, item.number) ?? "/"}
                  className="mt-1 block truncate font-semibold hover:text-[#a14e35]"
                >
                  {item.title}
                </Link>
                {NOT_OPEN[item.state] && (
                  <p className="mt-2 inline-block rounded-full border border-[#d8c6a7] bg-[#f5efe3] px-2.5 py-0.5 text-xs text-[#5e4a2b]">
                    {NOT_OPEN[item.state]}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-3 text-xs">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#6b6a61] hover:text-[#24251f]"
                >
                  GitHub ↗<span className="sr-only"> (opens in a new tab)</span>
                </a>
                <button
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.title} from your shortlist`}
                  className="rounded-full border border-[#e5e0d5] px-3 py-1.5 hover:border-[#a14e35]"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
