const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8001";

// The API only reads the first 20,000 characters of a body, so don't send more.
const MAX_BODY_CHARS = 20_000;

export type TaskType =
  | "Bug"
  | "Feature"
  | "Documentation"
  | "UI / UX"
  | "Testing";

/** An issue as returned by the Incipit API (already normalised). */
export type ApiIssue = {
  id: number;
  number: number;
  title: string;
  url: string;
  state: string;
  repository: string; // "owner/name"
  labels: string[];
  body: string | null;
  comments: number;
  assignees: string[];
  created_at: string;
  updated_at: string;
  inferred_task_type: TaskType | null;
};

export type IssueSearchResult = {
  total_count: number;
  items: ApiIssue[];
};

export type IssueSearchParams = {
  query?: string;
  language?: string;
  taskType?: TaskType;
  perPage?: number;
  page?: number;
  signal?: AbortSignal;
};

/** One scored signal. `score` is null when it could not be computed. */
export type SignalResult = {
  name: string;
  score: number | null;
  weight: number;
  reason: string;
};

export type RankedIssue = {
  issue: ApiIssue;
  score: number;
  breakdown: SignalResult[];
};

/** The profile as the API expects it. */
export type ApiProfile = {
  topics: string[];
  task_types: TaskType[];
};

async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const payload = await response.json().catch(() => null);

  return typeof payload?.detail === "string"
    ? payload.detail
    : `${fallback} (${response.status})`;
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchIssues({
  query,
  language,
  taskType,
  perPage = 20,
  page = 1,
  signal,
}: IssueSearchParams = {}): Promise<IssueSearchResult> {
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
  });

  if (query) params.set("query", query);
  if (language) params.set("language", language);
  if (taskType) params.set("task_type", taskType);

  const response = await fetch(`${API_BASE_URL}/issues?${params}`, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response, "Issue search failed"));
  }

  return response.json() as Promise<IssueSearchResult>;
}

export async function rankIssues({
  issues,
  profile,
  signal,
}: {
  issues: ApiIssue[];
  profile: ApiProfile;
  signal?: AbortSignal;
}): Promise<RankedIssue[]> {
  const response = await fetch(`${API_BASE_URL}/rank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      issues: issues.map((issue) => ({
        ...issue,
        body: issue.body?.slice(0, MAX_BODY_CHARS) ?? null,
      })),
      profile,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response, "Ranking failed"));
  }

  const data = (await response.json()) as { items: RankedIssue[] };
  return data.items;
}
