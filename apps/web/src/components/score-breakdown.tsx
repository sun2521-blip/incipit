import type { SignalResult } from "@/lib/api";

const SIGNAL_LABELS: Record<string, string> = {
  skill_match: "Language match",
  task_match: "Task type",
  clarity: "Description clarity",
  maintenance: "Repository activity",
  goal_match: "Your topics",
};

export function ScoreBreakdown({ breakdown }: { breakdown: SignalResult[] }) {
  const counted = breakdown.filter((signal) => signal.score !== null).length;

  return (
    <details className="mt-4 text-xs text-[#77766d]">
      <summary className="cursor-pointer font-semibold text-[#494940]">
        Why this score · based on {counted} of {breakdown.length} signals
      </summary>

      <ul className="mt-3 space-y-3">
        {breakdown.map((signal) => (
          <li key={signal.name} className="grid grid-cols-[120px_1fr] gap-x-3">
            <span className="font-medium text-[#494940]">
              {SIGNAL_LABELS[signal.name] ?? signal.name}
            </span>

            <span>
              <span className="font-semibold text-[#24251f]">
                {signal.score === null ? "not counted" : `${signal.score}/100`}
              </span>
              <span className="text-[#a09b90]">
                {" "}
                · weight {Math.round(signal.weight * 100)}%
              </span>
              <br />
              {signal.reason}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
