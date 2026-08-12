# Cocos ClickHouse 字段与上报口径

## 表结构与生命周期

每个 App 对应一个 database，正式事件表为 `event_local_prod`，测试事件表为 `event_local_test`。产品范围由 database 决定，不使用 `app` 列过滤。

已知正式表结构：

```text
PARTITION BY toYYYYMMDD(event_time)
ORDER BY (event_time, event_id, action, uid)
TTL event_time + 180 DAY
```

因此每个事件表查询都要对 `event_time` 设上下界。`event_id`、`action` 适合放入 `PREWHERE`；gameType、版本和用户条件放入 `WHERE`。

## Cocos 公共字段

| CK 列 | WSDK 来源 | 含义与规则 |
|---|---|---|
| `event_time` | `Date.now()` | 客户端事件时间；必须限制上下界 |
| `event_id` | `ReportSystem.send` 参数 | 事件类型 |
| `action` | WSDK `emEventAction` | 当前内置 Cocos 事件为 `cocos_js` |
| `event_value` | `JSON.stringify(reportValue)` | 原始业务参数 JSON，新旧数据回退来源 |
| `uid` | 原生初始化信息 | 用户 ID；`0` 代表不能作为已登录用户统计 |
| `device_id` | 原生初始化信息 | 设备标识，仅在用户明确需要设备口径时使用 |
| `platform` | 原生初始化信息 | 宿主平台 |
| `version_code` / `version_name` | 原生初始化信息 | 宿主 App 版本 |
| `game_version_code` | 游戏 `version.txt` | 子游戏版本，字符串类型 |
| `long_key_1` | `wsdk.gameType` | 新 WSDK 的 gameType，Int64 |
| `str_key_1` | 自动生成 | 单次 WSDK 会话内递增 seqId，字符串类型 |
| `id` | 自动生成 | 当前 WSDK 实例的客户端唯一 ID，字符串类型 |

`app` 列在历史全端数据中不可靠。禁止用它限定产品；database 才是产品边界。

## 新旧 gameType 兼容

新 WSDK 把 gameType 写入 `long_key_1`，旧数据可能只在 `event_value.gameType`：

```sql
if(
  ifNull(long_key_1, 0) > 0,
  ifNull(long_key_1, 0),
  toInt64(JSONExtractUInt(event_value, 'gameType'))
) AS game_type
```

不要只用 `long_key_1` 回溯跨版本数据。若查询窗口确认全部采用新 WSDK，才可直接过滤该列以换取性能。

## 顶层类型化扩展字段

字段白名单与类型来自 WSDK `EventData.ts`：

| 类型 | 字段 |
|---|---|
| String | `game_version_code`, `message`, `name`, `host`, `uri`, `type`, `method`, `error`, `id`, `str_key_1` … `str_key_10` |
| Int32 | `server_code`, `int_key_1` … `int_key_10` |
| Int64 | `duration`, `code`, `long_key_1` … `long_key_10` |
| Float64 | `double_key_1` … `double_key_10` |

WSDK 只把白名单内且类型合法的值提升到顶层列。`event_value` 仍保存原始参数，因此顶层为空时不一定代表业务没有上报；先检查调用点，再检查 JSON 回退字段。

扩展槽含义由具体事件决定。例如 `str_key_3` 在 WSDK `game_flow` 中是 flow，但在自定义事件中可能完全不同。禁止跨事件复用其业务含义。

## WSDK 内置事件

| event_id | 用途 | 已知业务字段 |
|---|---|---|
| `js_error` | Cocos JS 异常 | 新：`message`；旧：`event_value.err_msg` |
| `app_to_game` | 原生到游戏桥接 | `name`, `str_key_2`(extra) |
| `game_to_app` | 游戏到原生桥接 | `name`, `str_key_2`(extra) |
| `game_flow` | 游戏流程 | `str_key_3`(flow), `str_key_4`(param) |
| `net_protocol` | HTTP / Socket | `host`, `uri`, `type`, `duration`, `code`, `server_code`, `method`, `error` |
| `anti_ban` | 防封禁 | `type`，其他字段由调用参数决定 |

游戏也可通过 WSDK 或原生桥接上报自定义事件，所以本表不是完整事件字典。查询自定义事件前必须搜索目标项目代码。

## 常见陷阱

- SQL 关键词冲突列 `count`、`type`、`switch`、`from`、`protocol` 在 `SELECT` / `GROUP BY` 中加反引号。
- `uid = 0` 常见于登录前，用户数使用 `uniqExactIf(uid, uid != 0)`。
- 客户端时钟可能产生未来时间，只有下界不足以保护统计。
- 同一业务动作可能重试并生成多行；订单或流程实体优先按稳定业务 ID 去重。
- `count()` 是上报次数，不是用户数，也不天然等于真实业务动作数。
