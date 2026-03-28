#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import secrets
import sys
import urllib.parse
import urllib.request


AUTH_URL = "https://animeschedule.net/api/v3/oauth2/authorize"
TOKEN_URL = "https://animeschedule.net/api/v3/oauth2/token"


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
    if args.scope:
        params["scope"] = args.scope

    print(
        json.dumps(
            {
                "authorize_url": f"{AUTH_URL}?{urllib.parse.urlencode(params)}",
                "code_verifier": code_verifier,
                "state": state,
                "scope": args.scope or "",
            },
            indent=2,
        )
    )
    return 0


def submit_form(form: dict[str, str]) -> int:
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


def command_exchange(args: argparse.Namespace) -> int:
    form = {
        "grant_type": "authorization_code",
        "client_id": args.client_id,
        "code": args.code,
        "code_verifier": args.code_verifier,
        "redirect_uri": args.redirect_uri,
    }
    if args.client_secret:
        form["client_secret"] = args.client_secret
    return submit_form(form)


def command_refresh(args: argparse.Namespace) -> int:
    form = {
        "grant_type": "refresh_token",
        "client_id": args.client_id,
        "refresh_token": args.refresh_token,
    }
    if args.client_secret:
        form["client_secret"] = args.client_secret
    return submit_form(form)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Helper for AnimeSchedule OAuth2 authorization-code flows."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    authorize = subparsers.add_parser(
        "authorize", help="Generate AnimeSchedule authorize URL."
    )
    authorize.add_argument("--client-id", required=True)
    authorize.add_argument("--redirect-uri", required=True)
    authorize.add_argument("--scope")
    authorize.add_argument("--code-verifier")
    authorize.add_argument("--state")
    authorize.set_defaults(func=command_authorize)

    exchange = subparsers.add_parser(
        "exchange", help="Exchange AnimeSchedule code for tokens."
    )
    exchange.add_argument("--client-id", required=True)
    exchange.add_argument("--redirect-uri", required=True)
    exchange.add_argument("--code", required=True)
    exchange.add_argument("--code-verifier", required=True)
    exchange.add_argument("--client-secret")
    exchange.set_defaults(func=command_exchange)

    refresh = subparsers.add_parser(
        "refresh", help="Refresh an AnimeSchedule OAuth token."
    )
    refresh.add_argument("--client-id", required=True)
    refresh.add_argument("--refresh-token", required=True)
    refresh.add_argument("--client-secret")
    refresh.set_defaults(func=command_refresh)

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
