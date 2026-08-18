---
name: cocos-grafana-dashboard
description: "创建、更新、验证 WeNext Cocos Creator 埋点的 Grafana 指标看板。用户提到 Cocos Grafana、游戏数据看板、Dashboard、监控面板、趋势图、漏斗、指标大盘，或要求通过 API 批量维护 Cocos ClickHouse 面板时使用。负责 Grafana 资源、可视化和安全发布；ClickHouse 查询范围、字段、gameType、统计口径与只读校验必须交给 cocos-query-ck，JS 错误排行或根因分析继续遵循该 Skill 的路由。"
---

# Cocos Grafana 看板

把 `$cocos-query-ck` 已验证的只读查询组织为 Grafana 看板，并通过受保护的 API 流程完成读取、差异检查、验证和发布。不要在本 Skill 中重新定义 ClickHouse 口径，也不要跳过依赖 Skill 的范围解析与 SQL 校验。

## 边界

- 本 Skill 负责：Grafana 环境发现、Dashboard v2 spec、变量、布局、可视化、查询代理验证、创建和更新。
- `$cocos-query-ck` 负责：环境、App/database、游戏/gameType、事件字段、时间边界、聚合口径、只读 SQL 和资源上限。
- 用户只要求查数时停止在 `$cocos-query-ck`，不要创建看板。
- 用户要求 JS 错误排行、根因或修复时，先按 `$cocos-query-ck` 的路由交给对应 Skill；需要把结果做成看板时再回到本 Skill。
- 不提供删除 Dashboard 的命令。删除、移动生产文件夹或修改数据源不属于本 Skill。

## 安全硬规则

1. **没有明确确认，不执行写入。** 默认只读取、生成 spec、验证查询和展示 diff。
2. **生产与测试不混用。** 一个 Dashboard 只绑定一个环境和一个 ClickHouse datasource；不得在同一指标中合并 `prod` 与 `test`。
3. **目标文件夹必须来自 URL。** Skill 内置 WeNext Cocos 的 Grafana URL、namespace 和前端 ClickHouse datasource UID，但不内置 folder UID。创建或更新前必须解析用户提供的 Grafana 文件夹 URL 或已有 Dashboard URL，并通过只读 API 验证。先读 [references/config-and-api.md](references/config-and-api.md)。
4. **SQL 必须先过 `$cocos-query-ck`。** 使用 `scripts/prepare_panel_sql.py` 从同一模板生成 CK 校验 SQL 和 Grafana SQL，禁止手工维护两份逐渐漂移的查询。
5. **数据库变量必须是白名单。** 使用 `database` 变量时设置 `allowCustomValue: false`、`multi: false`；列表动态来自 `cocos-query-ck/scripts/resolve_scope.py apps`，不要维护硬编码 App 清单。
6. **更新必须先备份和 diff。** 更新命令要求用户确认过的 `resourceVersion` 和备份路径；线上版本变化时立即中止。
7. **创建必须幂等。** 使用确定性的 `metadata.name`，禁止 `generateName`；同名资源存在时不得自动再建一个。
8. **凭据只放在本机配置。** 配置文件权限必须为 `600`；不打印 token，不把配置、备份或 Dashboard spec 中的敏感值提交到仓库。

## 解析请求

按“环境 -> App -> 游戏 -> 时间 -> 指标 -> 展示方式 -> 目标 Grafana URL”的顺序确定范围，只询问会改变结果或写入目标的缺失条件。

- 查询环境未指定时，沿用 `$cocos-query-ck` 的默认生产环境并明确说明；真正写入前必须再次显示环境、datasource UID、目标 URL 和解析出的 folder UID。
- 新建 Dashboard 时要求文件夹 URL，格式为 `/dashboards/f/<folderUid>/<slug>`；更新时也可接受 `/d/<dashboardUid>/<slug>`，从该 Dashboard 元信息解析所属文件夹。
- App 与游戏必须通过 `$cocos-query-ck` 的解析脚本确认，不从当前仓库名、Dashboard 标题或模糊名称推断。
- 用户数、比率、留存等指标所需时间和分母不明确时先询问，不用 Dashboard 默认时间掩盖口径缺失。
- 用户只描述业务目标时，先给出面板清单、指标定义和默认时间范围，再进入 spec 编写。

