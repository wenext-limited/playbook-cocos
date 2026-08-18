---
name: cocos-query-ck
description: 查询和分析 WeNext Cocos Creator 游戏上报到 ClickHouse 的任意埋点，支持单个或全部 App、gameType、event_id、action、版本、用户、趋势、比率和明细调查，并可只生成安全 SQL。用户提到“查 Cocos 埋点”“查询 CK 上报”“Cocos ClickHouse”“查游戏事件”“统计游戏用户数”“验证埋点”“按 gameType 查数据”或跨 App 对比时使用；JS 错误排行转交 cocos-js-error，JS 错误根因诊断或修复转交 cocos-js-error-fix。
---

# Cocos CK 上报查询

把自然语言问题转换为有明确统计口径的只读 ClickHouse 查询，执行后说明范围、结果和限制。不要猜 App、游戏、字段或指标分母。

## 先路由

- 用户要 **JS 错误排行、Top 错误、排行较前的 bug** 时，转交 `$cocos-js-error`。
- 用户要根据 JS 错误 **定位根因、分析堆栈或给出修复方案** 时，转交 `$cocos-js-error-fix`。
- 用户要错误率、错误用户占比、跨 App 对比，或其他任意 Cocos 埋点分析时，继续使用本 Skill。
- “bug”本身不等于根因诊断；结合“排行/Top”走错误排行，结合“定位/原因/修复”走根因诊断。不明确时询问目标。

## 选择查询环境

- 用户明确说“生产”“正式”“线上”或 `prod` 时选择 `prod`；明确说“测试”“测试库”或 `test` 时选择 `test`。
- 用户未指定环境时默认选择 `prod`，并在结果中明确说明“未指定环境，本次采用生产环境”。
- 一次脚本调用只能选择一个环境。用户要求同时查询生产与测试时，分别使用 `--env prod` 和 `--env test` 执行，分开展示结果；禁止相加、合并或混算两套环境的数据。
- 必须使用 `{table}` 让脚本按环境选择事件表，不要在 SQL 中硬编码 `event_local_prod` / `event_local_test`，也不要用 `--table` 跨环境覆盖。
- 任一环境查询失败都不得静默切换到另一环境。

环境固定映射如下；详细连接与表说明见 [references/schema.md](references/schema.md)：

| 环境 | `--env` | 默认事件表 |
|---|---|---|
| 生产 | `prod` | `event_local_prod` |
| 测试 | `test` | `event_local_test` |

## 解析查询范围

按“App → 游戏 → 时间 → 指标 → 事件/字段”的顺序解析。只询问缺失且会改变结果的条件。

### App

- 单 App：运行 `python3 -B <skill-dir>/scripts/resolve_scope.py match-app '<name>'`。仅远端 App 列表中的不区分大小写精确匹配可直接使用。
- 所有 App：运行 `python3 -B <skill-dir>/scripts/resolve_scope.py apps` 动态获取列表；不要维护硬编码清单，也不要查询系统数据库。
- 用户没有给 App，而指标不能自然解释为跨 App 时，询问。不要从当前游戏仓库名推断宿主 App。

### 游戏与 gameType

运行 `python3 -B <skill-dir>/scripts/resolve_scope.py match-game '<name>'`，从 WSDK 最新 `Const.GameType` 解析枚举名、ID 和注释别名。

- `exact`：可以直接采用。
- `needs_confirmation`、`ambiguous` 或 `not_found`：展示已有候选；没有候选时先列出可用游戏，再询问。不要把唯一模糊候选当作用户确认。
- 名称可能泛指一类游戏时必须询问。例如“水果机”可能是具体水果游戏，也可能泛指老虎机；不能静默选 `FRUIT_LUCKY_77_LITE`。
- 用户已明确给 gameType 数字时可直接使用，但仍在结果中显示 ID。

### 时间与指标

- 所有查询都必须有时间上下界。用户未给时间时：普通事件查询默认最近 24 小时并说明；**用户数、DAU/UV、留存或比率必须询问时间，不能套默认值**。
- 单次事件表查询最多覆盖 14 天，脚本会硬校验且没有绕过开关。总时间范围超过 14 天时，先固定同一个开始与结束时刻，再拆成多个连续、无重叠且每段不超过 14 天的半开区间 `[start, end)`，按时间顺序逐段执行；不要并发执行多个时间段，也不要让每段分别计算 `now()`，以免边界漂移、遗漏或重复。
- “统计某游戏用户数量”固定指：指定 App 与时间窗内，该游戏产生过任意 `action = 'cocos_js'` 上报的 `uniqExactIf(uid, uid != 0)`。游戏范围必须用统一 `game_type` 同时覆盖顶层 `long_key_1` 与旧版 `event_value.gameType`，并在同一次聚合中去重；不要分别统计后相加。只补问缺失的 App 和时间；不要再追问 event_id、去重字段或把最近 24 小时当默认值。用户明确要求设备数时才改用 `device_id`。
- “JS 报错率”定义为：同 App、同游戏、同时间窗内，`js_error` 去重报错用户数 ÷ 任意 Cocos 上报去重用户数。分子和分母都排除 `uid = 0`，并展示两者样本数。
- 其他含“率/占比/人均”的问题如果分母不唯一，先确认。

