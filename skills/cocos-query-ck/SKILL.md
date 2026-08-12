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

- 单 App：运行 `scripts/resolve_scope.py match-app '<name>'`。仅远端 App 列表中的不区分大小写精确匹配可直接使用。
- 所有 App：运行 `scripts/resolve_scope.py apps` 动态获取列表；不要维护硬编码清单，也不要查询系统数据库。
- 用户没有给 App，而指标不能自然解释为跨 App 时，询问。不要从当前游戏仓库名推断宿主 App。

### 游戏与 gameType

运行 `scripts/resolve_scope.py match-game '<name>'`，从 WSDK 最新 `Const.GameType` 解析枚举名、ID 和注释别名。

- `exact`：可以直接采用。
- `needs_confirmation`、`ambiguous` 或 `not_found`：展示已有候选；没有候选时先列出可用游戏，再询问。不要把唯一模糊候选当作用户确认。
- 名称可能泛指一类游戏时必须询问。例如“水果机”可能是具体水果游戏，也可能泛指老虎机；不能静默选 `FRUIT_LUCKY_77_LITE`。
- 用户已明确给 gameType 数字时可直接使用，但仍在结果中显示 ID。

### 时间与指标

- 所有查询都必须有时间上下界。用户未给时间时：普通事件查询默认最近 24 小时并说明；**用户数、DAU/UV、留存或比率必须询问时间，不能套默认值**。
- 单次事件表查询最多覆盖 14 天，脚本会硬校验且没有绕过开关。总时间范围超过 14 天时，先固定同一个开始与结束时刻，再拆成多个连续、无重叠且每段不超过 14 天的半开区间 `[start, end)`，按时间顺序逐段执行；不要并发执行多个时间段，也不要让每段分别计算 `now()`，以免边界漂移、遗漏或重复。
- “统计某游戏用户数量”固定指：指定 App 与时间窗内，该游戏产生过任意 `action = 'cocos_js'` 上报的 `uniqExactIf(uid, uid != 0)`。只补问缺失的 App 和时间；不要再追问 event_id、去重字段或把最近 24 小时当默认值。用户明确要求设备数时才改用 `device_id`。
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
4. 默认只查询顶层类型化列。不要在首轮 SQL 中加入 `event_value`、`JSONExtract*` 或“顶层为空则解析 JSON”的兼容表达式。

仅在以下任一条件成立时回退 `event_value`：

- 代码或字段定义确认目标参数没有对应顶层列；
- 用户明确要求覆盖旧 WSDK / 旧版本，且该窗口确有旧数据；
- 顶层查询结果异常或为空，并通过小时间窗抽样确认值只存在于 `event_value`。

回退时使用 `--allow-event-value` 单独执行有界查询，优先缩短时间窗并限定具体 `event_id`；不要把 JSON 回退永久合并进默认统计 SQL，也不要在顶层查询超时后自动改跑 JSON。模板见 [references/query-cookbook.md](references/query-cookbook.md)。

## 编写与执行查询

从 [references/query-cookbook.md](references/query-cookbook.md) 中最接近的模板开始，不要徒手重写通用口径。

普通生产单事件查询：

```bash
python3 <skill-dir>/scripts/query_ck.py --env prod --database yoki \
  "SELECT count() AS events FROM {table} PREWHERE event_id = 'game_flow' AND action = 'cocos_js' WHERE event_time >= now() - INTERVAL 1 DAY AND event_time <= now() AND long_key_1 = 1"
```

查询测试环境时仅把环境参数改为 `--env test`，不要改 SQL 中的 `{table}`。

跨 App 时先解析 App 列表，再一次执行同一条 SQL：

```bash
python3 <skill-dir>/scripts/query_ck.py --all-apps --allow-cross-event '<SQL>'
```

查询用户数、错误率或事件发现等需要读取同游戏多个 `event_id` 的指标时，必须显式加 `--allow-cross-event`。它不是通用绕过开关；脚本仍要求有界时间、`action = 'cocos_js'` 和 gameType 过滤。

用户明确指定查询资源上限时，按需添加以下额外参数；未指定时不要猜值或自动添加：

