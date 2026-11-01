"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { DossierSkeleton, Spinner } from "@/components/loading";
import { ScoreBreakdown } from "@/components/score-breakdown";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  ApiError,
  fetchDossier,
  rankIssues,
  type Dossier,
  type RankedIssue,
} from "@/lib/api";
import { formatCount } from "@/lib/format";
import { parseIssueRoute } from "@/lib/issue-path";
import { isProfileEmpty, toApiProfile } from "@/lib/profile";
import { useSavedIssues } from "@/lib/use-saved-issues";
import { useStoredProfile } from "@/lib/use-stored-profile";

type LoadState =
  | { key: string; status: "ready"; dossier: Dossier }
  | { key: string; status: "missing"; message: string }
  | { key: string; status: "error"; message: string };

type RankState = { key: string; ranked: RankedIssue | null };

function formatDate(value: string | null): string {
  if (!value) return "unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleDateString();
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 py-2 text-sm">
      <dt className="text-[#6b6a61]">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-xl border border-[#d8c6a7] bg-[#f5efe3] px-4 py-3 text-sm text-[#5e4a2b]"
    >
      {children}
    </p>
  );
}

function Shell({ saved, children }: { saved: number; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f6f0] text-[#24251f]">
      <SiteHeader saved={saved} />

      <main id="main" className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6">
        <Link
          href="/#discover"
          className="text-sm text-[#6b6a61] underline-offset-4 hover:text-[#24251f] hover:underline"
        >
          ← Back to discovery
        </Link>
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}

export function IssueDossier({
  owner,
  repo,
  number,
}: {
  owner: string;
  repo: string;
  number: string;
}) {
  const route = parseIssueRoute(owner, repo, number);
  const key = `${owner}/${repo}#${number}`;

  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<LoadState | null>(null);
  const [ranking, setRanking] = useState<RankState | null>(null);
  const [profile] = useStoredProfile();
  const { saved, savedIds, toggle } = useSavedIssues();

  const profileKey = JSON.stringify(toApiProfile(profile));
  const current = load?.key === `${key}:${attempt}` ? load : null;
  const dossier = current?.status === "ready" ? current.dossier : null;

  useEffect(() => {
    if (!route) return undefined;

    const controller = new AbortController();
    const loadKey = `${key}:${attempt}`;

    fetchDossier({ ...route, signal: controller.signal })
      .then((result) => {
        setLoad({ key: loadKey, status: "ready", dossier: result });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        const status = error instanceof ApiError ? error.status : -1;
        const message =
          error instanceof Error ? error.message : "Could not load this issue.";
        setLoad({
          key: loadKey,
          status: status === 404 || status === 410 || status === 422 ? "missing" : "error",
          message,
        });
      });

    return () => controller.abort();
    // `route` is derived from these three strings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, number, attempt]);

  // The tab shows which issue this is once it has loaded.
  useEffect(() => {
    if (dossier) document.title = `${dossier.issue.title} · Incipit`;
  }, [dossier]);

  // The score needs the profile, which lives in this browser, so it comes from
  // POST /rank rather than the dossier itself.
  useEffect(() => {
    if (!dossier) return undefined;

    const controller = new AbortController();
    const rankKey = `${dossier.issue.id}:${profileKey}`;

    rankIssues({
      issues: [dossier.issue],
      profile: JSON.parse(profileKey),
      signal: controller.signal,
    })
      .then((ranked) => setRanking({ key: rankKey, ranked: ranked[0] ?? null }))
      .catch(() => {
        if (!controller.signal.aborted) setRanking({ key: rankKey, ranked: null });
      });

    return () => controller.abort();
  }, [dossier, profileKey]);

  if (!route) {
    return (
      <Shell saved={saved.length}>
        <Missing message="That isn't a valid GitHub issue address." />
      </Shell>
    );
  }

  if (!current) {
    return (
      <Shell saved={saved.length}>
        <p
          className="mt-6 flex items-center gap-3 text-sm text-[#6b6a61]"
          role="status"
        >
          <Spinner />
          Checking {key} on GitHub… If the API was asleep, this can take up to
          a minute.
        </p>
        <DossierSkeleton />
      </Shell>
    );
  }

  if (current.status === "missing") {
    return (
      <Shell saved={saved.length}>
        <Missing message={current.message} />
      </Shell>
    );
  }

  if (current.status === "error") {
    return (
      <Shell saved={saved.length}>
        <div className="mt-10 rounded-2xl border border-[#e5e0d5] bg-white/70 p-6">
          <h1 className="text-xl font-semibold">This issue could not be loaded</h1>
          <p role="alert" className="mt-2 text-sm text-[#a14e35]">
            {current.message}
          </p>
          <button
            onClick={() => setAttempt((value) => value + 1)}
            className="mt-4 rounded-full border border-[#e5e0d5] bg-white px-4 py-2 text-sm font-semibold hover:border-[#a14e35]"
          >
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  const { issue, contributing_guide: guide, guidance } = current.dossier;
  const repoFacts = issue.repo_context;
  const isSaved = savedIds.has(issue.id);
  const rankKey = `${issue.id}:${profileKey}`;
  const ranked = ranking?.key === rankKey ? ranking.ranked : undefined;

  return (
    <Shell saved={saved.length}>
      <article className="mt-6 min-w-0 [overflow-wrap:anywhere]">
        <p className="text-sm text-[#6b6a61]">
          {issue.repository} · #{issue.number}
        </p>

        <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {issue.title}
        </h1>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[#24251f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#a14e35]"
          >
            Continue on GitHub ↗
          </a>

          <button
            onClick={() => toggle(issue)}
            aria-pressed={isSaved}
            className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition ${
              isSaved
                ? "border-[#a14e35] bg-[#a14e35] text-white"
                : "border-[#e5e0d5] bg-white hover:border-[#a14e35]"
            }`}
          >
            {isSaved ? "Saved ✓" : "+ Save to shortlist"}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {current.dossier.moved_from && (
            <Notice>
              This issue was transferred: you followed a link to{" "}
              {current.dossier.moved_from}, and GitHub now keeps it in{" "}
              {issue.repository}.
            </Notice>
          )}
          {issue.state !== "open" && (
            <Notice>
              This issue is {issue.state} on GitHub, so it is probably not looking
              for a contribution. Read the comments before doing any work.
            </Notice>
          )}
          {repoFacts?.archived && (
            <Notice>
              The repository is archived: it is read-only and no longer accepts
              changes.
            </Notice>
          )}
        </div>

        <section className="mt-8 rounded-2xl border border-[#e5e0d5] bg-white/70 p-6">
          <h2 className="text-lg font-semibold">On GitHub</h2>
          <p className="mt-1 text-xs text-[#6b6a61]">
            Copied from GitHub, checked {formatDateTime(current.dossier.checked_at)}.
          </p>

          <dl className="mt-4 divide-y divide-[#eee9df]">
            <Fact label="State">{issue.state}</Fact>
            <Fact label="Repository">
              <a
                href={repoFacts?.url ?? `https://github.com/${issue.repository}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {issue.repository}
              </a>
            </Fact>
            <Fact label="Opened">{formatDate(issue.created_at)}</Fact>
            <Fact label="Last updated">{formatDate(issue.updated_at)}</Fact>
            <Fact label="Comments">{issue.comments}</Fact>
            <Fact label="Assignees">
              {issue.assignees.length > 0
                ? issue.assignees.join(", ")
                : "None listed on GitHub (someone may still be working on it)"}
            </Fact>
            <Fact label="Labels">
              {issue.labels.length > 0 ? issue.labels.join(", ") : "None"}
            </Fact>
            {repoFacts ? (
              <>
                <Fact label="Main language">{repoFacts.language ?? "Not reported"}</Fact>
                <Fact label="Stars">{formatCount(repoFacts.stars)}</Fact>
                <Fact label="Last push">{formatDate(repoFacts.pushed_at)}</Fact>
                <Fact label="Licence">{repoFacts.license ?? "Not recognised by GitHub"}</Fact>
              </>
            ) : (
              <Fact label="Repository details">Unavailable right now</Fact>
            )}
            <Fact label="Contributing guide">
              {guide.status === "found" && guide.url ? (
                <a
                  href={guide.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  Open the guide ↗
                </a>
              ) : guide.status === "not_found" ? (
                "GitHub found none"
              ) : (
                "Could not be checked right now"
              )}
            </Fact>
          </dl>

          <h3 className="mt-6 text-sm font-semibold">Description</h3>
          {issue.body ? (
            <div className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[#f8f6f0] p-4 font-mono text-xs leading-5 text-[#494940]">
              {issue.body}
            </div>
          ) : (
            <p className="mt-2 text-sm text-[#6b6a61]">The issue has no description.</p>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-[#e5e0d5] bg-white/70 p-6">
          <h2 className="text-lg font-semibold">How it may fit you</h2>
          <p className="mt-1 text-xs text-[#6b6a61]">
            Inferred by Incipit, not stated by the project.
          </p>

          <dl className="mt-4 divide-y divide-[#eee9df]">
            <Fact label="Task type">
              {issue.inferred_task_type
                ? `${issue.inferred_task_type} (guessed from labels)`
                : "No label suggests one"}
            </Fact>
            <Fact label="Fit score">
              {ranked === undefined
                ? "Scoring…"
                : ranked === null
                  ? "Unavailable right now"
                  : `${ranked.score} / 100${isProfileEmpty(profile) ? " (set up your profile on the discovery page to personalise this)" : ""}`}
            </Fact>
          </dl>

          {ranked && (
            <ScoreBreakdown breakdown={ranked.breakdown} penalties={ranked.penalties} />
          )}

          <p className="mt-4 text-xs text-[#6b6a61]">
            A score is a rough guide for prioritising, not a promise that the issue
            is easy or that a pull request will be accepted.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-[#e5e0d5] bg-white/70 p-6">
          <h2 className="text-lg font-semibold">A general checklist</h2>
          <p className="mt-1 text-xs text-[#6b6a61]">{guidance.note}</p>

          <ol className="mt-4 space-y-4">
            {guidance.steps.map((step, index) => (
              <li key={step.title} className="flex gap-4 text-sm">
                <span aria-hidden="true" className="font-serif text-[#b5aa99]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="font-semibold">{step.title}</p>
                  <p className="mt-1 text-[#6b6a61]">{step.detail}</p>
                  {step.link && (
                    <a
                      href={step.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-[#a14e35] underline underline-offset-4"
                    >
                      Open it ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </article>
    </Shell>
  );
}

function Missing({ message }: { message: string }) {
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-[#d8d0c2] px-6 py-16 text-center">
      <h1 className="font-serif text-2xl">No issue here.</h1>
      <p className="mt-2 text-sm text-[#6b6a61]">{message}</p>
      <Link
        href="/#discover"
        className="mt-5 inline-block text-sm font-semibold text-[#a14e35] underline underline-offset-4"
      >
        Find another issue
      </Link>
    </div>
  );
}
