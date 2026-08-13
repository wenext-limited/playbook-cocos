#!/usr/bin/env python3

import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_WIKI_URL = "https://fikvmzrrhfl.feishu.cn/wiki/AudVw0HYki0nnEk1SEQc02Rknef"
DEFAULT_SPREADSHEET_TOKEN = "ITfWsspPRh6Nb6tqGo0cRMqqn3g"
DEFAULT_APP_SHEET_TITLE = "APP信息"
DEFAULT_GAME_SHEET_TITLE = "游戏信息"
DEFAULT_RELATION_SHEET_TITLE = "APP游戏关系"
REQUEST_TIMEOUT_SECONDS = 10
MAX_RETRIES = 2


class QueryError(RuntimeError):
    def __init__(self, message, stage="查询", details=None):
        super().__init__(message)
        self.stage = stage
        self.details = details


def normalize_cell(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        for key in ("link", "text", "value"):
            if key in value:
                normalized = normalize_cell(value[key])
                if normalized:
                    return normalized
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, (list, tuple)):
        for item in value:
            if isinstance(item, dict) and item.get("link"):
                return normalize_cell(item["link"])
        values = [normalize_cell(item) for item in value]
        return " ".join(item for item in values if item).strip()
    return str(value).strip()


def normalize_lookup(value):
    return re.sub(r"[\s_\-·]+", "", normalize_cell(value)).casefold()


def json_safe(value):
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return normalize_cell(value)


def json_text(value):
    return json.dumps(json_safe(value), ensure_ascii=False, indent=2, default=str)


def run_cli(args, label, identity=None, output_format="json"):
    command = ["lark-cli", *args]
    if identity:
        command.extend(["--as", identity])
    if output_format:
        command.extend(["--format", output_format])
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    except OSError as error:
        raise QueryError(
            f"无法执行 lark-cli：{error}",
            stage="前置检查",
        ) from error
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()
        raise QueryError(
            f"{label}失败{f'：{detail[:500]}' if detail else ''}",
            stage="前置检查",
        )
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise QueryError(
            f"{label}返回的不是合法 JSON",
            stage="前置检查",
            details=completed.stdout[:1000],
        ) from error
    if payload.get("ok") is False:
        error = payload.get("error") or {}
        message = error.get("message") or "未知错误"
        raise QueryError(f"{label}不可用：{message}", stage="前置检查")
    return payload


def require_cli(identity):
    if shutil.which("lark-cli") is None:
        raise QueryError(
            "未检测到 lark-cli，请先安装并完成飞书 CLI 配置。",
            stage="前置检查",
        )
    auth = run_cli(["auth", "status", "--json"], "飞书认证检查", output_format=None)
    identities = auth.get("identities") or {}
    selected = identities.get(identity) or {}
    if identity == "user":
        ready = selected.get("status") == "ready" and selected.get("tokenStatus") == "valid"
    else:
        ready = selected.get("status") == "ready" and selected.get("available") is True
    if not ready:
        raise QueryError("飞书认证不可用。", stage="前置检查", details=auth)
    return {"name": "lark-cli 与飞书认证", "status": "通过", "identity": identity}


def get_sheet_catalog(spreadsheet_token, wiki_url, identity):
    wiki = run_cli(
        ["wiki", "+node-get", "--node-token", wiki_url],
        "Wiki 节点检查",
        identity,
    )
    wiki_data = wiki.get("data") or {}
    if wiki_data.get("obj_type") != "sheet":
        raise QueryError(
            f"Wiki 节点对象类型不是电子表格：{wiki_data.get('obj_type') or '-'}",
            stage="前置检查",
            details=wiki_data,
        )
    if wiki_data.get("obj_token") and wiki_data.get("obj_token") != spreadsheet_token:
        raise QueryError(
            "Wiki 节点对应的 Spreadsheet token 与查询配置不一致。",
            stage="前置检查",
            details={
                "wikiObjToken": wiki_data.get("obj_token"),
                "configuredToken": spreadsheet_token,
            },
        )

    info = run_cli(
        ["sheets", "+info", "--spreadsheet-token", spreadsheet_token],
        "电子表格元数据读取",
        identity,
    )
    sheets = ((info.get("data") or {}).get("sheets") or {}).get("sheets") or []
    catalog = {str(sheet.get("title")): sheet for sheet in sheets if sheet.get("title")}
    if not catalog:
        raise QueryError("电子表格没有可用 Sheet。", stage="前置检查", details=info)
    return {
        "wiki": wiki_data,
        "info": info,
        "catalog": catalog,
    }


