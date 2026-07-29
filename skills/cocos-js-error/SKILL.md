---
name: cocos-js-error
description: "查询 ClickHouse 指定 App、gameType 和时间范围的 Cocos JS 错误 Top 10，兼容 WSDK 新版拓展列 long_key_1/message 与旧 event_value 回退，并展示结果、导出 CSV。用户提到查询 JS 报错、错误排行或指定游戏报错 Top 10 时使用。"
argument-hint: "[app名] [游戏名] [时间范围，如：最近1天/最近3天/最近7天]"
allowed-tools:
  - Bash
  - AskUserQuestion
---

<objective>
从 ClickHouse 查询指定 App、指定游戏类型的 JS 错误 Top 10，支持自定义时间范围（默认最近 1 天），并兼容 WSDK 新旧两种上报字段。
</objective>

<game_type_source>
GameType 定义从 GitHub 实时拉取，不使用硬编码映射：
```bash
gh api repos/wenext-limited/cocos-game-wsdk/contents/assets/Const.ts --jq '.content' | base64 -d
```
从返回的 TypeScript 源码中解析 `static GameType = { ... }` 块，提取所有 `KEY: NUMBER` 条目，构建 name→id 映射。
</game_type_source>

<clickhouse_config>
默认使用以下 ClickHouse 配置；允许通过同名环境变量覆盖。执行过程中不得打印密码：

| 配置 | 默认值 |
|---|---|
| JDBC | `jdbc:clickhouse://cc-t4nnjid28p401lh59-ck-l8.clickhouseserver.singapore.rds.aliyuncs.com:8123` |
| `CLICKHOUSE_HOST` | `cc-t4nnjid28p401lh59-ck-l8.clickhouseserver.singapore.rds.aliyuncs.com` |
| `CLICKHOUSE_PORT` | `8123` |
| `CLICKHOUSE_USER` | `clickhouse_read` |
| `CLICKHOUSE_PASSWORD` | 使用本 Skill 内配置的默认查询密码 |
</clickhouse_config>

<query_contract>
查询口径必须与 `monitor_script_error/run_js_error_monitor.py` 保持一致：

- `gameType`：优先取 `long_key_1`；为空或不大于 0 时，回退到 `event_value.gameType`。
- 错误内容：优先取 `message`；为空时，回退到 `event_value.err_msg`。
- 仅统计 `action = 'cocos_js'` 且 `event_id = 'js_error'` 的记录。
- 排除错误内容为空的记录，以及以 `[JsError]: Script error. -` 开头的无效错误。
- Top 10 按相同完整错误内容的事件次数降序排列，不按用户数排列。
- 时间范围使用滚动窗口 `[now() - interval, now())`，不是昨日自然日。
</query_contract>

<process>

## 1. 检查 gh CLI 并拉取 GameType 映射

先检查 `gh` 是否可用：
```bash
which gh
```

如果不存在，用 Bash 输出安装提示后终止：
```
未检测到 GitHub CLI (gh)，请先安装：
  macOS:   brew install gh
  Linux:   https://github.com/cli/cli/blob/trunk/docs/install_linux.md
  Windows: winget install --id GitHub.cli
安装后执行 gh auth login 完成授权，再重新运行此 skill。
```

`gh` 可用后，从 GitHub 实时拉取最新 GameType：
```bash
gh api repos/wenext-limited/cocos-game-wsdk/contents/assets/Const.ts --jq '.content' | base64 -d
```

用正则解析出 `KEY : NUMBER` 对，构建 game_type_map（key 转小写以便模糊匹配）。
注释中的中文说明（如 `// 龙虎斗`）也一并提取，作为别名供用户输入匹配。

## 2. 解析参数

从 $ARGUMENTS 中尝试解析：
- app 名候选：保留用户输入，等待与远端 App 列表做精确匹配，不使用硬编码列表
- 游戏名候选：与 game_type_map 的 key 或注释别名做模糊匹配
- 时间范围候选：识别"最近N天"、"最近N小时"、"Nd"、"Nh" 等模式，提取数字 N 和单位（DAY/HOUR）

