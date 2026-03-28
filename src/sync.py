import json
import logging
import os
import sys
from dataclasses import dataclass
from datetime import date
from typing import Any
from urllib import error, parse, request

ANILIST_API = "https://graphql.anilist.co"
MAL_API = "https://api.myanimelist.net/v2"
MAL_OAUTH = "https://myanimelist.net/v1/oauth2/token"
ANIMESCHEDULE_API = "https://animeschedule.net/api/v3"


ANILIST_VIEWER_QUERY = """
query ViewerName {
  Viewer {
    id
    name
  }
}
""".strip()


ANILIST_LIST_QUERY = """
query ViewerAnimeList($userName: String) {
  MediaListCollection(userName: $userName, type: ANIME) {
    lists {
      name
      entries {
        status
        score(format: POINT_10)
        progress
        repeat
        startedAt {
          year
          month
          day
        }
        completedAt {
          year
          month
          day
        }
        updatedAt
        media {
          id
          idMal
          episodes
          title {
            romaji
            english
            native
          }
        }
      }
    }
  }
}
""".strip()


ANILIST_TO_MAL_STATUS = {
    "CURRENT": "watching",
    "COMPLETED": "completed",
    "PAUSED": "on_hold",
    "DROPPED": "dropped",
    "PLANNING": "plan_to_watch",
    "REPEATING": "watching",
}

ANILIST_TO_ANIMESCHEDULE_STATUS = {
    "CURRENT": "watching",
    "COMPLETED": "completed",
    "PAUSED": "on-hold",
    "DROPPED": "dropped",
    "PLANNING": "to-watch",
    "REPEATING": "watching",
}


@dataclass
class SyncEntry:
    anilist_id: int
    mal_id: int | None
    title: str
    status: str
    progress: int
    score_10: int
    started_at: str | None
    completed_at: str | None
    updated_at: int | None

    @property
    def score_100(self) -> int:
        return self.score_10 * 10


def setup_logging() -> None:
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, level_name, logging.INFO),
        format="%(levelname)s %(message)s",
    )


def bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def make_date(value: dict[str, Any] | None) -> str | None:
    if not value:
        return None
    year = value.get("year")
    month = value.get("month")
    day = value.get("day")
    if not year or not month or not day:
        return None
    return date(year, month, day).isoformat() + "T00:00:00Z"


def http_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    payload: dict[str, Any] | None = None,
    form: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, str]]:
    request_headers = {"Accept": "application/json", **(headers or {})}

    body: bytes | None = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    elif form is not None:
        body = parse.urlencode(form).encode("utf-8")
        request_headers["Content-Type"] = "application/x-www-form-urlencoded"

    req = request.Request(url, data=body, headers=request_headers, method=method)
    try:
        with request.urlopen(req) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
            return data, dict(response.headers.items())
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        detail = raw
        try:
            detail = json.dumps(json.loads(raw))
        except json.JSONDecodeError:
            pass
        raise RuntimeError(f"{method} {url} failed: HTTP {exc.code} {detail}") from exc


def http_no_content(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, str]:
    request_headers = {"Accept": "application/json", **(headers or {})}
    body: bytes | None = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"

    req = request.Request(url, data=body, headers=request_headers, method=method)
    try:
        with request.urlopen(req) as response:
            response.read()
            return dict(response.headers.items())
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed: HTTP {exc.code} {raw}") from exc


