# Grafana 配置与 Dashboard API

## 目录

- [本机配置](#本机配置)
- [权限与凭据](#权限与凭据)
- [环境绑定](#环境绑定)
- [发现资源](#发现资源)
- [Dashboard v2 资源](#dashboard-v2-资源)
- [创建规则](#创建规则)
- [更新与并发控制](#更新与并发控制)
- [失败处理](#失败处理)

## 本机配置

默认配置路径是 `~/.wenext/cocos-grafana.json`。通过以下命令输出模板：

```bash
python3 scripts/grafana_dashboard.py config-template
```

结构：

```json
{
  "token": "<service-account-token>"
}
```

Skill 内置 WeNext Cocos 环境参数：

| 参数 | 默认值 |
|---|---|
| Grafana URL | `https://wenextlama.grafana.net` |
| namespace | `stacks-241102` |
| 前端 ClickHouse datasource UID | `cem1x6ws9huyod` |
| datasource type | `grafana-clickhouse-datasource` |
| 生产表 | `event_local_prod` |
| 测试表 | `event_local_test` |

正常初始化不要复制这些固定值。确有环境迁移或临时验证需要时，仍可在配置中使用原有完整字段覆盖默认值；覆盖后必须重新运行 `doctor`。

要求：

```bash
chmod 600 ~/.wenext/cocos-grafana.json
```

工具拒绝读取组或其他用户可访问的配置。不要把配置放进项目目录，不要提交 token。

## 权限与凭据

优先使用有有效期的 Service Account Token，并限制到目标文件夹和所需 Dashboard 权限。只有确实需要创建或更新时才授予写权限；只读审查使用只读 token。Service Account 名称不会参与 API 认证，`codex-cocos-dashboard` 只是当前 Token 的归属名称，不是 Skill 配置项，也不是固定要求。

最低操作能力：

| 操作 | 所需能力 |
|---|---|
| `doctor`、发现资源、读取、diff | 读取组织、文件夹、数据源和 Dashboard |
| `verify` | 查询选定 ClickHouse datasource |
| `create` | 目标文件夹内创建 Dashboard |
| `update` | 目标 Dashboard 与文件夹写权限 |

不要在命令行直接拼 token。辅助脚本从权限为 `600` 的配置中读取，并通过临时 curl 配置传递认证头；临时文件离开上下文后自动删除。

## 环境绑定

Skill 已将 `prod`、`test` 与前端 ClickHouse 数据源显式绑定。首次配置或内置资源变化后必须核对：

1. 用 `$cocos-query-ck` 的 `query_ck.py --validate-only` 获取实际环境和表名。
2. 用 `list-datasources` 查看 Grafana datasource UID 与类型。
3. 确认该 datasource 能访问对应环境的 ClickHouse 表，只看名称不够。
4. 若内置值已失效，先更新 Skill 默认值；不要要求每个使用者重复填写公共环境参数。

禁止把生产 datasource 与 `event_local_test` 组合，或把测试 datasource 与 `event_local_prod` 组合。工具会检查 SQL 表名和 datasource UID，但不能从 Grafana 名称证明底层主机，因此首次绑定仍需人工确认。

## 发现资源

```bash
python3 scripts/grafana_dashboard.py doctor
python3 scripts/grafana_dashboard.py list-folders
python3 scripts/grafana_dashboard.py list-datasources
python3 scripts/grafana_dashboard.py resolve-folder --url '<grafana-url>'
```

`doctor` 只读取：

- 当前 Grafana 组织；
- 可见文件夹数量；
- 可见数据源数量；
- 配置中的环境绑定是否能在数据源清单中找到且类型一致。

它不会创建、更新或删除资源。

`resolve-folder` 接受两类 URL：

- 文件夹 URL：`https://<host>/dashboards/f/<folderUid>/<slug>`，直接解析 UID 后读取文件夹确认存在。
- Dashboard URL：`https://<host>/d/<dashboardUid>/<slug>`，先读取 Dashboard 元信息，再读取其所属文件夹。

URL host 必须与配置中的 Grafana URL 一致。创建和更新命令不接受默认 folder，必须传入 `--folder-url`。

## Dashboard v2 资源

集合路径：

```text
/apis/dashboard.grafana.app/v2/namespaces/<namespace>/dashboards
```

单个资源路径：

```text
/apis/dashboard.grafana.app/v2/namespaces/<namespace>/dashboards/<uid>
```

资源外层：

```json
{
  "apiVersion": "dashboard.grafana.app/v2",
  "kind": "Dashboard",
  "metadata": {
    "name": "cocos-game-flow",
    "namespace": "<namespace>",
    "annotations": {
      "grafana.app/folder": "<folder-uid>"
    }
  },
  "spec": {}
}
```

Dashboard 文件可以保存纯 `spec`，也可以保存完整 resource。辅助脚本在读取输入时自动提取 `spec`，发布时重新构造外层元数据。

## 创建规则

- 使用确定性的 `metadata.name`，格式限制为小写字母、数字和连字符。
- 创建前先 GET 同名 UID；存在时停止，不自动追加后缀。
- 不使用 `generateName`，避免网络重试产生重复 Dashboard。
- folder UID 必须从本次请求提供的 URL 解析，并写入 `grafana.app/folder` annotation；不使用默认文件夹或旧版 `folderUid` 字段。
- 创建前必须完成 `validate`、`verify` 和用户确认。

## 更新与并发控制

更新流程：

1. GET 当前完整 resource。
2. 保存当前 `.metadata.resourceVersion`。
3. 基于当前 `.spec` 生成目标 spec，不从陈旧副本盲目整体覆盖。
4. 执行 `diff`，让用户确认完整替换效果。
5. 调用 `update` 时传入刚确认的 `--expected-resource-version`。
6. 工具再次 GET；版本不一致时停止。
7. 先把完整旧 resource 写入 `--backup`，再 PUT。
8. 保留现有 labels 和 annotations，只覆盖明确指定的 folder annotation。
9. 写入后重新 GET 并执行 `verify`。

不要把“刚读取到最新 resourceVersion”误认为已经合并线上改动。只有目标 spec 确实基于该线上版本生成、并且用户看过 diff，才允许整体 PUT。

## 失败处理

- HTTP 非 2xx、无法解析 JSON 或返回 `kind: Status` 错误时立即失败。
- `401`/`403`：停止并说明认证或权限问题，不换用其他 token。
- `404`：区分资源不存在、namespace 错误和 UID 错误。
- `409` 或 resourceVersion 不一致：重新读取、重新生成 diff、重新确认；不要自动重试覆盖。
- 查询接口 HTTP 成功但 `results.<refId>.error` 存在：按面板失败处理。
- 单次超时先复核 `$cocos-query-ck` 的时间窗口、`PREWHERE`、事件范围和资源限制；重复失败后再拆面板或缩短默认范围。
- 任一写入结果不明确时先 GET 确认资源是否已经变化，禁止直接重试创建。
