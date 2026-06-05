---
name: cocos-feature-migration
description: 在两个 Cocos Creator 项目之间迁移业务功能时使用，包括入口定位、代码图谱分析、依赖资源盘点、缺失资源补齐、代码落地与路径修复。当用户说“迁移功能”、“移植功能”、“从项目A迁到项目B”、“migrate feature”或描述跨项目复制某个业务模块时使用此 skill。
argument-hint: [源项目路径] [目标项目路径] [功能名]
allowed-tools: [Read, Write, Edit, Bash, Agent, SendMessage, TeamCreate, TeamDelete, TaskCreate, TaskGet, TaskList, TaskUpdate, mcp__ts-graph__ts_graph_stats, mcp__ts-graph__ts_graph_build, mcp__ts-graph__ts_search_symbols, mcp__ts-graph__ts_get_file_context, mcp__ts-graph__ts_query_symbol, mcp__ts-graph__ts_get_review_context]
---

# Cocos 功能迁移指南

你是 Cocos Creator 功能迁移专家。目标是在**保留目标项目既有架构和目录规范**的前提下，把某个业务功能从源项目迁移到目标项目，而不是机械复制文件。

## feature_slug 生成规则（硬规则）

`feature_slug` 必须尽量表达“业务对象 + 功能类型”，不能只保留最短英文关键词而丢弃明确的功能类型。它会同时影响：源分析目录、目标迁移目录、manifest 中的 `feature_slug`、以及默认目标迁移分支 `feature/migration_<feature-slug>`。

生成规则：

1. 优先保留功能名中的英文业务关键词，并统一小写。
   - `jackpot榜单` 中的业务关键词是 `jackpot`。
   - `vip任务` 中的业务关键词是 `vip`。
2. 对常见中文功能类型做稳定英文映射：
   - `榜单` / `排行` / `排行榜` / `排名` -> `rank`
   - `任务` -> `task`
   - `活动` -> `activity`
   - `商城` -> `shop`
   - `背包` -> `bag`
   - `记录` / `历史记录` -> `record`
   - `规则` -> `rule`
   - `奖励` -> `reward`
   - `入口` -> `entry`
   - `弹窗` -> `popup`
3. 当功能名由“英文业务对象 + 中文功能类型”组成时，必须组合为 snake_case：`<business>_<feature-type>`。
   - `jackpot榜单` -> `jackpot_rank`
   - `jackpot排行` -> `jackpot_rank`
   - `vip任务` -> `vip_task`
   - `活动奖励` -> `activity_reward`
4. 如果功能名只有中文功能类型，没有明确业务对象，则使用功能类型 slug：
   - `排行榜` -> `rank`
   - `历史记录` -> `record`
5. 如果用户明确提供 slug，以用户提供为准；但若用户未指定，主控不得把 `jackpot榜单` 简化为 `jackpot`。
6. `feature_slug` 只使用小写英文、数字和下划线 `_`；不得使用中文、空格、`/`。如原始名称包含连字符或其他分隔符，应统一归一为 `_`。

示例：

| 功能名 | feature_slug | 默认迁移分支 |
|---|---|---|
| `jackpot榜单` | `jackpot_rank` | `feature/migration_jackpot_rank` |
| `jackpot排行` | `jackpot_rank` | `feature/migration_jackpot_rank` |
| `排行榜` | `rank` | `feature/migration_rank` |
| `vip任务` | `vip_task` | `feature/migration_vip_task` |
| `活动奖励` | `activity_reward` | `feature/migration_activity_reward` |

## 执行模型：单入口 Skill + 阶段 Agent Team

本 skill 仍然是用户唯一入口；用户只需要调用 `/cocos-feature-migration <源项目路径> <目标项目路径> <功能名>`。对于完整功能迁移任务，默认采用“主控 + 阶段 agent team”的执行模型，以降低主会话上下文压力。

### 主控职责

主控即当前会话，负责：

- 解析用户参数与 feature slug；
- 执行硬门禁前置检查：ts-graph MCP、`cli-anything-cocoscreator`、Git 基线；
- **在创建阶段 agent team、启动任何子 agent、执行目标项目 stash / pull / checkout / 业务修改之前，完成目标项目 feature 分支确认门禁；**
- 创建或维护团队任务、manifest、source-manifest 的最终状态；
- 处理用户确认与阻塞判断；
- 只读取 compact 摘要作为跨阶段事实基线；
- 裁定最终状态：`static-pass` / `partial-pass-static` / `blocked-static` / `completed` / `partial` / `blocked` / `abandoned`；
- 向用户输出最终结果。

### 推荐阶段 Agent

完整迁移任务优先拆给以下阶段 agent；agent prompt 存放在本 skill 目录的 `agent-prompts/` 下：

| Agent | 负责步骤 | 主要产物 | 是否允许改业务代码 |
|---|---|---|---|
| `source-analyzer` | 第 2~4 步 | 源侧步骤文档、`源侧摘要.compact.md` | 否 |
| `target-analyzer` | 第 5 步 | `05-目标差异分析.md`、`目标差异摘要.compact.md` | 否 |
| `migration-applier` | 第 6 步 | 目标代码/资源改动、`06-迁移动作记录.md`、`迁移状态摘要.compact.md` | 是，且应是唯一写业务代码的 agent |
| `migration-verifier` | 第 7 步 | `07-迁移验证.md`、`迁移总结.md`、`使用效果监控.md`、`最终状态摘要.compact.md` | 通常否；只做验证和文档写回 |

### Agent 协作硬规则

1. 子 agent 必须把完整证据写入步骤 md 或 `logs/`，只向主控返回 compact 摘要。
2. 子 agent 返回内容默认控制在 200 行以内，不得返回完整源码、完整 CLI 输出、完整 Prefab 依赖树。
3. 只有主控可以向用户提问；子 agent 只能上报 `needs_user_confirmation`、`confirmation_topic` 和候选项。
4. 只有主控裁定最终状态；子 agent 只能给出 `final_status_recommendation`。
5. `migration-applier` 是唯一业务代码/资源写入 agent，避免多 agent 并发修改同一批文件。
6. manifest / source-manifest 可由阶段 agent 草拟或更新，但主控必须最终收敛其状态，避免互相覆盖。
7. 若上下文、权限或任务规模不适合创建 agent team，可退化为单会话执行，但仍必须遵守 compact 和 logs 规则。
8. 子 agent 不得依赖 TaskList 才开始执行阶段任务；主控 prompt 已给出明确任务时，必须直接按 prompt 执行，TaskList 为空不构成阻塞。
9. `migration-verifier` 发现 L1 静态问题后，主控可将问题回派给 `migration-applier` 自动修复，默认最多 2 轮；超过 2 轮仍未闭合时，应标记 `blocked-static` 或 `partial-pass-static` 并输出风险。
10. **主控必须复核子 agent 摘要与步骤产物是否一致。** 若 agent compact 摘要与其写入的步骤 md / manifest 矛盾，以更保守的状态为准。尤其是源侧 `02-源入口候选.md`、`源分析清单.md` 或 compact 中出现 `needs_user_confirmation: true`、`候选入口超过 1 个`、`待确认`、`等待用户确认`、`边界不清`、`feature-boundary`、`exact-entry` 等信号时，主控必须暂停并向用户确认，不得继续第 3~7 步。
11. **确认项不得被后续阶段静默清除。** 任何阶段发现或继承的待确认项，只有在用户明确答复或有 `target-existing` / `user-specified` / `backend-doc` 等证据关闭后，才能从 manifest 中清除；否则最终 `迁移清单.md` 必须保留 `needs_user_confirmation: true` 与具体 `confirmation_topic`。
12. **目标 feature 分支确认是 agent 启动前门禁。** 主控在创建阶段 agent team、启动 `source-analyzer` / `target-analyzer` / `migration-applier` / `migration-verifier`、以及对目标项目执行 stash / pull / checkout / 创建分支 / 业务修改之前，必须先完成目标项目 feature 分支确认。若该门禁需要用户确认，必须暂停，不能先启动子 agent 继续分析或修改。

---

## 上下文预算与大输出治理

为避免上下文耗尽，本 skill 默认采用 compact 摘要 + logs 原始证据模式。

### Compact 摘要

每完成对应阶段，必须同步生成或更新 compact 摘要：

| 阶段 | compact 文件 | 作用 |
|---|---|---|
| 源侧第 2~4 步 | `源侧摘要.compact.md` | 记录源入口、边界、代码闭包、资源闭包、职责层、完成定义 |
| 目标第 5 步 | `目标差异摘要.compact.md` | 记录目标同名/同职责能力、缺口、复用策略、迁移策略 |
| 第 6 步 | `迁移状态摘要.compact.md` | 记录新增/修改/复制/复用/过渡目录/待验证项 |
| 第 7 步 | `最终状态摘要.compact.md` | 记录验证等级、最终状态建议、风险和下一步 |

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

## 默认快速静态迁移策略（性能优化）

除非用户明确要求完整编译/构建/运行验证，本 skill 默认采用**快速静态迁移策略**：

1. **不检测、不运行、不依赖 `tsc` / `npx tsc` / `node_modules/.bin/tsc` / `cocos` / `npm run build` / `npm run typecheck`。**
   - 第 7 步也不主动探测这些命令是否存在。
   - 不安装依赖，不为了验证修改开发环境。
   - 若用户明确要求编译/构建验证，才按项目实际命令执行，并把验证等级提升到 L2。
2. **代码闭包主要依赖 ts-graph MCP、关键词搜索、import/call 关系和代码阅读。**
   - 不把 `cli-anything-cocoscreator` 当作代码闭包工具。
3. **资源闭包与 Prefab 静态验证必须使用 `cli-anything-cocoscreator`。**
   - `asset deps` 用于展开 prefab / asset 的静态 outgoing 依赖。
   - `asset uuid` + `asset refs` 用于脚本/资源反向引用与 prefab 绑定检查。
   - 验证阶段必须对关键 prefab 输出 `missing=0` / unresolved 数量结论。
4. **最终默认最高承诺为 L1 静态结构验证。**
   - L1 通过只能说明代码结构、资源依赖、UIConfig、事件、协议字段、Prefab deps 在静态层闭合。
   - 未经用户额外提供编辑器/运行环境，不宣称 L2/L3/L4 通过。
5. **目标差异分析默认轻量化。**
   - 必须回答“目标是否已有同功能、可复用公共能力、缺失代码、缺失资源、必须适配点、风险”。
   - 不做冗长的同职责替代表格，除非目标确实存在多个可替代实现或用户要求详细审计。
6. **迁移动作必须强制关键文件自检。**
   - `migration-applier` 修改关键文件后，必须读取目标实物并记录证据，不能只报告“已修”。
   - 自检结论必须写入 `06-迁移动作记录.md` 或 `迁移状态摘要.compact.md`。

### 快速静态状态定义

| 状态 | 含义 | 可作为最终状态 |
|---|---|---|
| `static-pass` | L1 静态结构验证通过，关键职责层在静态层等价，无已知 L1 阻塞；未做 L2/L3/L4。 | 是 |
| `partial-pass-static` | L1 静态结构基本通过，但存在关键职责层部分等价、fallback 策略、运行配置链未恢复或需业务确认的风险；未做 L2/L3/L4。 | 是 |
| `blocked-static` | L1 静态验证仍有阻塞，例如关键 DTO/enum 缺失、import 明显不存在、Prefab `missing>0`、关键脚本未绑定或关键资源缺失。 | 是 |

这些状态不取代传统状态，而是在“默认不做 tsc/cocos/editor/runtime 验证”的前提下提供更准确的结果表达。若用户明确要求完整验证，可继续使用 `completed` / `partial` / `blocked`。

