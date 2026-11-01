// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IssueDossier } from "@/components/issue-dossier";

const originalFetch = globalThis.fetch;

function issue(overrides: Record<string, unknown> = {}) {
  return {
    id: 99,
    number: 7,
    title: "Fix the parser crash",
    url: "https://github.com/example/project/issues/7",
    state: "open",
    repository: "example/project",
    labels: ["good first issue", "bug"],
    body: "Steps to reproduce <script>alert('x')</script>",
    comments: 2,
    assignees: [],
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-29T08:30:00Z",
    inferred_task_type: "Bug",
    repo_context: {
      full_name: "example/project",
      url: "https://github.com/example/project",
      description: null,
      language: "Python",
      stars: 1234,
      pushed_at: "2026-10-30T00:00:00Z",
      archived: false,
      topics: [],
      license: "MIT",
    },
    ...overrides,
  };
}

function dossier(overrides: Record<string, unknown> = {}) {
  return {
    checked_at: "2026-11-01T12:00:00Z",
    moved_from: null,
    issue: issue(),
    contributing_guide: { status: "not_found", url: null },
    guidance: {
      kind: "generic",
      note: "General steps that suit most open-source projects.",
      steps: [
        { title: "Look for contribution notes", detail: "Check the README.", link: null },
        { title: "Set up the project", detail: "Fork and clone.", link: null },
      ],
    },
    ...overrides,
  };
}

const ranked = {
  items: [
    {
      issue: issue(),
      score: 81,
      breakdown: [
        { name: "clarity", score: 80, weight: 0.2, reason: "Found: a list." },
      ],
    },
  ],
};

type Answer = { status: number; body: unknown };

/** Answers GET /issues/... with `dossierAnswer` and POST /rank with a ranking. */
function mockApi(dossierAnswers: Answer[]): string[] {
  const urls: string[] = [];
  let call = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const answer = url.endsWith("/rank")
      ? { status: 200, body: ranked }
      : dossierAnswers[Math.min(call++, dossierAnswers.length - 1)];
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return urls;
}

async function renderDossier(owner = "example", repo = "project", number = "7") {
  await act(async () => {
    render(<IssueDossier owner={owner} repo={repo} number={number} />);
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("IssueDossier", () => {
  it("refuses an invalid address without calling the API", async () => {
    const urls = mockApi([{ status: 200, body: dossier() }]);

    await renderDossier("example", "..", "7");

    expect(screen.getByText("That isn't a valid GitHub issue address.")).toBeInTheDocument();
    expect(urls).toEqual([]);
  });

  it("shows verified facts, the inference and the generic checklist", async () => {
    mockApi([{ status: 200, body: dossier() }]);

    await renderDossier();

    expect(
      screen.getByRole("heading", { name: "Fix the parser crash" }),
    ).toBeInTheDocument();
    expect(screen.getByText("On GitHub")).toBeInTheDocument();
    expect(screen.getByText(/None listed on GitHub/)).toBeInTheDocument();
    expect(screen.getByText("1.2k")).toBeInTheDocument();
    expect(screen.getByText("GitHub found none")).toBeInTheDocument();
    expect(screen.getByText("Bug (guessed from labels)")).toBeInTheDocument();
    expect(await screen.findByText(/81 \/ 100/)).toBeInTheDocument();
    expect(screen.getByText("A general checklist")).toBeInTheDocument();
    expect(screen.getByText("Look for contribution notes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue on GitHub ↗" })).toHaveAttribute(
      "href",
      "https://github.com/example/project/issues/7",
    );
  });

  it("renders the issue text as plain text, never as HTML", async () => {
    mockApi([{ status: 200, body: dossier() }]);

    const { container } = render(<div />);
    await renderDossier();

    expect(screen.getByText(/<script>alert\('x'\)<\/script>/)).toBeInTheDocument();
    expect(container.ownerDocument.querySelector("script")).toBeNull();
  });

  it("opens outside links without giving them access to this page", async () => {
    mockApi([{ status: 200, body: dossier() }]);

    await renderDossier();

    for (const link of screen.getAllByRole("link")) {
      if (link.getAttribute("target") === "_blank") {
        expect(link.getAttribute("rel")).toContain("noopener");
        expect(link.getAttribute("href")).toMatch(/^https:\/\/github\.com\//);
      }
    }
  });

  it("warns about closed issues, archived repositories and transfers", async () => {
    mockApi([
      {
        status: 200,
        body: dossier({
          moved_from: "old/place#3",
          issue: issue({
            state: "closed",
            repo_context: { ...issue().repo_context, archived: true },
          }),
        }),
      },
    ]);

    await renderDossier();

    expect(screen.getByText(/This issue is closed on GitHub/)).toBeInTheDocument();
    expect(screen.getByText(/The repository is archived/)).toBeInTheDocument();
    expect(screen.getByText(/you followed a link to old\/place#3/)).toBeInTheDocument();
  });

  it("saves to and removes from the shortlist", async () => {
    mockApi([{ status: 200, body: dossier() }]);
    await renderDossier();

    fireEvent.click(screen.getByRole("button", { name: "+ Save to shortlist" }));

    expect(screen.getByRole("button", { name: "Saved ✓" })).toBeInTheDocument();
    expect(screen.getByText("Saved (1)")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("incipit.saved.v1") ?? "[]")).toMatchObject([
      { id: 99, repository: "example/project", number: 7, state: "open" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Saved ✓" }));

    expect(screen.getByText("Saved (0)")).toBeInTheDocument();
  });

  it("shows a not-found state with the API's explanation", async () => {
    mockApi([
      { status: 404, body: { detail: "GitHub has no issue #7 in example/project." } },
    ]);

    await renderDossier();

    expect(screen.getByText("No issue here.")).toBeInTheDocument();
    expect(
      screen.getByText("GitHub has no issue #7 in example/project."),
    ).toBeInTheDocument();
  });

  it("offers a retry after a failure, and recovers", async () => {
    mockApi([
      { status: 503, body: { detail: "GitHub API rate limit reached." } },
      { status: 200, body: dossier() },
    ]);
    await renderDossier();

    expect(screen.getByRole("alert")).toHaveTextContent("GitHub API rate limit reached.");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(
      screen.getByRole("heading", { name: "Fix the parser crash" }),
    ).toBeInTheDocument();
  });
});
