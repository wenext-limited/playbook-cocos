# Cocos CK 查询模板

所有模板都使用 database 选择 App，使用 `{table}` 让脚本替换环境表名。按实际问题修改时间与 gameType，不要删除安全过滤条件。

## 公共兼容表达式

```sql
WITH
  if(
    ifNull(long_key_1, 0) > 0,
    ifNull(long_key_1, 0),
    toInt64(JSONExtractUInt(event_value, 'gameType'))
  ) AS game_type,
  if(
    empty(trim(ifNull(message, ''))),
    JSONExtractString(event_value, 'err_msg'),
    ifNull(message, '')
  ) AS error_message
```

只查询新版本数据时可以直接用 `long_key_1`；跨版本统计使用上述回退。

## JS 报错用户影响率

定义：有效 `js_error` 去重用户 ÷ 同 App、同游戏、同窗口内任意 Cocos 上报去重用户。使用 `--allow-cross-event` 执行。

```sql
WITH
  if(ifNull(long_key_1, 0) > 0, ifNull(long_key_1, 0),
     toInt64(JSONExtractUInt(event_value, 'gameType'))) AS game_type,
  if(empty(trim(ifNull(message, ''))),
     JSONExtractString(event_value, 'err_msg'), ifNull(message, '')) AS error_message
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

用户未同时给出 App 和时间范围时先询问。使用 `--allow-cross-event` 执行。

```sql
WITH if(
  ifNull(long_key_1, 0) > 0,
  ifNull(long_key_1, 0),
  toInt64(JSONExtractUInt(event_value, 'gameType'))
) AS game_type
SELECT uniqExactIf(uid, uid != 0) AS users
FROM {table}
PREWHERE action = 'cocos_js'
WHERE event_time >= now() - INTERVAL 1 DAY
  AND event_time <= now()
  AND game_type = 10009
```

这表示“窗口内至少产生过一条 Cocos 上报的登录用户”，不是宿主 App DAU。跨 App 结果不能直接称为全局去重用户。

## 单事件趋势

```sql
SELECT
  toDate(event_time) AS day,
  count() AS reports,
  uniqExactIf(uid, uid != 0) AS users
FROM {table}
PREWHERE event_id = 'game_flow' AND action = 'cocos_js'
WHERE event_time >= now() - INTERVAL 7 DAY
  AND event_time <= now()
  AND long_key_1 = 1
GROUP BY day
ORDER BY day
```

滚动 7 天窗口的首尾自然日可能不完整，展示趋势时注明。

## 游戏流程分布

WSDK `game_flow` 中 `str_key_3` 是 flow，`str_key_4` 是 param：

```sql
SELECT
  str_key_3 AS flow,
  str_key_4 AS param,
  count() AS reports,
  uniqExactIf(uid, uid != 0) AS users
FROM {table}
PREWHERE event_id = 'game_flow' AND action = 'cocos_js'
WHERE event_time >= now() - INTERVAL 1 DAY
  AND event_time <= now()
  AND long_key_1 = 1
GROUP BY flow, param
ORDER BY reports DESC
LIMIT 50
```

## 网络失败率

分母是所选协议请求上报数；如果用户要按用户或请求链路去重，先确认稳定 ID。

```sql
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
  AND long_key_1 = 1
GROUP BY `type`
ORDER BY requests DESC
```

不要把 `code != 0` 无条件解释为失败，先根据该项目的网络上报约定核对 `code` 语义。

## 探索事件字段

确认具体 `event_id` 后才抽样，明细必须有 `LIMIT`：

```sql
SELECT
  event_time,
  game_version_code,
  JSONExtractKeys(event_value) AS keys,
  event_value
FROM {table}
PREWHERE event_id = '<event_id>' AND action = 'cocos_js'
WHERE event_time >= now() - INTERVAL 1 HOUR
  AND event_time <= now()
  AND long_key_1 = <game_type>
LIMIT 20
```

展示结果时隐藏或删去不必要的 UID、device_id、token、URL 参数和个人信息。
