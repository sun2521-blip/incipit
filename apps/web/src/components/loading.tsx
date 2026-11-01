// Placeholders shaped like the content they stand in for, so the page looks
// busy rather than frozen. They pulse only for people who allow motion.

function Bar({ className }: { className: string }) {
  return <div className={`rounded-full bg-[#e9e4d9] ${className}`} />;
}

function IssueCardSkeleton() {
  return (
    <div className="rounded-2xl border border-[#e5e0d5] bg-white/70 p-6">
      <div className="motion-safe:animate-pulse">
        <div className="flex items-center justify-between gap-4">
          <Bar className="h-3 w-44" />
          <Bar className="h-7 w-16" />
        </div>
        <Bar className="mt-7 h-5 w-4/5" />
        <Bar className="mt-2 h-5 w-3/5" />
        <Bar className="mt-5 h-3 w-full" />
        <Bar className="mt-2 h-3 w-11/12" />
        <Bar className="mt-2 h-3 w-2/3" />
        <div className="mt-6 flex gap-2">
          <Bar className="h-6 w-20" />
          <Bar className="h-6 w-24" />
          <Bar className="h-6 w-16" />
        </div>
        <div className="mt-6 flex justify-between border-t border-[#eee9df] pt-4">
          <Bar className="h-3 w-28" />
          <Bar className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
}

/** A grid of placeholder cards; hidden from screen readers, which get a status. */
export function IssueListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      data-testid="issue-list-skeleton"
      className="grid gap-4 lg:grid-cols-2"
    >
      {Array.from({ length: count }, (_, index) => (
        <IssueCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function DossierSkeleton() {
  return (
    <div aria-hidden="true" data-testid="dossier-skeleton" className="mt-6">
      <div className="motion-safe:animate-pulse">
        <Bar className="h-3 w-48" />
        <Bar className="mt-4 h-8 w-11/12" />
        <Bar className="mt-3 h-8 w-2/3" />
        <div className="mt-6 flex gap-3">
          <Bar className="h-10 w-44" />
          <Bar className="h-10 w-44" />
        </div>
        <div className="mt-8 rounded-2xl border border-[#e5e0d5] bg-white/70 p-6">
          <Bar className="h-5 w-32" />
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="mt-5 flex gap-6">
              <Bar className="h-3 w-24" />
              <Bar className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A small spinner for inline "working" states. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 shrink-0 rounded-full border-2 border-[#e2dccf] border-t-[#a14e35] motion-safe:animate-spin ${className}`}
    />
  );
}
