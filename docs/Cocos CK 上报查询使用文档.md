# Cocos CK 上报查询使用文档

## 1. 文档范围

本文档说明如何使用 `cocos-query-ck`（显示名称：**Cocos CK 上报查询**）查询 WeNext Cocos Creator 游戏上报到 ClickHouse 的数据。

适用问题包括：

- 查询某个 App、某个游戏的玩家人数、上报量或趋势
- 查询多个 App 的同一游戏并逐 App 对比
- 查询事件字段、版本分布、用户数、比率和明细
- 只生成 SQL，不实际连接 ClickHouse

以下问题会自动转交专项 Skill：

- JS 错误 Top、错误排行、排行靠前的 bug：`cocos-js-error`
- JS 错误堆栈根因分析和修复：`cocos-js-error-fix`
- JS 错误率、错误用户占比：仍使用本 Skill

Skill 入口：[`skills/cocos-query-ck/SKILL.md`](../skills/cocos-query-ck/SKILL.md)

## 2. 最快的使用方式

直接用自然语言描述 App、游戏、时间和指标即可。例如：

```text
查询 Lama 的 teen-patti 昨天玩家人数
```

```text
查询 Yoki 最近 7 天贪婪盒子的平均每天玩家数
```

```text
查询目前所有 App 中水果幸运 77 精简版最近两天的错误率
```

如果游戏名称存在多个候选，Skill 会先列出候选并询问，不能把模糊名称静默映射到某个 gameType。

## 3. 查询前需要明确的范围

### 3.1 App

- 单 App 查询：必须提供 App 名称，例如 `Lama`、`Yoki`、`wyak`。
- 所有 App 查询：明确说“所有 App”或“跨 App”。Skill 会动态解析当前 App 列表。
- App 名称必须与远端列表进行不区分大小写的精确匹配。
- 不使用事件中的 `app` 字段来限定产品；database 才是 App 的边界。

### 3.2 游戏

游戏查询使用 `Const.GameType` 中的 gameType ID。支持游戏名、别名或直接提供数字 ID。

以下情况必须确认：

- “水果机”“扑克”“ludo”等可能泛指多个游戏
- 游戏名只匹配到模糊候选
- 同一名称在多个版本或多个游戏中出现

例如“水果机”不能自动选择“水果幸运 77 精简版”，需要用户明确具体游戏。

### 3.3 时间

- 玩家数、DAU/UV、留存和比率必须明确时间范围，不能自动套最近 24 小时。
- 普通事件查询未指定时间时，才默认最近 24 小时，并在结果中说明。
- 单次 ClickHouse 查询最多覆盖 14 天。
- 超过 14 天时，固定同一组开始/结束时间，拆成连续、无重叠的半开区间 `[start, end)`，每段不超过 14 天。

推荐使用明确的自然日边界，例如：

```text
2026-08-01 00:00:00 <= event_time < 2026-08-15 00:00:00
```

不要让每个分段单独使用 `now()`，否则分段边界可能漂移。

### 3.4 查询环境

| 用户说法 | 环境参数 | 事件表 |
|---|---|---|
| 生产、正式、线上、prod | `--env prod` | `event_local_prod` |
| 测试、测试库、test | `--env test` | `event_local_test` |

未指定环境时默认生产，并在结果中写明“未指定环境，本次采用生产环境”。

生产和测试必须分开查询、分开展示，禁止相加或混算。环境查询失败时不能静默切换到另一套环境。

## 4. 玩家人数的统一口径

### 4.1 定义

“某游戏玩家人数”固定指：

> 指定 App、指定游戏、指定时间范围内，产生过至少一条 `action = 'cocos_js'` 上报的非零 UID 去重人数。

它表示“产生过 Cocos 上报的游戏玩家”，不是宿主 App 的完整 DAU，也不是上报次数。

### 4.2 为什么不限制 event_id

玩家可能只产生了 `game_flow`、`net_protocol`、`js_error` 或其他 Cocos 事件。如果只筛选一个 event_id，会漏掉其他已上报玩家。

因此玩家人数查询使用：

```sql
PREWHERE action = 'cocos_js'
```

而不限定具体 `event_id`。

### 4.3 去重规则

```sql
uniqExactIf(uid, uid != 0)
```

- 同一个 UID 多次上报只算一个玩家
- `uid = 0` 排除
- 用户明确要求设备数时才使用 `device_id`
- 多个 App 的用户数不能直接称为全局唯一用户数，因为同一 UID 可能出现在多个 App database 中

### 4.4 新旧 gameType 融合

游戏范围使用统一的 `game_type`：

