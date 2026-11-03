# Changelog

## Unreleased

- **Shortlist:** "Refresh status" re-checks saved issues on GitHub, three at a time, and shows when each was checked. Closed, deleted and missing issues are flagged, transferred ones follow their new address, and a rate limit or a sleeping API stops the check politely with a reason.
- **Security:** the rate limits could be dodged by sending a made-up `X-Forwarded-For` header, because uvicorn trusted its first entry, which the visitor controls. The API now uses only the entry Cloudflare appends (`TRUSTED_PROXY_HOPS`). Found from a code review, confirmed against the live API, and covered by tests.
- **Evaluation:** `rate` lets a person rate a pool blind (shuffled, no scores) and `agree` reports agreement between two raters with Cohen's kappa. `capture` now needs `--pool`, so it can't overwrite the development set. The evaluation write-up now says plainly that the 33 ratings are an unreviewed first pass, not yet rated by a person, and that the penalty rules were measured on the issues they came from.
- **Fixes:** CI's web job had two checkouts and two Node setups after a Dependabot merge; it has one of each again. The author email is out of `pyproject.toml`.

## v0.1.0: first public release

Incipit's first release: everything in the 14-day plan in [docs/checkpoints.md](docs/checkpoints.md), live at https://incipit-five.vercel.app.

### What's in it

- **Discovery:** live `good first issue` issues from GitHub, with keyword, language and task-type filters, `owner/repo` search, and "Load more" up to 100 results. Each card shows the repository's main language and stars.
- **Ranking:** five weighted signals (language match, task type, description clarity, repository activity, topics), plus visible penalties for assigned issues and busy discussions. Every score has an expandable explanation. The weights and rules were checked against 33 real issues with first-pass ratings, with golden-ordering tests guarding the result ([evaluation](docs/ranking-evaluation.md)).
- **Dossiers:** each issue checked live on GitHub, with verified facts kept apart from a clearly labelled general checklist, the repository's contributing guide when GitHub reports one, and clear states for closed, deleted, transferred and missing issues.
- **Profile and shortlist:** stored in the browser, validated, synced across tabs, surviving refreshes and blocked storage.
- **Experience:** loading placeholders and a "waking up" note on slow starts, a phone layout checked at 375px, keyboard navigation with visible focus, WCAG AA text contrast, "reduce motion" respected.
- **Security:** the GitHub token stays server-side, CORS allows only the web app, per-visitor rate limits, a 4 MB body cap, validated identifiers, security headers and a Content-Security-Policy on both apps, and CI actions pinned to commit SHAs.
- **Engineering:** CI runs Ruff, Pyright, pytest (99% coverage), ESLint, the TypeScript check, Vitest and the production build on every pull request. Deployment is described in `render.yaml` and [docs/deployment.md](docs/deployment.md), with a smoke test for the live URLs.

### Known limitations

- The fit score is a heuristic for prioritising, not a measure of difficulty: a long, clear issue can still be hard.
- Language match uses only the repository's main language; task types come from labels, which are noisy.
- One repository can take several places in the results.
- The shortlist lives in one browser and shows each issue's state as it was when saved; it does not re-check GitHub.
- The free API sleeps after 15 minutes idle, so the first search afterwards can take up to a minute.
- Rate limits and caches are in memory and reset when the API restarts.
- The ranking evaluation used 33 issues from one day with one unreviewed set of ratings, and the penalty rules were measured on the issues they came from; treat its numbers as direction, not precision.