时间数字必须是正整数，单位只能是 `DAY` 或 `HOUR`。游戏名或 App 名匹配到多个结果时，必须让用户确认，不得静默选择第一个。

示例解析：
- "fungo ludo 最近3天" → app=fungo, game=LUDO(1), interval=3 DAY
- "fungo 幸运足球 2天" → app=fungo, game=LUCKY_SOCCER(10007), interval=2 DAY
- "最近12小时" → interval=12 HOUR（app 和游戏名交互选择）

## 3. 确定 app 名

始终先从远端拉取 App 列表：
```bash
curl -fsSL "https://lama-dev1-1314119829.cos.ap-guangzhou.myqcloud.com/game-test/app_list.json"
```

解析 JSON 的 `BUCKET_NAME`，排除空值和字符串 `null`：

- 参数中有 App 名时，按不区分大小写的精确名称匹配远端列表。
- 参数中没有 App 名时，用 AskUserQuestion 让用户选择；选项过多时先按关键词缩小范围。
- 最终 App 名必须匹配 `^[A-Za-z_][A-Za-z0-9_]*$`，且必须存在于远端列表，否则停止查询。App 名会拼入 ClickHouse 表名，禁止直接使用未经验证的输入。

## 4. 确定 gameType

如果 $ARGUMENTS 中已指定游戏名（与 game_type_map key 或注释别名匹配），直接使用对应 ID。

否则用 AskUserQuestion 展示游戏选项（分两步，每步最多4个）：
- 第一步：选分类，按 ID 范围分组（1-9 基础棋牌、10000+ 特色游戏等）
- 第二步：在该分类内选具体游戏（展示 枚举名 + 注释 + ID）

## 5. 确定时间范围

如果 $ARGUMENTS 中已包含时间范围描述，解析为 interval 数字和单位：
- "最近1天" / "1天" / "1d" → INTERVAL 1 DAY
- "最近3天" / "3天" / "3d" → INTERVAL 3 DAY
- "最近12小时" / "12小时" / "12h" → INTERVAL 12 HOUR

如果未指定，直接使用默认值 `INTERVAL 1 DAY`，无需再次询问。

如果用户输入的时间范围无法解析为正整数天数或小时数，用 AskUserQuestion 要求重新输入，不得把原始文本直接拼入 SQL。

## 6. 构造并执行查询

确定好 APP_NAME、GAME_TYPE_ID、INTERVAL_VALUE、INTERVAL_UNIT 后，用 Python 执行查询：

