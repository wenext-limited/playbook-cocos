---
name: cocos-feature-migration
description: 在两个 Cocos Creator 项目之间迁移业务功能时使用，包括入口定位、代码图谱分析、依赖资源盘点、缺失资源补齐、代码落地与路径修复。当用户说“迁移功能”、“移植功能”、“从项目A迁到项目B”、“migrate feature”或描述跨项目复制某个业务模块时使用此 skill。
argument-hint: [源项目路径] [目标项目路径] [功能名]
allowed-tools: [Read, Write, Edit, Bash, Agent, SendMessage, TeamCreate, TeamDelete, TaskCreate, TaskGet, TaskList, TaskUpdate, mcp__ts-graph__ts_graph_stats, mcp__ts-graph__ts_graph_build, mcp__ts-graph__ts_search_symbols, mcp__ts-graph__ts_get_file_context, mcp__ts-graph__ts_query_symbol, mcp__ts-graph__ts_get_review_context]
---

# Cocos 功能迁移指南

你是 Cocos Creator 功能迁移专家。目标是在**保留目标项目既有架构和目录规范**的前提下，把某个业务功能从源项目迁移到目标项目，而不是机械复制文件。

## 执行模型：单入口 Skill + 阶段 Agent Team

本 skill 仍然是用户唯一入口；用户只需要调用 `/cocos-feature-migration <源项目路径> <目标项目路径> <功能名>`。对于完整功能迁移任务，默认采用“主控 + 阶段 agent team”的执行模型，以降低主会话上下文压力。

### 主控职责

主控即当前会话，负责：

- 解析用户参数与 feature slug；
- 执行硬门禁前置检查：ts-graph MCP、`cli-anything-cocoscreator`、Git 基线；
- 创建或维护团队任务、manifest、source-manifest 的最终状态；
- 处理用户确认与阻塞判断；
- 只读取 compact 摘要作为跨阶段事实基线；
- 裁定最终状态：`completed` / `partial` / `blocked` / `abandoned`；
- 向用户输出最终结果。

### 推荐阶段 Agent

完整迁移任务优先拆给以下阶段 agent；agent prompt 存放在本 skill 目录的 `agent-prompts/` 下：

| Agent | 负责步骤 | 主要产物 | 是否允许改业务代码 |
|---|---|---|---|
| `source-analyzer` | 第 2~4 步 | 源侧步骤文档、`SOURCE_SUMMARY.compact.md` | 否 |
| `target-analyzer` | 第 5 步 | `05-target-gap-analysis.md`、`TARGET_GAP.compact.md` | 否 |
| `migration-applier` | 第 6 步 | 目标代码/资源改动、`06-migration-actions.md`、`MIGRATION_STATE.compact.md` | 是，且应是唯一写业务代码的 agent |
| `migration-verifier` | 第 7 步 | `07-verification.md`、`SUMMARY.md`、`MONITORING.md`、`FINAL_STATE.compact.md` | 通常否；只做验证和文档写回 |

### Agent 协作硬规则

1. 子 agent 必须把完整证据写入步骤 md 或 `logs/`，只向主控返回 compact 摘要。
2. 子 agent 返回内容默认控制在 200 行以内，不得返回完整源码、完整 CLI 输出、完整 Prefab 依赖树。
3. 只有主控可以向用户提问；子 agent 只能上报 `needs_user_confirmation`、`confirmation_topic` 和候选项。
4. 只有主控裁定最终状态；子 agent 只能给出 `final_status_recommendation`。
5. `migration-applier` 是唯一业务代码/资源写入 agent，避免多 agent 并发修改同一批文件。
6. manifest / source-manifest 可由阶段 agent 草拟或更新，但主控必须最终收敛其状态，避免互相覆盖。
7. 若上下文、权限或任务规模不适合创建 agent team，可退化为单会话执行，但仍必须遵守 compact 和 logs 规则。

---

## 上下文预算与大输出治理

为避免上下文耗尽，本 skill 默认采用 compact 摘要 + logs 原始证据模式。

### Compact 摘要

每完成对应阶段，必须同步生成或更新 compact 摘要：

| 阶段 | compact 文件 | 作用 |
|---|---|---|
| 源侧第 2~4 步 | `SOURCE_SUMMARY.compact.md` | 记录源入口、边界、代码闭包、资源闭包、职责层、完成定义 |
| 目标第 5 步 | `TARGET_GAP.compact.md` | 记录目标同名/同职责能力、缺口、复用策略、迁移策略 |
| 第 6 步 | `MIGRATION_STATE.compact.md` | 记录新增/修改/复制/复用/过渡目录/待验证项 |
| 第 7 步 | `FINAL_STATE.compact.md` | 记录验证等级、最终状态建议、风险和下一步 |

后续步骤和 Resume 默认先读取 compact 摘要；只有 compact 缺失、不一致、状态为 `stale`，或需要核查具体证据时，才读取完整步骤 md。

### Logs 原始证据

任何超过 100 行的命令输出、搜索结果、依赖树、引用列表，不得原样写入步骤 md，也不得完整返回主控。必须保存到当前任务目录的 `logs/` 下，并在步骤 md 中记录摘要、结论和日志路径。

建议日志目录：

```text
<source-project>/.claude/cocos-feature-migration/source-features/<feature-slug>/logs/
<target-project>/.claude/cocos-feature-migration/<feature-slug>/logs/
```

步骤 md 中只记录：

```markdown
| 命令/来源 | 结论 | 原始输出路径 |
|---|---|---|
| asset deps ... | unresolved_count = 0 | logs/asset-deps-panel-rank.txt |
```

### 限长规则

- 候选入口超过 20 项：正文只保留关键候选，其余写 `logs/`。
- 资源清单超过 50 项：正文按“必迁 / 复用 / 动态 / 风险”聚合，其余写 `logs/`。
- CLI 输出超过 100 行：只写摘要和日志路径。
- 不在步骤 md 中重复粘贴前序步骤全文，只引用 compact 摘要和证据路径。

---
## 适用范围

适用于以下场景：

- 从项目 A 迁移某个完整业务功能到项目 B
- 目标项目缺少功能代码、Prefab、Sprite、Atlas、配置或本地化资源
- 两个项目同属 Cocos Creator / TypeScript 体系，但目录、入口和 UI 配置可能不同
- 用户已经明确给出源项目路径、目标项目路径和要迁移的功能名

不适用于：

- 单文件工具类拷贝
- 纯资源同步但没有业务逻辑的场景
- 仅做 bug fix，而不是跨项目迁移

---

## 必须先检查 ts-graph MCP 与 cli-anything-cocoscreator

开始迁移分析前，先通过 MCP 调用 `ts_graph_stats()` 探测 ts-graph MCP 是否可用。

- 调用成功：继续下一项检查。该检查与操作系统无关，不需要区分 macOS / Linux / Windows 命令。
- 工具不存在、未安装、未启动或调用失败：停止迁移分析，先询问用户是否安装 ts-graph MCP，并提供安装指南链接。

安装指南：`https://github.com/wenext-limited/cocos-ts-graph-mcp/blob/main/%E5%AE%89%E8%A3%85%E6%8C%87%E5%BC%95.md`

不要复制安装步骤；安装指南内容可能变化，以链接内容为准。

接着必须检查 `cli-anything-cocoscreator` 是否可用。

按当前运行环境选择对应命令：

```bash
# macOS / Linux / WSL / Git Bash
command -v cli-anything-cocoscreator

# PowerShell
Get-Command cli-anything-cocoscreator

# cmd
where cli-anything-cocoscreator
```

- 任一对应环境下的检查命令能找到该命令：继续执行迁移流程。
- 对应环境下检查失败、命令不存在、未安装或无法执行：停止迁移分析，先询问用户是否安装 `cli-anything-cocoscreator`，并提供部署指南链接。

部署指南：`https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/DEPLOY.md`

不要复制部署步骤；部署指南内容可能变化，以链接内容为准。

---

## 核心原则

