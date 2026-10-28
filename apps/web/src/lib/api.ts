
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8001";

export type GitHubIssue = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  updated_at: string;
  labels: { name: string }[];
  repository_url: string;
};

type GitHubIssueResponse = {
  total_count: number;
  items: GitHubIssue[];
};

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

export async function fetchIssues(
  query = "good first issue",
): Promise<GitHubIssueResponse> {
  const params = new URLSearchParams({
    query,
    per_page: "20",
    page: "1",
  });

  const response = await fetch(`${API_BASE_URL}/issues?${params}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : `Issue search failed (${response.status})`;

    throw new Error(detail);
  }

  return response.json() as Promise<GitHubIssueResponse>;
}
