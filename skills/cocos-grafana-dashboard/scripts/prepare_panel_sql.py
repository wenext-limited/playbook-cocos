#!/usr/bin/env python3
"""Render one guarded SQL template for CK validation and Grafana use."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any


TIME_MARKER = "__TIME_FILTER__"
TABLE_MARKER = "{table}"
MAX_WINDOW_SECONDS = 14 * 24 * 60 * 60


class PrepareError(RuntimeError):
    pass


def parse_time(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise PrepareError(
            f"Invalid ISO datetime {value!r}; use YYYY-MM-DD HH:MM:SS or an ISO offset"
        ) from exc


def sql_literal(value: datetime) -> str:
    rendered = value.isoformat(sep=" ", timespec="seconds")
    return rendered.replace("'", "''")


def atomic_write_text(path: Path, content: str, force: bool) -> None:
    if path.exists() and not force:
        raise PrepareError(f"Output already exists: {path}; pass --force to replace it")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
            if not content.endswith("\n"):
                handle.write("\n")
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise


def default_query_script() -> Path:
    skills_dir = Path(__file__).resolve().parents[2]
    return skills_dir / "cocos-query-ck" / "scripts" / "query_ck.py"


def run_ck_validation(args: argparse.Namespace, sql: str) -> dict[str, Any]:
    query_script = Path(args.query_script).expanduser().resolve()
    if not query_script.is_file():
        raise PrepareError(f"cocos-query-ck script not found: {query_script}")

    command = [
        sys.executable,
        str(query_script),
        "--env",
        args.env,
        "--database",
        args.database,
        "--validate-only",
    ]
    if args.allow_event_value:
        command.append("--allow-event-value")
    if args.allow_cross_event:
        command.append("--allow-cross-event")
    command.append(sql)

    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=args.timeout,
    )
    raw = completed.stdout.strip() or completed.stderr.strip()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise PrepareError(
            f"cocos-query-ck returned non-JSON output (exit {completed.returncode}): {raw[:500]}"
        ) from exc

    if completed.returncode != 0 or not result.get("ok"):
        message = result.get("error") or raw[:500]
        raise PrepareError(f"cocos-query-ck validation failed: {message}")
    if not result.get("validated"):
        raise PrepareError("cocos-query-ck did not report validated=true")
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Validate a Cocos ClickHouse SQL template with cocos-query-ck, then render "
            "the matching Grafana SQL."
        )
    )
    parser.add_argument("--template", required=True, help="SQL template path")
    parser.add_argument("--env", choices=("prod", "test"), required=True)
    parser.add_argument("--database", required=True, help="Validated representative App/database")
    parser.add_argument("--validation-from", required=True, dest="validation_from")
    parser.add_argument("--validation-to", required=True, dest="validation_to")
    parser.add_argument("--output", required=True, help="Grafana SQL output path")
    parser.add_argument(
        "--validated-output",
        help="Optional path for the exact SQL accepted by cocos-query-ck",
    )
    parser.add_argument(
        "--database-variable",
        default="database",
        help="Grafana variable name used for dynamic App switching (default: database)",
    )
    parser.add_argument(
        "--static-database",
        action="store_true",
        help="Render a fixed database instead of ${database}",
    )
    parser.add_argument("--allow-event-value", action="store_true")
    parser.add_argument("--allow-cross-event", action="store_true")
    parser.add_argument(
        "--query-script",
        default=str(default_query_script()),
        help="Path to cocos-query-ck/scripts/query_ck.py",
    )
    parser.add_argument("--timeout", type=int, default=45)
    parser.add_argument("--force", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        template_path = Path(args.template).expanduser().resolve()
        if not template_path.is_file():
            raise PrepareError(f"Template not found: {template_path}")
        template = template_path.read_text(encoding="utf-8").strip()

        if template.count(TIME_MARKER) != 1:
            raise PrepareError(f"Template must contain {TIME_MARKER} exactly once")
        if TABLE_MARKER not in template:
            raise PrepareError(f"Template must contain {TABLE_MARKER}")
        if "${" in template:
            raise PrepareError("Template must not contain Grafana variables before rendering")

        start = parse_time(args.validation_from)
        end = parse_time(args.validation_to)
        try:
            window_seconds = (end - start).total_seconds()
        except TypeError as exc:
            raise PrepareError(
                "validation-from and validation-to must both include offsets or both omit them"
            ) from exc
        if window_seconds <= 0:
            raise PrepareError("Validation window must have validation-from < validation-to")
        if window_seconds > MAX_WINDOW_SECONDS:
            raise PrepareError("Validation window must not exceed 14 days")

        fixed_filter = (
            f"event_time >= '{sql_literal(start)}' "
            f"AND event_time < '{sql_literal(end)}'"
        )
        validation_input = template.replace(TIME_MARKER, fixed_filter)
        result = run_ck_validation(args, validation_input)

        actual_env = result.get("environment")
        actual_databases = result.get("databases") or []
        table = result.get("table")
        if actual_env != args.env:
            raise PrepareError(
                f"Environment mismatch: requested {args.env}, validator returned {actual_env}"
            )
        if args.database not in actual_databases:
            raise PrepareError(
                f"Database mismatch: requested {args.database}, validator returned {actual_databases}"
            )
        if not isinstance(table, str) or not table:
            raise PrepareError("cocos-query-ck did not return an environment table")

        if args.static_database:
            table_reference = f"{args.database}.{table}"
            scope = "static"
        else:
            if not args.database_variable.replace("_", "").isalnum():
                raise PrepareError("database-variable must contain only letters, digits, or underscores")
            table_reference = f"${{{args.database_variable}}}.{table}"
            scope = "variable"

        grafana_sql = template.replace(TABLE_MARKER, table_reference).replace(
            TIME_MARKER, "$__timeFilter(event_time)"
        )
        if TABLE_MARKER in grafana_sql or TIME_MARKER in grafana_sql:
            raise PrepareError("Unresolved template marker remains in Grafana SQL")

        output_path = Path(args.output).expanduser().resolve()
        atomic_write_text(output_path, grafana_sql, args.force)

        validated_output = None
        if args.validated_output:
            validated_path = Path(args.validated_output).expanduser().resolve()
            atomic_write_text(validated_path, str(result["sql"]), args.force)
            validated_output = str(validated_path)

        print(
            json.dumps(
                {
                    "ok": True,
                    "environment": actual_env,
                    "database": args.database,
                    "table": table,
                    "scope": scope,
                    "validationWindow": {
                        "from": sql_literal(start),
                        "to": sql_literal(end),
                    },
                    "grafanaSql": str(output_path),
                    "validatedSql": validated_output,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    except (PrepareError, subprocess.TimeoutExpired, OSError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
