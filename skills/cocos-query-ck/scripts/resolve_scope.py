#!/usr/bin/env python3
"""Resolve current WeNext App names and Cocos WSDK GameType values."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

APP_LIST_URL = "https://lama-dev1-1314119829.cos.ap-guangzhou.myqcloud.com/game-test/app_list.json"
GAME_TYPE_RAW_URL = "https://raw.githubusercontent.com/wenext-limited/cocos-game-wsdk/main/assets/Const.ts"
GAME_TYPE_API_PATH = "repos/wenext-limited/cocos-game-wsdk/contents/assets/Const.ts"
IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def fetch_text(url: str) -> str:
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            return response.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError, OSError, UnicodeDecodeError) as first_error:
        try:
            completed = subprocess.run(
                ["curl", "-fsSL", "--max-time", "20", url],
                check=True,
                capture_output=True,
                text=True,
            )
            return completed.stdout
        except (FileNotFoundError, subprocess.CalledProcessError) as second_error:
            raise RuntimeError(f"Cannot fetch {url}: {first_error}; curl fallback: {second_error}") from second_error


def fetch_apps() -> list[str]:
    data = json.loads(fetch_text(APP_LIST_URL))
    values = data.get("BUCKET_NAME") if isinstance(data, dict) else None
    if not isinstance(values, list):
        raise RuntimeError("App list response does not contain BUCKET_NAME array")
    apps = sorted({str(value) for value in values if value and str(value).lower() != "null"})
    invalid = [value for value in apps if not IDENTIFIER.fullmatch(value)]
    if invalid:
        raise RuntimeError(f"App list contains unsafe database identifiers: {invalid}")
    return apps


def fetch_game_type_source(local_file: Path | None) -> tuple[str, str]:
    if local_file:
        return local_file.read_text(encoding="utf-8"), str(local_file.resolve())
    try:
        completed = subprocess.run(
            ["gh", "api", GAME_TYPE_API_PATH, "--jq", ".content"],
            check=True,
            capture_output=True,
            text=True,
        )
        import base64

        return base64.b64decode(completed.stdout).decode("utf-8"), "github:wenext-limited/cocos-game-wsdk/main/assets/Const.ts"
    except (FileNotFoundError, subprocess.CalledProcessError, ValueError, UnicodeDecodeError):
        return fetch_text(GAME_TYPE_RAW_URL), GAME_TYPE_RAW_URL


def normalize(value: str) -> str:
    return re.sub(r"[\W_]+", "", value, flags=re.UNICODE).casefold()


def parse_games(source: str) -> list[dict[str, object]]:
    block_match = re.search(r"\bGameType\s*=\s*\{(?P<body>[\s\S]*?)\n\s*\}", source)
    if not block_match:
        raise RuntimeError("Cannot locate Const.GameType object")
    games = []
    for line in block_match.group("body").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("//"):
            continue
        match = re.match(r"([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(\d+)\s*,?\s*(?://\s*(.*))?$", stripped)
        if not match:
            continue
        name, number, comment = match.groups()
        if name == "CLIENT_BEGIN":
            continue
        aliases = [name, name.replace("_", " "), name.replace("_", "-")]
        if comment and comment.strip():
            aliases.append(comment.strip())
        aliases = list(dict.fromkeys(aliases))
        games.append({"name": name, "game_type": int(number), "comment": (comment or "").strip(), "aliases": aliases})
    if not games:
        raise RuntimeError("Const.GameType contains no game entries")
    return games


def match_game(query: str, games: list[dict[str, object]]) -> dict[str, object]:
    needle = normalize(query)
    exact = []
    fuzzy = []
    for game in games:
        aliases = [normalize(str(alias)) for alias in game["aliases"]]
        if needle and needle in aliases:
            exact.append(game)
        elif needle and any(needle in alias or alias in needle for alias in aliases):
            fuzzy.append(game)
    if len(exact) == 1:
        status, candidates = "exact", exact
    elif len(exact) > 1:
        status, candidates = "ambiguous", exact
    elif fuzzy:
        status, candidates = ("needs_confirmation" if len(fuzzy) == 1 else "ambiguous"), fuzzy
    else:
        status, candidates = "not_found", []
    return {"query": query, "status": status, "candidates": candidates}


def print_json(value: object) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local-game-types", type=Path, help="Use a local Const.ts instead of the latest GitHub source")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("apps")
    match_app_parser = subparsers.add_parser("match-app")
    match_app_parser.add_argument("name")
    subparsers.add_parser("games")
    match_game_parser = subparsers.add_parser("match-game")
    match_game_parser.add_argument("name")
    args = parser.parse_args()

    try:
        if args.command in {"apps", "match-app"}:
            apps = fetch_apps()
            if args.command == "apps":
                print_json({"source": APP_LIST_URL, "apps": apps})
                return 0
            matches = [app for app in apps if app.casefold() == args.name.casefold()]
            print_json({"query": args.name, "status": "exact" if len(matches) == 1 else "not_found", "candidates": matches})
            return 0 if matches else 2

        source, source_name = fetch_game_type_source(args.local_game_types)
        games = parse_games(source)
        if args.command == "games":
            print_json({"source": source_name, "games": games})
            return 0
        result = match_game(args.name, games)
        result["source"] = source_name
        print_json(result)
        return 0 if result["status"] == "exact" else 2
    except (RuntimeError, OSError, json.JSONDecodeError) as error:
        print_json({"ok": False, "error": str(error)})
        return 1


if __name__ == "__main__":
    sys.exit(main())