```sql
if(
  ifNull(long_key_1, 0) > 0,
  ifNull(long_key_1, 0),
  toInt64(JSONExtractUInt(event_value, 'gameType'))
) AS game_type
```

规则是：

1. 顶层 `long_key_1` 有效时优先使用
2. 顶层值缺失或为 `0` 时读取旧版 `event_value.gameType`
3. 新旧数据在同一条 SQL 中按 `game_type` 过滤
4. 最后统一执行 `uniqExactIf`，不能分别统计新版、旧版玩家数后相加

## 5. 标准玩家人数 SQL

下面是单 App、单游戏的标准模板。将 `<game_type>`、时间边界和 database 替换为实际值；保留 `{table}`，由脚本根据环境选择事件表。

```sql
WITH if(
  ifNull(long_key_1, 0) > 0,
  ifNull(long_key_1, 0),
  toInt64(JSONExtractUInt(event_value, 'gameType'))
) AS game_type
SELECT
  count() AS reports,
  countIf(ifNull(long_key_1, 0) > 0) AS top_level_reports,
  countIf(ifNull(long_key_1, 0) <= 0) AS legacy_reports,
  uniqExactIf(uid, uid != 0) AS players
FROM {table}
PREWHERE action = 'cocos_js'
WHERE event_time >= '<start>'
  AND event_time < '<end>'
  AND game_type = <game_type>
SETTINGS short_circuit_function_evaluation = 'force_enable'
```

命令行示例：

```bash
python3 -B skills/cocos-query-ck/scripts/query_ck.py \
  --env prod \
  --database yoki \
  --allow-cross-event \
  --allow-event-value \
  "WITH if(ifNull(long_key_1, 0) > 0, ifNull(long_key_1, 0), toInt64(JSONExtractUInt(event_value, 'gameType'))) AS game_type
   SELECT uniqExactIf(uid, uid != 0) AS players
   FROM {table}
   PREWHERE action = 'cocos_js'
   WHERE event_time >= '2026-08-13 00:00:00'
     AND event_time < '2026-08-14 00:00:00'
     AND game_type = <game_type>
   SETTINGS short_circuit_function_evaluation = 'force_enable'"
```

查询用户数需要跨 event_id，因此命令使用 `--allow-cross-event`；查询 gameType 旧字段，因此使用 `--allow-event-value`。

## 6. 平均每天玩家数

“最近 7 天平均每天玩家数”不是 7 天窗口内的唯一玩家数。应先按自然日分别去重，再求每日人数的平均值：

```sql
WITH if(
  ifNull(long_key_1, 0) > 0,
  ifNull(long_key_1, 0),
  toInt64(JSONExtractUInt(event_value, 'gameType'))
) AS game_type
SELECT
  toDate(event_time) AS day,
  uniqExactIf(uid, uid != 0) AS daily_players
FROM {table}
PREWHERE action = 'cocos_js'
WHERE event_time >= '<start>'
  AND event_time < '<end>'
  AND game_type = <game_type>
GROUP BY day
ORDER BY day
SETTINGS short_circuit_function_evaluation = 'force_enable'
```

拿到每日结果后：

```text
平均每天玩家数 = 所有完整自然日 daily_players 之和 ÷ 完整自然日数量
```

首尾不完整自然日必须在结果中标注，不能无说明地混入平均值。

如果查询的是整个时间窗的唯一玩家数，分段结果不能直接相加；同一玩家可能跨多个分段出现。

## 7. 其他字段的新旧兼容

除 gameType 外，已确认映射的业务字段采用“两阶段自动回退”：

1. 在目标环境、App、游戏、event_id 和时间范围内探测是否存在“顶层无有效值、旧 JSON 有有效值”的行。
2. 探测命中后，正式查询使用“顶层有效值优先，否则读取旧 JSON key”的统一字段。
3. 探测未命中时，正式查询只读顶层字段，不额外解析 JSON。

已确认的常用映射：

| 事件 | 顶层字段 | 旧 JSON 字段 |
|---|---|---|
| `js_error` | `message` | `err_msg` |
| `app_to_game` / `game_to_app` | `name` | `call_name` |
| `app_to_game` / `game_to_app` | `str_key_2` | `extra` |
| `game_flow` | `str_key_3` | `flow` |
| `game_flow` | `str_key_4` | `param` |
| `net_protocol` | `host`、`uri`、`type`、`duration`、`code` 等 | 同名字段 |

`str_key_N`、`long_key_N` 在不同自定义事件中可能含义不同。没有代码证据时必须询问，不能根据槽位名猜测。

## 8. 常用指标区别

