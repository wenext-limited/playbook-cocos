#!/usr/bin/env python3
"""Guarded Grafana dashboard operations for Cocos ClickHouse metrics."""

from __future__ import annotations

import argparse
import copy
import difflib
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import unquote, urlparse


DEFAULT_CONFIG = Path.home() / ".wenext" / "cocos-grafana.json"
DEFAULT_URL = "https://wenextlama.grafana.net"
DEFAULT_NAMESPACE = "stacks-241102"
DEFAULT_API_VERSION = "dashboard.grafana.app/v2"
DEFAULT_DATASOURCE_UID = "cem1x6ws9huyod"
DEFAULT_DATASOURCE_TYPE = "grafana-clickhouse-datasource"
DATABASE_VARIABLE = "database"
HTTP_MARKER = "__GRAFANA_HTTP_STATUS__="


class DashboardError(RuntimeError):
    pass


def print_json(value: Any, *, stream: Any = sys.stdout) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2), file=stream)


def config_template() -> dict[str, Any]:
    return {"token": "<service-account-token>"}


def default_runtime_config() -> dict[str, Any]:
    return {
        "url": DEFAULT_URL,
        "namespace": DEFAULT_NAMESPACE,
        "apiVersion": DEFAULT_API_VERSION,
        "environments": {
            "prod": {
                "datasourceUid": DEFAULT_DATASOURCE_UID,
                "datasourceType": DEFAULT_DATASOURCE_TYPE,
                "table": "event_local_prod",
            },
            "test": {
                "datasourceUid": DEFAULT_DATASOURCE_UID,
                "datasourceType": DEFAULT_DATASOURCE_TYPE,
                "table": "event_local_test",
            },
        },
    }


def load_config(path_value: str) -> dict[str, Any]:
    path = Path(path_value).expanduser().resolve()
    if not path.is_file():
        raise DashboardError(
            f"Grafana config not found: {path}; run config-template and create it with mode 600"
        )
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077:
        raise DashboardError(f"Grafana config must have mode 600, got {mode:03o}: {path}")
    try:
        user_config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DashboardError(f"Cannot read Grafana config {path}: {exc}") from exc
    if not isinstance(user_config, dict):
        raise DashboardError("Grafana config must be a JSON object")

    config = default_runtime_config()
    for key in ("url", "token", "namespace", "apiVersion"):
        if key in user_config:
            config[key] = user_config[key]
    if "environments" in user_config:
        overrides = user_config["environments"]
        if not isinstance(overrides, dict):
            raise DashboardError("Grafana config environments must be an object")
        for env_name, env_value in overrides.items():
            if env_name in config["environments"] and isinstance(env_value, dict):
                config["environments"][env_name].update(env_value)
            else:
                config["environments"][env_name] = env_value

    for key in ("url", "token", "namespace"):
        value = config.get(key)
        if not isinstance(value, str) or not value.strip():
            raise DashboardError(f"Grafana config field {key!r} is required")
        config[key] = value.strip()
    if config["token"] == "<service-account-token>":
        raise DashboardError("Replace the token placeholder in the Grafana config")
    if not config["url"].startswith(("https://", "http://")):
        raise DashboardError("Grafana config url must be an absolute HTTP/HTTPS URL")

    api_version = config.get("apiVersion", DEFAULT_API_VERSION)
    if api_version != DEFAULT_API_VERSION:
        raise DashboardError(
            f"Unsupported apiVersion {api_version!r}; expected {DEFAULT_API_VERSION!r}"
        )
    environments = config.get("environments")
    if not isinstance(environments, dict) or not environments:
        raise DashboardError("Grafana config environments must be a non-empty object")
    return config


def environment_config(config: dict[str, Any], env: str) -> dict[str, str]:
    value = config["environments"].get(env)
    if not isinstance(value, dict):
        raise DashboardError(f"Environment {env!r} is not configured")
    result: dict[str, str] = {}
    for key in ("datasourceUid", "datasourceType", "table"):
        item = value.get(key)
        if not isinstance(item, str) or not item.strip():
            raise DashboardError(f"Environment {env!r} field {key!r} is required")
        result[key] = item.strip()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", result["table"]):
        raise DashboardError(f"Unsafe table name in environment {env!r}: {result['table']!r}")
    return result


