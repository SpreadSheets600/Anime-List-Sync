# Sync behavior

What the sync does and how entries are matched between AniList and MyAnimeList.

## What gets synced

For each entry in your list the following fields are synchronized from source to target:

| Field | Synced |
|-------|--------|
| Status (watching / completed / on-hold / dropped / plan to watch) | ✅ |
| Score (automatically normalized between AniList and MAL score formats) | ✅ |
| Progress (episodes watched / chapters + volumes read) | ✅ |
| Start date | ✅ (nil source date never overwrites a set target date) |
| Finish date | ✅ (only when status is Completed) |
| Favorites | ✅ optional, see [Favorites](#favorites-synchronization) |

**Conflict rule:** the source service always wins. The default direction is AniList → MAL; the
workflow can flip it to MAL → AniList with `--reverse-direction`.

## How entries are matched

The sync uses a chain of ID-mapping strategies per direction and media type:

- **Forward anime:** Manual → ID → OfflineDB → Hato → ARM → Title → API search
- **Forward manga:** Manual → ID → Hato → Title → Jikan → API search
- **Reverse anime:** Manual → ID → OfflineDB → Hato → ARM → Title → MAL ID → API search
- **Reverse manga:** Manual → ID → Hato → Title → Jikan → MAL ID → API search

Notes:

- The offline database (anime-offline-database) and ARM API are anime-only; Hato API covers
  anime and manga and is enabled by default.
- Entries that cannot be matched are reported in the sync stats as **Unmapped**.

## Favorites synchronization

Optional phase that runs after the main sync. MAL's API v2 has no favorites endpoint, so the
directions are asymmetric:

| Direction | Read | Write | Behavior |
|-----------|------|-------|----------|
| MAL → AniList | ✅ via Jikan API | ✅ via ToggleFavourite mutation | Adds missing favorites (never removes) |
| AniList → MAL | ✅ via `isFavourite` field | ❌ no MAL API support | Report mismatches only |

Enable it by uncommenting `FAVORITES_SYNC_ENABLED: "true"` in
`.github/workflows/sync.yml` (this also enables the Jikan API automatically).

For detailed documentation, see [docs/favorites-sync.md](favorites-sync.md).

## What is not done by this tool

- No two-way conflict merging (the source always wins)
- No rewatching / rereading count sync
- No syncing of notes or custom lists