1. **先分析，再复制。** 必须先在源项目定位功能入口和依赖闭包，再决定迁什么。
2. **以目标项目规范为准。** import 路径、UI 注册方式、bundle 路径、命名约定、资源目录都要适配目标项目。
3. **优先复用目标项目已有能力。** 目标项目已有通用组件、工具类、网络层、UI 管理时，不要重复拷贝同类实现。
4. **资源必须成组校验。** 不能只迁 `.png`，还要检查 `.meta`、Prefab 引用、Atlas、Spine、字体、配置 JSON、本地化文案。
5. **迁移结果必须可验证。** 至少要能说明入口如何触发、缺了哪些依赖、补了哪些资源、还剩哪些人工确认项。
6. **按职责层判断功能是否完整，不要只看文件是否存在。** 迁移分析与最终验证时，必须先识别源功能的关键职责层，再逐层判断目标项目是否保留这些职责。职责层不固定，不强制要求某种模板；应根据功能形态按需拆分为一层或多层，例如：触发层、展示层、详情层、数据层、事件层、配置层、资源层、接入层、平台桥接层等。若某一关键职责层缺失，即使主要 TS、Prefab、资源已经迁入，也不得直接判定该功能已完整迁移。

---

## 执行前提

迁移分析默认应基于**已从远程更新后的源项目和目标项目**进行，不应把“是否更新代码”视为可省略步骤。

Git 相关操作在本 skill 中仅视为**第 1 步前置初始化动作**，默认只执行一次：

- `git status --short` 用于记录初始化前工作区状态；
- 若工作区不干净，可在**第 1 步**执行一次 `git stash push -u` 暂存本地变更；
- 随后在**第 1 步**执行一次 `git pull --rebase` 获取远程最新代码；
- 若分析或迁移需要切换分支，可直接执行并在步骤文档中记录原因与结果；
- 完成迁移后，如需恢复第 1 步产生的 stash，可根据任务需要决定是否执行 `git stash pop`，并同样记录到步骤文档。

强约束：

- 第 1 步完成后，后续第 2~7 步默认继承这次初始化后的工作区基线，不再重复要求 clean、不得再次自动 stash、不得再次自动 pull。
- 若后续步骤发现工作区与第 1 步基线不一致，应优先记录风险、标记 `stale` 或上报主控，而不是再次做 Git 现场清理。
- 只有用户明确要求，或发生新的外部变更 / 高风险冲突、且主控已在步骤文档中说明原因时，才允许把额外 Git 动作作为**例外**处理；该例外不得视为默认流程。

标准要求：

- 若工作区干净：应先在第 1 步执行远程更新，再进入后续迁移分析。
- 若工作区不干净：应先把风险写入步骤文档，再在第 1 步自动 `stash` 后更新，并记录 stash 名称、更新前状态与更新后 commit。
- 若尚未完成远程更新就先做了探索性分析：后续产出的步骤文档必须明确标记为 `stale` / 待刷新，不能当作最终分析基线。

推荐顺序（仅第 1 步使用一次）：

```bash
git status --short
git stash push -u -m "claude-feature-migration-<feature>-<date>"
git pull --rebase
```

---

## 连续执行与暂停规则

本 skill 是连续迁移流程，不是单步报告流程。**完成某一个中间步骤并写回 Markdown，本身不是暂停理由。**

除非遇到以下明确阻塞条件，否则不得在某一步完成后仅输出阶段性汇报并停止：

1. ts-graph MCP 不可用；
2. `cli-anything-cocoscreator` 不可用；
3. 检测到历史源分析，需要用户选择复用 / 增量复核 / 重建；
4. 候选入口超过 1 个，需要用户确认精确入口；
5. 功能边界不清，需要用户确认迁移范围；
6. 迁移动作涉及高风险覆盖、删除、外部发布或不可逆操作，需要用户确认；
7. 用户明确要求暂停、只执行到某一步、或只生成阶段性报告。

如果以上阻塞条件均不存在，完成第 1 步后必须自动继续第 2 步；完成第 2 步且入口 / 边界明确后必须继续第 3 步；以此类推，直到遇到真实阻塞点或完成第 7 步。

每一步完成后仍必须写回对应 Markdown 和 manifest，但“写回完成”不得被视为流程结束信号。

`MONITORING.md` 可以阶段性更新，但阶段性监控记录不得被视为流程结束信号。只有在 `completed` / `blocked` / `partial` / `abandoned` 状态明确，或用户明确要求阶段性汇报时，才应向用户输出总结性回复。

### 最终输出触发条件

只有在以下情况才输出最终回复：

1. 第 7 步完成，并写入 `SUMMARY.md` 与最终 `MONITORING.md`；
2. 流程因明确阻塞条件暂停，并已在 `manifest.md` / `source-manifest.md` 中记录 `needs_user_confirmation: true` 与 `confirmation_topic`；
3. 用户明确要求阶段性汇报、暂停、解释当前状态或只执行到某一步。

如果只是完成某个中间步骤，例如第 1 步前置检查、第 2 步入口候选、第 5 步差异分析，不应直接以最终输出格式回复用户，而应继续执行下一步。

---

## 结果持久化 / Resume 规则

此 skill 在执行过程中，必须把每一步的结果保存为 Markdown，并在后续对话中优先读取这些 Markdown 继续推进，而不是默认从头重新分析。

### 默认保存目录

本 skill 采用**双目录持久化模型**，把“源功能分析产物”和“目标项目迁移产物”分开保存。

#### 1. 源分析目录（默认保存到源项目内）

`<source-project>/.claude/cocos-feature-migration/source-features/<feature-slug>/`

用于保存描述**源功能本身**的分析结果，例如：

- `source-manifest.md`
- `02-source-entry-candidates.md`
- `03-source-code-closure.md`
- `04-source-resource-closure.md`
- 可选：`SOURCE_SUMMARY.md`

这些文件描述的是源功能的入口、职责层、代码闭包、资源闭包与边界，通常可复用于多个目标项目。

#### 2. 目标迁移目录（默认保存到目标项目内）

`<target-project>/.claude/cocos-feature-migration/<feature-slug>/`

用于保存与**当前目标项目**绑定的迁移结果，例如：

- `manifest.md`
- `01-precheck.md`
- `05-target-gap-analysis.md`
- `06-migration-actions.md`
- `07-verification.md`
- `SUMMARY.md`
- `MONITORING.md`

这些文件描述的是当前目标项目的差异、动作、验证和最终结论，不应回写到源项目中。

约定：

- `<feature-slug>` 使用功能名生成稳定 slug；若功能名相同，必须在 manifest 中记录源项目绝对路径与目标项目绝对路径以消除歧义。
- 如果目录不存在，可以创建。
- 不要把运行结果写到 skill 目录本身，也不要写到 memory 目录。

### 目录结构

#### 源项目目录结构

- `source-manifest.md`：源功能分析索引与当前进度
- `02-source-entry-candidates.md`：源项目候选入口
- `03-source-code-closure.md`：已确认入口的代码闭包
- `04-source-resource-closure.md`：资源闭包
- `SOURCE_SUMMARY.compact.md`：源侧 compact 摘要，供后续阶段和 Resume 优先读取
- `logs/`：长命令输出、搜索结果、资源依赖树等原始证据

#### 目标项目目录结构

- `manifest.md`：目标迁移任务索引与当前进度
- `01-precheck.md`：ts-graph / git / 前置约束检查
- `05-target-gap-analysis.md`：目标项目差异分析
- `06-migration-actions.md`：实际迁移动作记录
- `07-verification.md`：验证结果
- `SUMMARY.md`：最终迁移摘要
- `MONITORING.md`：本次 skill 使用效果监控记录
- `TARGET_GAP.compact.md`：目标差异 compact 摘要
- `MIGRATION_STATE.compact.md`：迁移动作 compact 摘要
- `FINAL_STATE.compact.md`：最终验证 compact 摘要
- `logs/`：长命令输出、构建日志、资源依赖树等原始证据

### source-manifest.md 必填字段

`source-manifest.md` 至少记录：

