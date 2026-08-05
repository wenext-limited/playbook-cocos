---
name: cocos-code-review
description: Review Cocos Creator and OOPS TypeScript branch or PR diffs with ts-graph MCP semantic analysis and cli-anything-cocoscreator scene/prefab resource integrity checks. Use for Cocos code reviews, impact analysis, missing component detection, and missing resource validation. Requires both tools and asks before installation or update when unavailable.
---

# Cocos 代码变更审查

## 使用场景

用于审查 Cocos Creator / OOPS / TypeScript 代码变更，包括：

- 当前分支相对 `main` 的完整 diff；
- PR、指定 base 或工作区 diff；
- TypeScript 变更影响范围；
- Scene / Prefab 缺失组件和缺失资源检查。

不用于非 Cocos 项目，也不用于全量点评未修改代码。

## 必须先完成双重前置检查

开始 review 前，必须依次检查 `cli-anything-cocoscreator` 和 ts-graph MCP。任一工具不可用时，不得静默跳过。

### 1. 检查 Cocos CLI

从 Cocos 项目目录或其他非 CLI 源码目录执行：

```bash
command -v cli-anything-cocoscreator
cli-anything-cocoscreator --json info
cli-anything-cocoscreator asset prefab-check --help
```

- 命令不存在或执行失败：停止 review，询问用户是否安装，不得自动安装。
- 安装提示必须包含：`未检测到 cli-anything-cocoscreator，无法执行 Scene / Prefab 资源完整性检查。是否现在安装？`
- 安装说明：`https://github.com/wenext-limited/cli-anything-cocoscreator`
- 命令存在但资源检查 JSON 不包含顶层 `problem_file_count`、`issue_count` 或文件级 `issues`：视为旧版，停止 review 并询问用户是否更新。
- 用户明确拒绝安装或更新时，只有在用户明确同意跳过资源检查后才可继续，并在报告中写明未执行原因。

### 2. 检查 ts-graph MCP

调用 `ts_graph_stats()` 探测 ts-graph MCP：

- 调用成功：继续 review；
- 工具不存在、未安装、未启动或调用失败：停止 review，询问用户是否安装，并提供安装指南。

安装指南：`https://github.com/wenext-limited/cocos-ts-graph-mcp/blob/main/%E5%AE%89%E8%A3%85%E6%8C%87%E5%BC%95.md`

不要复制安装步骤，安装指南可能变化，以链接内容为准。

## Review 前第一步

双重前置检查通过后，第一步必须构建或更新代码图谱：

```text
ts_graph_build({ directory, force: false })
```

`directory` 指向当前 Cocos 项目根目录或 TypeScript 源码目录。除非用户明确要求全量重建，否则不要设置 `force: true`。

## 代码变更范围

1. 默认审查当前分支相对 `main` 的完整分支差异：
   - `git log --oneline --decorate main..HEAD`；
   - `git diff --name-status main...HEAD`；
   - `git diff --stat main...HEAD`；
   - `git diff main...HEAD -- '*.ts'`。
2. 用户明确指定 PR、base 分支或工作区 diff 时，按用户范围执行。
3. 只点评所选 diff 中新增或修改的 TypeScript 行。
4. 排除 `node_modules` 和 node 引入的插件扩展。
5. `.prefab`、`.scene`、`.json` 等非 TS 文件只作为代码审查上下文，不扩展点评未修改代码。
6. 资源完整性检查是独立的全项目健康检查，不受代码 diff 限制，也不得自动归因于本次变更。

## Scene / Prefab 资源完整性检查

### 检查范围

- 默认扫描项目 `assets` 下全部 `.prefab`、`.scene`、`.fire` 文件。
- 不扫描 `library`、`temp`、`build`、`node_modules`。
- 如果没有 Scene / Prefab，在报告中写明检查文件数为 0，不视为失败。

### 执行方式

收集文件后，使用本机安装的当前 CLI 执行 JSON 检查：

```bash
cli-anything-cocoscreator --json asset prefab-check <PROJECT_ROOT> <SCENE_OR_PREFAB_FILES...>
```

文件过多导致参数长度受限时可分批执行，但必须汇总成一份结果。检查 JSON 必须包含：

- 顶层：`checked_count`、`passed_count`、`problem_file_count`、`issue_count`；
- 文件级：`prefab`、`issue_count`、`issues`；
- 问题级：`kind`、`node`、`component`、`expected_type`、`property`、`serialized_uuid`。