def column_name(number):
    result = ""
    while number > 0:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result or "A"


def sheet_range(sheet):
    grid = sheet.get("grid_properties") or {}
    row_count = max(1, min(int(grid.get("row_count") or 200), 2000))
    column_count = max(1, min(int(grid.get("column_count") or 26), 100))
    return f"A1:{column_name(column_count)}{row_count}"


def read_sheet(spreadsheet_token, sheet, identity):
    sheet_id = str(sheet.get("sheet_id") or "").strip()
    if not sheet_id:
        raise QueryError("目标 Sheet 缺少 sheet_id。", stage="读取 Sheet")
    payload = run_cli(
        [
            "sheets",
            "+read",
            "--spreadsheet-token",
            spreadsheet_token,
            "--sheet-id",
            sheet_id,
            "--range",
            sheet_range(sheet),
        ],
        f"读取 Sheet {sheet.get('title')}",
        identity,
    )
    values = ((payload.get("data") or {}).get("valueRange") or {}).get("values") or []
    if not values:
        raise QueryError(f"Sheet {sheet.get('title')} 为空。", stage="读取 Sheet")
    return values, payload


def headers_of(values, sheet_title):
    if not values or not values[0]:
        raise QueryError(f"Sheet {sheet_title} 缺少表头。", stage="解析 Sheet")
    return [normalize_cell(value) for value in values[0]]


def header_index(headers, name, sheet_title):
    try:
        return headers.index(name)
    except ValueError as error:
        raise QueryError(
            f"Sheet {sheet_title} 缺少必要字段：{name}",
            stage="解析 Sheet",
            details={"headers": headers},
        ) from error


def row_record(headers, row):
    return {
        header: normalize_cell(row[index]) if index < len(row) else ""
        for index, header in enumerate(headers)
        if header
    }


