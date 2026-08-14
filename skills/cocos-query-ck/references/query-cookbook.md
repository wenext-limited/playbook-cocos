# Cocos CK 查询模板

所有模板都使用 database 选择 App，使用 `{table}` 让脚本替换环境表名。按实际问题修改时间与 gameType，不要删除安全过滤条件。

## 统一 gameType

所有按游戏过滤的模板都统一新旧 gameType，并使用 `--allow-event-value` 执行。顶层 `long_key_1` 有效时优先使用，仅在该行顶层值缺失或为 `0` 时读取 `event_value.gameType`：

```sql
WITH if(
  ifNull(long_key_1, 0) > 0,
  ifNull(long_key_1, 0),
  toInt64(JSONExtractUInt(event_value, 'gameType'))
) AS game_type
```

在同一查询中按 `game_type` 过滤并统一聚合，禁止相加新版与旧版去重用户数。每个模板都设置 `short_circuit_function_evaluation = 'force_enable'`，使 JSON 分支只在顶层 gameType 无效时执行。

gameType 以外的字段仍默认使用顶层类型化列。需要兼容旧字段时，先执行下方探测；只有探测命中才在正式查询中加入统一逻辑字段。

## 其他业务字段的两阶段回退

先从 [schema.md](schema.md) 确认映射。兼容探测必须使用与正式查询相同的环境、App、游戏、`event_id` 和时间范围，只查找“顶层无有效值、旧 key 有有效值”的一行。以下示例检查 `game_flow.flow`；使用 `--allow-event-value` 执行：

```sql
WITH if(
  ifNull(long_key_1, 0) > 0,
  ifNull(long_key_1, 0),
  toInt64(JSONExtractUInt(event_value, 'gameType'))
) AS game_type
SELECT 1 AS fallback_needed
FROM {table}
PREWHERE event_id = 'game_flow' AND action = 'cocos_js'
WHERE event_time >= now() - INTERVAL 1 DAY
  AND event_time <= now()
  AND game_type = 1
  AND if(
    notEmpty(ifNull(str_key_3, '')),
    false,
    notEmpty(JSONExtractString(event_value, 'flow'))
  )
LIMIT 1
SETTINGS short_circuit_function_evaluation = 'force_enable'
```

- 返回一行：正式查询使用统一 `flow` 字段；返回空结果：正式查询继续只用 `str_key_3`。
- 字符串探测使用“顶层为空且旧值非空”；数值探测使用“顶层为 `0` 且旧值非 `0`”。例如 `code` 的条件为 `if(ifNull(code, 0) != 0, false, JSONExtractInt(event_value, 'code') != 0)`。
- 多个目标字段可以在同一探测中用 `OR` 连接各自的受控条件；任一命中后，正式查询只为已确认映射的目标字段生成兼容表达式。
- 探测和正式查询都受 14 天单次范围限制；分段查询逐段采用同一流程。不要因为顶层查询超时而跳过探测直接解析 JSON。

探测命中后的字符串统一表达式：

```sql
if(
  notEmpty(ifNull(str_key_3, '')),
  ifNull(str_key_3, ''),
  JSONExtractString(event_value, 'flow')
) AS flow
```

Int64 使用 `if(ifNull(code, 0) != 0, ifNull(code, 0), JSONExtractInt(event_value, 'code'))`；Int32 的 JSON 分支使用 `toInt32(JSONExtractInt(...))`。所有过滤、分组和聚合都引用统一别名，不再引用原始新旧字段。

## JS 报错用户影响率

定义：有效 `js_error` 去重用户 ÷ 同 App、同游戏、同窗口内任意 Cocos 上报去重用户。使用 `--allow-cross-event --allow-event-value` 执行。

先探测 `message` → `err_msg`。若命中，使用下方兼容形式；未命中时把 `error_message` 定义为 `ifNull(message, '')`，不解析错误内容 JSON。

```sql
WITH
  if(
    ifNull(long_key_1, 0) > 0,
    ifNull(long_key_1, 0),
    toInt64(JSONExtractUInt(event_value, 'gameType'))
  ) AS game_type,
  if(
    notEmpty(trim(ifNull(message, ''))),
    ifNull(message, ''),
    JSONExtractString(event_value, 'err_msg')
  ) AS error_message
SELECT
  uniqExactIf(uid, uid != 0) AS total_users,
  uniqExactIf(
    uid,
    uid != 0
      AND event_id = 'js_error'
      AND notEmpty(trim(error_message))
      AND error_message NOT LIKE '[JsError]: Script error. -%'
  ) AS error_users,
  round(error_users / nullIf(total_users, 0) * 100, 4) AS error_user_rate_pct
FROM {table}
PREWHERE action = 'cocos_js'
WHERE event_time >= now() - INTERVAL 7 DAY
  AND event_time <= now()
  AND game_type = 10013
SETTINGS short_circuit_function_evaluation = 'force_enable'
```

跨 App 执行时，逐库返回 `total_users`、`error_users` 和 `error_user_rate_pct`。失败库单列为失败，不能填 0。

