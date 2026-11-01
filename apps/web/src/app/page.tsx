"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IssueCard } from "@/components/issue-card";
import { IssueListSkeleton, Spinner } from "@/components/loading";
import { ProfilePanel } from "@/components/profile-panel";
import { SavedList } from "@/components/saved-list";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  checkApiHealth,
  fetchIssues,
  rankIssues,
  type ApiIssue,
  type ApiProfile,
  type RankedIssue,
  type TaskType,
} from "@/lib/api";
import {
  LANGUAGE_FILTERS,
  SAMPLE_ISSUES,
  TASK_FILTERS,
  toCard,
} from "@/lib/cards";
import {
  canLoadMore,
  MAX_LOADED_ISSUES,
  mergeIssues,
  orderWithinPages,
} from "@/lib/pagination";
import { isProfileEmpty, toApiProfile } from "@/lib/profile";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useSavedIssues } from "@/lib/use-saved-issues";
import { useStoredProfile } from "@/lib/use-stored-profile";

const SEARCH_DEBOUNCE_MS = 400;
const PROFILE_DEBOUNCE_MS = 300;
// After this long, say why a search may be slow (free hosting wakes up slowly).
const SLOW_SEARCH_MS = 5000;

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
  notice: string | null; // from the API, e.g. why nothing matched
};

type RankState = {
  resultKey: string; // the search result these scores belong to
  ranked: RankedIssue[] | null;
  error: string | null;
};