def parse_grafana_resource_url(config: dict[str, Any], url_value: str) -> dict[str, str]:
    if not isinstance(url_value, str) or not url_value.strip():
        raise DashboardError("Grafana folder or Dashboard URL is required")
    parsed = urlparse(url_value.strip())
    expected = urlparse(config["url"])
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise DashboardError("Grafana resource URL must be an absolute HTTP/HTTPS URL")
    if (parsed.scheme, parsed.netloc) != (expected.scheme, expected.netloc):
        raise DashboardError(
            f"Grafana resource URL host does not match configured URL {config['url']!r}"
        )

    folder_match = re.match(r"^/dashboards/f/([^/]+)(?:/|$)", parsed.path)
    if folder_match:
        return {"kind": "folder", "uid": unquote(folder_match.group(1))}

    dashboard_match = re.match(r"^/(?:d|d-solo)/([^/]+)(?:/|$)", parsed.path)
    if dashboard_match:
        return {"kind": "dashboard", "uid": unquote(dashboard_match.group(1))}

    raise DashboardError(
        "Unsupported Grafana URL; expected /dashboards/f/<folderUid>/... or /d/<dashboardUid>/..."
    )


def resolve_folder(config: dict[str, Any], url_value: str) -> dict[str, Any]:
    resource = parse_grafana_resource_url(config, url_value)
    if resource["kind"] == "folder":
        folder_uid = resource["uid"]
        source_dashboard_uid = None
    else:
        source_dashboard_uid = resource["uid"]
        _, dashboard = request_json(
            config,
            "GET",
            f"/api/dashboards/uid/{source_dashboard_uid}",
        )
        meta = dashboard.get("meta") if isinstance(dashboard, dict) else None
        folder_uid = meta.get("folderUid") if isinstance(meta, dict) else None
        if not isinstance(folder_uid, str) or not folder_uid:
            raise DashboardError(
                f"Dashboard {source_dashboard_uid!r} is not inside a Grafana folder"
            )

    _, folder = request_json(config, "GET", f"/api/folders/{folder_uid}")
    if not isinstance(folder, dict):
        raise DashboardError(f"Grafana folder {folder_uid!r} response is invalid")
    return {
        "uid": folder_uid,
        "title": folder.get("title"),
        "source": resource["kind"],
        "sourceDashboardUid": source_dashboard_uid,
    }


