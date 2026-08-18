# Cocos Dashboard 面板模式

## 目录

- [SQL 模板与校验](#sql-模板与校验)
- [数据源查询结构](#数据源查询结构)
- [最小 Dashboard spec](#最小-dashboard-spec)
- [App 变量](#app-变量)
- [选择可视化](#选择可视化)
- [查询结果形状](#查询结果形状)
- [面板描述](#面板描述)
- [布局与标识](#布局与标识)
- [发布前检查](#发布前检查)

## SQL 模板与校验

面板 SQL 只维护一个模板，使用两个占位符：

```sql
WITH if(
  ifNull(long_key_1, 0) > 0,
  ifNull(long_key_1, 0),
  toInt64(JSONExtractUInt(event_value, 'gameType'))
) AS game_type
SELECT count() AS `事件数`
FROM {table}
PREWHERE event_id = 'game_flow' AND action = 'cocos_js'
WHERE __TIME_FILTER__
  AND game_type = 123
SETTINGS short_circuit_function_evaluation = 'force_enable'
```

运行 `prepare_panel_sql.py` 后：

- CK 校验版本使用 `{table}` 和固定绝对时间，交给 `$cocos-query-ck`。
- Grafana 版本使用 `${database}.event_local_prod` 或 `${database}.event_local_test`，时间条件为 `$__timeFilter(event_time)`。
- 固定 App Dashboard 使用 `--static-database`，生成 `<database>.<table>`。

Grafana 时间宏不能证明单次窗口不超过 14 天，因此不要直接把宏传给 `query_ck.py --validate-only`。验证窗口只是证明 SQL 结构和查询保护有效，不代表 Dashboard 默认时间范围；两者都要在交付说明中列出。

中文别名统一使用反引号：

```sql
SELECT count() AS `事件数`
```

不要用正则事后改写完整 SQL。别名、`GROUP BY` 和 `ORDER BY` 在模板源头写正确。

## 数据源查询结构

每条 ClickHouse 查询使用当前 Grafana 栈已有同类面板的 query shape。核心字段：

```json
{
  "kind": "PanelQuery",
  "spec": {
    "query": {
      "kind": "DataQuery",
      "group": "grafana-clickhouse-datasource",
      "version": "v0",
      "datasource": {"name": "<datasource-uid>"},
      "spec": {
        "editorType": "sql",
        "format": 1,
        "queryType": "table",
        "rawSql": "SELECT ..."
      }
    },
    "refId": "A",
    "hidden": false
  }
}
```

注意：

- `datasource.name` 放 UID，不是显示名称。
- `pluginVersion`、query `version`、`vizConfig.version` 从同一 Grafana 栈的现有 Dashboard 复制，不在 Skill 中永久硬编码。
- 不假设所有插件版本都要求同一个 `format/queryType` 组合。时序图优先读取当前栈已经渲染成功的同类面板；如果沿用 `table` queryType，必须通过 `verify` 和实际渲染确认。
- 多查询面板给每条查询唯一 `refId`，例如 `A`、`B`、`C`。

## 最小 Dashboard spec

新建时从以下结构开始，并从同一 Grafana 栈的现有 Dashboard 补齐实际 `vizConfig.version`、query 版本和插件字段：

```json
{
  "title": "Cocos 核心指标",
  "editable": true,
  "links": [],
  "tags": ["cocos"],
  "timeSettings": {
    "timezone": "browser",
    "from": "now-24h",
    "to": "now",
    "autoRefresh": "",
    "hideTimepicker": false
  },
  "variables": [],
  "elements": {
    "panel-events": {
      "kind": "Panel",
      "spec": {
        "id": 1,
        "title": "事件数",
        "description": "环境、范围、去重键和数据限制写在这里。",
        "links": [],
        "data": {
          "kind": "QueryGroup",
          "spec": {
            "queries": [],
            "transformations": [],
            "queryOptions": {}
          }
        },
        "vizConfig": {
          "kind": "VizConfig",
          "group": "stat",
          "version": "<从当前 Grafana 栈读取>",
          "spec": {
            "options": {},
            "fieldConfig": {"defaults": {}, "overrides": []}
          }
        }
      }
    }
  },
  "layout": {
    "kind": "GridLayout",
    "spec": {
      "items": [
        {
          "kind": "GridLayoutItem",
          "spec": {
            "x": 0,
            "y": 0,
            "width": 24,
            "height": 6,
            "element": {"kind": "ElementReference", "name": "panel-events"}
          }
        }
      ]
    }
  }
}
```

把经过校验的 PanelQuery 放入 `queries`，再根据指标选择可视化。不要从零猜测当前 Grafana 版本生成的完整字段；先读取同栈现有面板，删除与目标无关的配置并保留必要结构。

## App 变量

动态获取 App/database 清单后构造 CustomVariable：

```json
{
  "kind": "CustomVariable",
  "spec": {
    "name": "database",
    "query": "yoki,wyak",
    "current": {"text": "yoki", "value": "yoki"},
    "label": "App",
    "multi": false,
    "includeAll": false,
    "allowCustomValue": false,
    "valuesFormat": "csv"
  }
}
```

只放经过 `resolve_scope.py apps` 确认且指标语义已经验证的数据库。动态清单不等于所有 App 都适合共享同一指标；字段或上报版本不一致时缩小白名单并在面板描述中说明。

`${database}` 只能出现在数据库标识符位置：

```sql
FROM ${database}.event_local_prod
```

不要允许 Custom value，不要让变量控制表名、datasource UID 或 SQL 片段。

## 选择可视化

| 目的 | 类型 | 关键要求 |
|---|---|---|
| 核心事件量、用户数、成功率 | `stat` | 少量指标；每列设置 unit 与 threshold |
| 随时间变化 | `timeseries` | 第一列字面别名为 `time` |
| 每日事件量 | `timeseries` + bars | 固定时间粒度，避免点数过多 |
| gameType、event_id、错误码对比 | `barchart` | 长标签使用横向；限制 Top N |
| 漏斗率、渗透率 | `bargauge` | `min=0`、`max=100`、`unit=percent` |
| 不超过 6 类的构成 | `piechart` | 超过 6 类改横向 barchart |
| 多指标明细 | `table` | 合理 LIMIT；必要时阈值着色 |
| 分区标题 | `text` | 无查询；Markdown 短标题 |

单位必须显式设置：

- 数量：`short`
- 比率：`percent`
- 毫秒：`ms`
- 字节：`bytes`
- 金额：只在 `$cocos-query-ck` 已确认币种和单位后设置

不要用图表掩盖小样本。比率面板同时显示分子和分母，或在 description 中写清样本数入口。

## 查询结果形状

### Stat

一行多列：

```sql
SELECT
  uniqExactIf(uid, uid != 0) AS `用户数`,
  count() AS `事件数`
...
```

### Timeseries

时间列必须为 `time`：

```sql
SELECT
  toStartOfHour(event_time) AS time,
  uniqExactIf(uid, uid != 0) AS `用户数`
...
GROUP BY time
ORDER BY time
```

自然日趋势必须明确 ClickHouse 时区。Dashboard 可选时间跨度较大时，根据跨度选择小时或天，避免产生过多点。

### Bar chart

第一列为类别，后续为数值：

```sql
SELECT game_type AS `gameType`, count() AS `事件数`
...
GROUP BY game_type
ORDER BY `事件数` DESC
LIMIT 20
```

漏斗或阶段需要自然顺序时给类别加数字前缀，不依赖 Grafana 默认排序。

### Bar gauge / Pie chart

使用长表，一行一个指标或切片：

```sql
SELECT item.1 AS `阶段`, item.2 AS `比率`
FROM (..., [('1 展示', show_rate), ('2 点击', click_rate)] AS items)
ARRAY JOIN items AS item
```

比率先聚合原始分子和分母再计算，不平均分段比率。

### Table

限制返回行数，并避免 `SELECT *`：

```sql
SELECT event_id, version_name, count() AS `事件数`
...
GROUP BY event_id, version_name
ORDER BY `事件数` DESC
LIMIT 100
```

明细表不展示完整 UID、device_id 或原始错误隐私数据，除非用户明确需要且权限与用途合理。

## 面板描述

description 用于防止误读，而不是重复标题。至少覆盖最相关的内容：

- 环境和数据表；
- App 白名单、游戏/gameType；
- event_id/action；
- 时间口径和时区；
- 用户、设备、事件或业务对象的去重键；
- 比率分子与分母；
- 顶层字段与旧 JSON 回退；
- 上报版本、TTL、空结果或样本量限制。

示例：

```text
生产环境；按非零 UID 去重。游戏范围统一使用 long_key_1，缺失时回退 event_value.gameType。比率分母为同 App、同 gameType、同时间窗内任意 cocos_js 上报用户；最近 24 小时样本过小时不用于版本结论。
```

## 布局与标识

- `elements` key 稳定，例如 `panel-active-users`，不要每次生成随机名称。
- Panel `id` 在 Dashboard 内唯一；新建前读取现有最大值。
- `layout.spec.items[].element.name` 必须引用真实 element key。
- 核心指标放第一行，趋势放第二层，分组和异常明细放后面。
- Section header 使用 `text` panel；不要嵌套无意义的卡片或重复标题。
- 默认时间范围遵循指标用途；查询校验窗口与 Dashboard 默认范围分别记录。

## 发布前检查

1. 所有 SQL 来自 `prepare_panel_sql.py`，且 `$cocos-query-ck` 校验成功。
2. 环境、datasource UID、表名一致。
3. `database` 变量为动态白名单且禁止自定义值。
4. 每个查询有 event_id、`action = 'cocos_js'`、有界 Grafana 时间宏和必要 gameType 条件。
5. 用户数排除 `uid = 0`；比率展示分子和分母。
6. 每个查询面板有可防止误读的 description。
7. 所有 refId 都通过 Grafana query API 验证。
8. 目标 spec 与线上完整 spec 的 diff 已检查。
9. 更新备份、resourceVersion 和用户确认均已准备。
10. 写入后重新读取、验证，并确认实际 Dashboard 可以渲染。