- 源项目路径
- 功能名
- `feature_slug`
- 当前已完成步骤（源侧）
- 已确认入口（若有）
- 功能边界摘要
- 完成定义摘要
- 最近更新时间
- 源项目当时的分支与 commit（若已读取）
- 各源分析文件状态：`missing` / `draft` / `confirmed` / `stale`
- `needs_user_confirmation: true/false`
- `confirmation_topic: <topic or null>`
- `confirmed_entry: <path or null>`

### manifest.md 必填字段

目标项目内的 `manifest.md` 至少记录：

- 源项目路径
- 目标项目路径
- 功能名
- 当前已完成步骤
- 已确认入口（若有）
- 最近更新时间
- 源/目标项目当时的分支与 commit（若已读取）
- 每个目标侧步骤文件状态：`missing` / `draft` / `confirmed` / `stale`
- `needs_user_confirmation: true/false`
- `confirmation_topic: <topic or null>`
- `confirmed_entry: <path or null>`
- `source_analysis_path: <path or null>`
- `source_analysis_mode: reused | refreshed | rebuilt | none`
- `source_analysis_branch: <branch or null>`
- `source_analysis_commit: <commit or null>`
- `source_analysis_status: missing | draft | confirmed | stale`

### 源分析缓存与复用规则

在进入第 2 步前，必须先检查源项目内是否已存在：

`<source-project>/.claude/cocos-feature-migration/source-features/<feature-slug>/source-manifest.md`

若存在历史源分析，必须先判断是否可复用，至少检查：

1. 源项目路径是否一致；
2. 功能名 / `feature_slug` 是否一致；
3. 已确认入口是否一致（若已有）；
4. 上次分析记录的 branch / commit 是否与当前一致；
5. 用户本轮是否明确要求强制刷新。

若检测到已有历史源分析，不得擅自重跑，也不得擅自跳过，应向用户说明并提供以下选择：

1. **复用已有源分析，跳过重跑**：直接复用 `02/03/04`，从目标项目差异分析继续；
2. **基于已有结果做增量复核**：读取旧分析，仅核对关键入口、关键闭包、关键资源是否变化；
3. **忽略旧结果，重新完整分析**：把源分析按当前基线重建。

建议使用类似下面的标准提示模板：

```text
检测到该源功能已有历史分析结果：
- 源分析目录：<source-project>/.claude/cocos-feature-migration/source-features/<feature-slug>/
- 上次分析 branch / commit：<old-branch> / <old-commit>
- 当前源项目 branch / commit：<current-branch> / <current-commit>
- 已有产物：source-manifest.md、02-source-entry-candidates.md、03-source-code-closure.md、04-source-resource-closure.md
- 已确认入口（若有）：<confirmed-entry-or-null>

请确认本轮如何处理这份历史源分析：
1. 复用已有源分析（直接跳过源侧重跑，进入目标差异分析）
2. 增量复核（基于旧结果，只核对关键入口 / 闭包 / 资源变化）
3. 重新完整分析（忽略旧结果，按当前基线全量重建）
```

处理要求：

- 若用户选择复用：目标项目 `manifest.md` 必须记录 `source_analysis_mode: reused`；
- 若用户选择增量复核：目标项目 `manifest.md` 必须记录 `source_analysis_mode: refreshed`；
- 若用户选择完整重建：目标项目 `manifest.md` 必须记录 `source_analysis_mode: rebuilt`；
- 若源分析不存在：记录 `source_analysis_mode: none`，并按正常流程生成新的源分析。

若历史源分析 commit 已变化：

- 必须把 `source-manifest.md` 中相关状态标记为 `stale`；
- 同时把目标项目中依赖旧源分析的 `05-target-gap-analysis.md`、`06-migration-actions.md`、`07-verification.md`、`SUMMARY.md` 视为受影响产物；若其结论依赖旧源闭包，应标记为 `stale` 或待刷新。

### Resume 规则

每个步骤开始前，必须先读取对应侧的 manifest；再优先读取 compact 摘要；只有 compact 缺失、不一致、状态为 `stale` 或需要核查具体证据时，才读取完整步骤文件。

#### 目标侧步骤（第 1、5、6、7 步）

1. 读取 `manifest.md`。
2. 按阶段优先读取 compact：
   - 第 5 步优先读取 `SOURCE_SUMMARY.compact.md` 与 `TARGET_GAP.compact.md`（如存在）；
   - 第 6 步优先读取 `TARGET_GAP.compact.md` 与 `MIGRATION_STATE.compact.md`（如存在）；
   - 第 7 步优先读取 `SOURCE_SUMMARY.compact.md`、`TARGET_GAP.compact.md`、`MIGRATION_STATE.compact.md`、`FINAL_STATE.compact.md`（如存在）。
3. 仅在 compact 缺失、不一致、状态为 `stale`、证据不足或用户要求细节时，读取当前步骤对应的完整 md 文件。

#### 源侧步骤（第 2、3、4 步）

1. 读取 `source-manifest.md`。
2. 优先读取 `SOURCE_SUMMARY.compact.md`（如存在）。
3. 仅在 compact 缺失、不一致、状态为 `stale`、证据不足或用户要求细节时，读取 `02/03/04` 完整步骤文件。

然后判断是否复用：

- 关键输入未变：继续复用已有结果，并从下一未完成步骤继续；
- 源项目路径、目标项目路径、功能名、已确认入口任一变更：将受影响步骤及后续步骤标记为 `stale`，重新生成；
- 若已记录 git 分支或 commit，而当前读取到的分支或 commit 不一致：保留旧内容，但在对应步骤文件中明确标注 `stale`，并重新分析；
- 若当前目标迁移任务引用了一份旧的源分析，而源分析已经被标记为 `stale`：不得继续把它当最终基线直接使用，必须走“复用/增量/重建”判定。

后续步骤必须以前序 md 的内容为事实基线，不要只依赖当前会话上下文。

### 每一步写回要求

每完成一个步骤，必须：

1. 写入或更新该步骤对应的 md 文件；
2. 更新对应侧 manifest 中该步骤状态、当前进度、待确认项；
3. 按阶段同步更新对应 compact 摘要（`SOURCE_SUMMARY.compact.md` / `TARGET_GAP.compact.md` / `MIGRATION_STATE.compact.md` / `FINAL_STATE.compact.md`）；
4. 若产生超过 100 行的命令输出、搜索结果或依赖树，必须写入 `logs/`，步骤 md 只记录摘要和日志路径；
5. 在需要用户确认时，把确认主题写入对应 manifest；
6. **除非用户明确要求英文，否则所有产出的 Markdown 内容必须以中文为主。** 允许保留必要的英文术语、文件路径、命令、字段名和代码符号，但标题、说明、表头、结论、风险、下一步等自然语言内容应优先使用中文。

写回位置要求：

- 第 2、3、4 步：默认写回源项目目录；
- 第 1、5、6、7 步：默认写回目标项目目录；
- 目标项目 `manifest.md` 必须记录当前引用了哪份源分析，以及引用模式。

如果流程在等待用户确认时中断，新的对话应能仅通过读取 `manifest.md` 和 `source-manifest.md` 判断当前卡点。

### 使用效果监控写回要求

本 skill 已接入使用效果监控。监控规范文档位于：

`/Users/aosika/.claude/skills/cocos-feature-migration/USAGE_MONITORING.md`

每次执行本 skill 时，必须在以下时机读取该监控规范，并生成或更新 `MONITORING.md`：

1. **迁移流程正常完成时**：在写入 `SUMMARY.md` 后生成最终 `MONITORING.md`。
2. **流程被阻塞时**：例如等待用户确认入口、ts-graph MCP 不可用、`cli-anything-cocoscreator` 不可用时，也必须生成阶段性 `MONITORING.md`，记录当前阻塞点和已完成步骤。
3. **流程中断但已有阶段产物时**：若已经写入任一步骤 md 或任一侧 manifest，应同步生成阶段性监控记录，方便后续复盘。

`MONITORING.md` 默认保存到当前目标迁移任务目录：

`<target-project>/.claude/cocos-feature-migration/<feature-slug>/MONITORING.md`

`MONITORING.md` 至少包含：