---



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
2. **源代码结构保真优先。** 对本次 feature 私有代码、工具方法、配置字段、model / bll / panel / component 的代码结构与实现，默认应尽最大可能保持与源项目一致，包括字段名、静态属性/方法形态、getter/setter 结构、默认值、判断逻辑和文件内组织方式。不得为了“看起来更符合目标项目风格”而自行改写、包装、私有化、重命名或压缩实现。
3. **只做必要目标适配。** import 路径、bundle 名、UI 注册路径、资源根路径、目标已有公共框架接入等确实必须适配的部分可以修改，但必须局部、最小化，并在 `06-迁移动作记录.md` 记录差异与原因。
4. **优先复用目标项目已有能力。** 目标项目已有通用组件、工具类、网络层、UI 管理时，不要重复拷贝同类实现；但复用不得改变源 feature 私有逻辑结构，除非有 `target-existing` / `user-specified` / `backend-doc` 证据。
5. **资源必须成组校验。** 不能只迁 `.png`，还要检查 `.meta`、Prefab 引用、Atlas、Spine、字体、配置 JSON、本地化文案。
6. **迁移结果必须可验证。** 至少要能说明入口如何触发、缺了哪些依赖、补了哪些资源、还剩哪些人工确认项。
7. **按职责层判断功能是否完整，不要只看文件是否存在。** 迁移分析与最终验证时，必须先识别源功能的关键职责层，再逐层判断目标项目是否保留这些职责。职责层不固定，不强制要求某种模板；应根据功能形态按需拆分为一层或多层，例如：触发层、展示层、详情层、数据层、事件层、配置层、资源层、接入层、平台桥接层等。若某一关键职责层缺失，即使主要 TS、Prefab、资源已经迁入，也不得直接判定该功能已完整迁移。
8. **源行为保真优先，目标适配必须有证据。** 迁移默认保持源项目业务语义；如果需要为了目标项目适配而改写接口、请求参数、事件、配置开关、native/KV 读取、app/platform 分支等关键语义，必须先证明该改写来自目标已有实现、用户明确要求或后端/业务文档。没有证据的 AI 推断只能写入待确认项，不得静默落地。

---

## 迁移保真与隐性依赖规则

本节是功能迁移的硬约束，用于避免“主 UI / 主文件已迁入，但业务行为被削弱或被 AI 推断改写”的问题。

### 1. 业务语义字段禁止静默改写

以下字段属于**业务语义字段**，默认必须从源项目保真迁移，不能因为目标项目名称不同或 AI 推断而静默改写：

- API / deeplink path，例如 `getTotalRankNew`、`getRankConfig`、活动接口地址；
- request body / query 参数中的业务字段，例如 `gameType`、`roomId`、`region`、`range`、`topNum`、`activityType`、`businessType`、`taskType`、`taskData`；
- appName / platform / channel / old-new-interface 分支；
- native bridge / KVStorage key / 远端配置 key；
- timezone / rankType / currency / local-time / region / language / RTL 相关配置；
- event name、event enum、事件派发与监听关系；
- UIID / panel route / bundle 名中承载业务语义的部分；
- model 字段、协议 DTO 字段、奖励状态、活动状态等会影响展示或请求的字段。

如果目标项目必须不同，必须在 `05-目标差异分析.md` 或 `06-迁移动作记录.md` 记录：

| 字段 | 源值 | 目标值 | 变更来源 | 证据 | 是否需要用户确认 |
|---|---|---|---|---|---|
| `getTotalRankNew` | `...` | `...` | source / target-existing / user-specified / backend-doc / inferred | 路径或说明 | 是/否 |

变更来源只能使用：

- `source`：源项目原样迁移；
- `target-existing`：目标项目已有同职责实现明确使用该值；
- `user-specified`：用户明确要求；
- `backend-doc`：后端 / 业务文档明确说明；
- `inferred`：AI 推断。

规则：

- `inferred` 不能作为静默改写依据；涉及 API path、接口分支、native/KV/config、请求参数语义、activity/task 字段时，必须阻塞并交给主控向用户确认。
- 若没有证据支持改写，应保留源值，并把建议适配写入待确认项。
- **代码结构与实现形态也属于保真对象。** 如果源项目中某段 feature 相关实现是 `static xxx` 字段、getter、setter、默认值、枚举类型或数组类型，目标迁移默认必须保留相同结构；不得自行改成 `private _xxx`、固定常量、简化判断、包装方法或不同类型。确需改写时，必须记录为结构差异并提供 `target-existing` / `user-specified` / `backend-doc` 证据，否则应阻塞确认或保持源结构。
- 对 `AppUtil`、`SubGameConfig`、`SubGame` 等承载跨项目差异的文件，迁移 feature 相关片段时也应优先复制源项目片段结构，只改必要的目标业务常量（如用户明确确认的 `businessType`），不能为了统一目标风格重构源片段。

### 2. 条件性 native / KV / config / gating 隐性依赖扫描

这是**条件性通用规则**：不是要求每个项目都必须有 native/KV/gating，而是要求“源项目有就不能漏，没有就不要编”。

迁移每个功能时，必须扫描源项目中与该功能相关的：

- native bridge、KVStorage、local storage；
- 远端配置、活动开关、feature flag、AB 实验、版本灰度；
- appName / platform / channel 分支；
- region / country / language / RTL 分支；
- timezone、rankType、currency、local time 等运行配置；
- openBusinessTypes、betCurrencyTypes、beLocalTime 等活动配置字段；
- 决定入口是否显示、接口走向、请求参数、UI 状态或资源选择的 gating 逻辑。

处理规则：

- 如果源功能存在这类配置 / 开关链路，必须迁移，或说明为什么目标项目不迁移。
- 如果目标项目已有等价链路，必须映射到目标链路，并给出证据路径。
- 如果源功能不存在这类链路，不得凭空新增。
- 不得把源项目的条件展示 / 配置读取链静默改成无条件展示、默认值或空参数。

建议输出表：

| 依赖类型 | 源项目位置 | 源项目行为 | 目标项目状态 | 结论 | 证据 |
|---|---|---|---|---|---|
| native KV | `SubGame.ts#getLuckyGameRankType` | 读取 rankType | 缺失 / 等价 / 不迁移 | 漏迁 / 业务适配 / 待确认 | 路径 |

若源项目没有发现相关依赖，应明确写：

```text
No source-side native/KV/config/gating dependencies found for this feature.
```

### 3. 事件 producer-consumer 闭环检查

对每个 feature 相关事件，必须确认：

1. 在哪里定义；
2. 谁派发；
3. 谁监听；
4. 监听后更新什么 UI / model / state；
5. 目标项目是否完整迁入或有等价替代。

建议输出：

| 事件 | 源项目定义 | 源项目派发 | 源项目监听 | 目标项目状态 | 结论 |
|---|---|---|---|---|---|
| `OnGetTotalRankData` | 有 | `RankModelComp` | `PanelRankComponent` | 已迁 | 通过 |
| `OnJackpotPoolUpdate` | 有 | `UserGameModelComp` | `NodeJackpotComponent` | 缺失 | 漏迁 / 范围外待确认 |

不能只迁 listener 或只迁 event enum；事件闭环缺一环时必须标为“部分等价”或“缺失”。

### 4. 接口分支与请求参数语义检查

凡源项目存在 old/new interface、appName、platform、region、language、currency、local-time 等分支，目标项目必须保留或有明确替代。不得把分支硬编码成 `true` / `false`，除非有用户或业务证据。

请求参数如果从动态值变成常量、空字符串、`0`、`null` 或默认值，必须解释原因并标风险。

建议输出：

| 参数 / 分支 | 源项目 | 目标项目 | 是否业务语义 | 风险 | 证据 |
|---|---|---|---|---|---|
| `isUseOldRankInterface()` | 按 `appName` 判断 | `return false` | 是 | 高 | 路径 |
| `roomId` | 当前房间 | `0` | 是 | 高 / 待确认 | 路径 |

### 5. 三方参考项目对比模式

当用户同时提供“源项目、目标项目、参考/标准答案项目”时，必须采用三方对比，不能把参考项目有而源项目没有的能力直接判定为目标迁移遗漏。

差异分类必须使用：

- **确定问题**：源项目存在，目标项目缺失或错迁，且无业务适配证据；
- **高风险可疑**：源项目与目标项目不同，但可能有业务适配，需要用户或后端确认；
- **合理业务适配**：目标项目已有明确上下文支持该差异；
- **参考项目差异**：参考项目有，但源项目没有，不能作为本次迁移错误。

建议输出：

| 差异项 | 参考项目 | 源项目 | 目标项目 | 分类 | 说明 |
|---|---|---|---|---|---|
| 独立奖池接口 | 有 | 无/非主链 | 无 | 参考项目差异 | 不能单独判错 |
| native rank config | 有 | 有 | 缺失 | 确定问题 | 源目标不等价 |

### 6. 阻断项：必须暂停确认的高风险改写

以下情况必须在 manifest 中写入 `needs_user_confirmation: true`，由主控向用户确认；不得由子 agent 静默继续落地：

1. API path 与源项目不一致，且无 `target-existing` / `user-specified` / `backend-doc` 证据；
2. appName / platform / old-new-interface 分支被删除或硬编码；
3. native / KV / remote config / gating 链被删除、直通或默认值替代；
4. 源项目事件闭环中存在事件未迁移，且无法证明属于范围外；
5. 请求参数从动态值变为空值、`0`、默认值或固定值；
6. `activityType` / `businessType` / `taskType` / `taskData` 被改写；
7. 目标项目没有等价依赖但仍删除源项目逻辑；
8. 本次迁移边界不清，例如“榜单页面”是否包含“Jackpot mode / pool 本体闭环”。

---

## 执行前提

迁移分析默认应基于**已从远程更新后的源项目和目标项目**进行，不应把“是否更新代码”视为可省略步骤。

Git 相关操作在本 skill 中仅视为**第 1 步前置初始化动作**，默认只执行一次。

**目标 feature 分支确认是第 1 步前置动作中的最早门禁**：在创建阶段 agent team、启动任何子 agent、以及对目标项目执行 `stash` / `pull` / `checkout` / 创建分支 / 业务修改前，主控必须先只读确认目标当前分支与候选迁移分支；若触发确认条件，必须先向用户提问并等待答复。不得先启动 source/target/applier/verifier agent 再补问分支。

- `git status --short` 用于记录初始化前工作区状态；
- 若用户提供或目标项目存在需要承接本次迁移的远程 `feature/xxx` 功能分支，必须在目标项目 Git 初始化前向用户做**一次合并确认**：是否需要拉取并切换到该 `feature/xxx` 分支处理本次迁移；
- 用户确认“需要拉取目标 feature 分支”即代表同时授权：拉取远程 `feature/xxx` 分支、切换到该分支、并在该分支执行后续迁移动作；不得再拆成“是否拉取 / 是否切换 / 是否在该分支处理”三个问题重复确认；
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

### Git 远程协议与执行环境预检（第 1 步前置，只读）

在对源项目或目标项目执行任何 `fetch` / `pull` / `checkout` / `switch` / `stash` / 创建分支前，必须先对对应项目做一次**只读 Git 执行环境预检**。该预检的目的，是提前判断远程仓库协议和认证/SSH 环境，避免执行到 `pull` / `fetch` 时才失败。

对源项目和目标项目分别检查：

