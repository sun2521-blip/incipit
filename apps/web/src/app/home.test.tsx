// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

const originalFetch = globalThis.fetch;

function apiIssue(id: number, title: string) {
  return {
    id,
    number: id,
    title,
    url: `https://github.com/example/project/issues/${id}`,
    state: "open",
    repository: "example/project",
    labels: ["good first issue"],
    body: "Steps to reproduce: run it.",
    comments: 0,
    assignees: [],
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-29T08:30:00Z",
    inferred_task_type: "Bug",
    repo_context: null,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Fakes the API: /health and /rank always work; /issues is up to the test. */
function mockApi(issues: (url: URL) => Promise<Response> | Response) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/health") return json({ status: "healthy" });
    if (url.pathname === "/rank") {
      const { issues: sent } = JSON.parse(String(init?.body));
      return json({
        items: sent.map((issue: unknown, index: number) => ({
          issue,
          score: 90 - index,
          breakdown: [],
          penalties: [],
        })),
      });
    }
    return issues(url);
  }) as typeof fetch;
}

const never = () => new Promise<Response>(() => {});
const twoIssues = () =>
  json({
    total_count: 2,
    items: [apiIssue(1, "Fix the parser crash"), apiIssue(2, "Document the CLI")],
    notice: null,
  });

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("Home: while searching", () => {
  it("shows placeholder cards, not samples, while the first search runs", async () => {
    mockApi(never);

    await act(async () => {
      render(<Home />);
    });

    expect(screen.getByTestId("issue-list-skeleton")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Searching GitHub for issues.");
    expect(screen.queryByText("Sample")).not.toBeInTheDocument();
  });

  it("swaps the placeholders for live issues, ranked", async () => {
    mockApi(twoIssues);

    await act(async () => {
      render(<Home />);
    });

    expect(await screen.findByText("Fix the parser crash")).toBeInTheDocument();
    expect(screen.queryByTestId("issue-list-skeleton")).not.toBeInTheDocument();
    expect(await screen.findByText("Fit 90")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 issues shown.");
  });

  it("shows the placeholders again the moment you type", async () => {
    mockApi(twoIssues);
    await act(async () => {
      render(<Home />);
    });
    await screen.findByText("Fix the parser crash");

    fireEvent.change(screen.getByLabelText("Search issues"), {
      target: { value: "pandas" },
    });

    expect(screen.getByTestId("issue-list-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Fix the parser crash")).not.toBeInTheDocument();
  });

  it("explains a slow search: the free API may be waking up", async () => {
    vi.useFakeTimers();
    mockApi(never);
    await act(async () => {
      render(<Home />);
    });
    expect(screen.queryByText(/The API is waking up/)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5100);
    });

    expect(screen.getAllByText(/The API is waking up/).length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("The API may be waking up.");
  });
});

describe("Home: results", () => {
  it("explains an empty result with the API's notice", async () => {
    mockApi(() =>
      json({
        total_count: 0,
        items: [],
        notice: 'example/quiet has no open issues labelled "good first issue" yet.',
      }),
    );

    await act(async () => {
      render(<Home />);
    });

    expect(
      await screen.findByText(/example\/quiet has no open issues labelled/),
    ).toBeInTheDocument();
    expect(screen.getByText("No live issues match this search")).toBeInTheDocument();
  });

  it("falls back to labelled samples only when the API is unreachable", async () => {
    mockApi(() => {
      throw new TypeError("Failed to fetch");
    });

    await act(async () => {
      render(<Home />);
    });

    expect((await screen.findAllByText("Sample")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Showing sample data · Couldn't reach the Incipit API/)).toBeInTheDocument();
  });

  it("passes on GitHub's rate-limit message", async () => {
    mockApi(() =>
      json({ detail: "GitHub API rate limit reached. Try again in about 2 minutes." }, 503),
    );

    await act(async () => {
      render(<Home />);
    });

    expect(await screen.findByText(/rate limit reached\. Try again in about 2 minutes/)).toBeInTheDocument();
  });
});