- 任务信息：skill、源项目、目标项目、功能名、日期、最终状态
- 总评分：按 `USAGE_MONITORING.md` 的 100 分制评分模型输出
- 分模块得分：触发与参数澄清、前置检查、Resume、入口定位、代码闭包、资源闭包、目标差异、迁移动作、验证摘要
- 步骤耗时：每个步骤的 `started_at`、`ended_at`、`duration_seconds`，并区分工具耗时、等待用户确认耗时和主要人工/AI 分析耗时；若本轮未记录精确耗时，必须明确写“未记录精确耗时”，不得编造分钟数
- 耗时 Top 项与优化建议：列出耗时最长的 3 个步骤、主要原因和可优化方向
- 关键证据路径：`manifest.md`、`source-manifest.md`、步骤 md、`SUMMARY.md` 等
- 发现的问题：问题、严重程度、影响、建议优化
- 用户反馈：若本轮有明确反馈则记录
- 优化建议：本次执行暴露出的 skill 优化项
- 是否需要更新 `SKILL.md`：需要 / 不需要，并说明原因

最终回复用户时，必须明确报告监控输出路径，例如：

`监控记录已输出：<target-project>/.claude/cocos-feature-migration/<feature-slug>/MONITORING.md`

如果因为缺少目标项目路径而无法确定保存目录，则应先询问用户目标项目路径；若用户只是测试 skill 或未进入真实迁移任务，可说明本次未生成项目级 `MONITORING.md`，并说明原因。

### Markdown 模板要求

每个步骤 md 至少包含：

- 标题
- Task metadata（source / target / feature / entry / date）
- Inputs
- Findings
- Decisions
- Open questions / risks
- Next step

补充要求：

- 所有步骤 md、`SUMMARY.md`、`manifest.md` 与 `source-manifest.md` 中的说明性文本默认使用中文撰写；表格列名、段落标题、结论、风险、决策、下一步等都应以中文为主。
- 若保留英文小节名（如 `Inputs` / `Findings`），其正文内容仍应以中文为主；如无兼容性要求，也可直接改为中文小节名。
- `02-source-entry-candidates.md` 必须包含候选入口表和待用户确认项。
- `03-source-code-closure.md` 必须包含“迁移 / 复用 / 适配 / 不迁移”分类表。
- `04-source-resource-closure.md` 必须包含“资源类型 / 路径 / 来源 / 是否必须”表。
- `05-target-gap-analysis.md` 必须包含代码差异表和资源差异表。
- `06-migration-actions.md` 应按时间追加，记录具体改动、原因、涉及文件。
- `SUMMARY.md` 复用本 skill 末尾定义的最终输出结构。

---

### source-manifest.md 示例模板

建议 `source-manifest.md` 至少按以下结构组织：

```markdown
# Source Analysis Manifest

## Task metadata

| 字段 | 值 |
|---|---|
| 源项目路径 |  |
| 功能名 |  |
| feature_slug |  |
| 最近更新时间 |  |
| 源项目分支 |  |
| 源项目 commit |  |

## 已确认入口

- confirmed_entry: 

## 功能边界摘要

- 核心闭环能力：
- 可选子功能：
- 明确排除项：

## 完成定义摘要

- Minimum Done：
- Full Done：
- 缺失时最多判定为 `partial` 的项：
- 缺失时应判定为 `blocked` 的项：

## 源侧步骤状态

| 步骤 | 文件 | 状态 |
|---|---|---|
| 第 2 步 | `02-source-entry-candidates.md` | missing / draft / confirmed / stale |
| 第 3 步 | `03-source-code-closure.md` | missing / draft / confirmed / stale |
| 第 4 步 | `04-source-resource-closure.md` | missing / draft / confirmed / stale |

## 待确认项

- needs_user_confirmation: true / false
- confirmation_topic: <topic or null>

## Next step

- 
```

要求：

- 字段命名可根据实际任务微调，但语义必须覆盖本 skill 对 `source-manifest.md` 的字段要求。
- 若本轮是基于旧结果增量复核，应在该文件中明确写出“本轮复核范围”和“未重跑部分”。
- 若本轮是完整重建，应更新源项目 branch / commit，并把旧基线标记为历史记录或 `stale`。

---

## 标准工作流

### 第 1 步：更新源项目与目标项目

开始本步骤前：先读取目标项目 `manifest.md` 和 `01-precheck.md`（如果存在）。若前置结论仍有效则复用，否则重写。

完成本步骤后：写回目标项目 `01-precheck.md`，并更新目标项目 `manifest.md` 中第 1 步状态。

这是正式迁移分析的默认前置步骤，不应因为用户没有单独提到 pull/stash 就跳过。工作区存在未提交修改时，也不应停在这一步等待确认；应直接记录风险、执行 stash，再继续更新基线。

**但该类 Git 现场处理只允许发生在第 1 步一次。** 第 1 步完成后，后续第 2~7 步必须沿用这次初始化后的工作区基线持续推进，不得再次以“为了保持干净”或“继续分析/迁移更方便”为由重复执行 stash / clean / pull。

对源项目和目标项目分别执行：

1. 查看工作区状态
2. 若工作区不干净，则在第 1 步自动 stash 本地变更，并记录 stash 名称
3. 拉取远程最新代码
4. 记录当前分支名与 commit

建议记录表：

| 项目 | 路径 | 分支 | 更新前状态 | 更新动作 | 更新后 commit |
|------|------|------|-----------|-----------|----------------|
| 源项目 | /path/A | xxx | clean / dirty | pulled / stashed+pulled | abc123 |
| 目标项目 | /path/B | xxx | clean / dirty | pulled / stashed+pulled | def456 |

#### 1.x 源分析缓存检查（必做）

在进入第 2 步前，必须先检查源项目内是否已存在可复用的源分析目录：

`<source-project>/.claude/cocos-feature-migration/source-features/<feature-slug>/`

重点检查：

- `source-manifest.md` 是否存在
- `02-source-entry-candidates.md` 是否存在
- `03-source-code-closure.md` 是否存在
- `04-source-resource-closure.md` 是否存在
- 上次分析记录的 branch / commit 是否与当前一致

若存在历史源分析，必须先判断其是否可复用。若可复用，不得直接重跑，而应向用户说明当前已有源分析基线，并提供选择：

1. 复用已有源分析，直接跳过第 2~4 步
2. 基于已有结果做增量复核
3. 忽略旧结果，重新完整分析

处理要求：

- 若用户选择复用：后续第 2~4 步可直接引用源项目已有分析结果；
- 若用户选择增量复核：必须先读取旧分析，再只核对关键入口、关键代码闭包、关键资源闭包；
- 若用户选择重新完整分析：应把旧源分析视为历史基线，本轮按当前 commit 完整重建；
- 若源项目不存在历史分析：正常进入第 2 步，并在本轮生成新的源分析产物。

目标项目 `manifest.md` 必须同步记录：

- `source_analysis_path`
- `source_analysis_mode`
- `source_analysis_branch`
- `source_analysis_commit`
- `source_analysis_status`

---

### 第 2 步：在源项目构建代码图谱

开始本步骤前：先读取源项目 `source-manifest.md` 和 `02-source-entry-candidates.md`（如果存在）。若候选入口分析仍可复用，则直接基于已有结果继续；不要无条件重跑搜索。

完成本步骤后：写回源项目 `02-source-entry-candidates.md`，并更新源项目 `source-manifest.md` 中第 2 步状态。若候选入口超过 1 个，必须在 `source-manifest.md` 中写入 `needs_user_confirmation: true`、`confirmation_topic: exact-entry` 与候选列表摘要。

确认 ts-graph MCP 可用后，在源项目根目录构建 TypeScript 图谱：

```bash
# 在源项目目录执行
```

优先使用 `ts_graph_build`。

目标：

- 获得功能入口文件
- 理清入口到核心模块的调用关系
- 找到功能涉及的主要 TS 文件

如果功能名明确（例如“排行榜”），按以下顺序定位：

1. 搜索功能关键词（中英文、缩写、UI 名、枚举名、路由名）
2. 定位入口类：Panel / View / Controller / Entry / Model / API
3. 结合 ts-graph 追踪入口的直接依赖和调用链
4. 输出**功能代码清单**，不要只报一个入口文件

