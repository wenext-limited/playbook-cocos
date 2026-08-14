# Cocos ClickHouse 字段与上报口径

## 表结构与生命周期

每个 App 对应一个 database。产品范围由 database 决定，不使用 `app` 列过滤。

| 环境 | 主机 | 默认用户 | 事件表 |
|---|---|---|---|
| 生产 `prod` | `cc-t4nnjid28p401lh59-ck-l8.clickhouseserver.singapore.rds.aliyuncs.com` | `clickhouse_read` | `event_local_prod` |
| 测试 `test` | `43.156.112.94` | `read_only` | `event_local_test` |

- 未指定环境时默认生产，但必须在结果中声明采用了默认生产环境。
- 一次查询只连接一个环境。需要对比时分别查询、分别呈现，禁止把生产和测试数据相加或混算。
- 始终通过 `{table}` 选择事件表。环境、实际主机与表名必须一起输出；配置覆盖连接信息时，以脚本返回的实际主机为准。
- 生产失败不得改查测试，测试失败也不得改查生产。

已知生产表结构：

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
| `event_value` | `JSON.stringify(reportValue)` | 原始业务参数 JSON；gameType 默认兼容，其他已验证字段按两阶段规则受控回退 |
| `uid` | 原生初始化信息 | 用户 ID；`0` 代表不能作为已登录用户统计 |
| `device_id` | 原生初始化信息 | 设备标识，仅在用户明确需要设备口径时使用 |
| `platform` | 原生初始化信息 | 宿主平台 |
| `version_code` / `version_name` | 原生初始化信息 | 宿主 App 版本 |
| `game_version_code` | 游戏 `version.txt` | 子游戏版本，字符串类型 |
| `long_key_1` | `wsdk.gameType` | 新 WSDK 的 gameType，Int64 |
| `str_key_1` | 自动生成 | 单次 WSDK 会话内递增 seqId，字符串类型 |
| `id` | 自动生成 | 当前 WSDK 实例的客户端唯一 ID，字符串类型 |

`app` 列在历史全端数据中不可靠。禁止用它限定产品；database 才是产品边界。

## gameType 新旧统一策略

gameType 是所有游戏查询的范围条件，必须同时覆盖新旧格式。使用下列表达式生成统一 `game_type`：顶层 `long_key_1` 有效时直接采用；仅当该行顶层值缺失或为 `0` 时解析 `event_value.gameType`。

```sql
if(
  ifNull(long_key_1, 0) > 0,
  ifNull(long_key_1, 0),
  toInt64(JSONExtractUInt(event_value, 'gameType'))
) AS game_type
```

按 `game_type = <目标>` 过滤后，在同一次查询中统一执行 `uniqExact`、比率或其他聚合。不要分别统计新版与旧版用户数再相加；同一用户可能同时命中两种格式。运行时显式添加 `--allow-event-value`，并设置 `short_circuit_function_evaluation = 'force_enable'`，避免在顶层 gameType 有效的行上执行 JSON 分支。

解析旧 gameType 会增加扫描成本。保持时间有界，尽量将具体 `event_id` 与 `action` 放入 `PREWHERE`；跨事件用户数等指标无法限定 `event_id` 时，仍使用统一表达式并报告扫描量。

## 其他业务字段两阶段自动回退

gameType 以外的字段默认只查询顶层类型化列。查询下表中已有兼容映射的业务字段时，先在同一环境、App、游戏、`event_id` 和目标时间范围内自动执行有界兼容探测；用户明确只看新版顶层数据时才跳过。探测只查找“顶层为类型默认值、旧 JSON key 存在非默认有效值”的行，并使用 `LIMIT 1`。探测命中后，正式查询才使用统一逻辑字段自动融合；未命中则保持顶层查询。

不要把 `long_key_1 > 0` 当作所有业务字段已经提升到顶层的通用版本标记：WSDK 历史中各字段并非在同一提交完成提升。改用目标字段自身的有效值判断，顶层非默认有效值始终优先；仅在顶层为默认值时读取旧 key。对合法值也可能是 `0` 或空串的字段，只有旧 key 同时存在非默认值时才认为回退能补充数据。

兼容查询必须设置 `short_circuit_function_evaluation = 'force_enable'` 并使用 `--allow-event-value`。过滤、分组、排序、去重和聚合都使用同一个逻辑字段，禁止分别统计新旧结果再相加。

