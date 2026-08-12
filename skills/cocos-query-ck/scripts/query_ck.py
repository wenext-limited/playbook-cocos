#!/usr/bin/env python3
"""Validate and execute guarded, read-only ClickHouse queries over HTTP."""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import json
import os
import re
import stat
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from resolve_scope import fetch_apps

ENVIRONMENTS = {
    "prod": {
        "host": "cc-t4nnjid28p401lh59-ck-l8.clickhouseserver.singapore.rds.aliyuncs.com",
        "port": 8123,
        "user": "clickhouse_read",
        "table": "event_local_prod",
        "secure": False,
    },
    "test": {
        "host": "43.156.112.94",
        "port": 8123,
        "user": "read_only",
        "table": "event_local_test",
        "secure": False,
    },
}
IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
ALLOWED_START = re.compile(r"^\s*(?:SELECT\b|WITH\b[\s\S]*?\bSELECT\b|SHOW\b|DESC(?:RIBE)?\b|EXPLAIN\b|EXISTS\b)", re.I)
FORBIDDEN = re.compile(r"\b(?:INSERT|ALTER|DROP|TRUNCATE|DELETE|UPDATE|OPTIMIZE|SYSTEM|KILL|CREATE|RENAME|ATTACH|DETACH|GRANT|REVOKE)\b", re.I)


class QueryFailure(RuntimeError):
    def __init__(self, message: str, exit_code: int):
        super().__init__(message)
        self.exit_code = exit_code


def strip_comments(sql: str) -> str:
    return re.sub(r"/\*.*?\*/|--[^\n]*", " ", sql, flags=re.S).strip().rstrip(";").strip()


def validate_identifier(value: str, label: str) -> str:
    if not IDENTIFIER.fullmatch(value):
        raise QueryFailure(f"Invalid {label}: {value!r}", 1)
    return value


def validate_sql(sql: str, table: str, allow_cross_event: bool, allow_event_value: bool) -> str:
    normalized = strip_comments(sql)
    if not normalized:
        raise QueryFailure("SQL is empty", 1)
    if ";" in normalized:
        raise QueryFailure("Multiple SQL statements are not allowed", 3)
    if not ALLOWED_START.match(normalized) or FORBIDDEN.search(normalized):
        raise QueryFailure("Only read-only SELECT/SHOW/DESCRIBE/EXPLAIN/EXISTS queries are allowed", 3)
    if re.search(r"\bINTO\s+OUTFILE\b|\bFORMAT\s+[A-Za-z]", normalized, re.I):
        raise QueryFailure("INTO OUTFILE and caller-supplied FORMAT clauses are not allowed", 3)
    if re.search(r"\bevent_value\b|\bJSONExtract\w*\s*\(", normalized, re.I) and not allow_event_value:
        raise QueryFailure(
            "event_value/JSONExtract fallback is disabled by default; use top-level typed columns, or add --allow-event-value after confirming fallback is necessary",
            3,
        )

    other_environment_tables = {str(config["table"]) for config in ENVIRONMENTS.values()} - {table}
    mismatched_tables = [name for name in other_environment_tables if re.search(rf"\b{re.escape(name)}\b", normalized, re.I)]
    if mismatched_tables:
        raise QueryFailure(
            f"SQL references event table(s) from another environment: {mismatched_tables}; use {{table}} with the selected --env",
            3,
        )

    event_table_used = "{table}" in sql or re.search(rf"\b{re.escape(table)}\b", normalized, re.I)
    if event_table_used:
        has_lower = re.search(r"\bevent_time\b\s*(?:>=|>|BETWEEN\b)", normalized, re.I)
        has_upper = re.search(r"\bevent_time\b\s*(?:<=|<|BETWEEN\b)", normalized, re.I)
        if not (has_lower and has_upper):
            raise QueryFailure("Event-table queries require both lower and upper event_time bounds", 3)
        has_cocos_action = re.search(
            r"\b(?:PREWHERE|WHERE)\b(?:(?!\b(?:GROUP\s+BY|ORDER\s+BY|LIMIT|SETTINGS|FORMAT|UNION)\b)[\s\S])*?\baction\b\s*=\s*['\"]cocos_js['\"]",
            normalized,
            re.I,
        )
        if not has_cocos_action:
            raise QueryFailure("Cocos event-table queries must filter action='cocos_js' in PREWHERE or WHERE", 3)
        has_event_filter = re.search(
            r"\b(?:PREWHERE|WHERE)\b(?:(?!\b(?:GROUP\s+BY|ORDER\s+BY|LIMIT|SETTINGS|FORMAT|UNION)\b)[\s\S])*?\bevent_id\b\s*(?:=|IN\s*\()",
            normalized,
            re.I,
        )
        if not has_event_filter:
            if not allow_cross_event:
                raise QueryFailure("Event-table queries require a concrete event_id; use --allow-cross-event only for cross-event metrics", 3)
            has_game_type_filter = re.search(r"\b(?:game_type|long_key_1)\b\s*(?:=|IN\s*\()", normalized, re.I)
            if not has_game_type_filter:
                raise QueryFailure("Cross-event queries must filter a concrete game_type or long_key_1", 3)

    return normalized.replace("{table}", table)