建议输出格式：

| 类型 | 文件 | 作用 |
|------|------|------|
| 入口 UI | `assets/.../PanelRank.ts` | 排行榜界面入口 |
| 数据层 | `assets/.../RankModel.ts` | 排行榜数据存储 |
| 网络层 | `assets/.../RankApi.ts` | 排行榜请求 |
| 渲染项 | `assets/.../RankItem.ts` | 列表项渲染 |
| 配置层 | `assets/.../RankConfig.ts` | 文案/类型配置 |

#### 2.x 功能边界确认（必做）

在得到候选入口后，必须继续确认**本次迁移的功能边界**。精确入口确认不等于功能边界确认；即使入口文件已经明确，也不能默认把与之相邻的所有面板、弹窗、子链路都并入本次迁移范围。

必须回答：

- 哪些模块构成该功能的**核心闭环能力**；
- 哪些模块属于**可选子功能**，只有在用户明确要求或源功能闭环依赖时才纳入；
- 哪些模块应作为**明确排除项**，即使名称相关或入口相邻，也不纳入本次迁移。

常见需要单独判断边界的对象包括但不限于：

- 入口浮层与详情页
- 详情页与二级规则弹窗 / 历史记录 / 奖励说明
- 主功能与活动外壳 / 宿主页面 / 其他业务共用模块
- 主链路与只在特定渠道 / 地区 / feature flag 下启用的分支能力

建议输出一张边界确认表：

| 模块 | 是否纳入本次迁移 | 分类 | 说明 |
|---|---|---|---|
| `assets/...` | 是/否 | 核心闭环 / 可选子功能 / 明确排除 | 说明原因 |

要求：

- 若边界不清，必须暂停并向用户确认，不得自行扩大范围。
- 若后续发现某模块实际属于核心闭环能力，应回写 `02-source-entry-candidates.md` / `source-manifest.md`，并将此前基于错误边界的分析标记为 `stale`。

#### 2.y 完成定义（必做）

在进入代码闭包分析前，必须先定义本次任务的**完成标准**，避免到最终总结时才临时判断“算不算迁完”。

至少要明确两层标准：

1. **最小完成标准（Minimum Done）**：本轮至少做到什么，才能算有可交付结果；
2. **完整完成标准（Full Done）**：达到什么条件，才能标记为 `completed`。

并且必须提前说明：

- 哪些缺口出现时，任务最多只能标记为 `partial`；
- 哪些缺口出现时，任务应标记为 `blocked`；
- “主面板可打开”或“主要资源已拷入”本身不等于完成，若关键职责层、关键数据链、关键配置链、关键验证仍缺失，不得视为 `completed`。

建议输出一张完成定义表：

| 完成项 | 级别 | 缺失时状态 | 说明 |
|---|---|---|---|
| `xxx` | 最小完成 / 完整完成 | partial / blocked | 说明原因 |

该完成定义应在 `03-source-code-closure.md`、`07-verification.md`、`SUMMARY.md` 中保持一致；若中途调整，必须明确记录调整原因。

---

### 第 3 步：汇总源功能的代码闭包

开始本步骤前：先读取源项目 `source-manifest.md`、`02-source-entry-candidates.md` 和 `03-source-code-closure.md`（如果存在）。若用户已确认入口，必须把该入口作为唯一分析边界；不要把未确认的下一级 panel 默认并入范围。

完成本步骤后：写回源项目 `03-source-code-closure.md`，并更新源项目 `source-manifest.md` 中第 3 步状态与 `confirmed_entry`。

从入口 TS 出发，汇总以下内容：

1. **功能代码文件列表**
   - 直接调用的 TS 文件
   - 功能私有工具类
   - 相关枚举 / 常量 / 配置
2. **共享依赖识别**
   - OOPS / framework / common util / net / event 等通用能力
   - 判断这些依赖在目标项目是否已有同等实现
3. **迁移策略分类**
   - 直接迁移
   - 目标项目复用
   - 需要适配后迁移
   - 不应迁移（源项目特有逻辑）

建议把每个 TS 文件打上动作标签：

| 文件 | 分类 | 动作 | 说明 |
|------|------|------|------|
| `RankPanel.ts` | 业务 UI | 迁移 | 目标项目缺失 |
| `HttpRequest.ts` | 框架公共层 | 复用目标项目 | 目标已有网络封装 |
| `GameConst.ts` | 公共常量 | 局部摘取 | 仅迁排行榜相关字段 |

**禁止整包复制 framework/common 目录。**

#### 3.x 职责层拆解（必做）

在完成代码文件清单后，必须继续识别该功能在源项目中的**关键职责层**，不能只停留在“有哪些文件”。

职责层的数量不固定，应按功能实际结构拆解。常见职责层包括但不限于：

- 触发层：按钮、入口、路由、显隐开关、注册点
- 展示层：常驻 UI、节点组件、角标、浮层、列表项
- 详情层：二级面板、弹窗、完整功能页
- 数据层：request / api / model / store / ecs component / runtime state
- 事件层：event enum、message dispatch、listener、订阅关系
- 配置层：UIConfig、常量、feature switch、多语言、JSON 配置
- 资源层：prefab、sprite、atlas、font、material、spine、audio
- 接入层：bundle preload、初始化、宿主参数、native bridge、app 适配

注意：

- 不要求每个功能都具备上述所有职责层。
- 不要机械套模板；应根据功能形态选择实际存在的职责层。
- 若某职责层不存在，应明确写“该功能无此层”，而不是省略不写。

建议输出一张职责层表：

| 职责层 | 源实现文件/资源 | 作用 | 是否关键 |
|---|---|---|---|
| 触发层 | `assets/...` | 用户或系统如何进入该功能 | 是/否 |
| 展示层 | `assets/...` | 功能对外表现载体 | 是/否 |
| 数据层 | `assets/...` | 功能运行依赖的数据来源与状态存储 | 是/否 |
| 事件层 | `assets/...` | 功能联动与刷新机制 | 是/否 |
| 配置层 | `assets/...` | 功能依赖的配置、枚举、多语言 | 是/否 |

若某个职责层被标记为“关键”，则后续第 5 步和第 7 步必须继续核对该职责层是否在目标项目中被完整保留。

---

### 第 4 步：盘点源功能引用的资源

开始本步骤前：先读取源项目 `source-manifest.md`、`03-source-code-closure.md` 和 `04-source-resource-closure.md`（如果存在）。资源分析必须基于已确认入口和第 3 步代码闭包结果。

完成本步骤后：写回源项目 `04-source-resource-closure.md`，并更新源项目 `source-manifest.md` 中第 4 步状态。

必须分析该功能引用的所有资源，而不只是 TS 文件。

资源类型至少包括：

- Prefab
- Sprite / PNG / JPG
- SpriteAtlas
- Spine SkeletonData
- Font
- Audio（若该功能会用到）
- Json / 配置表
- language / i18n 文案
- 粒子、材质、Shader（如有）

#### 资源定位方法

在开始资源分析前，**如果候选入口不止一个，必须先向用户确认精确功能入口**。精确入口可以是：

- 某个 TS（如 `PanelGeneralRankPool.ts`）
- 某个入口 prefab（如 `panelGeneralRankPool.prefab`）
- 某个完整业务面板 prefab（如 `PanelGeneralRank.prefab`）

**未经确认，不得默认把“入口点击后打开的下一级 panel”纳入同一功能范围。**

采用**双轨分析**：**AI 负责判断动态依赖**，`cli-anything-cocoscreator` **负责展开静态依赖**。

在执行本节前，必须再次按当前运行环境确认 `cli-anything-cocoscreator` 可用；若不可用，停止资源闭包分析，并引导用户参考部署指南完成安装：`https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/DEPLOY.md`。

