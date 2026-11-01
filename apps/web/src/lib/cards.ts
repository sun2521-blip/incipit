import { formatCount } from "@/lib/format";
import { dossierPath } from "@/lib/issue-path";
import type {
  ApiIssue,
  Penalty,
  RankedIssue,
  SignalResult,
} from "@/lib/schemas";

/** What an issue card shows: a live GitHub issue, or a labelled sample. */
export type IssueCard = {
  id: number;
  title: string;
  repo: string;
  description: string;
  language: string;
  type: string;
  labels: string[];
  stars: string;
  updated: string;
  url?: string;
  dossierHref?: string; // live issues only
  source?: ApiIssue; // live issues only: what the shortlist saves
  isSample?: boolean;
  score?: number;
  breakdown?: SignalResult[];
  penalties?: Penalty[];
};

/** Shown, clearly labelled, only when the API cannot be reached. */
export const SAMPLE_ISSUES: IssueCard[] = [
  {
    id: 1,
    title: "Add keyboard shortcuts to the command palette",
    repo: "vercel / next.js",
    description:
      "Improve navigation by adding shortcuts for common actions in the command palette.",
    language: "TypeScript",
    type: "Feature",
    labels: ["good first issue", "help wanted"],
    stars: "128k",
    updated: "2 days ago",
    isSample: true,
  },
  {
    id: 2,
    title: "Improve error messages for invalid configuration",
    repo: "pallets / flask",
    description:
      "Make configuration errors easier to understand, with actionable suggestions.",
    language: "Python",
    type: "Bug",
    labels: ["good first issue", "documentation"],
    stars: "69k",
    updated: "1 day ago",
    isSample: true,
  },
  {
    id: 3,
    title: "Document examples for the new API",
    repo: "encode / httpx",
    description:
      "Add practical examples showing common request patterns and response handling.",
    language: "Python",
    type: "Documentation",
    labels: ["documentation", "help wanted"],
    stars: "14k",
    updated: "4 days ago",
    isSample: true,
  },
  {
    id: 4,
    title: "Improve empty states in the dashboard",
    repo: "shadcn-ui / ui",
    description:
      "Create clearer empty states that guide users toward their next action.",
    language: "TypeScript",
    type: "UI / UX",
    labels: ["good first issue", "design"],
    stars: "95k",
    updated: "3 days ago",
    isSample: true,
  },
  {
    id: 5,
    title: "Add tests for date parsing edge cases",
    repo: "pandas-dev / pandas",
    description:
      "Cover unusual date formats and invalid input to strengthen test coverage.",
    language: "Python",
    type: "Testing",
    labels: ["good first issue", "tests"],
    stars: "44k",
    updated: "5 days ago",
    isSample: true,
  },
  {
    id: 6,
    title: "Fix focus handling in modal dialogs",
    repo: "radix-ui / primitives",
    description:
      "Ensure keyboard focus returns to the triggering element when a dialog closes.",
    language: "TypeScript",
    type: "Bug",
    labels: ["accessibility", "help wanted"],
    stars: "16k",
    updated: "1 day ago",
    isSample: true,
  },
];

export const LANGUAGE_FILTERS = [
  "All languages",
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Rust",
  "Java",
];

export const TASK_FILTERS = [
  "All tasks",
  "Bug",
  "Feature",
  "Documentation",
  "UI / UX",
  "Testing",
];

export function summarise(body: string | null): string {
  const empty = "No issue description provided.";
  if (!body) return empty;

  const text = body
    .slice(0, 5000) // bound the work done on untrusted text
    .replace(/<!--[\s\S]*?-->/g, " ") // template comments
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/^#{1,6}\s.*$/gm, " ") // headings such as "### Describe the bug"
    .replace(/^>\s?/gm, "") // quote markers
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return empty;
  return text.length > 240 ? `${text.slice(0, 240).trimEnd()}…` : text;
}

// The API already normalised the issue; this only shapes it for the card UI.
// Language and stars come from the repository's context when GitHub gave it;
// otherwise the language is only known when the search was filtered by it.
export function toCard(
  issue: ApiIssue,
  languageFilter: string | undefined,
  ranked?: RankedIssue,
): IssueCard {
  return {
    id: issue.id,
    title: issue.title,
    repo: issue.repository.replace("/", " / "),
    description: summarise(issue.body),
    language: issue.repo_context?.language ?? languageFilter ?? "Unknown",
    type: issue.inferred_task_type ?? "Issue",
    labels: issue.labels,
    stars: issue.repo_context ? formatCount(issue.repo_context.stars) : "",
    updated: new Date(issue.updated_at).toLocaleDateString(),
    url: issue.url,
    dossierHref: dossierPath(issue.repository, issue.number) ?? undefined,
    source: issue,
    isSample: false,
    score: ranked?.score,
    breakdown: ranked?.breakdown,
    penalties: ranked?.penalties,
  };
}