export default function Home() {
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("All languages");
  const [task, setTask] = useState("All tasks");
  const {
    saved,
    savedIds,
    toggle: toggleSaved,
    remove: removeSaved,
  } = useSavedIssues();
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  const [result, setResult] = useState<SearchState | null>(null);
  const [ranking, setRanking] = useState<RankState | null>(null);
  // The result key a "Load more" is running for, so a new search never
  // inherits a stuck "Loading…" button from the old one.
  const [loadingMoreFor, setLoadingMoreFor] = useState<string | null>(null);
  const loadMoreController = useRef<AbortController | null>(null);
  // The search that has taken longer than SLOW_SEARCH_MS, if any.
  const [slowFor, setSlowFor] = useState<string | null>(null);
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

  // Still typing counts as searching, so the page reacts at the first key.
  const typing = search.trim() !== debouncedSearch;
  const searching = typing || loadingIssues;
  const pendingKey = `${search.trim()}|${language}|${task}`;
  const slow = searching && slowFor === pendingKey;

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
    if (!searching) return undefined;

    const timer = setTimeout(() => setSlowFor(pendingKey), SLOW_SEARCH_MS);
    return () => clearTimeout(timer);
  }, [searching, pendingKey]);

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
          notice: data.notice,
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
          notice: null,
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

  const filteredIssues = useMemo(() => {
    // Live results were already filtered by the API; only samples need it here.
    if (liveIssues !== null) return liveIssues;

    const term = search.toLowerCase().trim();

    return SAMPLE_ISSUES.filter((issue) => {
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

  const statusLine = searching
    ? slow
      ? "The API is waking up. Free hosting sleeps when idle, so the first search can take up to a minute."
      : "Searching GitHub…"
    : liveIssues !== null
      ? liveIssues.length === 0
        ? "No live issues match this search"
        : `${liveIssues.length} live issues loaded from GitHub · ${rankingNote}`
      : issueError
        ? `Showing sample data · ${issueError}`
        : "Showing sample data";

  return (
    <div className="min-h-screen bg-[#f8f6f0] text-[#24251f]">
      <SiteHeader saved={saved.length} />

      <main id="main">
        <section className="mx-auto max-w-7xl px-4 pb-12 pt-16 sm:px-6 sm:pt-24">
          <div className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#a14e35]">
            <span aria-hidden="true" className="h-px w-8 bg-[#a14e35]" />
            Your open-source story starts here
          </div>

          <div className="grid gap-10 md:grid-cols-[1fr_260px] md:items-end">
            <div>
              <h1 className="max-w-3xl text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.06em] sm:text-7xl">
                Every contribution
                <br />
                has a{" "}
                <span className="font-serif italic text-[#a14e35]">
                  beginning.
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-7 text-[#6b6a61] sm:text-lg">
                Find open-source issues that match your skills, not just
                your ambition. Your first meaningful contribution is
                closer than you think.
              </p>

              <p className="mt-4 text-sm text-[#6b6a61]">
                API status:{" "}
                {apiHealthy === null
                  ? "checking…"
                  : apiHealthy
                    ? "connected"
                    : "unavailable"}
              </p>
            </div>

            <div className="border-l border-[#e5e0d5] pl-5">
              <p className="font-serif text-4xl" aria-hidden={searching}>
                {searching
                  ? "··"
                  : String(filteredIssues.length).padStart(2, "0")}
              </p>

              <p className="mt-1 text-sm text-[#6b6a61]">
                {searching
                  ? "finding issues"
                  : liveIssues !== null
                    ? "live issues to explore"
                    : "sample issues to explore"}
              </p>

              <p className="mt-3 text-xs text-[#6b6a61]">{statusLine}</p>
            </div>
          </div>
        </section>

        <section
          id="discover"
          aria-labelledby="discover-heading"
          className="mx-auto max-w-7xl scroll-mt-6 px-4 pb-20 sm:px-6"
        >
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a14e35]">
                The issue index
              </p>

              <h2
                id="discover-heading"
                className="mt-2 text-2xl font-semibold tracking-tight"
              >
                Find your starting point.
              </h2>
            </div>

            <p className="text-sm text-[#6b6a61]">
              {searching
                ? "Searching…"
                : liveIssues !== null && totalCount !== null
                  ? `Showing ${filteredIssues.length} of ${totalCount.toLocaleString()} matching issues`
                  : `${filteredIssues.length} ${
                      filteredIssues.length === 1 ? "issue" : "issues"
                    } found`}
            </p>
          </div>

          <ProfilePanel profile={profile} onChange={setProfile} />

          <div className="mb-6 grid gap-3 rounded-2xl border border-[#e5e0d5] bg-white/70 p-4 md:grid-cols-[1fr_190px_190px]">
            <label className="flex items-center gap-3 rounded-xl border border-[#e5e0d5] bg-white px-4 py-3 focus-within:border-[#a14e35]">
              {searching ? (
                <Spinner />
              ) : (
                <span aria-hidden="true" className="text-lg text-[#6b6a61]">
                  ⌕
                </span>
              )}

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search keywords, or owner/repo for one project…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-[#6b6a61]"
                aria-label="Search issues"
              />
            </label>

            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              aria-label="Filter by language"
              className="rounded-xl border border-[#e5e0d5] bg-white px-4 py-3 text-sm outline-none focus:border-[#a14e35]"
            >
              {LANGUAGE_FILTERS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>

            <select
              value={task}
              onChange={(event) => setTask(event.target.value)}
              aria-label="Filter by task type"
              className="rounded-xl border border-[#e5e0d5] bg-white px-4 py-3 text-sm outline-none focus:border-[#a14e35]"
            >
              {TASK_FILTERS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>

          {/* What screen readers hear while the visible list is placeholders. */}
          <p role="status" className="sr-only">
            {searching
              ? slow
                ? "Still searching. The API may be waking up."
                : "Searching GitHub for issues."
              : `${filteredIssues.length} ${
                  filteredIssues.length === 1 ? "issue" : "issues"
                } shown.`}
          </p>

          <div aria-busy={searching}>
            {searching ? (
              <>
                {slow && (
                  <p className="mb-4 flex items-center gap-3 rounded-xl border border-[#d8c6a7] bg-[#f5efe3] px-4 py-3 text-sm text-[#5e4a2b]">
                    <Spinner />
                    The API is waking up. Free hosting sleeps when idle, so
                    the first search can take up to a minute.
                  </p>
                )}
                <IssueListSkeleton count={4} />
              </>
            ) : filteredIssues.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#d8d0c2] px-6 py-20 text-center">
                <p className="font-serif text-2xl">Nothing on this page. Yet.</p>

                <p className="mt-2 text-sm text-[#6b6a61]">
                  {result?.key === requestKey && result.notice
                    ? result.notice
                    : "Try another search or loosen your filters."}
                </p>

                <p className="mt-1 text-xs text-[#6b6a61]">
                  Tip: type owner/repo, such as pallets/flask, to see one
                  project&apos;s beginner issues.
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
                  <IssueCard
                    key={issue.id}
                    card={issue}
                    position={index + 1}
                    saved={savedIds.has(issue.id)}
                    onToggleSave={toggleSaved}
                  />
                ))}
              </div>
            )}
          </div>

          {liveIssues !== null && result?.items && !searching && (
            <div className="mt-8 flex flex-col items-center gap-2 text-sm text-[#6b6a61]">
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
                  className="inline-flex items-center gap-2 rounded-full border border-[#e5e0d5] bg-white px-5 py-2.5 font-semibold text-[#24251f] transition hover:border-[#a14e35] disabled:opacity-60"
                >
                  {loadingMore && <Spinner />}
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

          <SavedList saved={saved} onRemove={removeSaved} />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