1. 从 TS 中找显式资源路径字符串
2. 读取 UI 配置表（如 `UIConfig`、`SubUIID`、`prefab` 注册表）
3. 由 AI 沿“入口 TS → 打开 UI / 事件 / 配置 / util”链路，判断动态加载路径、运行时拼接资源名、按 appName / language / region / feature flag 选择的资源
4. 检查 Prefab 的脚本组件、子节点图片、图集引用
5. 检查 Atlas / Spine / Config 是否由工具类动态拼接路径
6. 使用 `cli-anything-cocoscreator asset deps` 展开 prefab / asset 的**静态 outgoing 依赖**（贴图、子 prefab、字体、材质等）
7. 使用 `cli-anything-cocoscreator asset uuid` + `asset refs` 反查“某个 TS / prefab / 资源被哪些 prefab / 场景 / 资源引用”，尤其适合：
   - 先拿某个 TS 脚本的 uuid
   - 再查哪些 prefab 引用了这个脚本
   - 再对这些 prefab 运行 `asset deps`，补齐脚本绑定带来的资源依赖
8. 将 AI 推断出的**动态依赖**与 CLI 找到的**静态依赖**合并去重，形成最终资源清单
9. 如用户提供并允许，可借助 `cli-anything-cocoscreator`（参考：`https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/README.md`）做批量核对

**不要只依赖 UIConfig。** UIConfig 只能帮助定位入口 prefab，不能覆盖：

- 运行时字符串拼接路径
- prefab 内部静态挂载的字体 / 材质 / 子 prefab / SpriteFrame
- TS 脚本被 prefab 反向引用后带出的资源
- 按 appName / 区域 / 语言切换的资源分支

当使用 `cli-anything-cocoscreator` 时，先让结果服务于“列全资源清单”，不要直接把它的输出当最终结论；最终结论必须由 AI 合并动态链路后给出。

建议输出格式：

| 资源类型 | 路径 | 来源 | 是否必须 |
|---------|------|------|---------|
| Prefab | `assets/resources/prefab/rank/RankPanel.prefab` | UIConfig | 是 |
| Sprite | `assets/resources/ui/rank/icon_top1.png` | Prefab 引用 | 是 |
| Atlas | `assets/resources/ui/rank/rank.plist` | 动态加载 | 是 |
| Json | `assets/resources/config/rankReward.json` | TS 读取 | 视功能而定 |

---

### 第 5 步：在目标项目构建图谱并做差异分析

开始本步骤前：先读取 `manifest.md`、`03-source-code-closure.md`、`04-source-resource-closure.md` 和 `05-target-gap-analysis.md`（如果存在）。

完成本步骤后：写回 `05-target-gap-analysis.md`，并更新 `manifest.md` 中第 5 步状态。

在目标项目构建代码图谱，重点回答两个问题：

1. **目标项目是否已经有同名 / 同职责功能？**
2. **目标项目缺失哪些代码与资源？**

对照源项目的代码清单和资源清单，逐项比对：

#### 5.0 目标项目原生替代能力识别（必做）

在判断“目标缺失某能力”之前，必须先检查目标项目是否已经存在可复用的**原生替代能力**，不能只按文件名是否一致来判断。

至少要依次检查三类替代关系：

1. **同名实现**：文件名、类名、资源名基本一致；
2. **同职责但异名实现**：命名不同，但承担相同业务职责；
3. **同流程但不同分层实现**：目标项目虽然没有一一对应的源文件，但已经通过不同架构分层承接了相同流程。

常见场景：

- 源项目有 `RankApi.ts`，目标项目改为统一 `ActivityService` / `TaskService`
- 源项目有独立入口浮层，目标项目把入口能力并到宿主面板或通用 Widget
- 源项目有单独 `Config.ts`，目标项目改为 JSON / 常量表 / 宿主配置中心

建议输出一张替代能力识别表：

| 源能力 | 目标同名实现 | 目标同职责异名实现 | 最终动作 | 说明 |
|---|---|---|---|---|
| `assets/...` | 有 / 无 | `assets/...` / 无 | 复用 / 适配 / 新增 | 说明原因 |

要求：

- 若目标项目已有可承接的原生能力，应优先复用或适配，不应机械复制一套源实现。
- 只有在确认目标不存在等价能力，或现有能力无法承接该职责时，才能判定为“缺失需新增”。
- 若是否可复用存在争议，应在 `05-target-gap-analysis.md` 中明确列为待确认项，不要直接按“缺失”处理。

#### 代码差异

| 源文件/能力 | 目标项目现状 | 动作 |
|------------|-------------|------|
| RankPanel | 不存在 | 新增 |
| RankItem | 有同类列表项基类 | 适配复用 |
| RankApi | 目标已有统一排行榜接口模块 | 对接现有实现 |

#### 资源差异

| 源资源 | 目标项目现状 | 动作 |
|-------|-------------|------|
| RankPanel.prefab | 不存在 | 复制并修复引用 |
| icon_top1.png | 存在但命名不同 | 复用并改路径 |
| rankReward.json | 不存在 | 新增 |

#### 5.x 职责等价性差异分析（必做）

完成代码差异表和资源差异表后，必须继续做**职责等价性差异分析**。

目标是回答：

- 源功能的关键职责层，在目标项目中是否都存在？
- 这些职责层是否只是“有对应文件”，还是“职责也完整保留”？
- 是否存在“主要面板已迁入，但入口职责、初始化链路、事件链或配置链被削弱/遗漏”的情况？

必须基于第 3 步输出的职责层表逐项对照，建议输出：

| 职责层 | 源项目实现 | 目标项目现状 | 是否等价 | 差异说明 | 后续动作 |
|---|---|---|---|---|---|
| 触发层 | `assets/...` | 已有 / 缺失 / 部分存在 | 是/否/部分 | 说明差异 | 新增 / 适配 / 复用 / 不迁移 |
| 展示层 | `assets/...` | ... | ... | ... | ... |
| 数据层 | `assets/...` | ... | ... | ... | ... |
| 事件层 | `assets/...` | ... | ... | ... | ... |
| 配置层 | `assets/...` | ... | ... | ... | ... |

判定要求：

- “目标有同名文件”不等于“职责等价”。
- “目标已有主面板 / 主 prefab”不等于“功能完整”。
- 如果关键职责层缺失，必须在 `05-target-gap-analysis.md` 明确标记为功能缺口。
- 如果是“已迁入但职责被削减”，必须明确写成“部分等价”，不能写成“已完成”。

---

### 第 6 步：迁移代码与资源

开始本步骤前：先读取 `manifest.md`、`05-target-gap-analysis.md` 和 `06-migration-actions.md`（如果存在）。

完成本步骤后：把本轮实际改动按时间追加写入 `06-migration-actions.md`，并更新 `manifest.md` 中第 6 步状态。

**阶段边界要求：第 6 步只执行迁移动作与动作记录，不要提前执行 TypeScript / lint / 构建 / Cocos build 等验证命令。** 所有验证类命令必须统一放到第 7 步执行并写入 `07-verification.md`。如果在第 6 步为了辅助迁移做了只读检查（如确认文件是否存在、资源路径是否可解析），只能作为迁移动作依据记录，不应把它当作最终验证结论。

执行迁移时遵循以下策略：

#### 6.1 代码迁移

- 新建目标项目缺失的业务 TS 文件
- 调整 import 路径到目标项目实际目录
- 替换源项目特有的：
  - 事件枚举
  - UI 注册 ID
  - 网络接口入口
  - bundle 名
  - 资源根路径
  - App/子游戏标识
- 若目标项目已有同类能力，只补功能增量，不复制底层通用实现

#### 6.2 资源迁移

- 复制缺失资源文件
- 检查 `.meta` 是否需要保留或重新生成
- 若跨项目复制 `.meta` 可能引发 UUID/引用问题，优先遵循目标项目资源管理方式
- 修复 Prefab / Atlas / SpriteFrame 的路径引用问题
- 跨项目复制 Prefab 后，如果为了保持 Prefab 内部静态 UUID 引用可解析而临时引入了隔离依赖目录（例如 `rank_deps/`、`migrated_deps/`），必须在 `06-migration-actions.md` 记录原因、包含哪些资源、后续如何在编辑器中切回目标项目原生资源，以及何时可以清理该目录
- 对目标项目已有的 coin / head / font / material / common texture 等资源，必须优先判断是否可直接复用，不得因为源 Prefab 的静态 uuid 引用方便，就默认复制一份到 `rank_deps/`、`migrated_deps/` 等隔离目录。
- 若为了让跨项目复制的 Prefab 先保持静态依赖可解析而临时复制到隔离依赖目录，必须把它标记为**过渡方案**，不得默认视为最终落地结果。
- 对隔离依赖目录中的资源，必须尽早判断其是否与目标项目原生资源“同名且同职责”；若目标原生资源已经存在且足以复用，应优先规划回切，不要把重复资源长期保留在隔离目录中。

