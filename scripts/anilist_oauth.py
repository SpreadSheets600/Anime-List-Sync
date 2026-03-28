import argparse
import json
import secrets
import urllib.parse

AUTH_URL = "https://anilist.co/api/v2/oauth/authorize"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate an AniList implicit OAuth URL."
    )
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--redirect-uri", required=True)
    parser.add_argument("--state")
    args = parser.parse_args()

    state = args.state or secrets.token_urlsafe(24)
    url = f"{AUTH_URL}?{urllib.parse.urlencode({'client_id': args.client_id, 'redirect_uri': args.redirect_uri, 'response_type': 'token', 'state': state})}"
    print(json.dumps({"authorize_url": url, "state": state}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