### 已验证的 WSDK 兼容映射

| event_id | 逻辑字段 | 顶层列 | 旧 `event_value` key | 类型 |
|---|---|---|---|---|
| 所有内置事件 | 子游戏版本 | `game_version_code` | `gameVersionCode` | String |
| 所有内置事件 | 会话事件序号 | `str_key_1` | `seqId` | String |
| 所有内置事件 | WSDK 实例 ID | `id` | `uniqueId` | String |
| `js_error` | 错误内容 | `message` | `err_msg` | String |
| `app_to_game`, `game_to_app` | 调用名 | `name` | `call_name` | String |
| `app_to_game`, `game_to_app` | 附加参数 | `str_key_2` | `extra` | String |
| `game_flow` | 流程名 | `str_key_3` | `flow` | String |
| `game_flow` | 流程参数 | `str_key_4` | `param` | String |
| `net_protocol` | 主机、路径、协议类型、方法、错误 | `host`, `uri`, `type`, `method`, `error` | 同名 key | String |
| `net_protocol` | 耗时、状态码 | `duration`, `code` | 同名 key | Int64 |
| `net_protocol` | 服务端状态码 | `server_code` | 同名 key | Int32 |

字符串逻辑字段使用“顶层非空，否则 `JSONExtractString`”；Int64 使用“顶层非零，否则 `JSONExtractInt`”；Int32 的 JSON 分支再转换为 `toInt32`。探测必须验证 JSON 值非空/非零，避免把合法的默认值误判成需要回退。已验证模板见 [query-cookbook.md](query-cookbook.md)。

自定义事件只在代码确认后增加临时映射，映射至少包含 `event_id + 逻辑字段 + 顶层列 + 旧 JSON key + 类型 + 默认值判定`。`str_key_N`、`long_key_N` 可被不同事件复用，禁止跨事件套用上表语义。无法从调用代码确认时询问用户。

## 顶层类型化扩展字段

字段白名单与类型来自 WSDK `EventData.ts`：

| 类型 | 字段 |
|---|---|
| String | `game_version_code`, `message`, `name`, `host`, `uri`, `type`, `method`, `error`, `id`, `str_key_1` … `str_key_10` |
| Int32 | `server_code`, `int_key_1` … `int_key_10` |
| Int64 | `duration`, `code`, `long_key_1` … `long_key_10` |
| Float64 | `double_key_1` … `double_key_10` |

WSDK 只把白名单内且类型合法的值提升到顶层列。

扩展槽含义由具体事件决定。例如 `str_key_3` 在 WSDK `game_flow` 中是 flow，但在自定义事件中可能完全不同。禁止跨事件复用其业务含义。

## WSDK 内置事件

| event_id | 用途 | 已知业务字段 |
|---|---|---|
| `js_error` | Cocos JS 异常 | 新：`message`；旧：`err_msg` |
| `app_to_game` | 原生到游戏桥接 | 新：`name`, `str_key_2`；旧：`call_name`, `extra` |
| `game_to_app` | 游戏到原生桥接 | 新：`name`, `str_key_2`；旧：`call_name`, `extra` |
| `game_flow` | 游戏流程 | 新：`str_key_3`, `str_key_4`；旧：`flow`, `param` |
| `net_protocol` | HTTP / Socket | 新旧 key 同名：`host`, `uri`, `type`, `duration`, `code`, `server_code`, `method`, `error` |
| `anti_ban` | 防封禁 | `type`，其他字段由调用参数决定 |

游戏也可通过 WSDK 或原生桥接上报自定义事件，所以本表不是完整事件字典。查询自定义事件前必须搜索目标项目代码。

## 常见陷阱

- SQL 关键词冲突列 `count`、`type`、`switch`、`from`、`protocol` 在 `SELECT` / `GROUP BY` 中加反引号。
- `uid = 0` 常见于登录前，用户数使用 `uniqExactIf(uid, uid != 0)`。
- 客户端时钟可能产生未来时间，只有下界不足以保护统计。
- 同一业务动作可能重试并生成多行；订单或流程实体优先按稳定业务 ID 去重。
- `count()` 是上报次数，不是用户数，也不天然等于真实业务动作数。