1. **Git 可执行文件探测**
   - 优先使用 `command -v git`。
   - 若失败且当前环境存在 `/usr/bin/git`，可回退使用 `/usr/bin/git`。
   - 若两者都不可用，停止第 1 步 Git 初始化，写入 `needs_user_confirmation: true`、`confirmation_topic: git-environment`，提示用户修复 Git 环境。
   - 后续第 1 步内所有 Git 命令必须使用已确认的 `git_bin`，不要在同一轮中混用未确认的 `git`。

2. **远程地址与协议识别**
   - 使用已确认的 `git_bin` 执行：`git remote get-url origin`。
   - 根据 `origin` URL 分类：

| URL 形态 | remote_protocol | 示例 |
|---|---|---|
| `git@host:org/repo.git` | `ssh` | `git@github.com:org/repo.git` |
| `ssh://git@host/org/repo.git` | `ssh` | `ssh://git@example.com/org/repo.git` |
| `https://...` | `https` | `https://github.com/org/repo.git` |
| `http://...` | `http` | `http://git.example.com/org/repo.git` |
| 本地路径或 `file://...` | `local` | `/path/repo.git` / `file:///path/repo.git` |
| 其他无法识别形态 | `unknown` | 记录原始形态摘要 |

3. **SSH remote 预检**
   - 若 `remote_protocol=ssh`，必须先检查 SSH 可执行文件：
     - 优先 `command -v ssh`；
     - 若失败但 `/usr/bin/ssh` 存在，后续所有 Git 远程命令必须设置 `GIT_SSH=/usr/bin/ssh`；
     - 若都不可用，停止远程更新，写入 `needs_user_confirmation: true`、`confirmation_topic: git-ssh-environment`，提示用户修复 SSH 环境。
   - 若 SSH 可执行文件有效，后续只读远程探测、`fetch`、`pull`、`ls-remote` 均应复用同一 `git_remote_env`（例如 `GIT_SSH=/usr/bin/ssh`），不得先用一种环境探测、再用另一种环境执行更新。

4. **HTTP(S) remote 预检**
   - 若 `remote_protocol=http` / `https`，必须使用非交互方式做只读远程探测，例如：`GIT_TERMINAL_PROMPT=0 git ls-remote --heads origin`。
   - 若认证失败、凭据缺失或命令需要交互，停止远程更新，写入 `needs_user_confirmation: true`、`confirmation_topic: git-http-auth`，提示用户先完成 Git 凭据配置。
   - 不得让 `git pull` 进入交互式账号、密码或 token 输入状态。

5. **本地 remote 预检**
   - 若 `remote_protocol=local`，确认路径可解析后可继续第 1 步；若路径不存在或不可读，写入 `needs_user_confirmation: true`、`confirmation_topic: git-remote-local`。

6. **只读远程探测与菜单候选使用同一环境**
   - 目标 feature 分支确认菜单中用于判断 `origin/main`、`origin/<current-branch>`、已有迁移分支是否可用的 `ls-remote` / 远程引用检查，必须使用上述 `git_bin` 和 `git_remote_env`。
   - 若远程探测因 SSH / HTTPS 认证失败，不得把对应远程分支作为可执行菜单项展示；只能在“不可用”摘要中说明原因。

`01-前置检查.md` 和 `迁移清单.md` 必须记录以下字段：

| 字段 | 含义 |
|---|---|
| `git_bin` | 本轮确认使用的 Git 可执行文件 |
| `origin_url_masked` | 脱敏后的 `origin` 地址；不得记录 token / 密码 |
| `remote_protocol` | `ssh` / `https` / `http` / `local` / `unknown` |
| `ssh_bin` | SSH remote 使用的 ssh 路径；非 SSH 可为 `null` |
| `git_remote_env` | 后续 Git 远程命令必须携带的环境，例如 `GIT_SSH=/usr/bin/ssh` / `GIT_TERMINAL_PROMPT=0` |
| `remote_probe_result` | 只读远程探测结果：success / failed / skipped，并记录失败摘要 |

脱敏要求：

- `origin_url_masked` 不得写入用户名密码、token、credential helper 输出。
- 对 `https://user:token@host/org/repo.git` 应记录为 `https://***@host/org/repo.git`。
- 对 SSH 地址可保留 host、org、repo，但不要输出本机私钥路径或 ssh config 详细内容。

### 阶段 Agent 工作目录与 worktree 限制

本 skill 的阶段 agent 默认**不使用 Claude Code 的 `isolation: worktree` 启动方式**。主会话根目录可以不是 Git 仓库，也可以不是源项目或目标项目；这不应阻塞阶段 agent 启动。阶段 agent 必须通过 prompt 中的 `source_project` / `target_project` 绝对路径开展工作，而不是依赖主会话当前目录的 Git 上下文。

硬规则：

- 主控启动 `source-analyzer` / `target-analyzer` / `migration-applier` / `migration-verifier` 时，默认 `isolation` 必须使用非 worktree 方式，或直接省略 `isolation`；不得因为“需要隔离”而从主会话根目录创建 Git worktree。
- 主会话当前目录不是 Git 仓库、或不是源/目标项目仓库时，仍然允许启动阶段 agent；agent 必须在命令中使用绝对路径或 `git -C <source_project|target_project>`。
- 阶段 agent 不得把主会话当前目录当作源/目标项目的 worktree 基线；不得基于无关仓库的 `HEAD` 创建迁移 worktree。
- `source-analyzer`：只写源项目分析目录，不需要 worktree 隔离。
- `target-analyzer`：只写目标迁移文档，不需要 worktree 隔离。
- `migration-applier`：是唯一允许写业务代码/资源的 agent；默认直接在主控已确认并切换好的目标项目分支上串行执行，不使用 Claude Code worktree 隔离。
- `migration-verifier`：默认只读验证和写文档，不需要 worktree 隔离。

如果用户明确要求额外隔离，也不得使用主会话根目录隐式创建 worktree；必须先向用户确认隔离方案，并优先采用目标项目内显式、可记录的 Git 分支/目录策略。该例外必须写入 `01-前置检查.md` 和 `迁移清单.md`，包括隔离路径、基线分支、创建命令和清理策略。

如果错误地从非源/目标项目的主会话目录创建 worktree，必须停止并修正 agent 启动方式；不得把该错误视为源/目标项目 Git 状态问题。

### 目标项目 feature 分支确认（第 1 步前置，按需）

如果用户在参数中提供目标功能分支（例如 `feature/xxx`），或迁移语境明确要求先在目标项目新功能分支处理，则必须在创建阶段 agent team、启动任何子 agent、以及对目标项目执行 stash / pull / 切换分支前，由主控向用户提出**一个合并问题**：

默认建议的目标迁移分支名为：

```text
feature/migration_<feature-slug>
```

其中 `<feature-slug>` 必须按本文开头的 **feature_slug 生成规则**生成：优先表达“业务对象 + 功能类型”，使用小写英文、数字和下划线 `_`。例如 `jackpot榜单` 的 slug 必须是 `jackpot_rank`，默认候选分支为 `feature/migration_jackpot_rank`。若用户明确给出其他分支名，以用户指定为准。

```text
是否需要拉取并切换到目标项目的 `<feature-branch>` 分支处理本次迁移？
```

选项语义（交互深度硬规则）：

1. **所有可见选项都必须是一层内可直接执行的策略**：用户选择后，主控即可执行对应分支动作、进入对应只读校验动作后执行、或明确暂停；不得再追问“从哪个基线创建 / 是否切换 / 是否拉取”。
2. **目标非默认分支确认时，菜单只展示当前可直接执行的策略**，并在菜单前用极简摘要说明当前分支、默认迁移分支和关键校验结果。当前不可执行的策略（例如无有效当前远程、未检测到已有迁移分支）不要进入编号列表；最多在“不可用摘要”中一行说明。
3. **目标非默认分支确认时，优先按以下策略直接询问用户**：
   - `从 origin/main 创建`：创建并切换到 `feature/migration_<feature-slug>`，创建基线为已校验有效的 `origin/main`；仅当 `origin/main` 已校验有效时作为推荐项展示。
   - `继续当前本地分支`：不创建迁移分支，直接在当前本地分支 `<current-branch>` 执行迁移。
   - `从当前远程创建`：创建并切换到 `feature/migration_<feature-slug>`，创建基线为当前本地分支对应的有效远程引用。该远程引用优先使用已校验有效的上游 `<valid-upstream>`；若上游缺失或无效，但 `origin/<current-branch>` 已通过 `git ls-remote --heads origin <current-branch>` 或本地远程跟踪引用校验有效，也应视为可直接执行的当前远程基线并展示该选项；若无有效当前远程，则不要在编号菜单中展示该项，只在不可用摘要中说明。
   - `切换已有迁移分支`：仅当本地或远程已检测到 `feature/migration_<feature-slug>` 时展示；拉取/切换并在该分支执行迁移。未检测到时不要在编号菜单中展示该项。
   - `从指定远程基线创建`：用户直接提供 `base=origin/xxx`，主控只读校验该远程基线；校验唯一有效时，创建并切换到默认迁移分支 `feature/migration_<feature-slug>`；校验失败时阻塞并说明原因，不再层层追问。
   - `改用指定目标分支`：用户直接提供 `branch=feature/xxx`，主控只读校验该目标分支；校验唯一有效时，拉取/切换并在该分支执行迁移；校验失败时阻塞并说明原因，不再层层追问。
   - `暂停，不做分支动作`：本轮停止迁移流程，不执行 stash / pull / checkout / 业务修改。
4. **自定义远程基线和自定义目标分支必须作为固定可执行输入格式保留**，不得只藏在“Other”说明里。目标分支策略确认默认使用**纯文本菜单**，不要使用 `AskUserQuestion` 按钮式组件。纯文本菜单应只列出推荐策略、当前可执行策略、自定义输入格式和暂停策略；当前不可执行策略不要占用编号列表。
5. **提示文本必须短**：从 skill 启动到目标分支策略确认之间，除非前置工具不可用，否则不要输出阶段性说明。最终询问应控制为“门禁通过摘要 + 分支摘要 + 可选策略菜单”，避免先汇报一大段再继续提问。
6. **创建默认迁移分支的选项必须直接写清楚创建基线**，例如：
   - `从 origin/main 创建 feature/migration_<feature-slug>`
   - `从 <valid-upstream-or-origin-current> 创建 feature/migration_<feature-slug>`（仅当该远程引用已校验有效时展示）
   - `base=origin/release/1.1.3` 表示从该远程基线创建 `feature/migration_<feature-slug>`
7. **选项文案必须简单明了**：优先使用短标签，如“从 origin/main 创建”“继续当前本地分支”“从当前远程创建”“从指定远程基线创建”“改用指定目标分支”“暂停”。详细含义放在 description 或正文说明中，不在 label 中堆叠长句。

若远程 `<feature-branch>` 不存在，但用户仍希望创建该目标功能分支，必须在一次确认里完成“创建默认迁移分支 + 创建基线 + 切换到新分支”的授权；不得拆成两轮确认。合并确认应优先展示可执行策略，自定义基线、自定义目标分支和暂停策略固定保留；当前不可执行策略只在不可用摘要中说明，不进入编号列表。合并确认示例：