def resolve_app(values, app_input, title):
    headers = headers_of(values, title)
    app_index = header_index(headers, "appKey", title)
    url_index = header_index(headers, "operationConfigReadUrl", title)
    needle = normalize_lookup(app_input)
    matches = []
    for row in values[1:]:
        app_key = normalize_cell(row[app_index]) if app_index < len(row) else ""
        if app_key and normalize_lookup(app_key) == needle:
            matches.append((app_key, row))
    if not matches:
        available = [
            normalize_cell(row[app_index])
            for row in values[1:]
            if app_index < len(row) and normalize_cell(row[app_index])
        ]
        raise QueryError(
            f"APP信息中找不到 APP：{app_input}",
            stage="匹配 APP",
            details={"availableApps": available},
        )
    if len(matches) > 1:
        raise QueryError(
            f"APP信息中存在重复 appKey，请先清理重复配置：{app_input}",
            stage="匹配 APP",
            details={"matchedRows": [row_record(headers, row) for _, row in matches]},
        )
    app_key, row = matches[0]
    api_url = normalize_cell(row[url_index]) if url_index < len(row) else ""
    record = row_record(headers, row)
    if not api_url:
        raise QueryError(
            f"APP {app_key} 未配置 operationConfigReadUrl。",
            stage="校验 APP 接口",
            details={"appRecord": record},
        )
    parsed = urllib.parse.urlsplit(api_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise QueryError(
            f"APP {app_key} 的 operationConfigReadUrl 不是有效 HTTP/HTTPS URL。",
            stage="校验 APP 接口",
            details={"operationConfigReadUrl": api_url, "appRecord": record},
        )
    if parsed.query or parsed.fragment:
        raise QueryError(
            f"APP {app_key} 的 operationConfigReadUrl 不能包含 Query 参数或 Fragment。",
            stage="校验 APP 接口",
            details={"operationConfigReadUrl": api_url, "appRecord": record},
        )
    return {
        "appKey": app_key,
        "operationConfigReadUrl": api_url,
        "record": record,
        "headers": headers,
    }


def resolve_game(values, game_input, title):
    headers = headers_of(values, title)
    game_key_index = header_index(headers, "gameKey", title)
    game_name_index = header_index(headers, "gameName", title)
    needle = normalize_lookup(game_input)
    rows = []
    for row in values[1:]:
        game_key = normalize_cell(row[game_key_index]) if game_key_index < len(row) else ""
        game_name = normalize_cell(row[game_name_index]) if game_name_index < len(row) else ""
        if game_key or game_name:
            rows.append((game_key, game_name, row))

    exact = [
        item
        for item in rows
        if normalize_lookup(item[0]) == needle or normalize_lookup(item[1]) == needle
    ]
    candidates = exact or [
        item
        for item in rows
        if needle and (
            needle in normalize_lookup(item[0]) or needle in normalize_lookup(item[1])
        )
    ]
    if not candidates:
        raise QueryError(
            f"游戏信息中找不到游戏：{game_input}",
            stage="匹配游戏",
            details={"availableGames": [{"gameKey": key, "gameName": name} for key, name, _ in rows]},
        )
    if len(candidates) > 1:
        raise QueryError(
            f"游戏输入匹配到多个游戏，请使用 gameKey 或完整游戏名：{game_input}",
            stage="匹配游戏",
            details={"candidates": [{"gameKey": key, "gameName": name} for key, name, _ in candidates]},
        )
    game_key, game_name, row = candidates[0]
    return {
        "gameKey": game_key,
        "gameName": game_name,
        "record": row_record(headers, row),
        "headers": headers,
    }


def resolve_relation(values, app_key, game_key, title):
    headers = headers_of(values, title)
    if headers[0] != "gameKey":
        raise QueryError(
            f"Sheet {title} 首列必须为 gameKey。",
            stage="解析 APP游戏关系",
            details={"headers": headers},
        )
    app_indexes = [
        index
        for index, header in enumerate(headers)
        if index > 0 and normalize_lookup(header) == normalize_lookup(app_key)
    ]
    if not app_indexes:
        raise QueryError(
            f"APP游戏关系中找不到 APP 列：{app_key}",
            stage="匹配 gameConfigId",
            details={"headers": headers},
        )
    app_index = app_indexes[0]
    game_rows = [
        row
        for row in values[1:]
        if row and normalize_lookup(row[0]) == normalize_lookup(game_key)
    ]
    if not game_rows:
        raise QueryError(
            f"APP游戏关系中找不到游戏行：{game_key}",
            stage="匹配 gameConfigId",
        )
    row = game_rows[0]
    raw_config_id = normalize_cell(row[app_index]) if app_index < len(row) else ""
    if not re.fullmatch(r"[1-9][0-9]*", raw_config_id):
        raise QueryError(
            f"APP {app_key}、游戏 {game_key} 未配置有效 gameConfigId。",
            stage="校验 gameConfigId",
            details={
                "appKey": app_key,
                "gameKey": game_key,
                "rawValue": raw_config_id,
                "relationRecord": row_record(headers, row),
            },
        )
    return {
        "appKey": app_key,
        "gameKey": game_key,
        "gameConfigId": int(raw_config_id),
        "rawValue": raw_config_id,
        "relationRecord": row_record(headers, row),
        "headers": headers,
    }


def request_online_config(api_url, config_type):
    request_url = f"{api_url}?{urllib.parse.urlencode({'configType': str(config_type)})}"
    request = urllib.request.Request(
        request_url,
        headers={"Accept": "application/json"},
        method="GET",
    )
    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                body = response.read().decode("utf-8", errors="replace")
                return request_url, response.status, dict(response.headers), body
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            if error.code not in {429, 500, 502, 503, 504} or attempt >= MAX_RETRIES:
                return request_url, error.code, dict(error.headers or {}), body
            last_error = error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last_error = error
            if attempt >= MAX_RETRIES:
                raise QueryError(
                    f"无法连接线上运营配置接口：{error}",
                    stage="请求线上配置",
                    details={"requestUrl": request_url},
                ) from error
        time.sleep(attempt + 1)
    raise QueryError(
        f"线上运营配置接口请求失败：{last_error}",
        stage="请求线上配置",
        details={"requestUrl": request_url},
    )


def parse_online_response(body, config_type):
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as error:
        raise QueryError(
            "线上接口返回不是合法 JSON。",
            stage="校验线上配置返回",
            details={"rawResponse": body},
        ) from error
    if not isinstance(payload, dict):
        raise QueryError(
            "线上接口返回必须是 JSON 对象。",
            stage="校验线上配置返回",
            details={"payload": payload},
        )
    if str(payload.get("code")) != "200":
        raise QueryError(
            f"线上接口业务失败：code={payload.get('code')}",
            stage="校验线上配置返回",
            details={"payload": payload},
        )
    if "sucessed" in payload and payload.get("sucessed") is not True:
        raise QueryError(
            "线上接口返回 sucessed=false。",
            stage="校验线上配置返回",
            details={"payload": payload},
        )
    data = payload.get("data")
    if not isinstance(data, dict):
        raise QueryError(
            "线上接口缺少 data 对象。",
            stage="校验线上配置返回",
            details={"payload": payload},
        )
    try:
        data_id = int(str(data.get("id")).strip())
    except (TypeError, ValueError) as error:
        raise QueryError(
            "线上接口 data.id 不是有效整数。",
            stage="校验线上配置返回",
            details={"data": data},
        ) from error
    if data_id != config_type:
        raise QueryError(
            f"线上接口 data.id 与 gameConfigId 不一致：请求={config_type}，返回={data_id}",
            stage="校验线上配置返回",
            details={"data": data},
        )
    if str(data.get("status")) != "1":
        raise QueryError(
            f"线上运营配置未启用：status={data.get('status')}",
            stage="校验线上配置返回",
            details={"data": data},
        )
    config_text = data.get("config")
    if not isinstance(config_text, str) or not config_text.strip():
        raise QueryError(
            "线上接口 data.config 不是非空 JSON 字符串。",
            stage="校验线上配置返回",
            details={"data": data},
        )
    try:
        config = json.loads(config_text)
    except json.JSONDecodeError as error:
        raise QueryError(
            "线上接口 data.config 不是合法 JSON。",
            stage="校验线上配置返回",
            details={"data": data, "configText": config_text},
        ) from error
    if not isinstance(config, dict):
        raise QueryError(
            "线上接口 data.config 必须解析为 JSON 对象。",
            stage="校验线上配置返回",
            details={"config": config},
        )
    for platform in ("android", "ios"):
        records = config.get(platform)
        if not isinstance(records, list) or not all(isinstance(record, dict) for record in records):
            raise QueryError(
                f"线上接口 data.config.{platform} 必须是对象数组。",
                stage="校验线上配置返回",
                details={"config": config},
            )
    return payload, config


def default_output_path(app_key, game_key):
    output_dir = Path(os.environ.get("ONLINE_GAME_CONFIG_OUTPUT_DIR", "~/Desktop")).expanduser()
    safe_app = re.sub(r"[^A-Za-z0-9._-]+", "_", app_key).strip("_") or "app"
    safe_game = re.sub(r"[^A-Za-z0-9._-]+", "_", game_key).strip("_") or "game"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return output_dir / f"线上游戏配置_{safe_app}_{safe_game}_{timestamp}.html"


def pretty_json_block(title, value, open_by_default=False):
    open_attr = " open" if open_by_default else ""
    content = json_text(value) if value is not None else "无"
    return (
        f"<details{open_attr}><summary>{html.escape(title)}</summary>"
        f"<pre>{html.escape(content)}</pre></details>"
    )


def render_html(report):
    status = report.get("status", "error")
    status_label = "查询成功" if status == "success" else "查询失败"
    status_class = "success" if status == "success" else "error"
    meta = report.get("meta") or {}
    error = report.get("error")
    checks = report.get("checks") or []
    checks_html = "".join(
        f"<li><span class='check-{('ok' if item.get('status') == '通过' else 'bad')}'>{html.escape(str(item.get('status') or '-'))}</span> "
        f"{html.escape(str(item.get('name') or '-'))}：{html.escape(str(item.get('detail') or ''))}</li>"
        for item in checks
    )
    summary_rows = [
        ("APP", meta.get("appKey") or meta.get("appInput") or "-"),
        ("游戏", meta.get("gameKey") or meta.get("gameInput") or "-"),
        ("游戏名", meta.get("gameName") or "-"),
        ("gameConfigId", meta.get("gameConfigId") or "-"),
        ("接口地址", meta.get("operationConfigReadUrl") or "-"),
        ("请求地址", meta.get("requestUrl") or "-"),
        ("HTTP 状态", meta.get("httpStatus") or "-"),
        ("Spreadsheet token", meta.get("spreadsheetToken") or "-"),
        ("Sheet", meta.get("sheetNames") or "-"),
        ("表格 revision", meta.get("revision") or "-"),
        ("生成时间", meta.get("generatedAt") or "-"),
    ]
    summary_html = "".join(
        f"<tr><th>{html.escape(str(key))}</th><td>{html.escape(str(value))}</td></tr>"
        for key, value in summary_rows
    )
    error_html = (
        "<section class='error-box'><h2>错误</h2>"
        f"<p><strong>{html.escape(str(error.get('stage') or '-'))}</strong>：{html.escape(str(error.get('message') or '-'))}</p>"
        f"{pretty_json_block('错误详情', error.get('details'), True) if error.get('details') is not None else ''}</section>"
        if error
        else ""
    )
    source = report.get("source") or {}
    response = report.get("response") or {}
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>线上游戏配置 - {html.escape(str(meta.get('appKey') or meta.get('appInput') or '-'))} / {html.escape(str(meta.get('gameKey') or meta.get('gameInput') or '-'))}</title>
<style>
:root{{color-scheme:light;--bg:#f4f7fb;--panel:#fff;--line:#d9e1ec;--text:#1f2937;--muted:#64748b;--blue:#2563eb;--green:#15803d;--red:#b91c1c}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}
main{{max-width:1200px;margin:0 auto;padding:28px 20px 48px}}header{{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:18px}}
h1{{margin:0;font-size:24px;line-height:1.25}}h2{{margin:0 0 10px;font-size:17px}}p{{margin:6px 0}}.muted{{color:var(--muted)}}
.badge{{border-radius:999px;padding:5px 12px;font-weight:700;white-space:nowrap}}.badge.success{{background:#dcfce7;color:var(--green)}}.badge.error{{background:#fee2e2;color:var(--red)}}
.panel,.error-box{{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px;margin:14px 0;box-shadow:0 2px 8px #1e3a8a0b}}
.error-box{{border-color:#fecaca;background:#fff7f7}}table{{width:100%;border-collapse:collapse}}th,td{{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}}th{{width:180px;color:var(--muted);font-weight:600}}td{{word-break:break-word}}
details{{margin:12px 0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fbfdff}}summary{{cursor:pointer;padding:10px 12px;font-weight:700;background:#f8fafc}}pre{{margin:0;padding:14px;overflow:auto;white-space:pre-wrap;word-break:break-word;background:#0f172a;color:#e2e8f0;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}}
ul{{margin:0;padding-left:22px}}.check-ok{{color:var(--green);font-weight:700}}.check-bad{{color:var(--red);font-weight:700}}
@media(max-width:720px){{header{{display:block}}.badge{{display:inline-block;margin-top:12px}}th{{width:130px}}}}
</style>
</head>
<body><main>
<header><div><h1>线上游戏配置查询</h1><p class="muted">只读查询 · 数据来源：{html.escape(str(meta.get('wikiUrl') or DEFAULT_WIKI_URL))}</p></div><span class="badge {status_class}">{status_label}</span></header>
<section class="panel"><h2>查询摘要</h2><table>{summary_html}</table></section>
{error_html}
<section class="panel"><h2>前置检查与校验</h2><ul>{checks_html or '<li>无检查记录</li>'}</ul></section>
<section class="panel"><h2>配置来源</h2>{pretty_json_block('APP信息匹配行', source.get('appRecord'), True)}{pretty_json_block('APP游戏关系匹配行', source.get('relationRecord'), True)}{pretty_json_block('游戏信息匹配行', source.get('gameRecord'))}</section>
<section class="panel"><h2>接口返回</h2>{pretty_json_block('接口原始返回', response.get('payload') if response.get('payload') is not None else response.get('body'), True)}{pretty_json_block('解析后的 config', report.get('config'), True)}</section>
</main></body></html>
"""


def execute(args):
    report = {
        "status": "error",
        "meta": {
            "appInput": args.app,
            "gameInput": args.game,
            "wikiUrl": args.wiki_url,
            "spreadsheetToken": args.spreadsheet_token,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
        "checks": [],
        "source": {},
        "response": {},
        "config": None,
    }
    try:
        report["checks"].append(require_cli(args.identity))
        catalog_info = get_sheet_catalog(args.spreadsheet_token, args.wiki_url, args.identity)
        catalog = catalog_info["catalog"]
        report["meta"]["sheetNames"] = ", ".join(
            [args.app_sheet_title, args.game_sheet_title, args.relation_sheet_title]
        )
        report["checks"].append({"name": "Wiki 与电子表格", "status": "通过", "detail": "Wiki 节点和 Spreadsheet token 已匹配"})
        required_titles = [args.app_sheet_title, args.game_sheet_title, args.relation_sheet_title]
        missing_titles = [title for title in required_titles if title not in catalog]
        if missing_titles:
            raise QueryError(
                f"电子表格缺少 Sheet：{', '.join(missing_titles)}",
                stage="前置检查",
                details={"availableSheets": sorted(catalog)},
            )
        report["checks"].append({"name": "目标 Sheet", "status": "通过", "detail": "APP信息、游戏信息、APP游戏关系均存在"})
        app_values, app_payload = read_sheet(
            args.spreadsheet_token, catalog[args.app_sheet_title], args.identity
        )
        game_values, game_payload = read_sheet(
            args.spreadsheet_token, catalog[args.game_sheet_title], args.identity
        )
        relation_values, relation_payload = read_sheet(
            args.spreadsheet_token, catalog[args.relation_sheet_title], args.identity
        )
        revisions = [
            ((payload.get("data") or {}).get("valueRange") or {}).get("revision")
            for payload in (app_payload, game_payload, relation_payload)
        ]
        revisions = [revision for revision in revisions if revision is not None]
        if revisions:
            report["meta"]["revision"] = max(revisions)
        app = resolve_app(app_values, args.app, args.app_sheet_title)
        report["meta"].update({"appKey": app["appKey"], "operationConfigReadUrl": app["operationConfigReadUrl"]})
        report["source"]["appRecord"] = app["record"]
        report["checks"].append({"name": "APP接口地址", "status": "通过", "detail": app["operationConfigReadUrl"]})
        game = resolve_game(game_values, args.game, args.game_sheet_title)
        report["meta"].update({"gameKey": game["gameKey"], "gameName": game["gameName"]})
        report["source"]["gameRecord"] = game["record"]
        report["checks"].append({"name": "游戏匹配", "status": "通过", "detail": f"{game['gameKey']} / {game['gameName']}"})
        relation = resolve_relation(
            relation_values,
            app["appKey"],
            game["gameKey"],
            args.relation_sheet_title,
        )
        report["meta"]["gameConfigId"] = relation["gameConfigId"]
        report["source"]["relationRecord"] = relation["relationRecord"]
        report["checks"].append({"name": "gameConfigId", "status": "通过", "detail": str(relation["gameConfigId"])})
        request_url, http_status, response_headers, body = request_online_config(
            app["operationConfigReadUrl"], relation["gameConfigId"]
        )
        report["meta"].update({"requestUrl": request_url, "httpStatus": http_status})
        report["response"] = {"httpStatus": http_status, "headers": {"content-type": response_headers.get("Content-Type", "")}}
        try:
            report["response"]["payload"] = json.loads(body)
        except json.JSONDecodeError:
            report["response"]["body"] = body
        if http_status != 200:
            raise QueryError(
                f"线上接口返回 HTTP {http_status}。",
                stage="请求线上配置",
                details={"requestUrl": request_url, "response": report["response"]},
            )
        payload, config = parse_online_response(body, relation["gameConfigId"])
        report["response"]["payload"] = payload
        report["config"] = config
        report["checks"].append({"name": "线上配置返回", "status": "通过", "detail": "HTTP、业务状态、ID、status、android/ios 结构均通过"})
        report["status"] = "success"
    except QueryError as error:
        report["error"] = {"stage": error.stage, "message": str(error)}
        if error.details is not None:
            report["error"]["details"] = error.details
        report["checks"].append({"name": error.stage, "status": "失败", "detail": str(error)})
    return report


def parse_args():
    parser = argparse.ArgumentParser(description="查询 APP 与线上游戏运营配置并输出解析后的 config JSON")
    parser.add_argument("--app", required=True, help="APP key 或 APP 名")
    parser.add_argument("--game", required=True, help="gameKey 或游戏名")
    parser.add_argument("--output", help="可选：HTML 输出路径；不传时直接输出 config JSON")
    parser.add_argument("--as", dest="identity", choices=("user", "bot"), default="user")
    parser.add_argument("--wiki-url", default=DEFAULT_WIKI_URL)
    parser.add_argument("--spreadsheet-token", default=DEFAULT_SPREADSHEET_TOKEN)
    parser.add_argument("--app-sheet-title", default=DEFAULT_APP_SHEET_TITLE)
    parser.add_argument("--game-sheet-title", default=DEFAULT_GAME_SHEET_TITLE)
    parser.add_argument("--relation-sheet-title", default=DEFAULT_RELATION_SHEET_TITLE)
    return parser.parse_args()


def main():
    args = parse_args()
    report = execute(args)
    if args.output:
        output_path = Path(args.output).expanduser()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(render_html(report), encoding="utf-8")
        print(f"HTML报告：{output_path.resolve()}")
    elif report["status"] == "success":
        print(json_text(report["config"]))
    else:
        error = report.get("error") or {}
        print(
            json.dumps(
                {
                    "status": "error",
                    "stage": error.get("stage") or "查询",
                    "message": error.get("message") or "查询失败",
                },
                ensure_ascii=False,
                indent=2,
            ),
            file=sys.stderr,
        )
    return 0 if report["status"] == "success" else 2


if __name__ == "__main__":
    sys.exit(main())