def curl_config_quote(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def request_json(
    config: dict[str, Any],
    method: str,
    path: str,
    *,
    body: Any | None = None,
    allowed_statuses: Iterable[int] = (200,),
    timeout: int = 60,
) -> tuple[int, Any]:
    url = config["url"].rstrip("/") + "/" + path.lstrip("/")
    allowed = set(allowed_statuses)
    with tempfile.TemporaryDirectory(prefix="cocos-grafana-") as temp_dir:
        temp = Path(temp_dir)
        curl_config = temp / "curl.conf"
        curl_config.write_text(
            "\n".join(
                [
                    f'header = "Authorization: Bearer {curl_config_quote(config["token"])}"',
                    'header = "Accept: application/json"',
                    'header = "Content-Type: application/json"',
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        os.chmod(curl_config, 0o600)

        command = [
            "curl",
            "--silent",
            "--show-error",
            "--max-time",
            str(timeout),
            "--request",
            method,
            "--config",
            str(curl_config),
            "--write-out",
            f"\n{HTTP_MARKER}%{{http_code}}",
        ]
        if body is not None:
            body_path = temp / "body.json"
            body_path.write_text(
                json.dumps(body, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            command.extend(["--data-binary", f"@{body_path}"])
        command.append(url)

        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout + 5,
        )
    if completed.returncode != 0:
        raise DashboardError(
            f"curl failed for {method} {path}: {(completed.stderr or completed.stdout).strip()[:500]}"
        )

    payload_text, marker, status_text = completed.stdout.rpartition(f"\n{HTTP_MARKER}")
    if not marker:
        raise DashboardError(f"Cannot read HTTP status for {method} {path}")
    try:
        status = int(status_text.strip())
    except ValueError as exc:
        raise DashboardError(f"Invalid HTTP status for {method} {path}: {status_text!r}") from exc

    payload_text = payload_text.strip()
    if payload_text:
        try:
            payload = json.loads(payload_text)
        except json.JSONDecodeError as exc:
            raise DashboardError(
                f"Grafana returned non-JSON for {method} {path} (HTTP {status}): {payload_text[:500]}"
            ) from exc
    else:
        payload = None

    if status not in allowed:
        message = payload.get("message") if isinstance(payload, dict) else payload_text[:500]
        raise DashboardError(f"Grafana {method} {path} failed: HTTP {status}: {message}")
    if (
        200 <= status < 300
        and isinstance(payload, dict)
        and payload.get("kind") == "Status"
        and payload.get("status", "Failure") != "Success"
    ):
        raise DashboardError(
            f"Grafana {method} {path} returned Status error: {payload.get('message', payload)}"
        )
    return status, payload


def dashboard_collection(config: dict[str, Any]) -> str:
    return (
        f"/apis/{config.get('apiVersion', DEFAULT_API_VERSION)}"
        f"/namespaces/{config['namespace']}/dashboards"
    )


def dashboard_path(config: dict[str, Any], uid: str) -> str:
    return f"{dashboard_collection(config)}/{uid}"


def load_spec(path_value: str) -> dict[str, Any]:
    path = Path(path_value).expanduser().resolve()
    if not path.is_file():
        raise DashboardError(f"Dashboard spec not found: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DashboardError(f"Cannot read Dashboard spec {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise DashboardError("Dashboard file must contain a JSON object")
    if value.get("kind") == "Dashboard" and isinstance(value.get("spec"), dict):
        value = value["spec"]
    if not isinstance(value, dict):
        raise DashboardError("Dashboard spec must be a JSON object")
    return value


def atomic_write_json(path_value: str, value: Any, *, force: bool) -> Path:
    path = Path(path_value).expanduser().resolve()
    if path.exists() and not force:
        raise DashboardError(f"Output already exists: {path}; pass --force to replace it")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.chmod(temp_name, 0o600)
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise
    return path


def query_records(spec: dict[str, Any]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    elements = spec.get("elements")
    if not isinstance(elements, dict):
        return records
    for element_name, element in elements.items():
        if not isinstance(element, dict) or element.get("kind") != "Panel":
            continue
        panel_spec = element.get("spec")
        if not isinstance(panel_spec, dict):
            continue
        data_spec = panel_spec.get("data", {}).get("spec", {})
        queries = data_spec.get("queries", []) if isinstance(data_spec, dict) else []
        if not isinstance(queries, list):
            continue
        for query in queries:
            if not isinstance(query, dict):
                continue
            panel_query_spec = query.get("spec")
            if not isinstance(panel_query_spec, dict):
                continue
            data_query = panel_query_spec.get("query")
            if not isinstance(data_query, dict):
                continue
            plugin_spec = data_query.get("spec")
            if not isinstance(plugin_spec, dict):
                continue
            records.append(
                {
                    "element": element_name,
                    "title": panel_spec.get("title", ""),
                    "description": panel_spec.get("description", ""),
                    "refId": panel_query_spec.get("refId", ""),
                    "hidden": bool(panel_query_spec.get("hidden", False)),
                    "datasourceUid": data_query.get("datasource", {}).get("name"),
                    "group": data_query.get("group"),
                    "pluginSpec": plugin_spec,
                    "rawSql": plugin_spec.get("rawSql", ""),
                }
            )
    return records


def database_variable(spec: dict[str, Any]) -> tuple[dict[str, Any] | None, list[str]]:
    variables = spec.get("variables", [])
    if not isinstance(variables, list):
        return None, []
    for variable in variables:
        if not isinstance(variable, dict):
            continue
        variable_spec = variable.get("spec")
        if not isinstance(variable_spec, dict) or variable_spec.get("name") != DATABASE_VARIABLE:
            continue
        values: list[str] = []
        query = variable_spec.get("query")
        if isinstance(query, str):
            values.extend(item.strip() for item in query.split(",") if item.strip())
        options = variable_spec.get("options")
        if isinstance(options, list):
            for option in options:
                if not isinstance(option, dict):
                    continue
                value = option.get("value")
                if isinstance(value, str) and value.strip():
                    values.append(value.strip())
        return variable_spec, list(dict.fromkeys(values))
    return None, []


def strip_leading_comments(sql: str) -> str:
    value = sql
    while True:
        previous = value
        value = re.sub(r"^\s*--[^\n]*(?:\n|$)", "", value)
        value = re.sub(r"^\s*/\*.*?\*/", "", value, flags=re.DOTALL)
        if value == previous:
            return value.strip()


def has_time_bounds(sql: str) -> bool:
    if re.search(r"\$__timeFilter\s*\(\s*event_time\s*\)", sql, flags=re.IGNORECASE):
        return True
    if "$__fromTime" in sql and "$__toTime" in sql:
        return True
    lower = re.search(r"\bevent_time\s*(?:>=|>)", sql, flags=re.IGNORECASE)
    upper = re.search(r"\bevent_time\s*(?:<=|<)", sql, flags=re.IGNORECASE)
    return bool(lower and upper)


def validate_spec(
    spec: dict[str, Any],
    env_name: str,
    env_config: dict[str, str],
    database: str | None,
) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    title = spec.get("title")
    if not isinstance(title, str) or not title.strip():
        errors.append("spec.title must be a non-empty string")

    elements = spec.get("elements")
    if not isinstance(elements, dict) or not elements:
        errors.append("spec.elements must be a non-empty object")
        elements = {}

    records = query_records(spec)
    if not records:
        errors.append("Dashboard must contain at least one panel query")

    variable_spec, allowlist = database_variable(spec)
    uses_database_variable = any("${database}" in str(item["rawSql"]) for item in records)
    if uses_database_variable:
        if variable_spec is None:
            errors.append("SQL uses ${database}, but the database CustomVariable is missing")
        else:
            if variable_spec.get("allowCustomValue") is not False:
                errors.append("database variable must set allowCustomValue=false")
            if variable_spec.get("multi") is not False:
                errors.append("database variable must set multi=false")
            if variable_spec.get("includeAll") is not False:
                errors.append("database variable must set includeAll=false")
            if not allowlist:
                errors.append("database variable must contain a non-empty App allowlist")
            for item in allowlist:
                if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", item):
                    errors.append(f"database variable contains unsafe value: {item!r}")
        if database is None:
            warnings.append("No --database supplied; variable membership was not checked")
        elif database not in allowlist:
            errors.append(f"database {database!r} is not in the Dashboard App allowlist")
    elif variable_spec is not None and variable_spec.get("allowCustomValue") is not False:
        errors.append("database variable must set allowCustomValue=false")

    panel_ids: set[Any] = set()
    for element_name, element in elements.items():
        if not isinstance(element, dict) or element.get("kind") != "Panel":
            continue
        panel_spec = element.get("spec")
        if not isinstance(panel_spec, dict):
            errors.append(f"element {element_name!r} has no panel spec")
            continue
        panel_id = panel_spec.get("id")
        if panel_id in panel_ids:
            errors.append(f"duplicate panel id: {panel_id!r}")
        panel_ids.add(panel_id)

    expected_table = env_config["table"]
    expected_uid = env_config["datasourceUid"]
    expected_type = env_config["datasourceType"]
    for record in records:
        label = f"{record['element']}[{record['refId'] or '?'}]"
        sql = record["rawSql"]
        if not isinstance(sql, str) or not sql.strip():
            errors.append(f"{label}: rawSql is empty")
            continue
        clean_sql = strip_leading_comments(sql)
        if not re.match(r"^(SELECT|WITH)\b", clean_sql, flags=re.IGNORECASE):
            errors.append(f"{label}: SQL must start with SELECT or WITH")
        without_trailing = clean_sql.rstrip().rstrip(";").rstrip()
        if ";" in without_trailing:
            errors.append(f"{label}: multiple SQL statements are not allowed")
        if re.search(r"\bSELECT\s+\*", clean_sql, flags=re.IGNORECASE):
            errors.append(f"{label}: SELECT * is not allowed")
        if "{table}" in sql or "__TIME_FILTER__" in sql:
            errors.append(f"{label}: unresolved SQL template marker remains")
        variables = re.findall(r"\$\{([^}]+)\}", sql)
        unsupported = [item for item in variables if item != DATABASE_VARIABLE]
        if unsupported:
            errors.append(f"{label}: unsupported Grafana variables: {unsupported}")
        if not re.search(rf"\b{re.escape(expected_table)}\b", sql):
            errors.append(
                f"{label}: SQL does not use configured {env_name} table {expected_table!r}"
            )
        table_matches = set(re.findall(r"\bevent_local_(prod|test)\b", sql))
        expected_suffix = "prod" if expected_table == "event_local_prod" else (
            "test" if expected_table == "event_local_test" else None
        )
        if expected_suffix and table_matches - {expected_suffix}:
            errors.append(f"{label}: SQL mixes prod/test event tables")
        if record["datasourceUid"] != expected_uid:
            errors.append(
                f"{label}: datasource UID {record['datasourceUid']!r} does not match "
                f"configured {env_name} UID {expected_uid!r}"
            )
        if record["group"] != expected_type:
            errors.append(
                f"{label}: datasource group {record['group']!r} does not match "
                f"configured type {expected_type!r}"
            )
        if not has_time_bounds(sql):
            errors.append(f"{label}: event_time must have a Grafana time filter or two bounds")
        if not re.search(r"\bevent_id\b", sql, flags=re.IGNORECASE):
            errors.append(f"{label}: event_id filter is required")
        if not re.search(
            r"\baction\s*=\s*['\"]cocos_js['\"]", sql, flags=re.IGNORECASE
        ):
            errors.append(f"{label}: action = 'cocos_js' is required")
        description = record["description"]
        if not isinstance(description, str) or not description.strip():
            errors.append(f"{label}: query panel description must not be empty")
        if not record["refId"]:
            errors.append(f"{record['element']}: every query needs a refId")

    layout = spec.get("layout")
    items = layout.get("spec", {}).get("items", []) if isinstance(layout, dict) else []
    if not isinstance(items, list) or not items:
        errors.append("spec.layout.spec.items must be a non-empty array")
    else:
        for index, item in enumerate(items):
            item_spec = item.get("spec", {}) if isinstance(item, dict) else {}
            element_ref = item_spec.get("element", {}) if isinstance(item_spec, dict) else {}
            name = element_ref.get("name") if isinstance(element_ref, dict) else None
            if name not in elements:
                errors.append(f"layout item {index} references missing element {name!r}")

    summary = {
        "ok": not errors,
        "title": title,
        "environment": env_name,
        "datasourceUid": expected_uid,
        "table": expected_table,
        "panels": sum(
            1
            for item in elements.values()
            if isinstance(item, dict) and item.get("kind") == "Panel"
        ),
        "queries": len(records),
        "databaseAllowlist": allowlist,
        "errors": errors,
        "warnings": warnings,
    }
    if errors:
        raise DashboardError(json.dumps(summary, ensure_ascii=False))
    return summary


def get_current_dashboard(config: dict[str, Any], uid: str) -> dict[str, Any]:
    _, value = request_json(config, "GET", dashboard_path(config, uid), allowed_statuses=(200,))
    if not isinstance(value, dict) or not isinstance(value.get("spec"), dict):
        raise DashboardError(f"Grafana resource {uid!r} has no spec")
    return value


def command_doctor(args: argparse.Namespace, config: dict[str, Any]) -> int:
    _, org = request_json(config, "GET", "/api/org")
    _, folders = request_json(config, "GET", "/api/folders")
    _, datasources = request_json(config, "GET", "/api/datasources")
    if not isinstance(folders, list) or not isinstance(datasources, list):
        raise DashboardError("Grafana folders/datasources response has an unexpected shape")
    datasource_by_uid = {
        item.get("uid"): item for item in datasources if isinstance(item, dict) and item.get("uid")
    }
    bindings: dict[str, Any] = {}
    for env_name in config["environments"]:
        env = environment_config(config, env_name)
        remote = datasource_by_uid.get(env["datasourceUid"])
        bindings[env_name] = {
            "configuredUid": env["datasourceUid"],
            "configuredType": env["datasourceType"],
            "table": env["table"],
            "found": remote is not None,
            "remoteName": remote.get("name") if remote else None,
            "remoteType": remote.get("type") if remote else None,
            "typeMatches": bool(remote and remote.get("type") == env["datasourceType"]),
        }
    print_json(
        {
            "ok": all(item["found"] and item["typeMatches"] for item in bindings.values()),
            "url": config["url"],
            "namespace": config["namespace"],
            "organization": org,
            "folderCount": len(folders),
            "datasourceCount": len(datasources),
            "bindings": bindings,
        }
    )
    return 0


def command_list_folders(args: argparse.Namespace, config: dict[str, Any]) -> int:
    _, folders = request_json(config, "GET", "/api/folders")
    if not isinstance(folders, list):
        raise DashboardError("Grafana folders response must be an array")
    print_json(
        [
            {"uid": item.get("uid"), "title": item.get("title")}
            for item in folders
            if isinstance(item, dict)
        ]
    )
    return 0


def command_list_datasources(args: argparse.Namespace, config: dict[str, Any]) -> int:
    _, datasources = request_json(config, "GET", "/api/datasources")
    if not isinstance(datasources, list):
        raise DashboardError("Grafana datasources response must be an array")
    print_json(
        [
            {
                "uid": item.get("uid"),
                "name": item.get("name"),
                "type": item.get("type"),
                "isDefault": item.get("isDefault"),
            }
            for item in datasources
            if isinstance(item, dict)
        ]
    )
    return 0


def command_resolve_folder(args: argparse.Namespace, config: dict[str, Any]) -> int:
    print_json({"ok": True, **resolve_folder(config, args.url)})
    return 0


def command_get(args: argparse.Namespace, config: dict[str, Any]) -> int:
    value = get_current_dashboard(config, args.uid)
    output = atomic_write_json(args.output, value, force=args.force)
    print_json(
        {
            "ok": True,
            "uid": value.get("metadata", {}).get("name"),
            "title": value.get("spec", {}).get("title"),
            "resourceVersion": value.get("metadata", {}).get("resourceVersion"),
            "output": str(output),
        }
    )
    return 0


def command_validate(args: argparse.Namespace, config: dict[str, Any]) -> int:
    spec = load_spec(args.spec)
    env = environment_config(config, args.env)
    print_json(validate_spec(spec, args.env, env, args.database))
    return 0


def normalized_lines(value: Any) -> list[str]:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True).splitlines(keepends=True)


def command_diff(args: argparse.Namespace, config: dict[str, Any]) -> int:
    desired = load_spec(args.spec)
    env = environment_config(config, args.env)
    summary = validate_spec(desired, args.env, env, args.database)
    current = get_current_dashboard(config, args.uid)
    current_spec = current["spec"]
    diff = list(
        difflib.unified_diff(
            normalized_lines(current_spec),
            normalized_lines(desired),
            fromfile=f"current:{args.uid}",
            tofile=f"desired:{args.spec}",
        )
    )
    print(
        json.dumps(
            {
                "uid": args.uid,
                "title": summary["title"],
                "environment": args.env,
                "resourceVersion": current.get("metadata", {}).get("resourceVersion"),
                "panels": summary["panels"],
                "queries": summary["queries"],
                "changed": bool(diff),
            },
            ensure_ascii=False,
        )
    )
    if diff:
        sys.stdout.writelines(diff)
    return 0


def render_query_sql(sql: str, database: str | None) -> str:
    if "${database}" in sql:
        if not database:
            raise DashboardError("--database is required to verify a variable Dashboard")
        sql = sql.replace("${database}", database)
    if "${" in sql:
        raise DashboardError(f"Unresolved Dashboard variable remains in SQL: {sql[:200]}")
    return sql


def command_verify(args: argparse.Namespace, config: dict[str, Any]) -> int:
    spec = load_spec(args.spec)
    env = environment_config(config, args.env)
    summary = validate_spec(spec, args.env, env, args.database)
    results: list[dict[str, Any]] = []
    failures = 0
    for record in query_records(spec):
        sql = render_query_sql(record["rawSql"], args.database)
        plugin_spec = copy.deepcopy(record["pluginSpec"])
        query_payload: dict[str, Any] = {
            "refId": record["refId"],
            "datasource": {
                "type": env["datasourceType"],
                "uid": env["datasourceUid"],
            },
            "editorType": plugin_spec.get("editorType", "sql"),
            "format": plugin_spec.get("format", 1),
            "queryType": plugin_spec.get("queryType", "table"),
            "rawSql": sql,
        }
        for key in ("meta", "pluginVersion"):
            if key in plugin_spec:
                query_payload[key] = plugin_spec[key]
        _, response = request_json(
            config,
            "POST",
            "/api/ds/query",
            body={"queries": [query_payload], "from": args.time_from, "to": args.time_to},
            allowed_statuses=(200,),
            timeout=args.timeout,
        )
        result_map = response.get("results", {}) if isinstance(response, dict) else {}
        result = result_map.get(record["refId"], {}) if isinstance(result_map, dict) else {}
        error = result.get("error") if isinstance(result, dict) else "missing result"
        ok = not error
        if not ok:
            failures += 1
        frames = result.get("frames", []) if isinstance(result, dict) else []
        results.append(
            {
                "element": record["element"],
                "title": record["title"],
                "refId": record["refId"],
                "ok": ok,
                "frames": len(frames) if isinstance(frames, list) else 0,
                "error": str(error)[:500] if error else None,
            }
        )
    print_json(
        {
            "ok": failures == 0,
            "title": summary["title"],
            "environment": args.env,
            "database": args.database,
            "from": args.time_from,
            "to": args.time_to,
            "queries": len(results),
            "failures": failures,
            "results": results,
        }
    )
    return 0 if failures == 0 else 1


def require_write_confirmation(args: argparse.Namespace) -> None:
    if not args.confirm_write:
        raise DashboardError(
            "Write refused: --confirm-write is required after explicit user confirmation in this conversation"
        )


def validate_resource_name(value: str) -> None:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", value):
        raise DashboardError(
            "Dashboard name must be 1-63 lowercase letters, digits, or hyphens and start alphanumeric"
        )


def command_create(args: argparse.Namespace, config: dict[str, Any]) -> int:
    require_write_confirmation(args)
    validate_resource_name(args.name)
    spec = load_spec(args.spec)
    env = environment_config(config, args.env)
    summary = validate_spec(spec, args.env, env, args.database)
    folder = resolve_folder(config, args.folder_url)
    folder_uid = folder["uid"]
    status, _ = request_json(
        config,
        "GET",
        dashboard_path(config, args.name),
        allowed_statuses=(200, 404),
    )
    if status == 200:
        raise DashboardError(
            f"Dashboard {args.name!r} already exists; use update after reading and diffing it"
        )
    body = {
        "apiVersion": config.get("apiVersion", DEFAULT_API_VERSION),
        "kind": "Dashboard",
        "metadata": {
            "name": args.name,
            "namespace": config["namespace"],
            "annotations": {"grafana.app/folder": folder_uid},
        },
        "spec": spec,
    }
    _, result = request_json(
        config,
        "POST",
        dashboard_collection(config),
        body=body,
        allowed_statuses=(200, 201),
        timeout=args.timeout,
    )
    print_json(
        {
            "ok": True,
            "action": "created",
            "uid": result.get("metadata", {}).get("name") if isinstance(result, dict) else args.name,
            "title": summary["title"],
            "environment": args.env,
            "folderUid": folder_uid,
            "folderTitle": folder["title"],
            "resourceVersion": (
                result.get("metadata", {}).get("resourceVersion")
                if isinstance(result, dict)
                else None
            ),
        }
    )
    return 0


def command_update(args: argparse.Namespace, config: dict[str, Any]) -> int:
    require_write_confirmation(args)
    spec = load_spec(args.spec)
    env = environment_config(config, args.env)
    summary = validate_spec(spec, args.env, env, args.database)
    folder = resolve_folder(config, args.folder_url)
    folder_uid = folder["uid"]
    current = get_current_dashboard(config, args.uid)
    metadata = current.get("metadata", {})
    current_version = str(metadata.get("resourceVersion", ""))
    if current_version != str(args.expected_resource_version):
        raise DashboardError(
            f"resourceVersion changed: expected {args.expected_resource_version!r}, "
            f"current is {current_version!r}; run diff and request confirmation again"
        )
    if current.get("spec") == spec:
        raise DashboardError("Dashboard spec has no changes; update was not sent")

    backup = atomic_write_json(args.backup, current, force=False)
    annotations = dict(metadata.get("annotations") or {})
    annotations["grafana.app/folder"] = folder_uid
    update_metadata: dict[str, Any] = {
        "name": args.uid,
        "namespace": config["namespace"],
        "resourceVersion": current_version,
        "annotations": annotations,
    }
    if isinstance(metadata.get("labels"), dict):
        update_metadata["labels"] = metadata["labels"]
    body = {
        "apiVersion": config.get("apiVersion", DEFAULT_API_VERSION),
        "kind": "Dashboard",
        "metadata": update_metadata,
        "spec": spec,
    }
    _, result = request_json(
        config,
        "PUT",
        dashboard_path(config, args.uid),
        body=body,
        allowed_statuses=(200,),
        timeout=args.timeout,
    )
    print_json(
        {
            "ok": True,
            "action": "updated",
            "uid": args.uid,
            "title": summary["title"],
            "environment": args.env,
            "folderUid": folder_uid,
            "folderTitle": folder["title"],
            "previousResourceVersion": current_version,
            "resourceVersion": (
                result.get("metadata", {}).get("resourceVersion")
                if isinstance(result, dict)
                else None
            ),
            "backup": str(backup),
        }
    )
    return 0


def add_spec_scope_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--spec", required=True)
    parser.add_argument("--env", choices=("prod", "test"), required=True)
    parser.add_argument("--database", help="Representative/selected App database")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Guarded Grafana dashboard operations for Cocos ClickHouse metrics."
    )
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("config-template")
    subparsers.add_parser("doctor")
    subparsers.add_parser("list-folders")
    subparsers.add_parser("list-datasources")

    resolve_folder_parser = subparsers.add_parser("resolve-folder")
    resolve_folder_parser.add_argument("--url", required=True)

    get_parser = subparsers.add_parser("get")
    get_parser.add_argument("--uid", required=True)
    get_parser.add_argument("--output", required=True)
    get_parser.add_argument("--force", action="store_true")

    validate_parser = subparsers.add_parser("validate")
    add_spec_scope_arguments(validate_parser)

    diff_parser = subparsers.add_parser("diff")
    add_spec_scope_arguments(diff_parser)
    diff_parser.add_argument("--uid", required=True)

    verify_parser = subparsers.add_parser("verify")
    add_spec_scope_arguments(verify_parser)
    verify_parser.add_argument("--from", dest="time_from", default="now-24h")
    verify_parser.add_argument("--to", dest="time_to", default="now")
    verify_parser.add_argument("--timeout", type=int, default=120)

    create_parser = subparsers.add_parser("create")
    add_spec_scope_arguments(create_parser)
    create_parser.add_argument("--name", required=True)
    create_parser.add_argument("--folder-url", required=True)
    create_parser.add_argument("--timeout", type=int, default=120)
    create_parser.add_argument("--confirm-write", action="store_true")

    update_parser = subparsers.add_parser("update")
    add_spec_scope_arguments(update_parser)
    update_parser.add_argument("--uid", required=True)
    update_parser.add_argument("--folder-url", required=True)
    update_parser.add_argument("--expected-resource-version", required=True)
    update_parser.add_argument("--backup", required=True)
    update_parser.add_argument("--timeout", type=int, default=120)
    update_parser.add_argument("--confirm-write", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "config-template":
        print_json(config_template())
        return 0
    try:
        config = load_config(args.config)
        commands = {
            "doctor": command_doctor,
            "list-folders": command_list_folders,
            "list-datasources": command_list_datasources,
            "resolve-folder": command_resolve_folder,
            "get": command_get,
            "validate": command_validate,
            "diff": command_diff,
            "verify": command_verify,
            "create": command_create,
            "update": command_update,
        }
        return commands[args.command](args, config)
    except (DashboardError, OSError, subprocess.TimeoutExpired) as exc:
        message = str(exc)
        try:
            structured = json.loads(message)
        except json.JSONDecodeError:
            structured = {"ok": False, "error": message}
        print_json(structured, stream=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
