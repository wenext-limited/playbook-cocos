---
name: cocos-query-config
description: "查询指定 APP 和线上游戏的运营配置。用户要求查看某个 APP、游戏名、gameConfigId、operationConfigReadUrl、线上配置 JSON 或生成 HTML 配置报告时使用。技能会检查 lark-cli 和飞书认证，读取 Wiki 电子表格中的 APP信息、游戏信息、APP游戏关系，校验接口地址与配置 ID，请求线上接口，并默认直接输出解析后的 config JSON。"
allowed-tools:
  - Bash
  - AskUserQuestion
---

# 查询线上游戏配置

## 目标

输入 APP 和游戏名，读取当前构建配置 Wiki 中的配置关系，获取线上运营平台配置，并在 Codex 中直接输出解析后的 `config` JSON。默认不写入本地 HTML；只有明确要求生成报告时，才使用 `--output` 输出 HTML。

## 输入

支持以下形式：

```text
查询线上配置 lama teen-patti
查询 APP=gmparty 游戏=baloot 的线上配置
```

如果 APP 或游戏名不明确，先询问用户，不要猜测。游戏输入可以是 `gameKey` 或 `游戏信息.gameName`；多个游戏匹配时必须让用户确认。

## 前置条件

执行查询前必须依次检查：

1. 存在 `lark-cli`：`command -v lark-cli`。
2. 飞书认证可用：执行 `lark-cli auth status --json`，所选身份必须处于可用状态；`user` 身份要求 `status=ready` 且 `tokenStatus=valid`，`bot` 身份要求 `status=ready` 且 `available=true`。如果提示 Keychain 未初始化、登录失效或权限不足，停止并说明处理方式，不绕过认证。
3. Wiki 节点可读取，且对象类型为电子表格；Wiki 对象 token 必须与当前表格 token 一致。
4. 表格元数据可读取，并包含 `APP信息`、`游戏信息`、`APP游戏关系` 三个 Sheet。
5. 目标 APP 的 `operationConfigReadUrl` 非空、是完整 HTTP/HTTPS URL，且不包含已有 Query 参数或 Fragment。
6. `APP游戏关系` 中目标 APP 与目标游戏的交叉单元格为大于 0 的整数 `gameConfigId`。

前置条件失败时不要写入本地文件；在标准错误输出失败阶段和原因，命令以非零状态结束。

## 执行流程

使用绑定脚本完成固定流程，不要临时拼接未经校验的接口地址或表格值：

```bash
python3 /Users/aosika/.playbook-cocos/skills/cocos-query-config/scripts/query_online_game_config.py \
  --app "<APP_KEY 或 APP 名>" \
  --game "<GAME_KEY 或游戏名>"
```

脚本默认只向标准输出打印解析后的 `config` JSON，不打印查询摘要，不生成本地 HTML 文件。

如果明确要求 HTML 报告，再追加输出路径：

```bash
... --output "/absolute/path/online-game-config.html"
```

脚本默认使用当前构建配置 Wiki：

- Wiki：`https://fikvmzrrhfl.feishu.cn/wiki/AudVw0HYki0nnEk1SEQc02Rknef`
- Spreadsheet token：`ITfWsspPRh6Nb6tqGo0cRMqqn3g`
- Sheet：`APP信息`、`游戏信息`、`APP游戏关系`

需要临时切换数据源时，使用脚本的 `--wiki-url`、`--spreadsheet-token`、`--app-sheet-title`、`--game-sheet-title` 和 `--relation-sheet-title` 参数，不修改技能文件。

### 1. 读取 APP信息

以第一行表头定位 `appKey` 和 `operationConfigReadUrl`，按不区分大小写的 `appKey` 匹配目标行。表格单元格可能是普通字符串，也可能是飞书 URL 富文本对象；富文本优先提取 `link`，再提取 `text`。

### 2. 读取游戏信息

优先按 `gameKey` 精确匹配；未匹配时按 `gameName` 精确匹配，再按规范化后的包含匹配。最终使用匹配行中的标准 `gameKey` 查关系矩阵。

### 3. 读取 APP游戏关系

第一行必须以 `gameKey` 开头，后续表头是 APP Key。按目标 APP 找列，按标准 `gameKey` 找行，读取交叉单元格并校验为正整数。该值既作为 `gameConfigId`，也作为线上接口的 `configType`。

### 4. 请求线上配置

使用以下形式发起只读请求：

```text
GET {operationConfigReadUrl}?configType={gameConfigId}
```

要求接口返回 JSON 对象，且满足：

- `code` 为 `200`；
- 如果存在 `sucessed`，必须为 `true`；
- `data.id` 等于请求的 `gameConfigId`；
- `data.status` 为 `1`；
- `data.config` 是非空 JSON 字符串；
- 解析后的 `data.config.android` 和 `data.config.ios` 都是对象数组。

请求失败、业务状态失败、ID 不一致、配置字符串非法或平台数组结构异常，都要保留原始响应用于诊断；默认不写文件，仅向标准错误输出错误信息。使用 `--output` 时，才生成包含完整诊断信息的 HTML 报告。

## 输出

成功时默认直接输出 `data.config` 解析后的 JSON，结构如下：

```json
{
  "android": [],
  "ios": []
}
```

默认不写入本地文件。需要 HTML 报告时，通过 `--output` 指定文件：

```bash
... --output "/absolute/path/online-game-config.html"
```

HTML 报告（仅在显式传入 `--output` 时生成）必须包含：

- 查询状态、生成时间、输入 APP、输入游戏、标准 `appKey`、标准 `gameKey`、`gameName`；
- Wiki URL、Spreadsheet token、Sheet 名称、表格 revision；
- APP 匹配行和 `operationConfigReadUrl`；
- 关系矩阵匹配行和 `gameConfigId`；
- 最终请求 URL；
- 前置检查和接口校验结果；
- 接口原始 JSON 或原始文本；
- 解析后的线上 `config` JSON；
- 可复制的等宽字体格式化 JSON。

成功时直接向用户返回解析后的 JSON；不要附加 HTML 文件路径、查询摘要或接口元数据。显式使用 `--output` 生成报告时，才返回 HTML 文件的绝对路径。报告中的 JSON 必须 HTML 转义，不能把接口返回直接拼入 HTML。

## 失败处理

- 不要把 `operationConfigReadUrl` 为空误报成接口返回为空；明确区分“表格未配置接口”和“线上接口返回异常”。
- 不要在没有 `gameConfigId` 时请求线上接口。
- 不要把用户输入直接拼接到 Shell、URL 或 HTML；脚本必须完成参数校验、URL 编码和 HTML 转义。
- 不要输出飞书认证信息、Token、Secret 或命令环境中的敏感值。
- 只读查询不修改 Wiki、Sheet 或线上运营配置。

## 资源

- 查询脚本：`scripts/query_online_game_config.py`
- 当前数据源配置：`/Volumes/PortableSSD/00_Code/wenext/game-jenkins-scripts/build_cocos_game_v2/config/game_metadata.groovy`
