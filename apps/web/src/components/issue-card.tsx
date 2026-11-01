import Link from "next/link";
import { ScoreBreakdown } from "@/components/score-breakdown";
import type { ApiIssue } from "@/lib/api";
import type { IssueCard as Card } from "@/lib/cards";

export function IssueCard({
  card,
  position,
  saved,
  onToggleSave,
}: {
  card: Card;
  position: number; // 1-based, for the decorative index
  saved: boolean;
  onToggleSave: (issue: ApiIssue) => void;
}) {
  const source = card.source;

  return (
    <article className="group min-w-0 rounded-2xl [overflow-wrap:anywhere] border border-[#e5e0d5] bg-white/70 p-6 transition duration-200 hover:-translate-y-0.5 hover:border-[#c7b8a5] hover:bg-white motion-reduce:transform-none">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#6b6a61]">
          <span className="font-semibold text-[#494940]">{card.repo}</span>
          <span aria-hidden="true">·</span>
          <span>{card.updated}</span>

          {card.score !== undefined && (
            <span
              className="rounded-full bg-[#f5efe3] px-2 py-0.5 font-semibold text-[#765c35]"
              title="Fit score, 0 to 100"
            >
              Fit {card.score}
            </span>
          )}
        </div>

        {source && (
          <button
            onClick={() => onToggleSave(source)}
            aria-pressed={saved}
            aria-label={saved ? `Unsave ${card.title}` : `Save ${card.title}`}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition ${
              saved
                ? "border-[#a14e35] bg-[#a14e35] text-white"
                : "border-[#e5e0d5] hover:border-[#a14e35]"
            }`}
          >
            {saved ? "Saved ✓" : "+ Save"}
          </button>
        )}
      </div>

      <div className="mt-6 flex gap-4">
        <span aria-hidden="true" className="font-serif text-sm text-[#b5aa99]">
          {String(position).padStart(2, "0")}
        </span>

        <div className="min-w-0 flex-1">
          {card.isSample && (
            <span className="mb-2 inline-flex rounded-full border border-[#d8c6a7] bg-[#f5efe3] px-2 py-1 text-xs font-medium text-[#765c35]">
              Sample
            </span>
          )}

          <h3 className="text-lg font-semibold leading-snug tracking-tight group-hover:text-[#a14e35]">
            {card.dossierHref ? (
              <Link href={card.dossierHref}>{card.title}</Link>
            ) : (
              card.title
            )}
          </h3>

          <p className="mt-3 text-sm leading-6 text-[#6b6a61]">
            {card.description}
          </p>

          {card.breakdown && (
            <ScoreBreakdown breakdown={card.breakdown} penalties={card.penalties} />
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {card.labels.map((label) => (
              <span
                key={label}
                className="rounded-full bg-[#f0ede5] px-3 py-1 text-xs text-[#666459]"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#eee9df] pt-4 text-xs text-[#6b6a61]">
        <div className="flex flex-wrap items-center gap-3">
          <span>{card.language}</span>
          <span aria-hidden="true">·</span>
          <span>{card.type}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {card.stars && <span>{card.stars} stars</span>}
          {card.url && (
            <a
              href={card.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:text-[#24251f] hover:underline"
            >
              GitHub ↗<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
