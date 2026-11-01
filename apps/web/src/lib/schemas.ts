import { z } from "zod";

/**
 * Runtime checks for everything the Incipit API sends back. TypeScript types
 * only exist at build time, so without this the app would trust whatever
 * arrives over the network.
 */

export const taskTypeSchema = z.enum([
  "Bug",
  "Feature",
  "Documentation",
  "UI / UX",
  "Testing",
]);

export type TaskType = z.infer<typeof taskTypeSchema>;

// Rendered as links, so only real GitHub URLs are accepted (this rules out
// "javascript:" and similar).
export const githubUrl = z
  .string()
  .refine((value) => value.startsWith("https://github.com/"), {
    message: "must be a GitHub URL",
  });

/** Verified facts about an issue's repository, from GitHub's /repos endpoint. */
export const repoContextSchema = z.object({
  full_name: z.string(),
  url: githubUrl,
  description: z.string().nullable(),
  language: z.string().nullable(),
  stars: z.number().int().nonnegative(),
  pushed_at: z.string().nullable(),
  archived: z.boolean(),
  topics: z.array(z.string()),
  license: z.string().nullable(),
});

export type RepoContext = z.infer<typeof repoContextSchema>;

export const apiIssueSchema = z.object({
  id: z.number().int(),
  number: z.number().int(),
  title: z.string(),
  url: githubUrl,
  state: z.string(),
  repository: z.string(),
  labels: z.array(z.string()),
  body: z.string().nullable(),
  comments: z.number().int(),
  assignees: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  // Only a hint: an unknown value counts as "no type" instead of failing.
  inferred_task_type: taskTypeSchema.nullable().catch(null),
  // Extra facts: missing or malformed context means "unavailable", and the
  // issue is kept.
  repo_context: repoContextSchema.nullable().catch(null),
});

export type ApiIssue = z.infer<typeof apiIssueSchema>;

export const signalResultSchema = z.object({
  name: z.string(),
  score: z.number().int().min(0).max(100).nullable(),
  weight: z.number().min(0).max(1),
  reason: z.string(),
});

export type SignalResult = z.infer<typeof signalResultSchema>;

export const rankedIssueSchema = z.object({
  issue: apiIssueSchema,
  score: z.number().int().min(0).max(100),
  breakdown: z.array(signalResultSchema),
});

export type RankedIssue = z.infer<typeof rankedIssueSchema>;

export type IssueSearchResult = {
  total_count: number;
  items: ApiIssue[];
  /** A note for the person searching, such as why nothing matched. */
  notice: string | null;
};

type SafeParse<T> = (
  value: unknown,
) => { success: true; data: T } | { success: false };

/** Keep the entries that parse successfully and drop the rest. */
function keepValid<T>(
  raw: unknown[],
  safeParse: SafeParse<T>,
  what: string,
): T[] {
  const valid: T[] = [];

  for (const entry of raw) {
    const parsed = safeParse(entry);
    if (parsed.success) valid.push(parsed.data);
  }

  const skipped = raw.length - valid.length;
  if (skipped > 0) {
    console.warn(`Skipped ${skipped} malformed ${what} from the API`);
  }

  return valid;
}

const searchEnvelopeSchema = z.object({
  total_count: z.number().int().nonnegative(),
  items: z.array(z.unknown()),
  // Optional and only ever shown as text; anything odd is simply dropped.
  notice: z.string().max(300).nullable().optional().catch(null),
});

/** Throws if the response is not the expected shape; drops single bad issues. */
export function parseIssueSearchResponse(data: unknown): IssueSearchResult {
  const envelope = searchEnvelopeSchema.parse(data);

  return {
    total_count: envelope.total_count,
    notice: envelope.notice ?? null,
    items: keepValid(
      envelope.items,
      (value) => apiIssueSchema.safeParse(value),
      "issues",
    ),
  };
}

const rankEnvelopeSchema = z.object({ items: z.array(z.unknown()) });

export function parseRankResponse(data: unknown): RankedIssue[] {
  const envelope = rankEnvelopeSchema.parse(data);

  return keepValid(
    envelope.items,
    (value) => rankedIssueSchema.safeParse(value),
    "ranked issues",
  );
}

// ---- issue dossier -----------------------------------------------------------

export const contributingGuideSchema = z.object({
  status: z.enum(["found", "not_found", "unknown"]),
  url: githubUrl.nullable(),
});

export type ContributingGuide = z.infer<typeof contributingGuideSchema>;

const checklistStepSchema = z.object({
  title: z.string(),
  detail: z.string(),
  link: githubUrl.nullable().catch(null),
});

export type ChecklistStep = z.infer<typeof checklistStepSchema>;

export const dossierSchema = z.object({
  checked_at: z.string(),
  moved_from: z.string().nullable(),
  issue: apiIssueSchema,
  // A malformed guide is reported as unknown, never as found or missing.
  contributing_guide: contributingGuideSchema.catch({
    status: "unknown",
    url: null,
  }),
  guidance: z.object({
    kind: z.literal("generic"),
    note: z.string(),
    steps: z.array(checklistStepSchema),
  }),
});

export type Dossier = z.infer<typeof dossierSchema>;

/** Throws if the response is not a dossier. */
export function parseDossierResponse(data: unknown): Dossier {
  return dossierSchema.parse(data);
}
