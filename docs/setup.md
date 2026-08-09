# Setup guide

How to deploy this template and run daily syncs with GitHub Actions. Everything happens on
GitHub's infrastructure — no local installation needed.

## Step 1: Create a repo from this template

1. Click **Use this template** and create a repo (public or private).
2. The workflows are ready to go — `.github/workflows/sync.yml` syncs daily, and
   `.github/workflows/pages.yml` deploys the token setup site to GitHub Pages.

> **Security note:** tokens are only ever stored in *your own repository's secrets* — never in
> commits or in the template itself. If you fork a public repo, prefer a **private** copy.

## Step 2: Set up the setup site (once)

The easiest way to get tokens: the setup site hosted on Pages walks you through the whole flow
in the browser.

1. After the Pages deployment finishes, enable Pages in **Settings → Pages → Source: GitHub Actions**
   and open the site.
2. Follow its steps: create the two OAuth apps ([AniList](https://anilist.co/settings/developer),
   [MAL](https://myanimelist.net/apiconfig)) using the **exact redirect URL** the site shows you,
   then authorize each service.
   - **AniList** tokens are exchanged right in the browser (AniList allows CORS), so you get the
     token immediately.
   - **MyAnimeList** blocks browser exchanges, so the site hands you a one-time authorization code
     instead — run the **Get MyAnimeList token** workflow (Actions tab), paste the code + verifier,
     and copy the access token from the run log.
3. Add the tokens and your usernames as secrets (next step).

## Step 3: Configure secrets

In your repo go to **Settings → Secrets and variables → Actions → New repository secret**.
Only these four are required:

| Secret | Value |
|--------|-------|
| `ANILIST_TOKEN` | AniList access token (from the setup site) |
| `ANILIST_USERNAME` | Your AniList username |
| `MAL_TOKEN` | MyAnimeList access token (from the token workflow log) |
| `MAL_USERNAME` | Your MAL username |

**Optional — auto-refreshing OAuth mode:** instead of (or in addition to) the tokens, keep
`TOKEN_JSON` (the full token file, see below) plus the four client credentials
`ANILIST_CLIENT_ID`, `ANILIST_CLIENT_SECRET`, `MAL_CLIENT_ID`, `MAL_CLIENT_SECRET`.
With these, expired access tokens are refreshed automatically by the workflow run.

## Step 4: Run

- **Manual run:** Actions → **Sync anime/manga lists** → **Run workflow** (supports `--dry-run`
  preview, reverse direction, and force flags).
- **Scheduled:** the workflow runs daily at 04:00 UTC; change the `cron` expression in
  `.github/workflows/sync.yml`.

Each run updates the sync stats block in the README:

```
<!-- SYNC-STATS:START -->
_Automatically updated by the anilist-mal-sync GitHub Actions workflow._

**Last sync:** 2026-08-09 04:00:00Z (AniList → MAL) - duration 42s

| Metric | Value |
|--------|-------|
| Total entries | 210 |
| Updated | 3 |
| Skipped | 205 |
| Errors | 0 |
| Unmapped | 2 |
| Favorites added | 1 |
<!-- SYNC-STATS:END -->
```

## How tokens stay valid

- **Token mode (default):** plain access tokens last for ~1 month. When a token expires, re-run the
  setup site flow (or the **Get MyAnimeList token** workflow) and update the secret. The workflow
  fails with a clear error if a token is rejected.
- **OAuth mode (TOKEN_JSON):** the app refreshes expired access tokens automatically using your
  client secret — no re-authentication needed. To obtain a `TOKEN_JSON` value, run the interactive
  OAuth flow once (requires the binary or Docker locally), then store
  `base64 -w0 ~/.config/anilist-mal-sync/token.json` in the `TOKEN_JSON` secret.

## Notes & limitations

- **60-day inactivity rule:** GitHub disables scheduled workflows in repositories with no activity
  for 60+ days. Push a commit (or re-enable the workflow on the Actions tab) to resume syncing.
- **Timing:** scheduled workflows may run a few minutes late under heavy GitHub load — harmless for
  daily syncs.
- **Rate limits:** a daily sync of a few hundred entries stays well within both APIs' rate limits.
- **Offline database:** cached between runs by the workflow's cache step, avoiding a re-download
  (~100 MB) on every sync.
- **Tokens in run logs:** the one-time **Get MyAnimeList token** workflow intentionally prints your
  access token so you can copy it into secrets — treat that run's log as sensitive.

## Troubleshooting

**"Missing secrets" error on the sync workflow run**

The four required secrets are not all set (or `ANILIST_TOKEN`/`MAL_TOKEN` together with the
optional client credentials are missing). See [Step 3](#step-3-configure-secrets).

**"Token rejected" / 401 errors**

Tokens expire after ~1 month in token mode. Re-run the setup site flow and update the secret.

**Sync appears frozen**

Both services have rate limits; the workflow retries with backoff. Wait for the run to finish.