| 用户说法 | 统计方式 |
|---|---|
| 玩家人数 | 时间窗内 `uniqExactIf(uid, uid != 0)` |
| 设备数 | 时间窗内 `uniqExactIf(device_id, device_id != '')`，需明确指定设备口径 |
| 上报量 | `count()`，表示事件行数，不是玩家数 |
| 平均每天玩家数 | 每日 `uniqExactIf(uid, uid != 0)` 后求平均 |
| JS 报错率 | JS 错误去重用户数 ÷ 任意 Cocos 上报去重用户数 |
| JS 错误排行 | 转交 `cocos-js-error` |
| JS 错误根因 | 转交 `cocos-js-error-fix` |

如果“率”“占比”存在多个合理分母，必须先确认分母口径。

## 9. 跨 App 查询

跨 App 查询时先动态获取 App 列表，再对每个 database 分别执行相同 SQL：

```bash
python3 -B skills/cocos-query-ck/scripts/query_ck.py \
  --all-apps \
  --allow-cross-event \
  --allow-event-value \
  '<SQL containing {table}>'
```

结果应逐个标记：

- 成功并有数据
- 成功但无数据
- 查询失败

失败 App 不能填 0。跨 App 展示“各 App 用户数”和“App 用户数之和”时，不能把后者称为全局唯一用户数。

## 10. 查询安全限制

### 10.1 时间范围

- 单次查询最多 14 天
- 超过 14 天必须固定边界后分段
- 不允许通过参数绕过时间限制
- 数据保留时间约 180 天，过期数据可能已不存在

### 10.2 可选资源上限

只有用户明确指定时才添加额外资源参数：

| CLI 参数 | ClickHouse setting | 硬限制 |
|---|---|---|
| `--max-execution-time` | `max_execution_time` | 最大 60 秒，且必须小于客户端 `--timeout` |
| `--max-memory-usage` | `max_memory_usage` | 最大 2 GiB |
| `--max-bytes-to-read` | `max_bytes_to_read` | 正整数，由用户指定 |
| `--max-rows-to-read` | `max_rows_to_read` | 正整数，由用户指定 |

超限统一使用 `throw`，不会返回不完整结果。脚本会自动附带：

```text
timeout_before_checking_execution_speed=0
timeout_overflow_mode=throw
read_overflow_mode=throw
```

### 10.3 只读边界

脚本只允许 `SELECT`、`WITH ... SELECT`、`SHOW`、`DESCRIBE`、`EXPLAIN` 和 `EXISTS`，禁止写入或管理语句。

用户只想检查 SQL 是否安全时使用：

```bash
python3 -B skills/cocos-query-ck/scripts/query_ck.py \
  --env prod \
  --database yoki \
  --allow-event-value \
  --validate-only \
  '<SQL containing {table}>'
```

### 10.4 敏感信息

- 不输出密码、token、完整 UID 或完整 device_id 列表
- 明细查询必须有合理 `LIMIT`
- 隐藏 URL 中可能包含的 token、签名和个人信息
- 不在 SQL、日志或结果中打印账号密码

### 10.5 Python 缓存

- 所有 Python 查询命令统一使用 `python3 -B`，避免生成 `.pyc` 和 `__pycache__`
- 仓库根目录 `.gitignore` 忽略 `__pycache__/` 和 `*.py[cod]`，防止其他调用方式产生的缓存进入 Git 状态或被误提交

## 11. 常见问题排查

### 查询结果为 0

0 不一定代表从未上报。依次检查：

1. App 是否选对，database 是否正确
2. 游戏名称是否确认到正确 gameType
3. 使用的是生产库还是测试库
4. 时间范围是否包含客户端上报时间
5. 新旧 gameType 是否都纳入统一表达式
6. 数据是否超过约 180 天保留期
7. `uid` 是否全部为 0（这会被用户数口径排除）

### 玩家人数看起来偏小

确认是否错误地使用了：

- `count()` 作为人数
- 单一 event_id 作为玩家范围
- 仅顶层 `long_key_1`，遗漏旧版 `event_value.gameType`
- 分别统计新旧玩家后没有统一去重
- 把 7 天每日人数之和误当作 7 天唯一玩家数

### 生产和测试结果不同

生产、测试是两套独立事件表，结果必须分开解释，不能合并成一个总数。

## 12. 输出结果应包含什么

每次查询结果至少说明：

- 环境、实际主机和事件表
- App/database
- 游戏名和 gameType
- 时间范围及时间边界
- `action` 和 `event_id` 过滤条件
- 统计字段和去重函数
- 新版/旧版命中行数（如果查询返回）
- 分子、分母及比率定义（如果是比率）
- 是否启用了旧字段兼容回退
