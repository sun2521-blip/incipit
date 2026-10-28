
"use client";

import { useEffect, useMemo, useState } from "react";
import { checkApiHealth, fetchIssues } from "@/lib/api";

type Issue = {
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
  isSample?: boolean;
};

const issues: Issue[] = [
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

const languages = ["All languages", "TypeScript", "Python"];

const taskTypes = [
  "All tasks",
  "Bug",
  "Feature",
  "Documentation",
  "UI / UX",
  "Testing",
];

export default function Home() {
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("All languages");
  const [task, setTask] = useState("All tasks");
  const [saved, setSaved] = useState<number[]>([]);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  const [liveIssues, setLiveIssues] = useState<Issue[] | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [loadingIssues, setLoadingIssues] = useState(true);

  useEffect(() => {
    let cancelled = false;

    checkApiHealth().then((healthy) => {
      if (!cancelled) {
        setApiHealthy(healthy);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchIssues()
      .then((result) => {
        if (cancelled) return;

        const mapped: Issue[] = result.items
          .filter((item) => !("pull_request" in item))
          .map((item) => {
            const labels = item.labels.map((label) => label.name);

            const repo = item.repository_url
              .replace("https://api.github.com/repos/", "")
              .replace(/\/$/, "");

            const lowerLabels = labels.map((label) =>
              label.toLowerCase(),
            );

            const type = lowerLabels.some((label) =>
              label.includes("documentation"),
            )
              ? "Documentation"
              : lowerLabels.some((label) => label.includes("bug"))
                ? "Bug"
                : lowerLabels.some((label) =>
                    label.includes("feature"),
                  )
                  ? "Feature"
                  : "Issue";

            return {
              id: item.id,
              title: item.title,
              repo: repo.replace("/", " / "),
              description:
                item.body?.trim().slice(0, 240) ||
                "No issue description provided.",
              language: "Unknown",
              type,
              labels,
              stars: "",
              updated: new Date(
                item.updated_at,
              ).toLocaleDateString(),
              url: item.html_url,
              isSample: false,
            };
          });

        setLiveIssues(mapped);
        setIssueError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        setIssueError(
          error instanceof Error
            ? error.message
            : "Could not load GitHub issues.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingIssues(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const displayedIssues = liveIssues ?? issues;

  const filteredIssues = useMemo(() => {
    const term = search.toLowerCase().trim();

    return displayedIssues.filter((issue) => {
      const matchesSearch =
        !term ||
        `${issue.title} ${issue.repo} ${issue.description}`
          .toLowerCase()
          .includes(term);

      const matchesLanguage =
        language === "All languages" ||
        (issue.language !== "Unknown" &&
          issue.language === language);

      const matchesTask =
        task === "All tasks" || issue.type === task;

      return matchesSearch && matchesLanguage && matchesTask;
    });
  }, [search, language, task, displayedIssues]);

  function toggleSaved(id: number) {
    setSaved((current) =>
      current.includes(id)
        ? current.filter((savedId) => savedId !== id)
        : [...current, id],
    );
  }

  return (
    <main className="min-h-screen bg-[#f8f6f0] text-[#24251f]">
      <header className="border-b border-[#e5e0d5]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <a
            href="#"
            className="text-2xl font-black tracking-[-0.08em]"
          >
            incipit<span className="text-[#bd593b]">.</span>
          </a>

          <nav className="flex items-center gap-6 text-sm">
            <a href="#discover" className="font-semibold">
              Discover
            </a>

            <a
              href="#saved"
              className="text-[#77766d] transition hover:text-[#24251f]"
            >
              Saved ({saved.length})
            </a>

            <span className="hidden rounded-full border border-[#e5e0d5] px-3 py-1 text-xs sm:inline">
              BETA
            </span>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 pb-12 pt-16 sm:pt-24">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#a14e35]">
          <span className="h-px w-8 bg-[#a14e35]" />
          Your open-source story starts here
        </div>

        <div className="grid gap-10 md:grid-cols-[1fr_260px] md:items-end">
          <div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-0.06em] sm:text-7xl">
              Every contribution
              <br />
              has a{" "}
              <span className="font-serif italic text-[#a14e35]">
                beginning.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-[#77766d] sm:text-lg">
              Find open-source issues that match your skills, not just
              your ambition. Your first meaningful contribution is
              closer than you think.
            </p>

            <p className="mt-4 text-sm text-[#77766d]">
              API status:{" "}
              {apiHealthy === null
                ? "checking..."
                : apiHealthy
                  ? "connected"
                  : "unavailable"}
            </p>
          </div>

          <div className="border-l border-[#e5e0d5] pl-5">
            <p className="font-serif text-4xl">
              {String(displayedIssues.length).padStart(2, "0")}
            </p>

            <p className="mt-1 text-sm text-[#77766d]">
              {liveIssues !== null
                ? "live issues to explore"
                : "sample issues to explore"}
            </p>

            <p className="mt-3 text-xs text-[#a09b90]">
              {liveIssues !== null
                ? `${liveIssues.length} live issues loaded from GitHub`
                : issueError
                  ? "Showing sample data · GitHub issues could not be loaded"
                  : loadingIssues
                    ? "Loading GitHub issues…"
                    : "Showing sample data"}
            </p>
          </div>
        </div>
      </section>

      <section
        id="discover"
        className="mx-auto max-w-7xl px-6 pb-20"
      >
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a14e35]">
              The issue index
            </p>

            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Find your starting point.
            </h2>
          </div>

          <p className="text-sm text-[#77766d]">
            {filteredIssues.length}{" "}
            {filteredIssues.length === 1 ? "issue" : "issues"} found
          </p>
        </div>

        <div className="mb-6 grid gap-3 rounded-2xl border border-[#e5e0d5] bg-white/70 p-4 md:grid-cols-[1fr_190px_190px]">
          <label className="flex items-center gap-3 rounded-xl border border-[#e5e0d5] bg-white px-4 py-3">
            <span aria-hidden="true" className="text-lg text-[#77766d]">
              ⌕
            </span>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search issues, repos, or keywords..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-[#a09b90]"
              aria-label="Search issues"
            />
          </label>

          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            aria-label="Filter by language"
            className="rounded-xl border border-[#e5e0d5] bg-white px-4 py-3 text-sm outline-none focus:border-[#a14e35]"
          >
            {languages.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <select
            value={task}
            onChange={(event) => setTask(event.target.value)}
            aria-label="Filter by task type"
            className="rounded-xl border border-[#e5e0d5] bg-white px-4 py-3 text-sm outline-none focus:border-[#a14e35]"
          >
            {taskTypes.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>

        {filteredIssues.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#d8d0c2] px-6 py-20 text-center">
            <p className="font-serif text-2xl">
              Nothing on this page. Yet.
            </p>

            <p className="mt-2 text-sm text-[#77766d]">
              Try another search or loosen your filters.
            </p>

            <button
              onClick={() => {
                setSearch("");
                setLanguage("All languages");
                setTask("All tasks");
              }}
              className="mt-5 text-sm font-semibold text-[#a14e35] underline underline-offset-4"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredIssues.map((issue, index) => (
              <article
                key={issue.id}
                className="group rounded-2xl border border-[#e5e0d5] bg-white/70 p-6 transition duration-200 hover:-translate-y-0.5 hover:border-[#c7b8a5] hover:bg-white"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#77766d]">
                    <span className="font-semibold text-[#494940]">
                      {issue.repo}
                    </span>

                    <span>·</span>
                    <span>{issue.updated}</span>
                  </div>

                  <button
                    onClick={() => toggleSaved(issue.id)}
                    aria-label={
                      saved.includes(issue.id)
                        ? "Unsave issue"
                        : "Save issue"
                    }
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition ${
                      saved.includes(issue.id)
                        ? "border-[#a14e35] bg-[#a14e35] text-white"
                        : "border-[#e5e0d5] hover:border-[#a14e35]"
                    }`}
                  >
                    {saved.includes(issue.id) ? "Saved ✓" : "+ Save"}
                  </button>
                </div>

                <div className="mt-6 flex gap-4">
                  <span className="font-serif text-sm text-[#b5aa99]">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <div className="min-w-0 flex-1">
                    {issue.isSample && (
                      <span className="mb-2 inline-flex rounded-full border border-[#d8c6a7] bg-[#f5efe3] px-2 py-1 text-xs font-medium text-[#765c35]">
                        Sample
                      </span>
                    )}

                    <h3 className="text-lg font-semibold leading-snug tracking-tight group-hover:text-[#a14e35]">
                      {issue.url ? (
                        <a
                          href={issue.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {issue.title}
                        </a>
                      ) : (
                        issue.title
                      )}
                    </h3>

                    <p className="mt-3 text-sm leading-6 text-[#77766d]">
                      {issue.description}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {issue.labels.map((label) => (
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

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#eee9df] pt-4 text-xs text-[#77766d]">
                  <div className="flex flex-wrap items-center gap-3">
                    <span>{issue.language}</span>
                    <span>·</span>
                    <span>{issue.type}</span>
                  </div>

                  {issue.stars && <span>{issue.stars} stars</span>}
                </div>
              </article>
            ))}
          </div>
        )}

        <div
          id="saved"
          className="mt-12 border-t border-[#e5e0d5] pt-6"
        >
          <p className="text-sm text-[#77766d]">
            <span className="font-semibold text-[#24251f]">
              Your shortlist:
            </span>{" "}
            {saved.length === 0
              ? "Save an issue to keep it in your shortlist during this session."
              : `${saved.length} ${
                  saved.length === 1 ? "issue" : "issues"
                } saved in this session.`}
          </p>
        </div>
      </section>

      <footer className="border-t border-[#e5e0d5]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-6 text-xs text-[#77766d] sm:flex-row sm:items-center sm:justify-between">
          <span className="font-black tracking-[-0.06em] text-[#24251f]">
            incipit<span className="text-[#bd593b]">.</span>
          </span>

          <span>Every contribution has a beginning.</span>
          <span>Built for the curious, not just the experienced.</span>
        </div>
      </footer>
    </main>
  );
}