```python
import base64
import csv
import json
import os
import re
import urllib.error
import urllib.request

host = os.environ.get(
    "CLICKHOUSE_HOST",
    "cc-t4nnjid28p401lh59-ck-l8.clickhouseserver.singapore.rds.aliyuncs.com",
)
port = int(os.environ.get("CLICKHOUSE_PORT", "8123"))
user = os.environ.get("CLICKHOUSE_USER", "clickhouse_read")
password = os.environ.get("CLICKHOUSE_PASSWORD", "!NQ%mifU%U%oh48wD&U3")

app_name = "{APP_NAME}"
game_name = "{GAME_NAME}"   # 用于展示，如 "幸运足球" 或枚举名
game_type_id = int({GAME_TYPE_ID})
interval_value = int({INTERVAL_VALUE})
interval_unit = "{INTERVAL_UNIT}"   # DAY 或 HOUR

if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", app_name):
    raise ValueError(f"非法 App 名: {app_name}")
if interval_value <= 0:
    raise ValueError("时间范围必须是正整数")
if interval_unit not in {"DAY", "HOUR"}:
    raise ValueError(f"不支持的时间单位: {interval_unit}")

query = f"""
SELECT
    count() AS cnt,
    err_msg
FROM
(
    SELECT
        if(
            ifNull(long_key_1, 0) > 0,
            ifNull(long_key_1, 0),
            toInt64(JSONExtractUInt(event_value, 'gameType'))
        ) AS game_type,
        if(
            empty(trim(ifNull(message, ''))),
            JSONExtractString(event_value, 'err_msg'),
            ifNull(message, '')
        ) AS err_msg
    FROM {app_name}.event_local_prod
    WHERE event_time >= now() - INTERVAL {interval_value} {interval_unit}
      AND event_time < now()
      AND action = 'cocos_js'
      AND event_id = 'js_error'
)
WHERE game_type = {game_type_id}
  AND notEmpty(trim(err_msg))
  AND err_msg NOT LIKE '[JsError]: Script error. -%'
GROUP BY err_msg
ORDER BY cnt DESC
LIMIT 10
SETTINGS short_circuit_function_evaluation = 'force_enable'
FORMAT JSON
"""

url = f"http://{host}:{port}/"
credentials = base64.b64encode(f"{user}:{password}".encode()).decode()
req = urllib.request.Request(url, data=query.encode("utf-8"), method="POST")
req.add_header("Authorization", f"Basic {credentials}")
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
except urllib.error.HTTPError as exc:
    detail = exc.read().decode("utf-8", errors="replace")
    raise RuntimeError(f"ClickHouse 查询失败 ({exc.code}): {detail}") from exc

rows = data.get("data", [])

time_label = f"最近{interval_value}{'天' if interval_unit == 'DAY' else '小时'}"
if not rows:
    print(f"{time_label}无该游戏的 JS 错误记录")
else:
    # 输出到桌面 CSV（UTF-8 BOM，Excel 直接打开不乱码）
    def safe_file_part(value):
        return re.sub(r'[\\/:*?"<>|\s]+', "_", str(value)).strip("_")

    output_dir = os.environ.get(
        "JS_ERROR_OUTPUT_DIR",
        os.path.expanduser("~/Desktop"),
    )
    os.makedirs(output_dir, exist_ok=True)
    csv_name = "_".join(
        [
            safe_file_part(app_name),
            safe_file_part(game_name),
            "js_error",
            safe_file_part(time_label),
        ]
    ) + ".csv"
    out_path = os.path.join(output_dir, csv_name)
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["排名", "次数", "错误信息"])
        for i, row in enumerate(rows, 1):
            writer.writerow([i, int(row["cnt"]), row["err_msg"]])

    print(f"app: {app_name} | 游戏: {game_name} (gameType={game_type_id}) | 时间: {time_label}")
    print()
    print(f"{'排名':<4} {'次数':>6}  错误信息")
    print("-" * 80)
    for i, row in enumerate(rows, 1):
        err = row['err_msg'][:70] + ("..." if len(row['err_msg']) > 70 else "")
        print(f"{i:<4} {int(row['cnt']):>6}  {err}")
    print()
    print(f"已导出 CSV：{out_path}")
```

## 7. 展示结果

输出格式示例：
```
app: fungo | 游戏: 幸运足球 (gameType=10007) | 时间: 最近3天

排名  次数   错误信息
────────────────────────────────────────────────────────────────────────────────
1      523  [JsError]: Cannot read property 'xxx' of undefined
2      412  [JsError]: ...
...

已导出 CSV：/Users/xxx/Desktop/fungo_幸运足球_js_error_最近3天.csv
```

如无数据，提示"最近N天/小时无该游戏的 JS 错误记录"。

</process>

<success_criteria>
- [ ] GameType 映射已从 GitHub 实时拉取并解析
- [ ] App 名已从远端列表确认并通过标识符校验
- [ ] gameType 已确认（用户指定或从列表选择）
- [ ] 时间范围已确认（用户指定或从选项选择，默认最近1天）
- [ ] 查询优先使用 `long_key_1` / `message`，并正确回退旧 `event_value` 字段
- [ ] 空错误和 `[JsError]: Script error. -` 无效错误已排除
- [ ] ClickHouse 使用 Skill 默认配置或同名环境变量覆盖，执行过程中未输出密码
- [ ] ClickHouse 查询成功执行
- [ ] 结果以排名表格形式展示，并导出到桌面 CSV
</success_criteria>
