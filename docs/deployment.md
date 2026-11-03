# Deploying Incipit

The API runs on [Render](https://render.com) and the web app on [Vercel](https://vercel.com), both on free plans. Each deploys from the `main` branch, so merge your pull request first.

Order matters: the web app needs the API's address at build time, and the API needs the web app's address to allow it through CORS. So: API first, then the web app, then connect the two.

## 1. Create a GitHub token (2 minutes)

The token raises GitHub's limit from 60 to 5,000 requests an hour. Without it, a few searches use up the hour and cards lose their repository details.

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Name it `incipit-api`, set an expiry (90 days is sensible), and under **Repository access** choose **Public repositories (read-only)**.
3. Add no permissions. Incipit only reads public data.
4. Copy the token. You will paste it into Render only. Never put it in Vercel or in any `NEXT_PUBLIC_` variable: those are sent to every visitor's browser.

## 2. Deploy the API to Render (5 minutes)

1. Render → **New** → **Blueprint** → connect GitHub and pick the `incipit` repository. Render reads [`render.yaml`](../render.yaml).
2. It asks for two values:
   - `GITHUB_TOKEN`: the token from step 1.
   - `ALLOWED_ORIGINS`: put `https://example.com` for now. You will replace it in step 4.
3. Apply. The first build takes a few minutes. When it is live, open `https://<your-api>.onrender.com/health`; it should say `{"status":"healthy"}`.

Free Render services sleep after 15 minutes without traffic, and the next request takes up to a minute to wake them. The web app says so instead of failing silently.

## 3. Deploy the web app to Vercel (3 minutes)

1. Vercel → **Add New** → **Project** → import the `incipit` repository.
2. Set **Root Directory** to `apps/web`. Vercel detects Next.js.
3. Add one environment variable, for Production and Preview:
   - `NEXT_PUBLIC_API_BASE_URL` = `https://<your-api>.onrender.com` (no trailing slash).
4. Deploy. Note the address Vercel gives you, such as `https://incipit.vercel.app`.

The web app's Content-Security-Policy only lets the browser call this API address, so if the API address changes, redeploy the web app.

## 4. Connect them (1 minute)

1. Render → `incipit-api` → **Environment** → set `ALLOWED_ORIGINS` to the Vercel address, e.g. `https://incipit.vercel.app` (no trailing slash; separate several with commas). Saving redeploys the API.
2. Preview deployments get their own addresses, which are not allowed unless you add them. That is deliberate: only the production site may call the API from a browser.

## 5. Check it works

From `services/api`, run the smoke test against the live API:

```bash
uv run python scripts/smoke_test.py https://<your-api>.onrender.com --origin https://incipit.vercel.app
```

It checks health, search, repository context, a dossier, ranking, CORS for your site (and refusal for others) and the security headers, and ends with `All checks passed.` Then, in a fresh browser window:

- [ ] The home page lists live issues with languages and stars.
- [ ] A card's title opens its dossier; "Continue on GitHub" opens the issue.
- [ ] Saving an issue survives a page refresh.
- [ ] Changing your profile changes the fit scores.

## Security notes

- **Secrets:** `GITHUB_TOKEN` lives only in Render. The browser never sees it, and nothing in the web app is secret.
- **CORS:** only the origins in `ALLOWED_ORIGINS` can call the API from a browser.
- **Abuse limits:** each visitor gets 60 requests a minute to GitHub-backed routes and 120 to `/rank`, and request bodies are capped at 4 MB. The limits live in memory, so they reset on restart. Visitors are told apart by the address Cloudflare appends to `X-Forwarded-For` (`TRUSTED_PROXY_HOPS=1` in `render.yaml`), not by anything the visitor sends, so a made-up header does not buy a fresh limit. They are still a fairness guard for one free instance, not protection against a botnet; GitHub's own rate limit, which the API reports politely, is the backstop.
- **Headers:** the API sends `nosniff`, `DENY` framing and a no-content CSP; the web app sends a CSP that only allows itself and the API.
- **Rotating the token:** create a new one, paste it into Render, then delete the old one on GitHub.
