# Anime List Sync [![Build Status](https://github.com/SpreadSheets600/Anime-List-Sync/workflows/go/badge.svg)](https://github.com/SpreadSheets600/Anime-List-Sync/actions)

> Personal template repo forked from
> [bigspawn/anilist-mal-sync](https://github.com/bigspawn/anilist-mal-sync). Wired for
> zero-setup daily syncs via GitHub Actions — there is nothing to run locally.

Synchronizes your [AniList](https://anilist.co) and [MyAnimeList](https://myanimelist.net)
lists (anime + manga) every day at 04:00 UTC.

## What it syncs

- Status, score, progress, start/finish dates (AniList → MAL by default, flippable with
  `--reverse-direction`)
- Favorites (optional, enabled in `sync.yml`)

Details: [docs/behavior.md](docs/behavior.md) · date rules: [docs/date-sync.md](docs/date-sync.md)

## Required secrets

Add these in **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `ANILIST_TOKEN` | AniList access token |
| `ANILIST_USERNAME` | Your AniList username |
| `MAL_TOKEN` | MyAnimeList access token |
| `MAL_USERNAME` | Your MAL username |

## Workflows

| Workflow | Purpose |
|----------|---------|
| `sync.yml` | Daily sync (04:00 UTC) + README stats update |
| `pages.yml` | Deploys the token setup site to GitHub Pages |
| `token.yml` | One-time MyAnimeList token exchange (MAL blocks browsers) |
| `go.yaml` / `golangci-lint.yaml` | CI: build, tests, lint on push |

## Setup

1. Click **Use this template** and create your repo.
2. After the first `pages.yml` run, enable **Settings → Pages → Source: GitHub Actions** and open
   the setup site — it issues the AniList token directly and prepares the MAL one.
3. Run **Get MyAnimeList token** once and copy the access token from its log.
4. Add the four secrets above, then run **Sync anime/manga lists** manually once.

Full guide (incl. optional auto-refresh OAuth mode and troubleshooting):
[docs/setup.md](docs/setup.md)

## Sync Status

<!-- SYNC-STATS:START -->
_Automatically updated by the anilist-mal-sync GitHub Actions workflow._

**Last sync: FAILED** - check the Actions run log for details.
<!-- SYNC-STATS:END -->

## Disclaimer

This project is not affiliated with AniList or MyAnimeList. Use at your own risk.