不要把已由当前 CLI 识别的 Cocos 内置资源或 `PrefabInfo.fileId` 再报告为缺失。

### 严重级别

- `missing-component`、`missing-file`、`parse-error`：`Critical`；
- `missing-resource`：默认 `Warning`；确认会阻断启动、核心流程或构建时提升为 `Critical`。

资源问题必须标记来源为“资源扫描”。若问题文件不在本次 diff 中，注明“全项目既有问题，未确认由本次变更引入”。

## ts-graph 分析流程

按需使用：

1. `ts_get_blast_radius(changedFiles)`：判断影响范围；
2. `ts_get_file_context(filePath)`：查看导出、导入和类型上下文；
3. `ts_get_symbol_ast(name, filePath)`：读取核心实现；
4. `ts_query_symbol(name, filePath)`：验证调用方和类型使用方；
5. 仅当语义结果为空且怀疑编辑器绑定、字符串事件名或资源路径引用时，使用文本搜索兜底。

## 审查规则

必须严格遵守同目录的 `review-rules.md`，尤其注意：

- 代码问题只允许点评 diff 中新增或修改的行；
- 资源问题使用 CLI 的独立全项目检查结果；
- 不关注 `node_modules` 或 node 引入的插件扩展；
- 任何情况下禁止建议或使用 `===` / `!==`；
- 不确定的上下文必须明确说明，不得猜测；
- 每个代码问题必须包含可直接参考的重构示例；
- 资源问题必须包含可执行修复建议，不强制提供 TypeScript 示例。

## 输出要求

默认将中文报告写入 `~/Desktop/cocos-code-review-report.md`。用户指定文件名或目录时按用户要求执行；目标文件存在时覆盖，不追加旧报告。

对话中只给出报告路径和简短摘要，不重复完整报告。

### 统一报告结构

```md
# Cocos 代码审查报告

## 1. 审查摘要

- 审查对象：当前分支 `main...HEAD` / PR / 用户指定 diff
- 对比基准：main 或用户指定 base
- 分支提交预览：N 个提交
- ts-graph：已构建 / 未构建及原因
- Cocos CLI：已执行 / 未执行及原因
- 代码变更范围：N 个 TypeScript 文件，M 个非 TS 上下文文件
- 资源检查范围：N 个 Scene / Prefab
- 结论：代码问题 X 个；资源完整性问题 Y 个

## 2. 统一问题索引

| # | 严重级别 | 来源 | 类型 | 文件 / 节点 | 摘要 |
|---|---|---|---|---|---|
| 1 | Critical | 代码 Diff | Correctness | `path/file.ts:123` | 简短问题摘要 |
| 2 | Warning | 资源扫描 | Resource Integrity | `path/prefab.prefab · root/Label` | 缺失 TTFFont |

## 3. 代码问题详情

### 1. 问题标题

**位置**：`path/file.ts:123`
**严重级别**：Critical
**问题类型**：Correctness

**问题描述**
说明触发条件和影响。

**建议修改**
给出可执行修改方向。

**重构示例**

```ts
// 可直接参考的示例代码
```

## 4. Scene / Prefab 资源完整性检查

- 检查文件：N
- 有问题文件：M
- 问题总数：K
- 通过：P

### Prefab: assets/path/example.prefab（2 个问题）

1. 节点：root/content/Label
   - 严重级别：Warning
   - 组件：cc.Label
   - 缺失资源：cc.TTFFont
   - 属性：_font
   - UUID：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   - 归因：全项目既有问题，未确认由本次变更引入
   - 修复建议：补回字体资源或改用有效字体引用

## 5. 修改建议或改进方案

## 6. Cocos Creator 风险提示

## 7. 已检查但未发现问题的范围
```

资源问题必须严格按 `Scene/Prefab → 问题数量 → 编号问题 → 固定字段` 的顺序输出。字段无值时可省略，但不得改变字段顺序。

如果资源检查全部通过：

```text
检查文件：N  有问题：0  问题总数：0  通过：N
结果：全部通过，未发现缺失组件或资源。
```

如果代码未发现问题，`统一问题索引` 写“未发现符合报告标准的高置信代码问题”；资源问题仍需独立展示，不得因代码无问题而省略。