| 用户说法 | 直接确定 | 必须补问 |
|---|---|---|
| “统计一下贪婪盒子用户数量” | gameType；任意 Cocos 事件；非零 UID 去重 | App、时间 |
| “统计 Yoki 最近一周贪婪盒子用户数量” | 所有口径均确定 | 无 |
| “统计贪婪盒子设备数” | `device_id` 去重 | 缺失的 App、时间 |

## 确认字段

首次查询或字段不熟悉时读取 [references/schema.md](references/schema.md)。

1. WSDK 内置事件：在 WSDK 的 `EventDefines.ts`、`ReportFunctions.ts` 和 `EventData.ts` 中确认 `event_id`、字段与类型。
2. 游戏自定义事件：搜索游戏项目中 `ReportSystem.send(...)`、`reportSys.send(...)`、`stat(event_id, events)` 及目标 `event_id` 调用点。
3. 不能从代码确定扩展字段含义时询问用户；不要根据 `str_key_N` / `long_key_N` 名称猜业务含义。
4. gameType 是游戏范围字段，属于默认兼容例外：所有按游戏过滤的查询都使用统一 `game_type`，先取有效的顶层 `long_key_1`，仅当该行顶层值缺失或为 `0` 时读取 `event_value.gameType`。必须使用 `--allow-event-value`，并在 SQL 中设置 `short_circuit_function_evaluation = 'force_enable'`。
5. 除 gameType 外，默认先查询顶层类型化列。需要兼容旧业务字段时，按下方“两阶段自动回退”确认后再生成统一逻辑字段。

统一 gameType 表达式固定为：

```sql
if(
  ifNull(long_key_1, 0) > 0,
  ifNull(long_key_1, 0),
  toInt64(JSONExtractUInt(event_value, 'gameType'))
) AS game_type
```

- 新旧数据必须放在同一条查询中按 `game_type = <目标>` 过滤，再统一执行 `uniqExact`、比率或其他聚合。
- 不要先查 `long_key_1` 再补查 JSON，也不要相加新旧去重用户数；同一 UID 可能同时出现在两种格式中。
- 可同时返回 `countIf(ifNull(long_key_1, 0) > 0)` 与 `countIf(ifNull(long_key_1, 0) <= 0)`，让用户核验新版、旧版命中行数。

### 其他业务字段两阶段自动回退

读取 [references/schema.md](references/schema.md) 中的已验证兼容映射，并按以下流程处理 gameType 以外的业务字段：

1. **顶层优先**：默认只使用顶层类型化列。不要因为“可能有旧数据”直接给所有字段添加 `JSONExtract*`。
2. **确认需要**：查询 schema 中已有兼容映射的业务字段时，先在同一环境、App、游戏、`event_id` 和目标时间范围内自动运行有界兼容探测；用户明确只看新版顶层数据时才跳过。探测只查找“顶层无有效值、旧 JSON 有有效值”的行并 `LIMIT 1`；不要用顶层查询超时作为回退依据。
3. **自动融合**：探测命中后，在正式查询中生成“顶层有效值优先，否则读取已验证旧 key”的统一逻辑字段。过滤、分组、排序、去重和聚合全部使用该逻辑字段；新旧数据必须在同一条查询中统计，禁止分别计算后相加。
4. **避免无效回退**：探测未命中时继续使用顶层字段，不在正式查询中解析该业务字段的 JSON。每个时间分段分别保持相同判断口径。
5. **只用确认映射**：WSDK 内置字段直接使用 schema 中的映射；自定义事件先从调用代码确认 `event_id + 逻辑字段 + 顶层列 + 旧 JSON key + 类型`。无法确认或存在多个候选时询问用户，禁止根据槽位名猜测。

字符串统一字段示例：

```sql
if(
  notEmpty(ifNull(str_key_3, '')),
  ifNull(str_key_3, ''),
  JSONExtractString(event_value, 'flow')
) AS flow
```