```text
✅ 前置门禁通过：ts-graph MCP 可用；cli-anything-cocoscreator 可用。

目标分支确认：
- 当前分支：`<current-branch>`
- 默认迁移分支：`feature/migration_<feature-slug>`
- 可用基线：`origin/main`、`<valid-current-remote>`（如有）
- 不可用：已有迁移分支未检测到（如适用）

请选择目标分支策略，直接回复编号或文本即可：
1. 从 `origin/main` 创建
   - 创建并切换到 `feature/migration_<feature-slug>`
2. 继续当前本地分支
   - 直接在 `<current-branch>` 执行迁移
3. 从当前远程创建
   - 仅当 `<valid-current-remote>` 有效时展示；从该远程创建并切换到 `feature/migration_<feature-slug>`
4. 切换已有迁移分支
   - 仅当本地或远程已检测到 `feature/migration_<feature-slug>` 时展示
5. `base=origin/xxx`
   - 从指定远程基线创建默认迁移分支，例如 `base=origin/release/1.1.3`
6. `branch=feature/xxx`
   - 改用指定目标分支，例如 `branch=feature/foo`
7. 暂停
```

目标分支策略确认必须使用纯文本菜单，不使用 `AskUserQuestion`。菜单必须允许用户直接回复编号或完整策略文本。当前不可执行的策略不得进入编号列表；如有必要，只在菜单前的“不可用”摘要中简短说明原因。不得因交互组件选项数量限制而裁剪自定义输入格式和暂停策略。

纯文本菜单规则：

```text
✅ 前置门禁通过：ts-graph MCP 可用；cli-anything-cocoscreator 可用。

目标分支确认：
- 当前分支：`<current-branch>`
- 默认迁移分支：`feature/migration_<feature-slug>`
- 可用基线：`origin/main`、`<valid-current-remote>`（如有）
- 不可用：<仅列必要摘要；没有则省略本行>

请选择目标分支策略，直接回复编号或文本即可：
1. 从 origin/main 创建
   - 创建并切换到 feature/migration_<feature-slug>

2. 继续当前本地分支
   - 直接在 <current-branch> 执行本次迁移

3. 从当前远程创建
   - 仅当 <valid-current-remote> 有效时展示
   - 从 <valid-current-remote> 创建并切换到 feature/migration_<feature-slug>

4. 切换已有迁移分支
   - 仅当本地或远程已检测到 feature/migration_<feature-slug> 时展示

5. base=origin/xxx
   - 从指定远程基线创建默认迁移分支，例如 base=origin/release/1.1.3

6. branch=feature/xxx
   - 改用指定目标分支，例如 branch=feature/foo

7. 暂停
```

要求：

- 菜单前必须说明目标当前分支、默认迁移分支、已校验到的可用基线；不可执行候选只在必要时用一行“不可用”摘要说明。
- 用户回复 `1` / `2` / `7`、完整中文策略、`base=origin/xxx` 或 `branch=feature/xxx` 都应被视为有效输入。
- 当前不可执行的策略不要展示在编号列表里；用户若手动输入了不可执行策略，应阻塞并说明需换策略或补充有效基线/分支。
- 不得再提示用户点击 `Other`、`Type something` 或依赖 AskUserQuestion 的自定义输入能力。

若当前分支配置的上游无效，不能把该无效上游作为正常可选项；但仍应额外只读校验 `origin/<current-branch>` 是否存在。若 `origin/<current-branch>` 存在且有效，则可以把它作为“从当前远程创建”的基线展示；若二者均无效，才提示：

```text
注意：当前分支配置的上游 `<upstream>` 无法解析为有效远程引用，本次不把它作为创建基线候选。
```

确认创建基线后，才允许创建并切换到目标功能分支；不得在远程 `<feature-branch>` 不存在时自行推断基线分支。

| 字段 | 含义 |
|---|---|
| `target_feature_branch_suggested` | 主控按 `feature/migration_<feature-slug>` 生成的默认建议迁移分支 |
| `target_feature_branch_requested` | 用户是否要求拉取/切换/创建目标 feature 分支 |
| `target_feature_branch_final` | 实际使用的目标分支；沿用当前分支时也必须记录 |
| `target_current_branch_explicitly_confirmed` | 若沿用当前非默认分支，用户是否已显式确认 |

要求：

- 这是一个合并确认，不得拆成“是否拉取远程分支 / 是否切换分支 / 是否在该分支处理”三个问题。
- 若用户确认需要目标 feature 分支，应在 `01-前置检查.md` 和 `迁移清单.md` 记录：`target_feature_branch_requested: true`、分支名、确认结果、切换前分支、切换后分支、切换后 commit。
- 若远程目标 feature 分支不存在且用户确认创建，应额外记录：`target_feature_branch_existed: false`、`target_feature_branch_create_base`、创建基线的选择来源（当前分支远程跟踪 / `origin/main` / 用户输入远程分支名）、创建命令结果、创建后分支与 commit。
- 若用户拒绝或未提供分支，应记录 `target_feature_branch_requested: false` 或 `target_feature_branch: null`，并说明沿用当前目标分支。
- 若拉取或切换分支失败，应停止进入迁移动作，在 `迁移清单.md` 写入 `needs_user_confirmation: true` 与 `confirmation_topic: target-feature-branch`。

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

`使用效果监控.md` 可以阶段性更新，但阶段性监控记录不得被视为流程结束信号。只有在 `completed` / `blocked` / `partial` / `abandoned` 状态明确，或用户明确要求阶段性汇报时，才应向用户输出总结性回复。

### 最终输出触发条件

只有在以下情况才输出最终回复：

1. 第 7 步完成，并写入 `迁移总结.md` 与最终 `使用效果监控.md`；
2. 流程因明确阻塞条件暂停，并已在 `迁移清单.md` / `源分析清单.md` 中记录 `needs_user_confirmation: true` 与 `confirmation_topic`；
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

- `源分析清单.md`
- `02-源入口候选.md`
- `03-源代码闭包.md`
- `04-源资源闭包.md`
- 可选：`SOURCE_迁移总结.md`

这些文件描述的是源功能的入口、职责层、代码闭包、资源闭包与边界，通常可复用于多个目标项目。

#### 2. 目标迁移目录（默认保存到目标项目内）

`<target-project>/.claude/cocos-feature-migration/<feature-slug>/`

用于保存与**当前目标项目**绑定的迁移结果，例如：

- `迁移清单.md`
- `01-前置检查.md`
- `05-目标差异分析.md`
- `06-迁移动作记录.md`
- `07-迁移验证.md`
- `迁移总结.md`
- `使用效果监控.md`

这些文件描述的是当前目标项目的差异、动作、验证和最终结论，不应回写到源项目中。

约定：

- `<feature-slug>` 必须按本文开头的 **feature_slug 生成规则**由功能名生成稳定 slug，优先表达“业务对象 + 功能类型”。例如 `jackpot榜单` -> `jackpot_rank`，对应目录为 `.../jackpot_rank/`；不得在用户未指定时简化为 `jackpot`。若功能名相同，必须在 manifest 中记录源项目绝对路径与目标项目绝对路径以消除歧义。
- 如果目录不存在，可以创建。
- 不要把运行结果写到 skill 目录本身，也不要写到 memory 目录。

### 目录结构

#### 源项目目录结构

- `源分析清单.md`：源功能分析索引与当前进度
- `02-源入口候选.md`：源项目候选入口
- `03-源代码闭包.md`：已确认入口的代码闭包
- `04-源资源闭包.md`：资源闭包
- `源侧摘要.compact.md`：源侧 compact 摘要，供后续阶段和 Resume 优先读取
- `logs/`：长命令输出、搜索结果、资源依赖树等原始证据

#### 目标项目目录结构

- `迁移清单.md`：目标迁移任务索引与当前进度
- `01-前置检查.md`：ts-graph / git / 前置约束检查
- `05-目标差异分析.md`：目标项目差异分析
- `06-迁移动作记录.md`：实际迁移动作记录
- `07-迁移验证.md`：验证结果
- `迁移总结.md`：最终迁移摘要
- `使用效果监控.md`：本次 skill 使用效果监控记录
- `目标差异摘要.compact.md`：目标差异 compact 摘要
- `迁移状态摘要.compact.md`：迁移动作 compact 摘要
- `最终状态摘要.compact.md`：最终验证 compact 摘要
- `logs/`：长命令输出、构建日志、资源依赖树等原始证据

### 源分析清单.md 必填字段

`源分析清单.md` 至少记录：

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

### 迁移清单.md 必填字段

目标项目内的 `迁移清单.md` 至少记录：

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

`<source-project>/.claude/cocos-feature-migration/source-features/<feature-slug>/源分析清单.md`

若存在历史源分析，必须先判断是否可复用，至少检查：

1. 源项目路径是否一致；
2. 功能名 / `feature_slug` 是否一致；
3. 已确认入口是否一致（若已有）；
4. 上次分析记录的 branch / commit 是否与当前一致；
5. 用户本轮是否明确要求强制刷新。

若检测到已有历史源分析，按以下优化规则处理：

1. **默认复用**：若源项目路径、功能名 / `feature_slug`、已确认入口（若有）、branch / commit 均一致，且用户没有要求强制刷新，则默认复用已有源分析，直接进入目标差异分析，不再向用户提问。
2. **默认增量复核**：若 commit 变化但入口和边界高度明确，可先做关键入口、关键代码闭包、关键资源闭包的轻量复核；复核发现差异再标记 stale 并重建。
3. **必须询问**：若源项目路径、功能名、feature slug、已确认入口、功能边界任一不一致，或历史分析缺少 `03/04/源侧摘要.compact.md`，必须向用户提供复用 / 增量 / 重建选择。
4. **用户优先**：若用户明确要求复用、增量复核或重建，按用户选择执行并记录到 manifest。

需要询问时，提供以下选择：

1. **复用已有源分析，跳过重跑**：直接复用 `02/03/04`，从目标项目差异分析继续；
2. **基于已有结果做增量复核**：读取旧分析，仅核对关键入口、关键闭包、关键资源是否变化；
3. **忽略旧结果，重新完整分析**：把源分析按当前基线重建。

建议使用类似下面的标准提示模板：

```text
检测到该源功能已有历史分析结果：
- 源分析目录：<source-project>/.claude/cocos-feature-migration/source-features/<feature-slug>/
- 上次分析 branch / commit：<old-branch> / <old-commit>
- 当前源项目 branch / commit：<current-branch> / <current-commit>
- 已有产物：源分析清单.md、02-源入口候选.md、03-源代码闭包.md、04-源资源闭包.md
- 已确认入口（若有）：<confirmed-entry-or-null>

请确认本轮如何处理这份历史源分析：
1. 复用已有源分析（直接跳过源侧重跑，进入目标差异分析）
2. 增量复核（基于旧结果，只核对关键入口 / 闭包 / 资源变化）
3. 重新完整分析（忽略旧结果，按当前基线全量重建）
```

处理要求：

- 若用户选择复用：目标项目 `迁移清单.md` 必须记录 `source_analysis_mode: reused`；
- 若用户选择增量复核：目标项目 `迁移清单.md` 必须记录 `source_analysis_mode: refreshed`；
- 若用户选择完整重建：目标项目 `迁移清单.md` 必须记录 `source_analysis_mode: rebuilt`；
- 若源分析不存在：记录 `source_analysis_mode: none`，并按正常流程生成新的源分析。

若历史源分析 commit 已变化：

- 必须把 `源分析清单.md` 中相关状态标记为 `stale`；
- 同时把目标项目中依赖旧源分析的 `05-目标差异分析.md`、`06-迁移动作记录.md`、`07-迁移验证.md`、`迁移总结.md` 视为受影响产物；若其结论依赖旧源闭包，应标记为 `stale` 或待刷新。

### Resume 规则

每个步骤开始前，必须先读取对应侧的 manifest；再优先读取 compact 摘要；只有 compact 缺失、不一致、状态为 `stale` 或需要核查具体证据时，才读取完整步骤文件。

#### 目标侧步骤（第 1、5、6、7 步）

