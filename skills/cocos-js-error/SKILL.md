---
name: cocos-js-error
description: "查询 ClickHouse JS 错误 Top 10，支持选择 app、gameType 和时间范围，结果输出到桌面 CSV"
argument-hint: "[app名] [游戏名] [时间范围，如：最近1天/最近3天/最近7天]"
allowed-tools:
  - Bash
  - AskUserQuestion
---

<objective>
从 ClickHouse 查询指定 app、指定游戏类型的 JS 错误 Top 10，支持自定义时间范围（默认最近1天）。
</objective>

<game_type_source>
GameType 定义从 GitHub 实时拉取，不使用硬编码映射：
```bash
gh api repos/wenext-limited/cocos-game-wsdk/contents/assets/Const.ts --jq '.content' | base64 -d
```
从返回的 TypeScript 源码中解析 `static GameType = { ... }` 块，提取所有 `KEY: NUMBER` 条目，构建 name→id 映射。
</game_type_source>

<clickhouse_config>
HOST=cc-t4nnjid28p401lh59-ck-l8.clickhouseserver.singapore.rds.aliyuncs.com
PORT=8123
USER=clickhouse_read
PASSWORD 来自环境变量 CLICKHOUSE_PASSWORD
</clickhouse_config>

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
- app 名候选：识别 app 列表中的词（ludo/fungo/inchat/lama/wyak/yoki/hichat/weparty/hayi/gameparty）
- 游戏名候选：与 game_type_map 的 key 或注释别名做模糊匹配
- 时间范围候选：识别"最近N天"、"最近N小时"、"Nd"、"Nh" 等模式，提取数字 N 和单位（DAY/HOUR）

示例解析：
- "fungo ludo 最近3天" → app=fungo, game=LUDO(1), interval=3 DAY
- "fungo 幸运足球 2天" → app=fungo, game=LUCKY_SOCCER(10007), interval=2 DAY
- "最近12小时" → interval=12 HOUR（app 和游戏名交互选择）

## 3. 确定 app 名

如果 $ARGUMENTS 中已指定 app 名，直接使用。

否则，从远端拉取 app 列表：
```bash
curl -s "https://lama-dev1-1314119829.cos.ap-guangzhou.myqcloud.com/game-test/app_list.json"
```

解析 JSON，提取所有 app 名称列表，用 AskUserQuestion 让用户选择（最多展示4个选项，超出则展示前3个并加"其他"选项）。

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

如果未指定，用 AskUserQuestion 让用户选择：
- 最近1天（默认）
- 最近3天
- 最近7天
- 自定义（用户输入）

## 6. 构造并执行查询

确定好 APP_NAME、GAME_TYPE_ID、INTERVAL_VALUE、INTERVAL_UNIT 后，用 Python 执行查询：

```python
import urllib.request, os, json, base64

host = "cc-t4nnjid28p401lh59-ck-l8.clickhouseserver.singapore.rds.aliyuncs.com"
port = 8123
user = "clickhouse_read"
password = os.environ.get("CLICKHOUSE_PASSWORD", "")

app_name = "{APP_NAME}"
game_name = "{GAME_NAME}"   # 用于展示，如 "幸运足球" 或枚举名
game_type_id = {GAME_TYPE_ID}
interval_value = {INTERVAL_VALUE}
interval_unit = "{INTERVAL_UNIT}"   # DAY 或 HOUR

query = f"""
SELECT
    count() AS cnt,
    JSONExtractString(event_value, 'err_msg') AS err_msg
FROM {app_name}.event_local_prod
WHERE event_time >= now() - INTERVAL {interval_value} {interval_unit}
  AND event_time <= now()
  AND action = 'cocos_js'
  AND event_id = 'js_error'
  AND JSONExtractUInt(event_value, 'gameType') = {game_type_id}
  AND position(JSONExtractString(event_value, 'err_msg'), '[JsError]: Script error. -') = 0
GROUP BY err_msg
ORDER BY cnt DESC
LIMIT 10
FORMAT JSON
"""

url = f"http://{host}:{port}/"
credentials = base64.b64encode(f"{user}:{password}".encode()).decode()
req = urllib.request.Request(url, data=query.encode("utf-8"), method="POST")
req.add_header("Authorization", f"Basic {credentials}")
resp = urllib.request.urlopen(req, timeout=30)
data = json.loads(resp.read().decode())
rows = data.get("data", [])

time_label = f"最近{interval_value}{'天' if interval_unit == 'DAY' else '小时'}"
if not rows:
    print(f"{time_label}无该游戏的 JS 错误记录")
else:
    # 输出到桌面 CSV（UTF-8 BOM，Excel 直接打开不乱码）
    import csv
    csv_name = f"{app_name}_{game_name}_js_error_{time_label}.csv"
    out_path = os.path.join(os.path.expanduser("~/Desktop"), csv_name)
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["排名", "次数", "错误信息"])
        for i, row in enumerate(rows, 1):
            writer.writerow([i, row["cnt"], row["err_msg"]])

    print(f"app: {app_name} | 游戏: {game_name} (gameType={game_type_id}) | 时间: {time_label}")
    print()
    print(f"{'排名':<4} {'次数':>6}  错误信息")
    print("-" * 80)
    for i, row in enumerate(rows, 1):
        err = row['err_msg'][:70] + ("..." if len(row['err_msg']) > 70 else "")
        print(f"{i:<4} {row['cnt']:>6}  {err}")
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
- [ ] app 名已确认（用户指定或从列表选择）
- [ ] gameType 已确认（用户指定或从列表选择）
- [ ] 时间范围已确认（用户指定或从选项选择，默认最近1天）
- [ ] ClickHouse 查询成功执行
- [ ] 结果以排名表格形式展示，并导出到桌面 CSV
</success_criteria>
