
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ProfilePanel } from "@/components/profile-panel";
import { ScoreBreakdown } from "@/components/score-breakdown";
import {
  checkApiHealth,
  fetchIssues,
  rankIssues,
  type ApiIssue,
  type ApiProfile,
  type RankedIssue,
  type SignalResult,
  type TaskType,
} from "@/lib/api";
import {
  canLoadMore,
  MAX_LOADED_ISSUES,
  mergeIssues,
  orderWithinPages,
} from "@/lib/pagination";
import { formatCount } from "@/lib/format";
import { isProfileEmpty, toApiProfile } from "@/lib/profile";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useStoredProfile } from "@/lib/use-stored-profile";

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
  score?: number;
  breakdown?: SignalResult[];
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

const languages = [
  "All languages",
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Rust",
  "Java",
];

const taskTypes = [
  "All tasks",
  "Bug",
  "Feature",
  "Documentation",
  "UI / UX",
  "Testing",
];

const SEARCH_DEBOUNCE_MS = 400;
const PROFILE_DEBOUNCE_MS = 300;

type SearchParams = {
  query: string;
  language: string | undefined;
  taskType: TaskType | undefined;
};

type SearchState = {
  key: string;
  params: SearchParams;
  items: ApiIssue[] | null;
  languageFilter: string | undefined;
  total: number | null;
  error: string | null;
  page: number; // the last page loaded
  pageStarts: number[]; // index in `items` where each loaded page begins
  exhausted: boolean; // a page came back with nothing new
  moreError: string | null; // error from the last "Load more"
};

type RankState = {
  resultKey: string; // the search result these scores belong to
  ranked: RankedIssue[] | null;
  error: string | null;
};