1. 读取 `迁移清单.md`。
2. 按阶段优先读取 compact：
   - 第 5 步优先读取 `源侧摘要.compact.md` 与 `目标差异摘要.compact.md`（如存在）；
   - 第 6 步优先读取 `目标差异摘要.compact.md` 与 `迁移状态摘要.compact.md`（如存在）；
   - 第 7 步优先读取 `源侧摘要.compact.md`、`目标差异摘要.compact.md`、`迁移状态摘要.compact.md`、`最终状态摘要.compact.md`（如存在）。
3. 仅在 compact 缺失、不一致、状态为 `stale`、证据不足或用户要求细节时，读取当前步骤对应的完整 md 文件。

#### 源侧步骤（第 2、3、4 步）

1. 读取 `源分析清单.md`。
2. 优先读取 `源侧摘要.compact.md`（如存在）。
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
3. 按阶段同步更新对应 compact 摘要（`源侧摘要.compact.md` / `目标差异摘要.compact.md` / `迁移状态摘要.compact.md` / `最终状态摘要.compact.md`）；
4. 若产生超过 100 行的命令输出、搜索结果或依赖树，必须写入 `logs/`，步骤 md 只记录摘要和日志路径；
5. 在需要用户确认时，把确认主题写入对应 manifest；
6. **除非用户明确要求英文，否则所有产出的 Markdown 内容必须以中文为主。** 允许保留必要的英文术语、文件路径、命令、字段名和代码符号，但标题、说明、表头、结论、风险、下一步等自然语言内容应优先使用中文。

写回位置要求：

- 第 2、3、4 步：默认写回源项目目录；
- 第 1、5、6、7 步：默认写回目标项目目录；
- 目标项目 `迁移清单.md` 必须记录当前引用了哪份源分析，以及引用模式。

如果流程在等待用户确认时中断，新的对话应能仅通过读取 `迁移清单.md` 和 `源分析清单.md` 判断当前卡点。

### 使用效果监控写回要求

本 skill 已接入使用效果监控。监控规范文档标准路径为：

`/Users/aosika/.claude/skills/cocos-feature-migration/USAGE_使用效果监控.md`

兼容路径为：

`/Users/aosika/.claude/skills/cocos-feature-migration/USAGE_MONITORING.md`

读取规则：优先读取标准路径；若标准路径不存在或不可读，再读取兼容路径。若两者同时存在且内容不一致，应在 `使用效果监控.md` 的“发现的问题”中记录命名/内容不一致风险，并优先按标准路径生成评分。

每次执行本 skill 时，必须在以下时机读取该监控规范，并生成或更新 `使用效果监控.md`：

1. **迁移流程正常完成时**：在写入 `迁移总结.md` 后生成最终 `使用效果监控.md`。
2. **流程被阻塞时**：例如等待用户确认入口、ts-graph MCP 不可用、`cli-anything-cocoscreator` 不可用时，也必须生成阶段性 `使用效果监控.md`，记录当前阻塞点和已完成步骤。
3. **流程中断但已有阶段产物时**：若已经写入任一步骤 md 或任一侧 manifest，应同步生成阶段性监控记录，方便后续复盘。

`使用效果监控.md` 默认保存到当前目标迁移任务目录：

`<target-project>/.claude/cocos-feature-migration/<feature-slug>/使用效果监控.md`

`使用效果监控.md` 至少包含：

- 任务信息：skill、源项目、目标项目、功能名、日期、最终状态
- 总评分：默认使用 **100 分制** 输出；如监控规范或历史样例使用 5 分制，必须同时给出折算分，例如 `88/100（4.4/5，A-）`
- 分模块得分：触发与参数澄清、前置检查、Resume、入口定位、代码闭包、资源闭包、目标差异、迁移动作、验证摘要
- 步骤耗时：每个步骤的 `started_at`、`ended_at`、`duration_seconds`，并区分工具耗时、等待用户确认耗时和主要人工/AI 分析耗时；若本轮未记录精确耗时，必须明确写“未记录精确耗时”，不得编造分钟数
- 耗时 Top 项与优化建议：列出耗时最长的 3 个步骤、主要原因和可优化方向
- 关键证据路径：`迁移清单.md`、`源分析清单.md`、步骤 md、`迁移总结.md` 等
- 发现的问题：问题、严重程度、影响、建议优化
- 用户反馈：若本轮有明确反馈则记录
- 优化建议：本次执行暴露出的 skill 优化项
- 是否需要更新 `SKILL.md`：需要 / 不需要，并说明原因

最终回复用户时，必须明确报告监控输出路径，例如：

`监控记录已输出：<target-project>/.claude/cocos-feature-migration/<feature-slug>/使用效果监控.md`

如果因为缺少目标项目路径而无法确定保存目录，则应先询问用户目标项目路径；若用户只是测试 skill 或未进入真实迁移任务，可说明本次未生成项目级 `使用效果监控.md`，并说明原因。

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

- 所有步骤 md、`迁移总结.md`、`迁移清单.md` 与 `源分析清单.md` 中的说明性文本默认使用中文撰写；表格列名、段落标题、结论、风险、决策、下一步等都应以中文为主。
- 若保留英文小节名（如 `Inputs` / `Findings`），其正文内容仍应以中文为主；如无兼容性要求，也可直接改为中文小节名。
- `02-源入口候选.md` 必须包含候选入口表和待用户确认项。
- `03-源代码闭包.md` 必须包含“迁移 / 复用 / 适配 / 不迁移”分类表。
- `04-源资源闭包.md` 必须包含“资源类型 / 路径 / 来源 / 是否必须”表。
- `05-目标差异分析.md` 必须包含代码差异表和资源差异表。
- `06-迁移动作记录.md` 应按时间追加，记录具体改动、原因、涉及文件。
- `迁移总结.md` 复用本 skill 末尾定义的最终输出结构。

---

### 源分析清单.md 示例模板

建议 `源分析清单.md` 至少按以下结构组织：

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
| 第 2 步 | `02-源入口候选.md` | missing / draft / confirmed / stale |
| 第 3 步 | `03-源代码闭包.md` | missing / draft / confirmed / stale |
| 第 4 步 | `04-源资源闭包.md` | missing / draft / confirmed / stale |

## 待确认项

- needs_user_confirmation: true / false
- confirmation_topic: <topic or null>

## Next step

