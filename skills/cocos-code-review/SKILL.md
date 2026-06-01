---
name: cocos-code-review
description: Review Cocos Creator TypeScript PR/diff changes with ts-graph MCP semantic analysis. Requires ts-graph MCP and asks before installation if unavailable.
tags: [cocos, code-review, typescript, ts-graph]
inputs: [PR diff, changed files, current branch changes]
outputs: [中文代码审查报告, 本地 Markdown 报告文件]
---

# Cocos 代码变更审查

## 使用场景

当用户要求 review Cocos Creator / OOPS / TypeScript 代码变更时使用，包括：

- 审查当前分支 diff
- 审查 PR diff
- 检查 Cocos TypeScript 变更的影响范围
- 对新增或修改代码行给出中文问题列表和修改建议

不用于审查非 Cocos 项目，也不用于全量重构未修改代码。

## 必须先检查 ts-graph MCP

开始 review 前，先调用 `ts_graph_stats()` 探测 ts-graph MCP 是否可用。

- 调用成功：继续执行 review 流程。
- 工具不存在、未安装、未启动或调用失败：停止 review，先询问用户是否安装 ts-graph MCP，并提供安装指南链接。

安装指南：`https://github.com/wenext-limited/cocos-ts-graph-mcp/blob/main/%E5%AE%89%E8%A3%85%E6%8C%87%E5%BC%95.md`

不要复制安装步骤；安装指南内容可能变化，以链接内容为准。

## Review 前第一步

确认 ts-graph MCP 可用后，review 的第一步必须构建或更新代码图谱：

```text
ts_graph_build({ directory, force: false })
```

`directory` 应指向当前 Cocos 项目的 TypeScript 源码目录或项目根目录。除非用户明确要求全量重建，否则不要设置 `force: true`。

## 变更范围

1. 默认审查当前分支相对 `main` 的完整分支差异，而不是只看工作区未提交 diff：
   - 先读取 `git log --oneline --decorate main..HEAD`，preview 当前分支上的所有历史提交。
   - 再读取 `git diff --name-status main...HEAD`、`git diff --stat main...HEAD` 和 `git diff main...HEAD -- '*.ts'`。
   - 报告中必须明确写出对比基准是 `main...HEAD`、分支提交数量、TypeScript 变更文件数量。
2. 如果用户明确指定 PR、base 分支或只看工作区 diff，才按用户指定范围审查，并在报告中说明范围来源。
3. 只收集所选 diff 范围内新增或修改的代码行。
4. 排除 `node_modules` 和 node 引入的插件扩展。
5. TypeScript 文件作为主要审查对象。
6. `.prefab`、`.scene`、`.json` 等非 TS 文件只作为上下文补充，不扩展点评未修改代码。

## ts-graph 分析流程

构建图谱后，按需使用以下语义工具：

1. `ts_get_blast_radius(changedFiles)`：判断变更影响范围。
2. `ts_get_file_context(filePath)`：查看每个 TS 变更文件的导出、导入、类型上下文。
3. `ts_get_symbol_ast(name, filePath)`：读取核心变更函数、类、接口的实现。
4. `ts_query_symbol(name, filePath)`：验证调用方、被调用方、类型使用方兼容性。
5. 当语义结果为空且怀疑存在编辑器绑定、字符串事件名或资源路径引用时，才使用 grep/find 兜底。

## 审查规则

必须严格遵守同目录的 `review-rules.md`。

尤其注意：

- 只审查 PR diff 中新增或修改的代码行。
- 不点评未修改代码，除非它是解释新增或修改行问题所必需的上下文。
- 不关注 `node_modules` 或 node 引入的插件扩展。
- 任何情况下禁止建议或使用 `===` / `!==` 运算符。
- 如果问题依赖未提供上下文，必须明确说明不确定性。
- 中文输出。
- 每个问题必须包含可直接参考的重构示例。

## 输出要求

默认必须把中文 review 报告写入桌面的本地 Markdown 文件，同时在对话中给出文件路径和简短摘要。

### Markdown 文件要求

- 文件名默认使用 `~/Desktop/cocos-code-review-report.md`。
- 如果用户指定文件名或输出目录，按用户指定的位置写入。
- 如果目标文件已存在，可以覆盖为本次最新审查结果；不要追加旧报告。
- 文件内容必须是完整 review 报告，结构遵循 `review-rules.md`。
- 对话最终回复不要重复完整报告，只需说明报告已生成、文件路径、问题数量或未发现问题。
- 报告必须便于快速浏览：先给结论摘要和问题索引表，再展开每个问题详情。

### Markdown 报告推荐格式

```md
# Cocos 代码审查报告

## 1. 审查摘要

- 审查对象：当前分支 `main...HEAD` 完整 diff / PR diff / 用户指定 diff
- 对比基准：main 或用户指定 base
- 分支提交预览：`main..HEAD` 共 N 个提交 / 不适用及原因
- ts-graph：已构建 / 未构建及原因
- 变更范围：N 个 TypeScript 文件，M 个非 TS 上下文文件
- 结论：发现 X 个问题（Critical A / Warning B / Suggestion C）

## 2. 问题索引

| # | 严重级别 | 类型 | 文件:行号 | 摘要 |
|---|---|---|---|---|
| 1 | Critical | Correctness | `path/file.ts:123` | 简短问题摘要 |

## 3. 问题详情

### 1. 简短问题标题

**位置**：`path/file.ts:123`  
**严重级别**：Critical  
**问题类型**：Correctness / Cocos Best Practice  

**问题描述**  
说明问题会在什么条件下发生，以及可能造成的影响。

**建议修改**  
给出可执行修改方向。

**重构示例**

```ts
// 示例代码
```

## 4. Cocos Creator 风险提示

- 生命周期、事件解绑、Tween/定时器清理、资源释放、节点有效性等专项提示。

## 5. 已检查但未发现问题的范围

- 列出已检查的关键文件、影响范围或语义调用链。
```

如果未发现问题，仍按上述格式输出，但 `问题索引` 写“未发现符合报告标准的高置信问题”，并重点说明审查范围、ts-graph 构建结果和关键影响范围。

Markdown 报告必须包含：

1. 审查摘要
2. 问题索引表
3. 问题详情
4. 修改建议或改进方案
5. 重构后的示例代码片段
6. Cocos Creator 特有风险提示或最佳实践说明（如有）

如果未发现问题，Markdown 中说明：

- 已审查的变更文件范围
- 已构建 ts-graph 图谱
- 已检查的关键影响范围
- 未发现符合报告标准的高置信问题