function summarise(body: string | null): string {
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
function toCard(
  issue: ApiIssue,
  languageFilter: string | undefined,
  ranked?: RankedIssue,
): Issue {
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
    isSample: false,
    score: ranked?.score,
    breakdown: ranked?.breakdown,
  };
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("All languages");
  const [task, setTask] = useState("All tasks");
  const [saved, setSaved] = useState<number[]>([]);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  const [result, setResult] = useState<SearchState | null>(null);
  const [ranking, setRanking] = useState<RankState | null>(null);
  // The result key a "Load more" is running for, so a new search never
  // inherits a stuck "Loading…" button from the old one.
  const [loadingMoreFor, setLoadingMoreFor] = useState<string | null>(null);
  const loadMoreController = useRef<AbortController | null>(null);
  const [profile, setProfile] = useStoredProfile();

  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  // Sent as a string so it is cheap to compare and debounce.
  const profileKey = useDebouncedValue(
    JSON.stringify(toApiProfile(profile)),
    PROFILE_DEBOUNCE_MS,
  );
  const profileIsEmpty = isProfileEmpty(profile);

  // Identifies the request the current filters describe. Results carry the key
  // they were fetched for, so "loading" is derived instead of set by hand.
  const requestKey = `${debouncedSearch}|${language}|${task}`;
  const issueError = result?.error ?? null;
  const totalCount = result?.total ?? null;
  const loadingIssues = result?.key !== requestKey;
  const loadingMore = loadingMoreFor !== null && loadingMoreFor === result?.key;

  // Scores only count while they belong to the search result on screen.
  const currentRanking = ranking?.resultKey === result?.key ? ranking : null;
  const rankError = currentRanking?.error ?? null;

  const liveIssues = useMemo(() => {
    if (!result?.items) return null;

    const ranked = currentRanking?.ranked;

    if (ranked) {
      // Issues from a page that was just loaded wait at the end of it,
      // unscored, until the next ranking arrives.
      return orderWithinPages(result.items, result.pageStarts, ranked).map(
        (entry) => toCard(entry.issue, result.languageFilter, entry.ranked),
      );
    }

    return result.items.map((item) => toCard(item, result.languageFilter));
  }, [result, currentRanking]);

  const rankingNote = rankError
    ? `ranking unavailable (${rankError})`
    : currentRanking?.ranked
      ? profileIsEmpty
        ? "ordered by clarity and repository activity"
        : "ranked for your profile"
      : "ranking…";

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
    const controller = new AbortController();
    const key = requestKey;
    const languageFilter =
      language === "All languages" ? undefined : language;
    const params: SearchParams = {
      query: debouncedSearch,
      language: languageFilter,
      taskType: task === "All tasks" ? undefined : (task as TaskType),
    };

    // A "Load more" for the old filters is no longer wanted.
    loadMoreController.current?.abort();

    fetchIssues({ ...params, signal: controller.signal })
      .then((data) => {
        setResult({
          key,
          params,
          items: data.items,
          languageFilter,
          total: data.total_count,
          error: null,
          page: 1,
          pageStarts: [0],
          exhausted: false,
          moreError: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setResult({
          key,
          params,
          items: null,
          languageFilter,
          total: null,
          page: 1,
          pageStarts: [0],
          exhausted: false,
          moreError: null,
          error:
            error instanceof Error
              ? error.message
              : "Could not load GitHub issues.",
        });
      });

    return () => controller.abort();
  }, [requestKey, debouncedSearch, language, task]);

  // Re-rank only when the issues change, not on every update to `result`
  // (such as a "Load more" error).
  const itemsToRank = result?.items ?? null;
  const itemsKey = result?.key ?? null;

  useEffect(() => {
    if (!itemsToRank || itemsKey === null) return undefined;

    const controller = new AbortController();
    const resultKey = itemsKey;

    rankIssues({
      issues: itemsToRank,
      profile: JSON.parse(profileKey) as ApiProfile,
      signal: controller.signal,
    })
      .then((ranked) => {
        setRanking({ resultKey, ranked, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setRanking({
          resultKey,
          ranked: null,
          error: error instanceof Error ? error.message : "Ranking failed.",
        });
      });

    return () => controller.abort();
  }, [itemsToRank, itemsKey, profileKey]);

  const displayedIssues = liveIssues ?? issues;

  const filteredIssues = useMemo(() => {
    // Live results were already filtered by the API; only samples need it here.
    if (liveIssues !== null) return liveIssues;

    const term = search.toLowerCase().trim();

    return issues.filter((issue) => {
      const matchesSearch =
        !term ||
        `${issue.title} ${issue.repo} ${issue.description}`
          .toLowerCase()
          .includes(term);

      const matchesLanguage =
        language === "All languages" || issue.language === language;

      const matchesTask = task === "All tasks" || issue.type === task;

      return matchesSearch && matchesLanguage && matchesTask;
    });
  }, [search, language, task, liveIssues]);

  async function loadMore() {
    const current = result;
    if (!current?.items || loadingMore) return;

    const controller = new AbortController();
    loadMoreController.current = controller;
    setLoadingMoreFor(current.key);

    try {
      const next = await fetchIssues({
        ...current.params,
        page: current.page + 1,
        signal: controller.signal,
      });

      // Ignore the answer if the filters changed while it was loading.
      setResult((latest) => {
        if (!latest?.items || latest.key !== current.key) return latest;

        const merged = mergeIssues(latest.items, next.items);

        return {
          ...latest,
          items: merged,
          total: next.total_count,
          page: latest.page + 1,
          pageStarts:
            merged.length > latest.items.length
              ? [...latest.pageStarts, latest.items.length]
              : latest.pageStarts,
          exhausted: merged.length === latest.items.length,
          moreError: null,
        };
      });
    } catch (error: unknown) {
      if (controller.signal.aborted) return;

      const message =
        error instanceof Error
          ? error.message
          : "Could not load more issues.";

      setResult((latest) =>
        latest && latest.key === current.key
          ? { ...latest, moreError: message }
          : latest,
      );
    } finally {
      setLoadingMoreFor((key) => (key === current.key ? null : key));
    }
  }

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
                ? loadingIssues
                  ? "Updating results…"
                  : `${liveIssues.length} live issues loaded from GitHub · ${rankingNote}`
                : issueError
                  ? `Showing sample data · ${issueError}`
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
            {liveIssues !== null && totalCount !== null
              ? `Showing ${filteredIssues.length} of ${totalCount.toLocaleString()} matching issues`
              : `${filteredIssues.length} ${
                  filteredIssues.length === 1 ? "issue" : "issues"
                } found`}
          </p>
        </div>

        <ProfilePanel profile={profile} onChange={setProfile} />

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

                    {issue.score !== undefined && (
                      <span
                        className="rounded-full bg-[#f5efe3] px-2 py-0.5 font-semibold text-[#765c35]"
                        title="Fit score, 0 to 100"
                      >
                        Fit {issue.score}
                      </span>
                    )}
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

                    {issue.breakdown && (
                      <ScoreBreakdown breakdown={issue.breakdown} />
                    )}

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

        {liveIssues !== null && result?.items && !loadingIssues && (
          <div className="mt-8 flex flex-col items-center gap-2 text-sm text-[#77766d]">
            {result.moreError && (
              <p role="alert" className="text-[#a14e35]">
                {result.moreError}
              </p>
            )}

            {canLoadMore({
              loaded: result.items.length,
              total: result.total ?? 0,
              exhausted: result.exhausted,
            }) ? (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-full border border-[#e5e0d5] bg-white px-5 py-2.5 font-semibold text-[#24251f] transition hover:border-[#a14e35] disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Load more issues"}
              </button>
            ) : result.items.length >= MAX_LOADED_ISSUES ? (
              <p>
                Showing the first {MAX_LOADED_ISSUES} results. Narrow your
                search to see others.
              </p>
            ) : null}
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