- 
```

要求：

- 字段命名可根据实际任务微调，但语义必须覆盖本 skill 对 `源分析清单.md` 的字段要求。
- 若本轮是基于旧结果增量复核，应在该文件中明确写出“本轮复核范围”和“未重跑部分”。
- 若本轮是完整重建，应更新源项目 branch / commit，并把旧基线标记为历史记录或 `stale`。

---

## 标准工作流

### 第 1 步：更新源项目与目标项目

开始本步骤前：先读取目标项目 `迁移清单.md` 和 `01-前置检查.md`（如果存在）。若前置结论仍有效则复用，否则重写。

完成本步骤后：写回目标项目 `01-前置检查.md`，并更新目标项目 `迁移清单.md` 中第 1 步状态。

这是正式迁移分析的默认前置步骤，不应因为用户没有单独提到 pull/stash 就跳过。工作区存在未提交修改时，也不应停在这一步等待确认；应直接记录风险、执行 stash，再继续更新基线。

如果用户提供了目标项目 `feature/xxx` 分支，或明确希望本次迁移在新的目标功能分支处理，则在目标项目 Git 初始化前先执行“目标项目 feature 分支确认”：只问一次是否拉取并切换到该分支处理。用户选择需要时，即视为同时同意拉取、切换、并在该分支处理；不要再分别询问这三个动作。

如果用户没有显式提供目标 feature 分支，主控仍必须在第 1 步最开始、启动任何阶段 agent 前，只读获取目标项目当前分支，并生成默认建议迁移分支：`feature/migration_<feature-slug>`。

若目标项目当前分支已经等于默认建议迁移分支，或分支名与本次 `feature_slug` 明显一致，可记录 `target_feature_branch_final` 后继续。

如果目标项目当前分支匹配 `feature/*`、`feat/*`、`release/*`、`hotfix/*` 等非默认开发分支，且分支名与本次 `feature_slug` 不明显一致，主控必须在目标项目 stash / pull / 迁移动作以及阶段 agent 启动前执行一次合并确认。确认提示必须短，不要在工具检查后先输出额外阶段性说明；直接给出“门禁通过 + 分支摘要 + 可选菜单”：

```text
✅ 前置门禁通过：ts-graph MCP 可用；cli-anything-cocoscreator 可用。

目标分支确认：
- 当前分支：`<current-branch>`
- 默认迁移分支：`feature/migration_<feature-slug>`
- 可用基线：`origin/main`、`<valid-current-remote>`（如有）
- 不可用：<仅列必要摘要；没有则省略本行>

请选择目标分支策略，直接回复编号或文本即可：
1. 从 `origin/main` 创建
   - 创建并切换到 `feature/migration_<feature-slug>`
2. 继续当前本地分支
   - 直接在 `<current-branch>` 执行迁移
3. 从当前远程创建
   - 仅当 `<valid-current-remote>` 有效时展示；从该远程创建并切换到 `feature/migration_<feature-slug>`
4. 切换已有迁移分支
   - 仅当本地或远程已检测到 `feature/migration_<feature-slug>` 时展示
5. `base=origin/xxx`
   - 从指定远程基线创建默认迁移分支，例如 `base=origin/release/1.1.3`
6. `branch=feature/xxx`
   - 改用指定目标分支，例如 `branch=feature/foo`
7. 暂停
```

编号菜单只展示当前可执行的具体策略、固定自定义输入格式和暂停；当前不可执行的具体策略不得进入编号列表。

1. **从 origin/main 创建**：创建并切换到 `feature/migration_<feature-slug>`，创建基线为 `origin/main`；仅当 `origin/main` 已校验有效时展示，通常作为推荐项。
2. **继续当前本地分支**：不创建迁移分支，用户明确授权在当前本地分支 `<current-branch>` 执行本次迁移，记录 `target_current_branch_explicitly_confirmed: true`。
3. **从当前远程创建**：创建并切换到 `feature/migration_<feature-slug>`，创建基线为当前本地分支对应的有效远程引用 `<valid-current-remote>`；`<valid-current-remote>` 优先取已校验有效的上游 `<valid-upstream>`，若上游缺失或无效但 `origin/<current-branch>` 已校验有效，则取 `origin/<current-branch>`；仅当 `<valid-current-remote>` 有效且不同于 `origin/main` 时作为可执行选项展示；若无效，不在编号菜单中展示，只在必要时用一行不可用摘要说明。
4. **切换已有迁移分支**：仅当本地或远程已检测到 `feature/migration_<feature-slug>` 时展示；用户选择即授权拉取/切换并在该分支执行迁移。
5. **从指定远程基线创建**：用户直接回复 `base=origin/xxx`，主控只读校验该远程基线；校验唯一有效时，从该基线创建并切换到默认迁移分支 `feature/migration_<feature-slug>`；校验失败时阻塞并说明原因。
6. **改用指定目标分支**：用户直接回复 `branch=feature/xxx`，主控只读校验该目标分支；校验唯一有效时，拉取/切换并在该分支执行迁移；校验失败时阻塞并说明原因。
7. **暂停**：本轮停止迁移流程，不执行 stash / pull / checkout / 业务修改。

交互深度硬规则：

- 目标分支策略确认必须使用**纯文本菜单**，不要使用 `AskUserQuestion`；菜单允许用户直接回复编号、完整策略文本、`base=origin/xxx` 或 `branch=feature/xxx`。
- 不得只展示“从 origin/main 创建 / 继续当前本地分支”两个选项；若当前远程、已有迁移分支可执行，应展示；若不可执行，不要进入编号列表。固定保留 `base=origin/xxx`、`branch=feature/xxx` 和 `暂停`。
- 不得展示“检查并切换默认迁移分支”“换一个分支”“其他远程基线”等选择后还需要继续追问的普通可见选项。
- 如需非默认基线或非默认目标分支，必须让用户直接输入完整意图，例如 `base=origin/release/1.1.3` 或 `branch=feature/foo`；主控收到后只读校验，能唯一确定时直接执行，不能唯一确定时阻塞并说明原因，而不是继续层层追问。
- 创建类选项必须在菜单条目中写明创建基线；不可执行项不得进入编号列表，必要时只在菜单前的不可用摘要中说明。

只读探测远程候选分支允许使用 `git ls-remote --heads origin <pattern>`；但拉取、切换、创建分支都必须在用户确认后执行。第 1 步必须在 `01-前置检查.md` 和 `迁移清单.md` 记录：`target_current_branch`、`target_feature_branch_suggested`、`target_feature_branch_final`、`target_current_branch_explicitly_confirmed`、`target_feature_branch_confirmation_reason`、候选远程分支探测结果和用户选择。

**但该类 Git 现场处理只允许发生在第 1 步一次。** 第 1 步完成后，后续第 2~7 步必须沿用这次初始化后的工作区基线持续推进，不得再次以“为了保持干净”或“继续分析/迁移更方便”为由重复执行 stash / clean / pull。

对源项目和目标项目分别执行：

1. 查看工作区状态
2. 若工作区不干净，则在第 1 步自动 stash 本地变更，并记录 stash 名称
3. 拉取远程最新代码
4. 记录当前分支名与 commit

建议记录表：

| 项目 | 路径 | 初始分支 | 目标 feature 分支确认 | feature 创建基线 | 更新前状态 | 更新动作 | 更新后分支 | 更新后 commit |
|------|------|----------|------------------------|------------------|-----------|----------|------------|----------------|
| 源项目 | /path/A | xxx | 不适用 | 不适用 | clean / dirty | pulled / stashed+pulled | xxx | abc123 |
| 目标项目 | /path/B | xxx | 默认建议 `feature/migration_<feature-slug>`；需要并已切换 / 继续当前分支 / 创建默认迁移分支 | 已存在 / origin/main / origin/dev / 用户输入 origin/release/xxx | clean / dirty | checkout+pulled / create-branch+checkout / pulled / stashed+checkout+pulled | feature/migration_xxx | def456 |

#### 1.x 源分析缓存检查（必做）

在进入第 2 步前，必须先检查源项目内是否已存在可复用的源分析目录：

`<source-project>/.claude/cocos-feature-migration/source-features/<feature-slug>/`

重点检查：

- `源分析清单.md` 是否存在
- `02-源入口候选.md` 是否存在
- `03-源代码闭包.md` 是否存在
- `04-源资源闭包.md` 是否存在
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

目标项目 `迁移清单.md` 必须同步记录：

- `source_analysis_path`
- `source_analysis_mode`
- `source_analysis_branch`
- `source_analysis_commit`
- `source_analysis_status`

---

### 第 2 步：在源项目构建代码图谱

开始本步骤前：先读取源项目 `源分析清单.md` 和 `02-源入口候选.md`（如果存在）。若候选入口分析仍可复用，则直接基于已有结果继续；不要无条件重跑搜索。

完成本步骤后：写回源项目 `02-源入口候选.md`，并更新源项目 `源分析清单.md` 中第 2 步状态。若候选入口超过 1 个，必须在 `源分析清单.md` 中写入 `needs_user_confirmation: true`、`confirmation_topic: exact-entry` 与候选列表摘要。

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
- 若 `02-源入口候选.md` 中任何候选项的“是否建议纳入”或“说明”包含 `待确认`、`可选子功能`、`边界不清`、`旧榜单`、`相邻功能` 等未关闭信号，源侧最终状态不得写 `confirmed`，compact 不得写 `needs_user_confirmation=false`。
- 若后续发现某模块实际属于核心闭环能力，应回写 `02-源入口候选.md` / `源分析清单.md`，并将此前基于错误边界的分析标记为 `stale`。

#### 2.z 源侧确认门禁复核（主控必做）

source-analyzer 完成第 2~4 步后，主控进入第 5 步前必须读取并复核：

- `源分析清单.md`
- `02-源入口候选.md`
- `源侧摘要.compact.md`

若任一文件出现以下信号，必须暂停并向用户确认，不得继续第 5 步：

- `needs_user_confirmation: true`
- `confirmation_topic: exact-entry` / `feature-boundary`
- `候选入口超过 1 个`
- `待确认`
- `等待用户确认`
- `边界不清`
- `不默认纳入`
- `可选子功能`
- `旧榜单`
- `相邻功能需要确认`

若 compact 摘要与步骤 md / manifest 矛盾，以更保守的待确认状态为准。主控必须把确认问题整理给用户，而不是让子 agent 自行继续。

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

该完成定义应在 `03-源代码闭包.md`、`07-迁移验证.md`、`迁移总结.md` 中保持一致；若中途调整，必须明确记录调整原因。

---

### 第 3 步：汇总源功能的代码闭包

开始本步骤前：先读取源项目 `源分析清单.md`、`02-源入口候选.md` 和 `03-源代码闭包.md`（如果存在）。若用户已确认入口，必须把该入口作为唯一分析边界；不要把未确认的下一级 panel 默认并入范围。

完成本步骤后：写回源项目 `03-源代码闭包.md`，并更新源项目 `源分析清单.md` 中第 3 步状态与 `confirmed_entry`。

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

#### 3.y 迁移保真闭包（必做）

在代码文件清单和职责层表之外，必须额外形成**迁移保真闭包**，用于识别容易被文件迁移遗漏的业务语义和隐性依赖。

至少输出以下表格；若源项目没有对应依赖，也要明确写“未发现”，不能省略。

1. **业务语义字段表**

| 字段类型 | 源项目位置 | 源值 / 源行为 | 是否关键 | 说明 |
|---|---|---|---|---|
| API path | `assets/...` | `xxx` | 是/否 |  |
| request 参数 | `assets/...` | `gameType = ...` | 是/否 |  |
| activity/task 字段 | `assets/...` | `activityType = ...` | 是/否 |  |

2. **native / KV / config / gating 依赖表**

| 依赖类型 | 源项目位置 | 源项目行为 | 影响 | 是否必须迁移 |
|---|---|---|---|---|
| native KV | `assets/...` | 读取 rankType / timezone | 请求参数 / 展示开关 | 是/否 |

若未发现，写：`No source-side native/KV/config/gating dependencies found for this feature.`

3. **事件 producer-consumer 闭环表**

| 事件 | 定义位置 | 派发方 | 监听方 | 更新内容 | 是否核心闭环 |
|---|---|---|---|---|---|

4. **接口分支与请求参数语义表**

| 分支 / 参数 | 源项目行为 | 影响 | 是否允许目标适配 | 说明 |
|---|---|---|---|---|

这些表必须进入 `03-源代码闭包.md`，并在 `源侧摘要.compact.md` 中压缩记录关键项：

- `semantic_fields`
- `gating_dependencies`
- `event_closures`
- `interface_branches`
- `request_parameter_semantics`

如果发现 API、native/KV、接口分支、事件闭环或请求参数影响功能完整性，必须把对应职责层标记为关键职责层，供第 5 步和第 7 步继续核对。

---

### 第 4 步：盘点源功能引用的资源

开始本步骤前：先读取源项目 `源分析清单.md`、`03-源代码闭包.md` 和 `04-源资源闭包.md`（如果存在）。资源分析必须基于已确认入口和第 3 步代码闭包结果。

完成本步骤后：写回源项目 `04-源资源闭包.md`，并更新源项目 `源分析清单.md` 中第 4 步状态。

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

开始本步骤前：先读取 `迁移清单.md`、`03-源代码闭包.md`、`04-源资源闭包.md` 和 `05-目标差异分析.md`（如果存在）。

完成本步骤后：写回 `05-目标差异分析.md`，并更新 `迁移清单.md` 中第 5 步状态。

性能优化要求：第 5 步默认做**轻量目标差异分析**，优先读取 `源侧摘要.compact.md` 和 `04-源资源闭包.md` 的资源清单摘要，只在证据不足时读取完整源步骤文档。正文应聚焦：目标是否已有同功能、目标可复用公共能力、缺失代码、缺失资源、必须适配点、职责等价风险。长搜索输出必须写入 `logs/`。

在目标项目构建代码图谱，重点回答两个问题：

1. **目标项目是否已经有同名 / 同职责功能？**
2. **目标项目缺失哪些代码与资源？**

对照源项目的代码清单和资源清单，逐项比对：

#### 5.0 目标项目原生替代能力识别（必做但默认轻量）

在判断“目标缺失某能力”之前，必须先检查目标项目是否已经存在可复用的**原生替代能力**，不能只按文件名是否一致来判断。

默认轻量模式只需覆盖三类结论：

1. **同名实现**：文件名、类名、资源名基本一致；
2. **同职责但异名实现**：命名不同，但承担相同业务职责；
3. **公共基础能力**：列表、头像、网络、事件、UI 管理、资源加载、时间/字符串工具等可复用能力。

若目标项目明显不存在同功能，只需要输出一张精简表，不必展开冗长替代关系：

| 源能力 | 目标同名/同职责能力 | 可复用公共能力 | 最终动作 | 说明 |
|---|---|---|---|---|
| `assets/...` | 无 / `assets/...` | `LazyListView` / 网络层 / UI 管理等 | 新增 / 适配 / 复用 | 说明原因 |

只有当目标项目存在多个相近实现、是否复用存在争议，或用户要求详细审计时，才展开完整的“同名 / 异名 / 同流程不同分层”分析。

要求：

- 若目标项目已有可承接的原生能力，应优先复用或适配，不应机械复制一套源实现。
- 只有在确认目标不存在等价能力，或现有能力无法承接该职责时，才能判定为“缺失需新增”。
- 若是否可复用存在争议，应在 `05-目标差异分析.md` 中明确列为待确认项，不要直接按“缺失”处理。

#### 5.0.x 入口承接策略与产品语义风险（必做）

若源功能存在入口、按钮、菜单、系统挂点、红点 / badge 或路由触发点，第 5 步必须在迁移动作前明确目标项目如何承接入口，不能等第 6 步落地后才暴露产品语义风险。

必须输出入口承接策略表：

| 源入口 | 目标承接入口 | 目标行为 | 是否替换目标已有入口行为 | 变更来源 | 是否需产品确认 | 风险 |
|---|---|---|---|---|---|---|
| `assets/...` | `assets/...` / 新增入口 / 复用按钮 | 打开 xxx | 是/否 | source / target-existing / user-specified / inferred | 是/否 | 说明 |

判定要求：

- **新增入口**且不影响目标既有入口行为：通常无需确认，但仍需记录接入位置和证据。
- **复用目标现有入口且不改变原行为**：可作为合理复用，需说明如何共存。
- **复用目标现有入口并替换原行为**：默认属于产品语义风险；如果没有 `target-existing` / `user-specified` / `backend-doc` 证据，应在 `迁移清单.md` 写入 `needs_user_confirmation: true`、`confirmation_topic: entry-semantics`，由主控向用户确认。
- 若只是临时承接策略（例如先挂到已有 Record 按钮），必须在第 6、7 步和 `迁移总结.md` 中继续跟踪，不得把它当作无风险最终方案。

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
- 如果关键职责层缺失，必须在 `05-目标差异分析.md` 明确标记为功能缺口。
- 如果是“已迁入但职责被削减”，必须明确写成“部分等价”，不能写成“已完成”。

#### 5.y 迁移保真差异分析（必做）

除代码 / 资源 / 职责等价外，必须基于源侧 `semantic_fields`、`gating_dependencies`、`event_closures`、`interface_branches`、`request_parameter_semantics` 做迁移保真差异分析。

必须输出以下表格：

1. **业务语义字段差异表**

| 字段 | 源值 | 目标现状 / 拟迁移值 | 变更来源 | 是否允许 | 风险 |
|---|---|---|---|---|---|

`变更来源` 只能是：`source` / `target-existing` / `user-specified` / `backend-doc` / `inferred`。涉及 API path、activity/task、native/KV、接口分支、请求参数的 `inferred` 改动必须列为待确认项。

2. **gating / config 等价表**

| 依赖类型 | 源项目行为 | 目标项目现状 | 是否等价 | 后续动作 |
|---|---|---|---|---|

3. **事件闭环等价表**

| 事件 | 源闭环 | 目标闭环 | 是否等价 | 结论 |
|---|---|---|---|---|

4. **请求参数 / 接口分支语义差异表**

| 参数 / 分支 | 源项目 | 目标项目 | 是否语义变化 | 风险 | 是否需确认 |
|---|---|---|---|---|---|

判定要求：

- 目标没有同名文件不等于缺失；但目标把源动态配置改成默认值、空值、直通或硬编码，必须标记为语义变化。
- API path 与源项目不一致且无证据时，不得写成“已适配”，必须写成“高风险可疑 / 需确认”。
- native/KV/config/gating 链如果源项目存在而目标项目缺失，必须标记为“确定缺口”或“目标等价链待证明”。
- 事件闭环缺定义、派发、监听任一环节，都必须标记为“部分等价 / 缺失”。
- 若用户提供参考/标准答案项目，必须三方分类：确定问题 / 高风险可疑 / 合理业务适配 / 参考项目差异。

如果触发“迁移保真与隐性依赖规则”的阻断项，必须在 `迁移清单.md` 写入：

```text
needs_user_confirmation: true
confirmation_topic: fidelity-risk
```

并列出需要用户确认的具体问题。

---

### 第 6 步：迁移代码与资源

开始本步骤前：先读取 `迁移清单.md`、`05-目标差异分析.md` 和 `06-迁移动作记录.md`（如果存在）。

完成本步骤后：把本轮实际改动按时间追加写入 `06-迁移动作记录.md`，并更新 `迁移清单.md` 中第 6 步状态。

**阶段边界要求：第 6 步只执行迁移动作、必要的文件存在性检查、关键文件自检和动作记录；不要执行 TypeScript / lint / 构建 / Cocos build 等命令。** 本 skill 默认不检测也不运行 `tsc` / `cocos`，第 7 步也只做 L1 静态验证，除非用户明确要求更高等级验证。如果在第 6 步为了辅助迁移做了只读检查（如确认文件是否存在、资源路径是否可解析、关键类型名是否实际落地），只能作为迁移动作依据记录，不应把它当作最终验证结论。

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


#### 6.1.x 业务语义改写保护（必做）

执行代码迁移时，必须遵守“源行为保真优先”。对第 5 步标记为 `inferred`、`高风险可疑`、`需确认` 的以下改动，不得静默落地：

- API / deeplink path 改写；
- `activityType` / `businessType` / `taskType` / `taskData` 改写；
- appName / platform / old-new-interface 分支删除或硬编码；
- native / KV / remote config / gating 链删除、直通或默认值替代；
- request 参数从动态值改为空值、`0`、`null`、默认值或固定值；
- event 定义、派发、监听任一环节被删除；
- 源项目关键职责层被裁剪为“只打开 UI”或“只保留主面板”。

处理方式：

1. 若没有用户确认或明确证据，保留源项目语义；
2. 若目标项目确实已有等价实现，记录 `target-existing` 证据路径；
3. 若需要用户确认，停止该项改写，把问题写入 `06-迁移动作记录.md` 和 `迁移状态摘要.compact.md` 的 `needs_user_confirmation`；
4. 不得为了让代码“看起来适配目标项目”而自行替换成另一个接口、默认配置或硬编码分支。

`06-迁移动作记录.md` 必须包含“关键语义字段来源表”：

| 字段 | 最终落地值 | 来源 | 证据 | 是否用户确认 |
|---|---|---|---|---|



- 复制缺失资源文件
- 检查 `.meta` 是否需要保留或重新生成
- 若跨项目复制 `.meta` 可能引发 UUID/引用问题，优先遵循目标项目资源管理方式
- 修复 Prefab / Atlas / SpriteFrame 的路径引用问题
- 跨项目复制 Prefab 后，如果为了保持 Prefab 内部静态 UUID 引用可解析而临时引入了隔离依赖目录（例如 `rank_deps/`、`migrated_deps/`），必须在 `06-迁移动作记录.md` 记录原因、包含哪些资源、后续如何在编辑器中切回目标项目原生资源，以及何时可以清理该目录
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
- 若迁移结束时仍保留过渡目录，必须在 `07-迁移验证.md`、`迁移总结.md` 中继续跟踪，不得只在 `06-迁移动作记录.md` 提一次就结束。

#### 6.x 关键文件强制自检（必做）

第 6 步修改关键接入文件后，`migration-applier` 必须读取目标项目中的**实际文件**并记录自检证据，避免出现“报告已修但未落地”的情况。

至少按功能形态自检以下类别：

| 文件类别 | 必查内容 | 记录方式 |
|---|---|---|
| 协议 / DTO 文件 | 迁入代码引用的 interface / enum / class / type 名称是否实际存在 | 记录文件路径、行数或符号存在列表，例如 `ReqRankData: true` |
| 主入口 / SubGame / Controller | 关键字段、初始化方法、请求方法、入口打开方法是否实际存在 | 记录字段名/方法名存在列表 |
| UIConfig / PanelConfig | 新增 UI ID、prefab 路径、bundle 名是否实际存在 | 记录 UI ID 与 prefab 映射 |
| Event enum / Message key | 新增事件名是否实际存在且与迁入代码引用一致 | 记录事件名列表 |
| 工具适配文件 | 新增 helper 方法是否实际存在 | 记录方法名列表 |
| Prefab / 资源 | 关键 prefab、资源、`.meta` 是否存在 | 记录存在性摘要；完整 deps 留到第 7 步 |

自检要求：

- 自检结果必须写入 `06-迁移动作记录.md` 或 `迁移状态摘要.compact.md`。
- 若自检失败，不能报告“已完成迁移”；应继续修复或标记 `blocked-static` 风险。
- 不允许只根据编辑动作或复制命令推断成功，必须以 Read / 搜索目标实物结果为准。



- UIConfig / PanelConfig 注册
- 子游戏入口 preload / init
- 路由/按钮点击入口
- 事件监听注册
- 网络协议声明
- 多语言 key 注册

若目标项目已有排行榜框架但缺少具体业务页，**只新增 TS 功能，不重复引入整套排行体系**。

---

### 第 7 步：修复迁移后的路径与缺失问题

开始本步骤前：先读取 `迁移清单.md`、`06-迁移动作记录.md` 和 `07-迁移验证.md`（如果存在）。

完成本步骤后：写回 `07-迁移验证.md`，并更新 `迁移清单.md` 中第 7 步状态。流程结束时，额外生成或更新 `迁移总结.md` 作为跨对话恢复入口；随后必须读取 `USAGE_使用效果监控.md` 并生成或更新 `使用效果监控.md`，记录本次 skill 使用效果、评分、证据路径、问题与优化建议。

迁移完成后默认只做 **L1 静态结构验证 + `cli-anything-cocoscreator` 资源依赖验证**，重点检查：

1. import 路径对应的文件是否存在、符号名是否明显闭合
2. Prefab 绑定脚本是否存在丢失或 uuid 无法解析
3. 动态加载路径是否能在目标项目找到对应资源或有明确 fallback
4. 枚举 / 常量 / UI ID 是否已注册
5. 本地化 key 是否缺失或需人工补齐
6. 协议字段 / DTO / request class 是否存在
7. 目标项目是否存在同名类/资源冲突
8. 关键 prefab 的 `asset deps` 是否 `missing=0` 或 unresolved_count=0

默认**不运行也不探测**：

```bash
# 默认禁止，除非用户明确要求 L2/L3/L4 验证
tsc / npx tsc / node_modules/.bin/tsc
cocos
npm run build / npm run typecheck / lint
```

验证命令要求：

- 默认不要执行 TypeScript / lint / Cocos build / npm build，也不要检查这些命令是否存在；这不是本 skill 默认验证范围。
- 若用户明确要求 L2/L3/L4 验证，再按项目实际命令执行；命令不可用时不得擅自安装依赖，必须如实记录失败原因。
- 默认必须执行静态检查：import 路径、Prefab 依赖 `asset deps`、脚本 uuid / refs、动态资源路径、UIConfig、i18n key、协议字段和同名冲突。
- 对 `asset refs` 查不到脚本反向引用但代码运行时依赖该脚本的情况，先按“脚本绑定次级静态证据”规则补证；补证仍失败时必须标为风险，并提示在 Cocos 编辑器中打开对应 Prefab 确认脚本组件是否绑定。

##### Prefab deps unresolved 判定规则（必做）

第 7 步使用 `cli-anything-cocoscreator asset deps` 后，不能只按 unresolved 数量机械判定通过或阻塞，必须分类记录：

| unresolved 类型 | 判定 | 处理 |
|---|---|---|
| 关键业务资源缺失，能映射到源功能 prefab / texture / font / material / config / child prefab | L1 阻塞 | 标记 `blocked-static` 或回派修复 |
| 脚本组件 uuid 无法解析，且无法用次级静态证据证明绑定 | L1 阻塞或高风险 | 回派修复或标记需 L3 编辑器确认 |
| `file=None`，关键业务资源均已解析，形态疑似 Cocos 引擎内建资源 / built-in material / internal asset | 非阻塞 note | 记录 unresolved 数量和日志路径；最终状态最多谨慎为 `static-pass` / `partial-pass-static`，并要求 L3 复核 |
| 无法判断来源的 unresolved | 风险 | 继续追 uuid；追不到时标记 `partial-pass-static`，不得宣称 completed |

`file=None` unresolved 只有同时满足以下条件时，才可作为非阻塞 note：

1. 关键业务 prefab、贴图、字体、材质、子 prefab、脚本组件都已解析或有次级静态证据；
2. unresolved 输出没有可映射到源功能资源路径的业务文件名；
3. 同类 unresolved 更像 Cocos 内建资源、默认材质、builtin texture 或内部占位引用；
4. 已在 `07-迁移验证.md`、`迁移总结.md` 和 `使用效果监控.md` 中记录，并提示 L3 编辑器复核。

##### 脚本绑定次级静态证据规则（必做）

当 `asset refs <script_uuid>` 未直接命中 prefab，但代码运行时依赖该脚本或源闭包显示该脚本应绑定在 prefab 上时，必须按以下顺序补证：

1. 读取脚本 `.meta`，记录完整 uuid；
2. 在目标 prefab 文本中搜索完整 uuid、短 uuid 前缀或 Cocos 序列化中的压缩/短 id；
3. 检查 prefab component 片段中是否存在脚本引用字段（如 `__type__`、`script`、`_script` 或同版本 Cocos 的脚本组件序列化字段）；
4. 若命中，可在 L1 中判定为“脚本挂载存在次级静态证据”，但必须注明仍需 L3 编辑器确认 Inspector 绑定；
5. 若完全未命中，标记为脚本绑定风险；关键脚本缺绑定时不得给 `static-pass`。

如果没有标准命令，也应通过静态检查给出未完成项。

#### 7.w 待确认项回扫（必做）

生成最终状态、`迁移总结.md` 和 `使用效果监控.md` 前，必须回扫以下文件：

- 源侧 `源分析清单.md`
- 源侧 `02-源入口候选.md`
- 源侧 `源侧摘要.compact.md`
- 目标侧 `迁移清单.md`
- `05-目标差异分析.md`
- `06-迁移动作记录.md`
- `07-迁移验证.md`（如已有旧稿）

若任一文件中存在未关闭的以下信号，最终 `迁移清单.md` 不得写 `needs_user_confirmation: false`：

- `needs_user_confirmation: true`
- `confirmation_topic`
- `待确认`
- `等待用户确认`
- `产品确认`
- `边界不清`
- `入口语义风险`
- `pending_product_confirmation`
- `entry-semantics`
- `feature-boundary`
- `target-feature-branch`

必须将这些项合并写入最终 manifest：

```text
needs_user_confirmation: true
confirmation_topic: <topic-list>
pending_confirmations:
- <具体待确认项、来源文件、影响>
```

只有当每个待确认项都有用户明确答复，或有 `target-existing` / `user-specified` / `backend-doc` 等证据关闭，才能置为 `false`。存在未关闭待确认项时，最终状态最多为 `partial-pass-static` / `blocked-static` / `partial`，不得给 `completed`；若待确认项影响入口边界或目标分支归属，不得给 `static-pass`。

#### 7.0 验证等级（必做）

最终验证时，必须明确声明本次迁移实际达到的**验证等级**，不能把不同强度的验证混为一谈。

建议按以下分级记录：

- **L1：静态结构验证（默认最高验证等级）**
  - import 路径与符号存在性
  - 资源路径
  - UIConfig / 常量 / i18n / 协议字段
  - Prefab 依赖 `asset deps`，必须记录 missing / unresolved 结论
  - 脚本 `uuid + refs`
  - 关键文件自检结果（如 DTO/enum/方法名实际存在）
- **L2：工程编译验证（仅用户明确要求时执行）**
  - `tsc` / `npx tsc`
  - lint
  - 项目已有的静态构建检查
- **L3：编辑器装配验证（通常人工或专门环境执行）**
  - Prefab 脚本组件是否绑定
  - Inspector 引用是否完整
  - 节点拖拽绑定、资源引用是否在编辑器内正常
- **L4：运行态功能验证（通常人工或专门环境执行）**
  - 真实点击入口
  - 请求 / 回包 / 刷新链路
  - UI 展示、事件响应、交互流程在运行态确认

要求：

- `07-迁移验证.md`、`迁移总结.md` 和最终回复中都应声明本次达到的最高验证等级。
- 默认最高验证等级为 L1；若未明确执行 L2/L3/L4，不得把结果表述为“编译通过”“编辑器可用”或“运行可用”。
- 若仅做到 L1 / L2，则凡是需要 L3 / L4 才能确认的结论，必须降级表述，不得直接宣称“已完整可用”。
- 若关键完成项只完成了低等级验证，应优先标记为 `static-pass`、`partial-pass-static`、`blocked-static` 或传统 `partial`，并在风险项中明确说明。

建议输出：

| 验证等级 | 是否完成 | 证据 | 说明 |
|---|---|---|---|
| L1 | 是/否 | `07-迁移验证.md` 相关段落 |  |
| L2 | 是/否 | 命令或日志 |  |
| L3 | 是/否 | 编辑器检查说明 |  |
| L4 | 是/否 | 运行态验证说明 |  |

#### 7.x 重复资源审计与过渡目录清理（必做）

若迁移过程中引入了 `rank_deps/`、`migrated_deps/` 或其他隔离依赖目录，验证阶段必须额外执行**重复资源审计**。

审计目标：

1. 检查隔离目录中的资源，是否与目标项目原生目录存在同名资源；
2. 判断这些资源是否属于同职责资源（例如 coin、head、font、material、common texture 等目标项目本已存在的公共资源）；
3. 若目标项目原生资源已存在且可复用，应优先将 Prefab / 资源引用切回目标原生资源；
4. 对仍保留在隔离目录中的重复资源，必须在 `07-迁移验证.md`、`迁移总结.md` 中列为待清理项，不得默认为最终方案。

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

- **只有当关键职责层均已迁入且职责等价，并且达到用户要求的验证等级时，才能标记为 `completed`。**
- 默认快速静态策略下，若 L1 静态结构闭合且关键职责层静态等价，可标记为 `static-pass`，不得标记为 `completed`。
- 若主要代码和资源已迁入，但存在一个或多个关键职责层缺失、削减、fallback、运行配置链未验证或需业务确认，应标记为 `partial-pass-static` 或 `partial`，不得标记为 `completed`。
- 若 L1 静态验证仍有阻塞（如关键类型缺失、Prefab missing > 0、关键资源缺失），应标记为 `blocked-static` 或 `blocked`。
- 在 `迁移总结.md` 和 `使用效果监控.md` 中，必须显式报告职责级验证结论，不能只报告静态验证结果。

#### 7.z 保真验证与问题分类（必做）

最终验证必须额外执行迁移保真验证，不能只检查 import、Prefab 和资源是否闭合。

必须复核：

1. API path 是否与源项目一致；若不一致，是否有 `target-existing` / `user-specified` / `backend-doc` 证据；
2. native / KV / config / gating 链是否按源项目迁入，或目标等价链是否有证据；
3. appName / platform / old-new-interface 等分支是否保留，或是否有明确业务裁剪依据；
4. request 参数是否从动态值变为空值、`0`、默认值或固定值；
5. event producer-consumer 闭环是否完整；
6. `activityType` / `businessType` / `taskType` / `taskData` 是否被改写；
7. 源项目关键职责层是否被简化为无条件打开、默认值、空参数或只保留主 UI。

`07-迁移验证.md` 和 `迁移总结.md` 必须按以下分类输出问题：

| 分类 | 定义 |
|---|---|
| 确定问题 | 源项目存在，目标项目缺失或错迁，且无业务适配证据 |
| 高风险可疑 | 源项目与目标项目不同，但可能有业务适配，需要用户或后端确认 |
| 合理业务适配 | 目标项目已有明确上下文、用户要求或文档支持该差异 |
| 参考项目差异 | 参考项目有但源项目没有，不能作为本次迁移错误 |

若存在未经确认的 API path 改写、接口分支硬编码、native/KV/gating 缺失、请求参数空心化或事件闭环缺失，最终状态不得为 `static-pass` / `completed`；应标记为 `partial-pass-static`、`blocked-static` 或 `partial`，并明确待确认项。

---



以下输出要求只适用于“最终输出触发条件”已经满足的情况。不得因为完成了第 1 步、第 2 步或其他中间步骤，就提前套用最终输出格式并停止流程。

执行此 skill 后，最终输出必须包含：

### 0. 使用效果监控输出

每次真实执行迁移流程后，最终回复必须报告：

- 是否已生成 `使用效果监控.md`
- 监控记录路径
- 本次 skill 使用总评分
- 本次流程状态：`static-pass` / `partial-pass-static` / `blocked-static` / `completed` / `blocked` / `partial` / `abandoned`
- 主要扣分项或风险项
- 是否建议更新 `SKILL.md`

示例：

```text
监控记录已输出：<target-project>/.claude/cocos-feature-migration/<feature-slug>/使用效果监控.md
本次 skill 使用评分：82/100
流程状态：blocked
主要扣分项：资源闭包尚未执行，原因是等待用户确认精确入口。
是否建议更新 SKILL.md：否
```

如果本次只是咨询、测试或缺少目标项目路径导致无法生成项目级监控文件，必须说明：

```text
本次未生成 使用效果监控.md：原因是未进入真实迁移流程 / 缺少目标项目路径。
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
- 最终状态为什么是 `static-pass` / `partial-pass-static` / `blocked-static` / `completed` / `partial` / `blocked`

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

- [ ] 已确认目标项目 feature 分支处理方式（必须在创建阶段 agent team、启动任何子 agent、以及目标项目 stash / pull / checkout / 业务修改之前完成）：默认建议分支为 `feature/migration_<feature-slug>`；若用户提供 `feature/xxx` 则按用户指定；若当前非默认分支与本次 feature_slug 不一致，已用一层、简单明了的策略确认：从 `origin/main` 创建 / 继续当前本地分支 / 从当前本地分支对应的有效远程上游创建（仅有效时展示）/ 切换已存在迁移分支（仅检测到时展示）/ `base=origin/xxx` 从指定远程基线创建 / `branch=feature/xxx` 改用指定目标分支 / 暂停；当前不可执行策略不得进入编号列表，但自定义基线、自定义分支和暂停策略必须保留。
- [ ] 已完成第 1 步 Git 状态检查，并记录是否执行 stash / pull
- [ ] 已明确后续子步骤不再重复执行 stash / clean / pull
- [ ] 已按当前平台确认 `cli-anything-cocoscreator` 可用，或已提示用户按部署指南安装
- [ ] 已与用户确认精确功能入口（如存在多个候选）
- [ ] 已确认功能边界（不只精确入口）
- [ ] 已定义最小完成标准 / 完整完成标准
- [ ] 源项目已整理功能代码闭包
- [ ] 源项目已整理完整资源清单
- [ ] 已完成业务语义字段保真检查：API path、activity/task、request 参数、event、model/DTO 关键字段未被无证据静默改写
- [ ] 已完成条件性 native / KV / config / gating 隐性依赖扫描；源项目有则已迁移或记录不迁移原因，源项目无则未凭空新增
- [ ] 已完成事件 producer-consumer 闭环检查：定义、派发、监听、UI/model 更新均已核对
- [ ] 已完成接口分支与请求参数语义检查：old/new interface、appName/platform、动态参数未被无证据硬编码或空心化
- [ ] 目标项目已完成代码差异分析

- [ ] 已检查目标项目同职责异名替代能力
- [ ] 目标项目已完成资源差异分析
- [ ] 已迁移缺失代码
- [ ] 已迁移缺失资源
- [ ] 已修复 import / UI / bundle / 动态路径问题
- [ ] 已标注过渡资源目录的退出条件与最晚清理时机
- [ ] 已声明本次验证等级；默认只做 L1 静态结构验证，除非用户明确要求，不检测/不运行 tsc/cocos/npm build
- [ ] 已用 `cli-anything-cocoscreator` 对关键 prefab 执行 deps，并记录 missing/unresolved 结论
- [ ] 已用 `cli-anything-cocoscreator asset uuid + refs` 检查关键脚本/资源引用
- [ ] `migration-applier` 已对关键文件做实物自检（协议/DTO、SubGame/Controller、UIConfig、Event、工具方法、关键资源），并记录符号/方法/资源存在性证据
- [ ] 若第 7 步发现 L1 静态问题，已最多执行 2 轮修复-复验证循环，或明确标记 `blocked-static`
- [ ] 已列出风险项和人工确认项

---

## 相关技能

- `cocos-asset-management` — 动态资源路径、预加载、缓存、释放
- `cocos-ui-system` — UIConfig、Panel 注册、弹窗入口
- `cocos-network` — 接口封装与协议适配
- `cocos-localization` — 文案 key 与语言资源迁移
- `cocos-node-binding` — Prefab 节点绑定修复
- `cocos-code-review` — 迁移后做语义级代码审查
