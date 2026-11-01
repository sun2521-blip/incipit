# Changelog

## v0.1.0: first public release

Incipit's first release: everything in the 14-day plan in [docs/checkpoints.md](docs/checkpoints.md), live at https://incipit-five.vercel.app.

### What's in it

- **Discovery:** live `good first issue` issues from GitHub, with keyword, language and task-type filters, `owner/repo` search, and "Load more" up to 100 results. Each card shows the repository's main language and stars.
- **Ranking:** five weighted signals (language match, task type, description clarity, repository activity, topics), plus visible penalties for assigned issues and busy discussions. Every score has an expandable explanation. The weights and rules were checked against 33 real, rated issues, with golden-ordering tests guarding the result ([evaluation](docs/ranking-evaluation.md)).
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
- The ranking evaluation used 33 issues from one day and one rater; treat its numbers as direction, not precision.