#### 6.2.x 过渡方案生命周期（必做）

若本轮迁移引入了 `rank_deps/`、`migrated_deps/` 或其他隔离依赖目录，除了记录“这是过渡方案”之外，还必须进一步记录其**生命周期**，避免过渡目录长期常驻。

至少要明确：

- 引入原因：为什么当前必须保留该过渡目录；
- 依赖对象：哪些 Prefab / 资源 / 功能链仍依赖它；
- 退出条件：达到什么条件后应切回目标项目原生资源或正式目录；
- 最晚清理时机：应在本轮验收前、编辑器修复后，还是下一轮资源回切任务前完成清理。

建议输出：

| 过渡目录 | 引入原因 | 当前依赖对象 | 退出条件 | 最晚清理时机 |
|---|---|---|---|---|
| `rank_deps/` | 说明原因 | `assets/...` | 说明条件 | 说明时机 |

要求：

- 若没有明确退出条件，不得把该过渡方案视为已闭环。
- 若迁移结束时仍保留过渡目录，必须在 `07-verification.md`、`SUMMARY.md` 中继续跟踪，不得只在 `06-migration-actions.md` 提一次就结束。

#### 6.3 功能接入

常见接入点：

- UIConfig / PanelConfig 注册
- 子游戏入口 preload / init
- 路由/按钮点击入口
- 事件监听注册
- 网络协议声明
- 多语言 key 注册

若目标项目已有排行榜框架但缺少具体业务页，**只新增 TS 功能，不重复引入整套排行体系**。

---

### 第 7 步：修复迁移后的路径与缺失问题

开始本步骤前：先读取 `manifest.md`、`06-migration-actions.md` 和 `07-verification.md`（如果存在）。

完成本步骤后：写回 `07-verification.md`，并更新 `manifest.md` 中第 7 步状态。流程结束时，额外生成或更新 `SUMMARY.md` 作为跨对话恢复入口；随后必须读取 `USAGE_MONITORING.md` 并生成或更新 `MONITORING.md`，记录本次 skill 使用效果、评分、证据路径、问题与优化建议。

迁移完成后重点检查：

1. import 是否都能解析
2. Prefab 绑定脚本是否存在丢失
3. 动态加载路径是否能在目标项目找到对应资源
4. 枚举 / 常量 / UI ID 是否已注册
5. 本地化 key 是否缺失
6. 网络接口返回结构是否一致
7. 目标项目是否存在同名类/资源冲突

推荐至少运行：

```bash
# 目标项目内执行 TypeScript / lint / 构建检查（按项目实际命令）
```

验证命令要求：

- 只在第 7 步执行 TypeScript / lint / Cocos build / 构建检查；不得在第 6 步提前执行。
- 不要假设目标项目一定安装了 TypeScript CLI。若 `npx tsc` / `tsc` 不可用，**不得擅自安装依赖**，应在 `07-verification.md` 中如实记录命令、失败原因和未安装依赖的事实，并建议通过 Cocos Creator 编辑器构建或项目既有构建命令验证。
- 若项目没有标准验证命令，也应至少执行静态检查：import 路径、Prefab 依赖 `asset deps`、脚本 uuid / refs、动态资源路径、UIConfig、i18n key、协议字段和同名冲突。
- 对 `asset refs` 查不到脚本反向引用但代码运行时依赖该脚本的情况，必须标为风险：提示在 Cocos 编辑器中打开对应 Prefab 确认脚本组件是否绑定。

如果没有标准命令，也应通过静态检查给出未完成项。

#### 7.0 验证等级（必做）

最终验证时，必须明确声明本次迁移实际达到的**验证等级**，不能把不同强度的验证混为一谈。

建议按以下分级记录：

- **L1：静态结构验证**
  - import 路径
  - 资源路径
  - UIConfig / 常量 / i18n / 协议字段
  - Prefab 依赖 `asset deps`
  - 脚本 `uuid + refs`
- **L2：工程编译验证**
  - `tsc` / `npx tsc`
  - lint
  - 项目已有的静态构建检查
- **L3：编辑器装配验证**
  - Prefab 脚本组件是否绑定
  - Inspector 引用是否完整
  - 节点拖拽绑定、资源引用是否在编辑器内正常
- **L4：运行态功能验证**
  - 真实点击入口
  - 请求 / 回包 / 刷新链路
  - UI 展示、事件响应、交互流程在运行态确认

要求：

- `07-verification.md`、`SUMMARY.md` 和最终回复中都应声明本次达到的最高验证等级。
- 若仅做到 L1 / L2，则凡是需要 L3 / L4 才能确认的结论，必须降级表述，不得直接宣称“已完整可用”。
- 若关键完成项只完成了低等级验证，应优先标记为 `partial` 或在风险项中明确说明。

建议输出：

| 验证等级 | 是否完成 | 证据 | 说明 |
|---|---|---|---|
| L1 | 是/否 | `07-verification.md` 相关段落 |  |
| L2 | 是/否 | 命令或日志 |  |
| L3 | 是/否 | 编辑器检查说明 |  |
| L4 | 是/否 | 运行态验证说明 |  |

#### 7.x 重复资源审计与过渡目录清理（必做）

若迁移过程中引入了 `rank_deps/`、`migrated_deps/` 或其他隔离依赖目录，验证阶段必须额外执行**重复资源审计**。

审计目标：

1. 检查隔离目录中的资源，是否与目标项目原生目录存在同名资源；
2. 判断这些资源是否属于同职责资源（例如 coin、head、font、material、common texture 等目标项目本已存在的公共资源）；
3. 若目标项目原生资源已存在且可复用，应优先将 Prefab / 资源引用切回目标原生资源；
4. 对仍保留在隔离目录中的重复资源，必须在 `07-verification.md`、`SUMMARY.md` 中列为待清理项，不得默认为最终方案。

建议输出：

| 隔离目录资源 | 目标原生资源 | 是否同名 | 是否同职责 | 当前处理 | 后续动作 |
|---|---|---|---|---|---|
| `rank_deps/...` | `assets/...` | 是/否 | 是/否 | 保留 / 回切 / 待确认 | 清理 / 保留 / 人工确认 |

判定要求：

- 若只是为了保住 Prefab 静态 uuid 引用而复制了目标项目本已存在的等价资源，该情况应视为**过渡性重复资源**。
- 过渡性重复资源不应在最终结论中被当作“正式新增资源”。
- 如果存在大量同名同职责重复资源，但未在验证与总结中标出，应视为迁移收尾不完整。

#### 7.y 职责级验证与完成判定（必做）

除静态检查（import、Prefab、资源路径、UIConfig、i18n、协议等）外，还必须执行**职责级验证**。

职责级验证不是检查“文件是否存在”，而是检查：

- 源项目中的关键职责层，目标项目是否逐项保留；
- 是否存在职责被削减、初始化链路断裂、事件链缺失、配置链未接回、入口只剩跳转但不再承担原有展示职责等情况。

建议输出：

| 验证项 | 检查方式 | 结果 | 说明 |
|---|---|---|---|
| 关键职责层是否全部存在 | 对照第 3 步职责层表 | 通过 / 不通过 / 部分通过 |  |
| 关键职责层是否职责等价 | 对照第 5 步职责差异表 | 通过 / 不通过 / 部分通过 |  |
| 是否存在初始化链路断点 | 检查 init / preload / register / event bind | 是/否 |  |
| 是否存在事件链缺失 | 检查 event enum、dispatch、listener | 是/否 |  |
| 是否存在配置链缺失 | 检查 UIConfig / 常量 / i18n / feature switch | 是/否 |  |
| 是否存在“主资源已迁、关键职责未迁” | 结合代码和资源综合判断 | 是/否 |  |

