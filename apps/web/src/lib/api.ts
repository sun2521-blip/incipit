import { PAGE_SIZE } from "@/lib/pagination";
import {
  parseDossierResponse,
  parseIssueSearchResponse,
  parseRankResponse,
  type ApiIssue,
  type Dossier,
  type IssueSearchResult,
  type Penalty,
  type RankedIssue,
  type SignalResult,
  type TaskType,
} from "@/lib/schemas";

export type {
  ApiIssue,
  Dossier,
  IssueSearchResult,
  Penalty,
  RankedIssue,
  SignalResult,
  TaskType,
};

/** An error answer from the API, with its HTTP status (0 when unreachable). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8001";

// The API only reads the first 20,000 characters of a body, so don't send more.
const MAX_BODY_CHARS = 20_000;

export type IssueSearchParams = {
  query?: string;
  language?: string;
  taskType?: TaskType;
  perPage?: number;
  page?: number;
  signal?: AbortSignal;
};

/** The profile as the API expects it. */
export type ApiProfile = {
  languages: string[];
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

const UNREACHABLE =
  "Couldn't reach the Incipit API. If it was asleep it may need a minute to start; try again shortly.";

/** fetch, but an unreachable API becomes an ApiError with status 0 and a
 * message people can act on, instead of the browser's "Failed to fetch". */
async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(UNREACHABLE, 0);
  }
}

/** Read a JSON body and validate it; errors never expose raw server data. */
async function readValidated<T>(
  response: Response,
  parse: (data: unknown) => T,
  what: string,
): Promise<T> {
  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new Error(`The API returned an unreadable ${what} response.`);
  }

  try {
    return parse(data);
  } catch {
    throw new Error(`The API returned an unexpected ${what} response.`);
  }
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
  perPage = PAGE_SIZE,
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

  const response = await request(`${API_BASE_URL}/issues?${params}`, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new ApiError(
      await errorMessage(response, "Issue search failed"),
      response.status,
    );
  }

  return readValidated(response, parseIssueSearchResponse, "search");
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
  const response = await request(`${API_BASE_URL}/rank`, {
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
    throw new ApiError(
      await errorMessage(response, "Ranking failed"),
      response.status,
    );
  }

  return readValidated(response, parseRankResponse, "ranking");
}

export async function fetchDossier({
  owner,
  repo,
  number,
  signal,
}: {
  owner: string;
  repo: string;
  number: number;
  signal?: AbortSignal;
}): Promise<Dossier> {
  const path = [owner, repo, String(number)].map(encodeURIComponent).join("/");

  const response = await request(`${API_BASE_URL}/issues/${path}`, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new ApiError(
      await errorMessage(response, "Could not load this issue"),
      response.status,
    );
  }

  return readValidated(response, parseDossierResponse, "issue");
}