def load_credentials(config_path: Path, env: str) -> dict[str, object]:
    environment_password = os.environ.get(f"CLICKHOUSE_{env.upper()}_PASSWORD") or os.environ.get("CLICKHOUSE_PASSWORD")
    if environment_password:
        return {"password": environment_password}

    config: dict[str, object] = {}
    if config_path.exists():
        if os.name != "nt" and stat.S_IMODE(config_path.stat().st_mode) & 0o077:
            raise QueryFailure(f"Credential file permissions are too open: {config_path}; run chmod 600", 2)
        try:
            raw = json.loads(config_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise QueryFailure(f"Cannot read credential file {config_path}: {error}", 2) from error
        if not isinstance(raw, dict):
            raise QueryFailure("Credential file must contain a JSON object", 2)
        selected = raw.get(env, raw)
        if not isinstance(selected, dict):
            raise QueryFailure(f"Credential config section {env!r} must be an object", 2)
        config.update(selected)

    password = config.get("password")
    if not password:
        template = '{"prod":{"password":"<prod-read-only-password>"},"test":{"password":"<test-read-only-password>"}}'
        raise QueryFailure(
            f"Missing ClickHouse password. Set CLICKHOUSE_{env.upper()}_PASSWORD / CLICKHOUSE_PASSWORD or create {config_path} with mode 600: {template}",
            2,
        )
    config["password"] = password
    return config


def build_connection(env: str, environment: dict[str, object], credentials: dict[str, object]) -> dict[str, object]:
    merged = {**environment, **credentials}
    overrides = {}
    for key in ("host", "port", "user"):
        environment_key = f"CLICKHOUSE_{env.upper()}_{key.upper()}"
        overrides[key] = os.environ.get(environment_key) or os.environ.get(f"CLICKHOUSE_{key.upper()}")
    for key, value in overrides.items():
        if value not in {None, ""}:
            merged[key] = int(value) if key == "port" else value
    other_environment_hosts = {str(config["host"]) for name, config in ENVIRONMENTS.items() if name != env}
    if str(merged["host"]) in other_environment_hosts:
        raise QueryFailure(f"Configured host {merged['host']!r} belongs to another environment; refusing --env {env!r}", 3)
    return merged


def execute_one(database: str, sql: str, connection: dict[str, object], timeout: float, retries: int) -> dict[str, object]:
    validate_identifier(database, "database")
    scheme = "https" if connection.get("secure") else "http"
    params = {
        "database": database,
        "max_result_rows": 10000,
        "result_overflow_mode": "throw",
    }
    url = f"{scheme}://{connection['host']}:{int(connection['port'])}/?{urllib.parse.urlencode(params)}"
    auth = base64.b64encode(f"{connection['user']}:{connection['password']}".encode()).decode()
    request = urllib.request.Request(
        url,
        data=(sql + " FORMAT JSON").encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Basic {auth}", "Content-Type": "text/plain; charset=utf-8"},
    )
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return {"ok": True, "database": database, "result": json.load(response)}
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            return {"ok": False, "database": database, "error": f"ClickHouse HTTP {error.code}: {detail}"}
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last_error = error
            if attempt < retries:
                time.sleep(min(0.5 * (2**attempt), 2.0))
    return {"ok": False, "database": database, "error": f"ClickHouse connection failed: {last_error}"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sql", nargs="?", help="SQL containing {table} for the environment event table")
    parser.add_argument("--stdin", action="store_true", help="Read SQL from stdin")
    parser.add_argument("--env", choices=ENVIRONMENTS, help="Query environment; defaults to prod when omitted")
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--database")
    scope.add_argument("--databases", help="Comma-separated validated App/database names")
    scope.add_argument("--all-apps", action="store_true", help="Resolve and query every current App database")
    parser.add_argument("--table", help="Override the environment event table")
    parser.add_argument("--config", type=Path, default=Path.home() / ".wenext" / "clickhouse.json")
    parser.add_argument("--allow-cross-event", action="store_true")
    parser.add_argument("--allow-event-value", action="store_true", help="Allow explicit legacy/custom JSON fallback after top-level fields are ruled out")
    parser.add_argument("--validate-only", action="store_true", help="Validate and print SQL without connecting")
    parser.add_argument("--timeout", type=float, default=64)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--compact", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    sql = sys.stdin.read() if args.stdin else args.sql
    if not sql or not sql.strip():
        print(json.dumps({"ok": False, "error": "Provide SQL or use --stdin"}, ensure_ascii=False), file=sys.stderr)
        return 1
    if args.timeout <= 0 or args.retries < 0 or not 1 <= args.workers <= 8:
        print(json.dumps({"ok": False, "error": "timeout must be positive, retries non-negative, workers 1..8"}, ensure_ascii=False), file=sys.stderr)
        return 1

    env = args.env or "prod"
    environment_defaulted = args.env is None
    environment = ENVIRONMENTS[env]
    try:
        expected_table = str(environment["table"])
        table = validate_identifier(args.table or expected_table, "table")
        if table != expected_table:
            raise QueryFailure(
                f"Table {table!r} does not match --env {env!r}; expected {expected_table!r}. Use {{table}} instead of crossing environments.",
                3,
            )
        validated_sql = validate_sql(sql, table, args.allow_cross_event, args.allow_event_value)
        available_apps = fetch_apps()
        app_lookup = {app.casefold(): app for app in available_apps}
        if args.all_apps:
            databases = available_apps
        elif args.databases:
            requested = [validate_identifier(item.strip(), "database") for item in args.databases.split(",") if item.strip()]
            unknown = [item for item in requested if item.casefold() not in app_lookup]
            if unknown:
                raise QueryFailure(f"Unknown App/database values: {unknown}", 1)
            databases = [app_lookup[item.casefold()] for item in requested]
        elif args.database:
            requested = validate_identifier(args.database, "database")
            if requested.casefold() not in app_lookup:
                raise QueryFailure(f"Unknown App/database: {requested}", 1)
            databases = [app_lookup[requested.casefold()]]
        else:
            raise QueryFailure("Specify --database, --databases, or --all-apps", 1)
        if not databases:
            raise QueryFailure("No databases selected", 1)
        databases = list(dict.fromkeys(databases))

        if args.validate_only:
            output = {
                "ok": True,
                "validated": True,
                "environment": env,
                "environment_defaulted": environment_defaulted,
                "host": str(environment["host"]),
                "port": int(environment["port"]),
                "databases": databases,
                "table": table,
                "sql": validated_sql,
            }
            print(json.dumps(output, ensure_ascii=False, indent=None if args.compact else 2))
            return 0

        credentials = load_credentials(args.config, env)
        connection = build_connection(env, environment, credentials)
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(args.workers, len(databases))) as executor:
            future_by_database = {
                executor.submit(execute_one, database, validated_sql, connection, args.timeout, args.retries): database
                for database in databases
            }
            by_database = {future_by_database[future]: future.result() for future in concurrent.futures.as_completed(future_by_database)}
        results = [by_database[database] for database in databases]
        output = {
            "ok": all(item["ok"] for item in results),
            "environment": env,
            "environment_defaulted": environment_defaulted,
            "host": str(connection["host"]),
            "port": int(connection["port"]),
            "databases": databases,
            "table": table,
            "results": results,
        }
        print(json.dumps(output, ensure_ascii=False, indent=None if args.compact else 2, default=str))
        return 0 if output["ok"] else 3
    except QueryFailure as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return error.exit_code
    except (RuntimeError, OSError, json.JSONDecodeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