## 标准流程

### 1. 检查 Grafana 环境

配置默认位于 `~/.wenext/cocos-grafana.json`，初始化只需要 Service Account Token。Service Account 的名称不参与认证，任何具备所需权限的有效 Token 都可以使用。配置不存在时只输出模板，不继续：

```bash
python3 <skill-dir>/scripts/grafana_dashboard.py config-template
```

模板只有一个字段：

```json
{"token": "<service-account-token>"}
```

Skill 内置以下 WeNext Cocos 默认值：

- Grafana URL：`https://wenextlama.grafana.net`
- namespace：`stacks-241102`
- 前端 ClickHouse datasource UID：`cem1x6ws9huyod`
- datasource type：`grafana-clickhouse-datasource`
- 生产表：`event_local_prod`
- 测试表：`event_local_test`

配置完成后检查连通性、权限、文件夹和数据源：

```bash
python3 <skill-dir>/scripts/grafana_dashboard.py doctor
python3 <skill-dir>/scripts/grafana_dashboard.py list-folders
python3 <skill-dir>/scripts/grafana_dashboard.py list-datasources
```

`doctor` 必须确认内置 datasource 存在且类型匹配。收到目标 URL 后单独解析并验证文件夹：

```bash
python3 <skill-dir>/scripts/grafana_dashboard.py resolve-folder \
  --url '<grafana-folder-or-dashboard-url>'
```

URL 必须与配置中的 Grafana 域名一致。无法解析、文件夹不存在或 Dashboard 不属于任何文件夹时停止。

### 2. 使用 `$cocos-query-ck` 确定口径

读取 `$cocos-query-ck`，依次确认：

1. `prod` 或 `test`；
2. App/database；
3. 游戏名与 gameType；
4. 事件、action、字段及新旧格式兼容；
5. 时间范围、分子、分母和去重键；
6. 是否需要 `--allow-event-value` 或 `--allow-cross-event`。

图表时间宏不能直接通过 `query_ck.py --validate-only` 的 14 天窗口证明。每个面板先编写一个 SQL 模板：

```sql
SELECT ...
FROM {table}
PREWHERE event_id = 'game_flow' AND action = 'cocos_js'
WHERE __TIME_FILTER__
  AND game_type = 123
```

模板中必须且只能由工具处理：

- `{table}`：CK 校验时交给 `$cocos-query-ck` 解析，Grafana 中变成 `${database}.<环境表>` 或固定数据库表。
- `__TIME_FILTER__`：CK 校验时变成固定、最多 14 天的半开区间；Grafana 中变成 `$__timeFilter(event_time)`。

使用固定验证窗口生成 Grafana SQL：

```bash
python3 <skill-dir>/scripts/prepare_panel_sql.py \
  --template panel.sql.tmpl \
  --env prod \
  --database yoki \
  --validation-from '2026-08-16 00:00:00' \
  --validation-to '2026-08-17 00:00:00' \
  --allow-event-value \
  --output panel.sql
```

只有查询确实符合依赖 Skill 的专用条件时才添加 `--allow-event-value` 或 `--allow-cross-event`。不要把它们作为通用绕过开关。

### 3. 设计看板

先读取目标文件夹中最接近的现有 Dashboard，再确定面板和布局。详细面板结构见 [references/panel-patterns.md](references/panel-patterns.md)。

- `stat`：少量核心数值。
- `timeseries`：趋势；时间列字面别名为 `time`。
- `barchart`：类别、错误码、阶段对比。
- `bargauge`：统一 0-100 标尺上的比率。
- `piechart`：不超过 6 个部分的构成。
- `table`：多指标明细或分组表。
- `text`：分区标题和短口径说明。

每个有查询的面板必须写 `description`，至少说明：环境、App/游戏范围、统计对象、去重键或分母、已知缺口。不要只复述标题。

