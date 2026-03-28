import argparse
import json
import secrets
import sys
import urllib.parse
import urllib.request

AUTH_URL = "https://myanimelist.net/v1/oauth2/authorize"
TOKEN_URL = "https://myanimelist.net/v1/oauth2/token"


def generate_verifier(length: int = 96) -> str:
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def command_authorize(args: argparse.Namespace) -> int:
    code_verifier = args.code_verifier or generate_verifier()
    state = args.state or secrets.token_urlsafe(24)
    params = {
        "response_type": "code",
        "client_id": args.client_id,
        "redirect_uri": args.redirect_uri,
        "code_challenge": code_verifier,
        "code_challenge_method": "plain",
        "state": state,
    }
    url = f"{AUTH_URL}?{urllib.parse.urlencode(params)}"
    print(
        json.dumps(
            {"authorize_url": url, "code_verifier": code_verifier, "state": state},
            indent=2,
        )
    )
    return 0


def command_exchange(args: argparse.Namespace) -> int:
    form = {
        "client_id": args.client_id,
        "client_secret": args.client_secret,
        "code": args.code,
        "code_verifier": args.code_verifier,
        "grant_type": "authorization_code",
    }
    body = urllib.parse.urlencode(form).encode("utf-8")
    req = urllib.request.Request(
        TOKEN_URL,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as response:
        print(response.read().decode("utf-8"))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Helper for MyAnimeList OAuth flows.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    authorize = subparsers.add_parser("authorize", help="Generate MAL authorize URL.")
    authorize.add_argument("--client-id", required=True)
    authorize.add_argument("--redirect-uri", required=True)
    authorize.add_argument("--code-verifier")
    authorize.add_argument("--state")
    authorize.set_defaults(func=command_authorize)

    exchange = subparsers.add_parser("exchange", help="Exchange MAL code for tokens.")
    exchange.add_argument("--client-id", required=True)
    exchange.add_argument("--client-secret", required=True)
    exchange.add_argument("--code", required=True)
    exchange.add_argument("--code-verifier", required=True)
    exchange.set_defaults(func=command_exchange)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except Exception as exc:  # noqa: BLE001
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