完成判定要求：

- **只有当关键职责层均已迁入且职责等价时，才能标记为 `completed`。**
- 若主要代码和资源已迁入，但存在一个或多个关键职责层缺失、削减或未验证，应标记为 `partial`，不得标记为 `completed`。
- 若流程因缺少关键确认、关键依赖不可用或关键职责无法验证而中断，应标记为 `blocked`。
- 在 `SUMMARY.md` 和 `MONITORING.md` 中，必须显式报告职责级验证结论，不能只报告静态验证结果。

---

## 输出要求

以下输出要求只适用于“最终输出触发条件”已经满足的情况。不得因为完成了第 1 步、第 2 步或其他中间步骤，就提前套用最终输出格式并停止流程。

执行此 skill 后，最终输出必须包含：

### 0. 使用效果监控输出

每次真实执行迁移流程后，最终回复必须报告：

- 是否已生成 `MONITORING.md`
- 监控记录路径
- 本次 skill 使用总评分
- 本次流程状态：`completed` / `blocked` / `partial` / `abandoned`
- 主要扣分项或风险项
- 是否建议更新 `SKILL.md`

示例：

```text
监控记录已输出：<target-project>/.claude/cocos-feature-migration/<feature-slug>/MONITORING.md
本次 skill 使用评分：82/100
流程状态：blocked
主要扣分项：资源闭包尚未执行，原因是等待用户确认精确入口。
是否建议更新 SKILL.md：否
```

如果本次只是咨询、测试或缺少目标项目路径导致无法生成项目级监控文件，必须说明：

```text
本次未生成 MONITORING.md：原因是未进入真实迁移流程 / 缺少目标项目路径。
```

### 1. 迁移摘要

- 源项目路径
- 目标项目路径
- 功能名
- 入口文件
- 迁移文件数
- 新增资源数
- 复用目标项目能力列表

### 2. 代码迁移清单

逐项列出：新增 / 复用 / 适配 / 未迁移。

### 3. 资源迁移清单

逐项列出：已存在 / 新增 / 改路径 / 待人工确认。

### 4. 职责等价性摘要

必须总结：

- 源功能识别出了哪些关键职责层
- 目标项目已完整保留了哪些职责层
- 哪些职责层仅部分保留
- 哪些职责层缺失
- 最终状态为什么是 `completed` / `partial` / `blocked`

建议格式：

| 职责层 | 结果 | 说明 |
|---|---|---|
| 触发层 | 完整 / 部分 / 缺失 |  |
| 展示层 | 完整 / 部分 / 缺失 |  |
| 数据层 | 完整 / 部分 / 缺失 |  |
| 事件层 | 完整 / 部分 / 缺失 |  |
| 配置层 | 完整 / 部分 / 缺失 |  |

### 5. 风险与待确认项


例如：

- 排行榜接口字段在两个项目中可能不一致
- 目标项目缺少某字体或图集
- 某 Prefab 在编辑器中需要重新绑定脚本
- 某动态路径依赖 bundle 名，尚需用户确认

---

## 排行榜迁移示例

用户输入：

- 源项目：`/Users/Work/wenext/cocos-game-greedybox`
- 目标项目：`/Users/Work/wenext/cocos-game-roulette`
- 功能：`排行榜`
- 默认动作：两个项目先检查状态；若第 1 步发现本地未提交内容则自动 stash，再拉取远程更新；后续步骤沿用该基线，不再重复 stash / pull

执行要点：

### 源项目 A

1. 切到 `/Users/Work/wenext/cocos-game-greedybox`
2. 查看状态；若第 1 步工作区不干净则自动 stash，随后 pull 最新代码；后续第 2~7 步不再重复做 Git 清理
3. 构建 TS 图谱
4. 搜索“排行榜 / rank / ranking / leaderboard / panel 名 / UI ID”
5. 列出候选入口 TS / prefab
6. **如果候选入口超过 1 个，先向用户确认精确功能入口**（例如：`PanelGeneralRankPool.ts`、`panelGeneralRankPool.prefab`、`PanelGeneralRank.prefab` 三选一）
7. 从确认后的入口 TS / prefab 汇总完整功能代码清单
8. 从 TS + Prefab + UIConfig + `cli-anything-cocoscreator` 盘点资源列表
9. 对关键 prefab 跑 `asset deps`，对关键 TS 跑 `asset uuid` + `asset refs` 反查 prefab 引用

### 目标项目 B

1. 切到 `/Users/Work/wenext/cocos-game-roulette`
2. 查看状态；若第 1 步工作区不干净则自动 stash，随后 pull 最新代码；后续第 2~7 步不再重复做 Git 清理
3. 构建 TS 图谱
4. 对照源项目资源清单检查缺失
5. 迁移缺失资源与代码
6. 修复 import 路径、UI 注册、动态加载路径、资源缺失
7. 若目标项目已有排行榜公共层，仅新增缺少的业务 TS 功能

---

## 推荐命令模式

以下是执行思路，不要假设所有项目命令完全一致；如果命令不存在，需要按项目实际情况调整。

```bash
# 第 1 步的 Git 状态初始化（只执行一次）
git status --short

# 若第 1 步工作区不干净，则先自动暂存，再拉最新
# 后续第 2~7 步沿用该基线，不再重复 stash / pull
git stash push -u -m "claude-feature-migration-rank-$(date +%Y%m%d-%H%M%S)"
git pull --rebase

# 关键词搜索
rg -n "排行榜|rank|ranking|leaderboard" assets

# 资源搜索
find assets -iname "*rank*" -o -iname "*leaderboard*"
```

如需 `cli-anything-cocoscreator`，先按当前运行环境检查本机命令是否存在；若不存在，先停止分析并引导用户参考部署指南完成安装：`https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/DEPLOY.md`。

可用检查命令：

- macOS / Linux / WSL / Git Bash：`command -v cli-anything-cocoscreator`
- PowerShell：`Get-Command cli-anything-cocoscreator`
- cmd：`where cli-anything-cocoscreator`

确认可用后，再优先组合使用以下命令：

- `asset deps <project> <asset>`：展开 prefab / asset 的静态依赖
- `asset uuid <project> <asset>`：获取 TS / prefab / 资源的 uuid
- `asset refs <project> <uuid>`：反查哪些项目文件引用了该 uuid

推荐组合：先对入口 TS 相关 prefab 做 `deps`，再对关键 TS 脚本做 `uuid + refs`，最后对 refs 找到的 prefab 再做 `deps`。

---

## 检查清单

- [ ] 已完成第 1 步 Git 状态检查，并记录是否执行 stash / pull
- [ ] 已明确后续子步骤不再重复执行 stash / clean / pull
- [ ] 已按当前平台确认 `cli-anything-cocoscreator` 可用，或已提示用户按部署指南安装
- [ ] 已与用户确认精确功能入口（如存在多个候选）
- [ ] 已确认功能边界（不只精确入口）
- [ ] 已定义最小完成标准 / 完整完成标准
- [ ] 源项目已整理功能代码闭包
- [ ] 源项目已整理完整资源清单
- [ ] 目标项目已完成代码差异分析
- [ ] 已检查目标项目同职责异名替代能力
- [ ] 目标项目已完成资源差异分析
- [ ] 已迁移缺失代码
- [ ] 已迁移缺失资源
- [ ] 已修复 import / UI / bundle / 动态路径问题
- [ ] 已标注过渡资源目录的退出条件与最晚清理时机
- [ ] 已声明本次验证等级
- [ ] 已列出风险项和人工确认项

---

## 相关技能

- `cocos-asset-management` — 动态资源路径、预加载、缓存、释放
- `cocos-ui-system` — UIConfig、Panel 注册、弹窗入口
- `cocos-network` — 接口封装与协议适配
- `cocos-localization` — 文案 key 与语言资源迁移
- `cocos-node-binding` — Prefab 节点绑定修复
- `cocos-code-review` — 迁移后做语义级代码审查