- 数值字段使用类型匹配的 `JSONExtractInt` / `JSONExtractFloat`，仅当顶层为类型默认值且旧 JSON 存在非默认有效值时确认需要回退。`0` 可能是合法值，因此探测条件必须同时验证旧值不是默认值；不要仅凭顶层等于 `0` 判断为旧数据。
- 正式兼容查询必须添加 `--allow-event-value`，并设置 `short_circuit_function_evaluation = 'force_enable'`，使顶层有效的行不执行 JSON 分支。
- 目标参数确实没有对应顶层列时属于 JSON-only 查询，不伪装成自动回退；确认字段和类型后执行有界 JSON 查询。
- 兼容探测与统一字段模板见 [references/query-cookbook.md](references/query-cookbook.md)。

## 编写与执行查询

从 [references/query-cookbook.md](references/query-cookbook.md) 中最接近的模板开始，不要徒手重写通用口径。

执行本 Skill 的所有 Python 脚本时统一使用 `python3 -B`，禁止生成 `.pyc` 和 `__pycache__` 污染工作区；仓库根目录 `.gitignore` 同时忽略 Python 字节码缓存作为兜底。

普通生产单事件查询：

```bash
python3 -B <skill-dir>/scripts/query_ck.py --env prod --database yoki --allow-event-value \
  "WITH if(ifNull(long_key_1, 0) > 0, ifNull(long_key_1, 0), toInt64(JSONExtractUInt(event_value, 'gameType'))) AS game_type SELECT count() AS events FROM {table} PREWHERE event_id = 'game_flow' AND action = 'cocos_js' WHERE event_time >= now() - INTERVAL 1 DAY AND event_time <= now() AND game_type = 1 SETTINGS short_circuit_function_evaluation = 'force_enable'"
```

查询测试环境时仅把环境参数改为 `--env test`，不要改 SQL 中的 `{table}`。

跨 App 时先解析 App 列表，再一次执行同一条 SQL：

```bash
python3 -B <skill-dir>/scripts/query_ck.py --all-apps --allow-cross-event --allow-event-value '<SQL>'
```

按游戏查询时必须显式加 `--allow-event-value` 以执行统一 gameType 表达式。查询用户数、错误率或事件发现等需要读取同游戏多个 `event_id` 的指标时，还必须显式加 `--allow-cross-event`。它们不是通用绕过开关；脚本仍要求有界时间、`action = 'cocos_js'` 和 gameType 过滤。

用户明确指定查询资源上限时，按需添加以下额外参数；未指定时不要猜值或自动添加：

| CLI 参数 | ClickHouse setting | 单位与行为 |
|---|---|---|
| `--max-execution-time <秒>` | `max_execution_time` | `0 < 值 ≤ 60`；自动附带 `timeout_before_checking_execution_speed=0` 和 `timeout_overflow_mode=throw` |
| `--max-memory-usage <字节>` | `max_memory_usage` | `0 < 值 ≤ 2147483648`（2 GiB）；限制单条查询在单台服务器的内存 |
| `--max-bytes-to-read <字节>` | `max_bytes_to_read` | 正整数；自动附带 `read_overflow_mode=throw` |
| `--max-rows-to-read <行数>` | `max_rows_to_read` | 正整数；自动附带 `read_overflow_mode=throw` |

所有资源上限通过 HTTP 查询参数传递，禁止在 SQL `SETTINGS` 中设置或覆盖。`throw` 模式固定不可选，确保超限时报错而不是返回不完整结果。脚本硬限制 `--max-execution-time` 最高 60 秒、`--max-memory-usage` 最高 2 GiB，用户不得提高或绕过；`--max-execution-time` 还必须小于客户端 `--timeout`。例如服务端 50 秒、客户端默认 64 秒：

```bash
python3 -B <skill-dir>/scripts/query_ck.py --env prod --database yoki \
  --max-execution-time 50 --max-memory-usage 2147483648 \
  --max-bytes-to-read 107374182400 --max-rows-to-read 1000000000 '<SQL>'
```

使用 `--validate-only` 时检查输出中的 `settings`，确认所有自动附带和用户指定的限制符合预期。分段查询时每段使用相同的资源上限。

总时间范围超过 14 天时，执行多次脚本调用，每段使用固定的 ISO 时间边界且不超过 14 天。例如 30 天拆为 14 天、14 天、2 天三个半开区间：

```bash
python3 -B <skill-dir>/scripts/query_ck.py --env prod --database yoki \
  "<相同统计 SQL；event_time >= '固定开始时间' AND event_time < '第 1 个边界'>"
python3 -B <skill-dir>/scripts/query_ck.py --env prod --database yoki \
  "<相同统计 SQL；event_time >= '第 1 个边界' AND event_time < '第 2 个边界'>"
python3 -B <skill-dir>/scripts/query_ck.py --env prod --database yoki \
  "<相同统计 SQL；event_time >= '第 2 个边界' AND event_time < '固定结束时间'>"
```

