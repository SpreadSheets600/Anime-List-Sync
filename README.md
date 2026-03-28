# Anime List Sync

Minimal daily sync from AniList to:

- MyAnimeList
- AnimeSchedule.net

The repo intentionally keeps this simple:

- one Python script
- no third-party dependencies
- one GitHub Actions workflow
- AniList is the source of truth

## What it syncs

For each AniList anime entry, the workflow copies:

- score
- status
- start date
- watched episode count
- finish date for completed shows

## Required GitHub secrets

### AniList

- `ANILIST_TOKEN`

### MyAnimeList

- `MAL_ACCESS_TOKEN` # Direct Access Token

or

- `MAL_CLIENT_ID`
- `MAL_CLIENT_SECRET` 
- `MAL_REFRESH_TOKEN` # Refresh Access Token

### AnimeSchedule.net

- `ANIMESCHEDULE_TOKEN`

## Notes

- The workflow runs every day at `03:00 UTC` and can also be triggered manually.
- If MAL credentials or AnimeSchedule credentials are missing then it would be skipped.
- The workflow writes a small run summary to `status/latest.json` and uploads it as an artifact.

## Local run

```bash
ANILIST_TOKEN=... \
MAL_ACCESS_TOKEN=... \
ANIMESCHEDULE_TOKEN=... \
SYNC_DRY_RUN=true \
python3 src/anime_list_sync.py
```

## Mapping

- AniList `CURRENT` -> MAL `watching` -> AnimeSchedule `watching`
- AniList `COMPLETED` -> MAL `completed` -> AnimeSchedule `completed`
- AniList `PAUSED` -> MAL `on_hold` -> AnimeSchedule `on-hold`
- AniList `DROPPED` -> MAL `dropped` -> AnimeSchedule `dropped`
- AniList `PLANNING` -> MAL `plan_to_watch` -> AnimeSchedule `to-watch`

## Important limitation

This is a one-way sync from AniList outward. It does not merge changes back from MAL or AnimeSchedule, and it does not try to resolve conflicts between platforms.