### 4. 构建变量

需要跨 App 切换时，先动态解析 App：

```bash
python3 <cocos-query-ck-dir>/scripts/resolve_scope.py apps
```

将已确认数据库写入 `database` CustomVariable，并保持：

```json
{"multi": false, "includeAll": false, "allowCustomValue": false}
```

不要让用户输入任意数据库名。跨 App 指标默认分别展示，不把各库 UID 去重数相加称为全局唯一用户。

### 5. 离线校验 spec

Dashboard 文件可以是纯 `spec`，也可以是包含 `spec` 的 v2 resource：

```bash
python3 <skill-dir>/scripts/grafana_dashboard.py validate \
  --spec dashboard-spec.json --env prod --database yoki
```

校验必须通过后才能继续。工具会检查数据源绑定、表环境、数据库白名单、未解析占位符、时间过滤、Cocos action、面板描述和布局引用；这些保护不替代 `$cocos-query-ck` 的业务口径校验。

### 6. 通过 Grafana 验证每条查询

直接查询 ClickHouse不能覆盖 Grafana 宏、datasource 设置和超时。逐面板调用 Grafana query API：

```bash
python3 <skill-dir>/scripts/grafana_dashboard.py verify \
  --spec dashboard-spec.json --env prod --database yoki \
  --from now-24h --to now
```

工具会逐条验证全部 `refId`，而不是只检查每个面板的第一条查询。任一查询失败都不得发布；空结果需要区分“成功但无数据”和执行错误。

### 7. 读取并展示差异

更新已有 Dashboard 前：

```bash
python3 <skill-dir>/scripts/grafana_dashboard.py get \
  --uid <dashboard-uid> --output current-dashboard.json

python3 <skill-dir>/scripts/grafana_dashboard.py diff \
  --uid <dashboard-uid> --spec dashboard-spec.json \
  --env prod --database yoki
```

向用户展示：Dashboard 标题、环境、App/游戏、folder UID、datasource UID、面板数、查询数、当前 `resourceVersion` 和差异摘要。没有明确确认时停在这里。

### 8. 明确确认后写入

创建新 Dashboard：

```bash
python3 <skill-dir>/scripts/grafana_dashboard.py create \
  --spec dashboard-spec.json --env prod --database yoki \
  --name <deterministic-uid> \
  --folder-url '<grafana-folder-url>' \
  --confirm-write
```

更新现有 Dashboard：

```bash
python3 <skill-dir>/scripts/grafana_dashboard.py update \
  --uid <dashboard-uid> --spec dashboard-spec.json \
  --env prod --database yoki \
  --folder-url '<grafana-folder-or-dashboard-url>' \
  --expected-resource-version <diff输出的版本> \
  --backup /absolute/path/dashboard-backup.json \
  --confirm-write
```

`--confirm-write` 只表示用户已经在当前对话中明确确认；不得为了通过参数检查自行添加。写入后重新执行 `get` 和 `verify`，报告最终 UID、标题、环境、folder 和验证结果。

## 输出要求

先给结论，再说明：

- 新建、更新、仅生成还是仅验证；
- Grafana URL、namespace、folder UID、datasource UID 和环境；
- App/database、游戏/gameType、时间默认值和指标口径；
- 面板数、查询数、验证成功/失败；
- 写入前后的 `resourceVersion`，以及备份路径；
- 未覆盖的产品、空数据、TTL、旧格式或跨 App 去重限制。

不要输出 token、完整 UID/device_id 明细、ClickHouse 密码或不必要的错误隐私数据。

## 资源

- `scripts/prepare_panel_sql.py`：从单一模板生成经 `$cocos-query-ck` 校验的 Grafana SQL。
- `scripts/grafana_dashboard.py`：Grafana 连接检查、发现、读取、校验、diff、查询验证和受保护写入。
- [references/config-and-api.md](references/config-and-api.md)：本机配置、权限、Dashboard v2 API 与并发更新规则。
- [references/panel-patterns.md](references/panel-patterns.md)：变量、查询、可视化、布局与 SQL 形状。