## 游戏用户数

用户未同时给出 App 和时间范围时先询问。使用 `--allow-cross-event --allow-event-value` 执行。

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
  uniqExactIf(uid, uid != 0) AS users
FROM {table}
PREWHERE action = 'cocos_js'
WHERE event_time >= now() - INTERVAL 1 DAY
  AND event_time <= now()
  AND game_type = 10009
SETTINGS short_circuit_function_evaluation = 'force_enable'
```

这表示“窗口内至少产生过一条 Cocos 上报的登录用户”，不是宿主 App DAU。`users` 已对新旧格式的全部命中行统一去重；`top_level_reports` 与 `legacy_reports` 仅用于核验数据来源，不能分别计算用户数后相加。跨 App 结果不能直接称为全局去重用户。

## 单事件趋势

```sql
WITH if(
  ifNull(long_key_1, 0) > 0,
  ifNull(long_key_1, 0),
  toInt64(JSONExtractUInt(event_value, 'gameType'))
) AS game_type
SELECT
  toDate(event_time) AS day,
  count() AS reports,
  uniqExactIf(uid, uid != 0) AS users
FROM {table}
PREWHERE event_id = 'game_flow' AND action = 'cocos_js'
WHERE event_time >= now() - INTERVAL 7 DAY
  AND event_time <= now()
  AND game_type = 1
GROUP BY day
ORDER BY day
SETTINGS short_circuit_function_evaluation = 'force_enable'
```

滚动 7 天窗口的首尾自然日可能不完整，展示趋势时注明。

## 游戏流程分布

WSDK `game_flow` 中 `str_key_3` 是 flow，`str_key_4` 是 param。先分别探测旧 `flow`、`param`；任一命中时使用下方兼容形式，均未命中时继续直接选择顶层列：

```sql
WITH
  if(
    ifNull(long_key_1, 0) > 0,
    ifNull(long_key_1, 0),
    toInt64(JSONExtractUInt(event_value, 'gameType'))
  ) AS game_type,
  if(
    notEmpty(ifNull(str_key_3, '')),
    ifNull(str_key_3, ''),
    JSONExtractString(event_value, 'flow')
  ) AS flow,
  if(
    notEmpty(ifNull(str_key_4, '')),
    ifNull(str_key_4, ''),
    JSONExtractString(event_value, 'param')
  ) AS param
SELECT
  flow,
  param,
  count() AS reports,
  uniqExactIf(uid, uid != 0) AS users
FROM {table}
PREWHERE event_id = 'game_flow' AND action = 'cocos_js'
WHERE event_time >= now() - INTERVAL 1 DAY
  AND event_time <= now()
  AND game_type = 1
GROUP BY flow, param
ORDER BY reports DESC
LIMIT 50
SETTINGS short_circuit_function_evaluation = 'force_enable'
```

## 网络失败率

分母是所选协议请求上报数；如果用户要按用户或请求链路去重，先确认稳定 ID。旧版 `net_protocol` 的 JSON key 与逻辑字段同名；探测任一目标字段命中后，按 schema 中的类型生成统一字段再代入下方统计，不要直接把顶层默认值当作真实旧版数据。

```sql
WITH if(
  ifNull(long_key_1, 0) > 0,
  ifNull(long_key_1, 0),
  toInt64(JSONExtractUInt(event_value, 'gameType'))
) AS game_type
SELECT
  `type`,
  count() AS requests,
  countIf(code != 0 OR server_code >= 400 OR notEmpty(error)) AS failures,
  round(failures / nullIf(requests, 0) * 100, 2) AS failure_rate_pct,
  quantileExact(0.95)(duration) AS p95_duration_ms
FROM {table}
PREWHERE event_id = 'net_protocol' AND action = 'cocos_js'
WHERE event_time >= now() - INTERVAL 1 DAY
  AND event_time <= now()
  AND game_type = 1
GROUP BY `type`
ORDER BY requests DESC
SETTINGS short_circuit_function_evaluation = 'force_enable'
```

不要把 `code != 0` 无条件解释为失败，先根据该项目的网络上报约定核对 `code` 语义。

## 探索事件字段

确认具体 `event_id` 后才抽样，明细必须有 `LIMIT`。读取 `event_value` 时显式添加 `--allow-event-value`：

```sql
WITH if(
  ifNull(long_key_1, 0) > 0,
  ifNull(long_key_1, 0),
  toInt64(JSONExtractUInt(event_value, 'gameType'))
) AS game_type
SELECT
  event_time,
  game_version_code,
  JSONExtractKeys(event_value) AS keys,
  event_value
FROM {table}
PREWHERE event_id = '<event_id>' AND action = 'cocos_js'
WHERE event_time >= now() - INTERVAL 1 HOUR
  AND event_time <= now()
  AND game_type = <game_type>
LIMIT 20
SETTINGS short_circuit_function_evaluation = 'force_enable'
```

展示结果时隐藏或删去不必要的 UID、device_id、token、URL 参数和个人信息。