合并分段结果时保持原统计口径：

- `count`、`sum` 等可加指标，对成功且区间不重叠的分段求和。
- 平均值、人均值和比率汇总各段的原始分子、分母后重新计算；不要平均各段结果。
- 全时间窗去重用户/设备数、留存、分位数、Top 排行等不可直接相加。优先改成可安全合并的明细粒度（例如平均 DAU 按自然日分别计算），否则逐段报告并明确不能得出全窗精确值；不要把分段去重数之和称为全窗去重数。
- 任一分段失败时，整体结果标记为不完整并报告失败区间；不得把失败段当作 0。

用户只要 SQL 时使用 `--validate-only` 校验并输出 SQL，不连接数据库。查询失败时读取错误并修正；只有网络/DNS 瞬态错误可以重试，不能切换环境重试。

## 查询前自检

每次执行前确认：

1. database 来自已验证的 App，而不是 `app` 列；禁止 `WHERE app = ...`。
2. `event_time` 同时有下界和上界；上界用于排除客户端未来时间。单次跨度不超过 14 天；更长范围已按固定边界拆成连续、无重叠的半开区间并依次查询。
3. 普通查询有具体 `event_id = ...` 或 `IN (...)`；跨事件查询满足专用保护条件。
4. Cocos WSDK 事件限定 `action = 'cocos_js'`；游戏范围使用统一 `game_type`，顶层 `long_key_1` 有效时优先采用，否则读取旧版 `event_value.gameType`。其他业务字段仅在兼容探测命中后使用已验证映射自动融合。兼容命令包含 `--allow-event-value`，SQL 强制启用短路计算。
5. `event_id` 与 `action` 尽可能放在 `PREWHERE`；避免 `SELECT *`，明细必须有合理 `LIMIT`。
6. 用户统计排除 `uid = 0`；金额、订单、动作等选择代表真实业务对象的去重键，不能默认用 `count()`。
7. 不输出密码、token、完整 UID/device_id 列表或不必要的错误隐私数据。

## 解读与输出

先给结论和小表格，再报告：环境、实际主机、App/database、实际表名、游戏/gameType、时间范围、事件/action、过滤条件、聚合函数以及分子/分母。不要只写“CK”或只写 `prod/test`，要让用户能直接核验数据来源。

- 跨 App 查询逐个显示成功、空结果与失败；不要把失败 App 当作 0。
- 按游戏查询时同时说明统一 gameType 口径；若返回了新版与旧版命中行数，分别展示，但最终用户数、比率和其他去重指标只能使用统一聚合结果。
- 业务字段兼容探测命中时，说明采用的“顶层列 → 旧 JSON key”映射；未命中时说明正式查询仅使用顶层字段。
- 同时查询生产和测试时分别给出两组来源信息与结果，禁止给出混合总计。
- 空结果不等于事件从未发生。检查 TTL、版本、字段新旧格式、客户端网络与 WSDK 生命周期。
- `event_time` 来自客户端 `Date.now()`；自然日或跨时区趋势必须显式说明 ClickHouse 时区。
- 数据最多保留约 180 天。超出范围时说明可能已过期。
- 跨 App 总用户数不能直接相加当作全局去重用户；同一 UID 可能出现在多个库。默认报告“各 App 用户数”和“App 用户数之和”，不要称为全局唯一用户。

## 凭据与只读边界

`query_ck.py` 内置生产与测试环境的只读账号和密码；如设置 `$CLICKHOUSE_PROD_PASSWORD` / `$CLICKHOUSE_TEST_PASSWORD`，再回退 `$CLICKHOUSE_PASSWORD`，环境变量优先覆盖内置密码。也可用权限为 `600` 的 `~/.wenext/clickhouse.json` 覆盖对应环境的 host、port、user、password、secure。不要在输出、日志、SQL 或提交信息中打印密码。脚本强制只读、硬限制单次事件查询最多 14 天且没有长时间绕过开关，并限制最多返回 10,000 行；用户可通过受校验的 CLI 参数额外限制服务端执行时间、单查询内存、扫描字节和扫描行数，其中执行时间最高 60 秒、单查询单服务器内存最高 2 GiB。只允许 `SELECT`、`WITH ... SELECT`、`SHOW`、`DESCRIBE`、`EXPLAIN` 和 `EXISTS`，禁止任何写入或管理语句。