def extract_anime_schedule_items(response_data: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("anime", "items", "data", "results"):
        value = response_data.get(key)
        if isinstance(value, list):
            return value
    if isinstance(response_data, list):
        return response_data
    return []


def normalize_score_10(value: Any) -> int:
    if value in (None, "", 0, 0.0):
        return 0
    try:
        score = round(float(value))
    except (TypeError, ValueError):
        return 0
    return max(0, min(score, 10))


def fetch_anilist_entries(token: str) -> tuple[str, list[SyncEntry]]:
    viewer_data, _ = http_json(
        "POST",
        ANILIST_API,
        headers={"Authorization": f"Bearer {token}"},
        payload={"query": ANILIST_VIEWER_QUERY, "variables": {}},
    )

    if "errors" in viewer_data:
        raise RuntimeError(
            f"AniList returned errors: {json.dumps(viewer_data['errors'])}"
        )

    viewer = viewer_data["data"]["Viewer"]
    data, _ = http_json(
        "POST",
        ANILIST_API,
        headers={"Authorization": f"Bearer {token}"},
        payload={
            "query": ANILIST_LIST_QUERY,
            "variables": {"userName": viewer["name"]},
        },
    )
    if "errors" in data:
        raise RuntimeError(f"AniList returned errors: {json.dumps(data['errors'])}")

    entries: list[SyncEntry] = []
    seen_media_ids: set[int] = set()

    collection = data["data"].get("MediaListCollection") or {}
    for anime_list in collection.get("lists") or []:
        for entry in anime_list.get("entries") or []:
            media = entry["media"]
            media_id = media["id"]
            if media_id in seen_media_ids:
                continue
            seen_media_ids.add(media_id)
            title = (
                media["title"].get("english")
                or media["title"].get("romaji")
                or media["title"].get("native")
                or str(media_id)
            )
            entries.append(
                SyncEntry(
                    anilist_id=media_id,
                    mal_id=media.get("idMal"),
                    title=title,
                    status=entry["status"],
                    progress=max(0, int(entry.get("progress") or 0)),
                    score_10=normalize_score_10(entry.get("score")),
                    started_at=make_date(entry.get("startedAt")),
                    completed_at=make_date(entry.get("completedAt")),
                    updated_at=entry.get("updatedAt"),
                )
            )

    return viewer["name"], entries


def get_mal_access_token() -> str | None:
    access_token = os.getenv("MAL_ACCESS_TOKEN")
    if access_token:
        return access_token

    refresh_token = os.getenv("MAL_REFRESH_TOKEN")
    client_id = os.getenv("MAL_CLIENT_ID")
    client_secret = os.getenv("MAL_CLIENT_SECRET")
    if not refresh_token or not client_id:
        return None

    form = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
    }
    if client_secret:
        form["client_secret"] = client_secret

    data, _ = http_json("POST", MAL_OAUTH, form=form)
    token = data.get("access_token")
    if not token:
        raise RuntimeError("MAL OAuth refresh succeeded without access_token")
    return token


def build_mal_payload(entry: SyncEntry) -> dict[str, Any]:
    status = ANILIST_TO_MAL_STATUS.get(entry.status)
    if not status:
        raise RuntimeError(f"Unsupported AniList status for MAL sync: {entry.status}")

    payload: dict[str, Any] = {
        "status": status,
        "num_watched_episodes": entry.progress,
    }
    if entry.score_10 > 0:
        payload["score"] = entry.score_10
    if entry.started_at:
        payload["start_date"] = entry.started_at[:10]
    if entry.completed_at and entry.status == "COMPLETED":
        payload["finish_date"] = entry.completed_at[:10]
    return payload


def sync_to_mal(entries: list[SyncEntry], dry_run: bool) -> dict[str, int]:
    token = get_mal_access_token()
    if not token:
        logging.info("Skipping MyAnimeList sync: MAL credentials are not configured")
        return {"synced": 0, "skipped": len(entries)}

    synced = 0
    skipped = 0
    headers = {"Authorization": f"Bearer {token}"}

    for entry in entries:
        if not entry.mal_id:
            skipped += 1
            logging.debug("Skipping MAL sync for %s: no MAL id", entry.title)
            continue

        payload = build_mal_payload(entry)
        url = f"{MAL_API}/anime/{entry.mal_id}/my_list_status"
        if dry_run:
            logging.info("DRY RUN MAL %s -> %s", entry.title, payload)
            synced += 1
            continue

        http_no_content("PUT", url, headers=headers, payload=payload)
        synced += 1
        logging.info("MAL synced: %s", entry.title)

    return {"synced": synced, "skipped": skipped}


