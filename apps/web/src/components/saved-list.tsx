import Link from "next/link";
import { dossierPath } from "@/lib/issue-path";
import type { SavedIssue } from "@/lib/saved";

export function SavedList({
  saved,
  onRemove,
}: {
  saved: SavedIssue[];
  onRemove: (id: number) => void;
}) {
  return (
    <section
      id="saved"
      aria-labelledby="saved-heading"
      className="mt-12 scroll-mt-6 border-t border-[#e5e0d5] pt-6"
    >
      <h2 id="saved-heading" className="text-xl font-semibold tracking-tight">
        Your shortlist
      </h2>
      <p className="mt-1 text-sm text-[#6b6a61]">
        {saved.length === 0
          ? "Save an issue to keep it here. Your shortlist stays in this browser."
          : `${saved.length} saved ${
              saved.length === 1 ? "issue" : "issues"
            }, kept in this browser. State is as it was when you saved it.`}
      </p>

      {saved.length > 0 && (
        <ul className="mt-4 divide-y divide-[#eee9df] rounded-2xl border border-[#e5e0d5] bg-white/70">
          {saved.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-xs text-[#6b6a61] [overflow-wrap:anywhere]">
                  {item.repository} · #{item.number} · {item.state} when saved{" "}
                  {new Date(item.savedAt).toLocaleDateString()}
                </p>
                <Link
                  href={dossierPath(item.repository, item.number) ?? "/"}
                  className="mt-1 block truncate font-semibold hover:text-[#a14e35]"
                >
                  {item.title}
                </Link>
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