| CLI 参数 | ClickHouse setting | 单位与行为 |
|---|---|---|
| `--max-execution-time <秒>` | `max_execution_time` | 正数秒；自动附带 `timeout_before_checking_execution_speed=0` 和 `timeout_overflow_mode=throw` |
| `--max-memory-usage <字节>` | `max_memory_usage` | 正整数；限制单条查询在单台服务器的内存 |
| `--max-bytes-to-read <字节>` | `max_bytes_to_read` | 正整数；自动附带 `read_overflow_mode=throw` |
| `--max-rows-to-read <行数>` | `max_rows_to_read` | 正整数；自动附带 `read_overflow_mode=throw` |

所有资源上限通过 HTTP 查询参数传递，禁止在 SQL `SETTINGS` 中设置或覆盖。`throw` 模式固定不可选，确保超限时报错而不是返回不完整结果。`--max-execution-time` 必须小于客户端 `--timeout`；例如服务端 50 秒、客户端默认 64 秒：

```bash
python3 <skill-dir>/scripts/query_ck.py --env prod --database yoki \
  --max-execution-time 50 --max-memory-usage 2147483648 \
  --max-bytes-to-read 107374182400 --max-rows-to-read 1000000000 '<SQL>'
```

使用 `--validate-only` 时检查输出中的 `settings`，确认所有自动附带和用户指定的限制符合预期。分段查询时每段使用相同的资源上限。

总时间范围超过 14 天时，执行多次脚本调用，每段使用固定的 ISO 时间边界且不超过 14 天。例如 30 天拆为 14 天、14 天、2 天三个半开区间：

```bash
python3 <skill-dir>/scripts/query_ck.py --env prod --database yoki \
  "<相同统计 SQL；event_time >= '固定开始时间' AND event_time < '第 1 个边界'>"
python3 <skill-dir>/scripts/query_ck.py --env prod --database yoki \
  "<相同统计 SQL；event_time >= '第 1 个边界' AND event_time < '第 2 个边界'>"
python3 <skill-dir>/scripts/query_ck.py --env prod --database yoki \
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
4. Cocos WSDK 事件限定 `action = 'cocos_js'`；游戏范围默认直接使用顶层 `long_key_1`，不要自动兼容旧 `event_value.gameType`。
5. `event_id` 与 `action` 尽可能放在 `PREWHERE`；避免 `SELECT *`，明细必须有合理 `LIMIT`。
6. 用户统计排除 `uid = 0`；金额、订单、动作等选择代表真实业务对象的去重键，不能默认用 `count()`。
7. 不输出密码、token、完整 UID/device_id 列表或不必要的错误隐私数据。

## 解读与输出

先给结论和小表格，再报告：环境、实际主机、App/database、实际表名、游戏/gameType、时间范围、事件/action、过滤条件、聚合函数以及分子/分母。不要只写“CK”或只写 `prod/test`，要让用户能直接核验数据来源。

- 跨 App 查询逐个显示成功、空结果与失败；不要把失败 App 当作 0。
- 同时查询生产和测试时分别给出两组来源信息与结果，禁止给出混合总计。
- 空结果不等于事件从未发生。检查 TTL、版本、字段新旧格式、客户端网络与 WSDK 生命周期。
- `event_time` 来自客户端 `Date.now()`；自然日或跨时区趋势必须显式说明 ClickHouse 时区。
- 数据最多保留约 180 天。超出范围时说明可能已过期。
- 跨 App 总用户数不能直接相加当作全局去重用户；同一 UID 可能出现在多个库。默认报告“各 App 用户数”和“App 用户数之和”，不要称为全局唯一用户。

## 凭据与只读边界

`query_ck.py` 优先读取环境专用的 `$CLICKHOUSE_PROD_PASSWORD` / `$CLICKHOUSE_TEST_PASSWORD`，再回退 `$CLICKHOUSE_PASSWORD`，最后读取 `~/.wenext/clickhouse.json`；Skill 内不保存凭据。配置文件必须为 `600`，生产与测试凭据不同时按 `prod` / `test` 分段，并可在各自分段内覆盖 host、port、user、secure。脚本强制只读、硬限制单次事件查询最多 14 天且没有长时间绕过开关，并限制最多返回 10,000 行；用户可通过受校验的 CLI 参数额外限制服务端执行时间、单查询内存、扫描字节和扫描行数。只允许 `SELECT`、`WITH ... SELECT`、`SHOW`、`DESCRIBE`、`EXPLAIN` 和 `EXISTS`，禁止任何写入或管理语句。