def anime_schedule_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def lookup_anime_schedule_route(token: str, entry: SyncEntry) -> str | None:
    query = parse.urlencode({"anilist-ids": entry.anilist_id})
    data, _ = http_json(
        "GET",
        f"{ANIMESCHEDULE_API}/anime?{query}",
        headers=anime_schedule_headers(token),
    )
    items = extract_anime_schedule_items(data)
    if items:
        route = items[0].get("route")
        if route:
            return route

    if entry.mal_id:
        query = parse.urlencode({"mal-ids": entry.mal_id})
        data, _ = http_json(
            "GET",
            f"{ANIMESCHEDULE_API}/anime?{query}",
            headers=anime_schedule_headers(token),
        )
        items = extract_anime_schedule_items(data)
        if items:
            return items[0].get("route")

    return None


def build_anime_schedule_payload(entry: SyncEntry) -> dict[str, Any]:
    status = ANILIST_TO_ANIMESCHEDULE_STATUS.get(entry.status)
    if not status:
        raise RuntimeError(
            f"Unsupported AniList status for AnimeSchedule sync: {entry.status}"
        )

    payload: dict[str, Any] = {
        "listStatus": status,
        "episodesSeen": entry.progress,
        "manualScore": entry.score_100,
    }
    if entry.started_at:
        payload["startDate"] = entry.started_at
    if entry.completed_at and entry.status == "COMPLETED":
        payload["endDate"] = entry.completed_at
    return payload


def sync_to_anime_schedule(entries: list[SyncEntry], dry_run: bool) -> dict[str, int]:
    token = os.getenv("ANIMESCHEDULE_TOKEN")
    if not token:
        logging.info(
            "Skipping AnimeSchedule sync: ANIMESCHEDULE_TOKEN is not configured"
        )
        return {"synced": 0, "skipped": len(entries), "unmatched": 0}

    synced = 0
    skipped = 0
    unmatched = 0

    for entry in entries:
        route = lookup_anime_schedule_route(token, entry)
        if not route:
            unmatched += 1
            logging.warning("AnimeSchedule route not found: %s", entry.title)
            continue

        item_url = f"{ANIMESCHEDULE_API}/animelists/oauth/{route}"
        _, response_headers = http_json(
            "GET", item_url, headers=anime_schedule_headers(token)
        )
        etag = response_headers.get("Etag") or response_headers.get("ETag")
        if not etag:
            skipped += 1
            logging.warning("AnimeSchedule Etag missing: %s", entry.title)
            continue

        payload = build_anime_schedule_payload(entry)
        headers = {**anime_schedule_headers(token), "Etag": etag}

        if dry_run:
            logging.info("DRY RUN AnimeSchedule %s -> %s", entry.title, payload)
            synced += 1
            continue

        http_no_content("PUT", item_url, headers=headers, payload=payload)
        synced += 1
        logging.info("AnimeSchedule synced: %s", entry.title)

    return {"synced": synced, "skipped": skipped, "unmatched": unmatched}


def write_status(summary: dict[str, Any]) -> None:
    output_path = os.getenv("STATUS_PATH", "status/latest.json")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2, sort_keys=True)
        handle.write("\n")


def main() -> int:
    setup_logging()
    dry_run = bool_env("SYNC_DRY_RUN")

    anilist_token = os.getenv("ANILIST_TOKEN")
    if not anilist_token:
        logging.error("ANILIST_TOKEN is required")
        return 1

    viewer_name, entries = fetch_anilist_entries(anilist_token)
    logging.info("Fetched %s AniList entries for %s", len(entries), viewer_name)

    mal_summary = sync_to_mal(entries, dry_run=dry_run)
    anime_schedule_summary = sync_to_anime_schedule(entries, dry_run=dry_run)

    summary = {
        "dry_run": dry_run,
        "viewer": viewer_name,
        "entries": len(entries),
        "mal": mal_summary,
        "anime_schedule": anime_schedule_summary,
    }
    write_status(summary)
    logging.info("Sync finished: %s", json.dumps(summary, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
