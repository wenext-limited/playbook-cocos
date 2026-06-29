# 持久化、Resume 与 Markdown 写回
> 术语索引：state_bootstrap 表示主控预创建 running state；artifact_harvest 表示恢复时按 required artifacts + phase-summary JSON + state compact 收割。

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

`<target-project>/.claude/cocos-feature-migration/migrations/<feature-slug>/`

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
- `05a-目标能力分析.md`：目标能力私有产物
- `05b-保真风险分析.md`：保真风险私有产物
- `05c-资源迁移计划.md`：资源计划私有产物
- `05-目标差异分析.md`：主控合并后的第 5 步最终产物
- `目标能力摘要.compact.md`：05a compact
- `保真风险摘要.compact.md`：05b compact
- `资源迁移计划摘要.compact.md`：05c compact
- `06-迁移动作记录.md`：实际迁移动作记录
- `07-迁移验证.md`：验证结果
- `迁移总结.md`：最终迁移摘要
- `使用效果监控.md`：本次 skill 使用效果监控记录
- `目标差异摘要.compact.md`：目标差异 compact 摘要
- `迁移状态摘要.compact.md`：迁移动作 compact 摘要
- `最终状态摘要.compact.md`：最终验证 compact 摘要
- `controller-checkpoint.compact.md`：主控轻量 checkpoint，用于 main 上下文压缩、跨对话恢复和避免在聊天中维护完整历史状态
- `logs/controller-event-log.jsonl`：主控结构化调度事件日志，用于跨对话恢复和最终监控复盘
- `logs/artifact-contract-manifest.json`：主控维护的机器可读 artifact path schema，用于 phase start / harvest / resume 校验 canonical required artifacts，避免 agent 写错路径造成假缺失
- `05x-target-shared-search.compact.json`：第 5 步目标共享检索包
- `migration-dry-run.json`：第 6 步迁移动作 dry-run 计划
- `migration-static-check.json`：第 7 步机器可读 L1 静态验证结果
- `logs/phase-summary/<phase>-<agent>.summary.json`：阶段机器可读摘要，Resume / Main controller 默认优先读取，减少 Markdown 上下文
- `logs/`：长命令输出、构建日志、资源依赖树等原始证据


### Resume 读取优先级（v2）

恢复任务时，Main/controller 不应默认展开完整 Markdown。读取顺序必须为：

```text
controller-checkpoint.compact.md
  -> logs/artifact-contract-manifest.json（轻量校验 required artifacts canonical path）
  -> logs/phase-summary/<phase>-<agent>.summary.json
  -> 当前阶段 *.state.compact.md
  -> evidence compact
  -> full step md / logs
```

只有 phase-summary JSON 缺失、stale、字段不足、与 state compact 冲突、存在 open confirmation、required artifacts 缺失或用户要求展开时，才下钻 Markdown。若 JSON 与 compact 冲突，按更保守状态处理，并在 `使用效果监控.md` 记录 `execution_gap.phase_summary_conflict:<phase>`。

恢复时还必须保留 `execution_mode: normal | degraded`、`degraded_reasons`、`confidence_caps`、`source_resource_prefetch`、`target_05_fanout` 等字段；不要把 degraded 的历史阶段恢复成 normal。


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
- `closed_confirmations: []`：已关闭确认项，历史记录必须标注 `historical_only: true`，避免 resume 误判为 open
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
- `phase_runtime`：当前 DAG 调度状态、active_agents、required_artifacts、output_mode、merge_owner、user_confirmation_owner
- `controller_checkpoint_path: controller-checkpoint.compact.md`：主控 checkpoint 路径

### Controller checkpoint（main 上下文压缩必做）

目标迁移目录必须维护轻量 checkpoint：

```text
<target-project>/.claude/cocos-feature-migration/migrations/<feature-slug>/controller-checkpoint.compact.md
```

该文件只保存 main/controller 调度所需状态，不保存完整分析事实：

```yaml
controller_checkpoint:
  feature_slug:
  current_phase:
  last_completed_phase:
  next_action:
  workflow_status: running | static-pass | partial-pass-static | blocked-static | blocked | completed | partial | abandoned
  open_confirmations: 0
  active_agents: []
  active_agent:
    name:
    agent_id:
    phase:
    status: pending | running | harvesting | completed | completed_with_agent_output_missing | agent_output_missing | failed | blocked | superseded
    started_at:
    lease_status: active | expired | completed | superseded
    restart_count: 0
    last_heartbeat_path:
    last_heartbeat_at:
    current_step:
  watchdog:
    enabled: true | false
    tool: Monitor | Bash | unavailable
    task_id:
    status: scheduled | running | completed | timeout | unavailable
    next_checkpoint_at:
    soft_timeout_at:
    last_event:
  pending_agent_shutdowns: []
  superseded_agents: []
  required_artifacts:
    declared: []
    existing: []
    missing: []
  required_artifacts_pending: []
  harvest_policy:
    on_idle_without_agent_result: check_artifacts
    on_checkpoint: check_artifacts
    on_soft_timeout: prompt_once_then_restart_or_block
  final_status:
  last_user_decision:
  source_analysis_ref:
  target_manifest_ref:
  compact_refs:
    source:
    target_diff:
    migration:
    final:
  updated_at:
```

写回规则：

1. 每个阶段开始、完成、阻塞、agent 收割、用户确认关闭后，都应更新 checkpoint。
2. main 恢复任务时优先读取 checkpoint + `迁移清单.md`；只有二者冲突、缺失或 stale 时才读多个完整 compact。
3. checkpoint 不能替代 manifest / compact / 步骤 md；它只用于调度和压缩 main 上下文。
4. checkpoint 中不得粘贴完整代码清单、完整资源清单或完整 CLI 输出。

### Resume 时的可靠调度恢复

恢复或继续任务时，main 不得依赖聊天历史判断 agent 是否完成。必须按以下顺序恢复：

1. 读取 `controller-checkpoint.compact.md`。
2. 读取 `迁移清单.md` 的 `phase_runtime` 必要片段。
3. 若 checkpoint 显示有 active agent，读取当前阶段 state compact；若 state 缺失，再读 heartbeat。
4. 检查 checkpoint 中 declared required artifacts，并优先用 `logs/artifact-contract-manifest.json` 做 canonical path / alias / 非空轻量校验。
5. 若 artifacts + state compact 完整，按 `completed_with_agent_output_missing` 或 `agent_harvest` 收割，并立即执行 DAG transition 原子推进：更新 checkpoint / event log / artifact manifest，bootstrap 并启动下一阶段 agent，安排 watchdog。不得只写 `next_action` 后暂停。
6. 若 artifacts 缺失但 heartbeat fresh 且未超时，继续等待 watchdog。
7. 若 heartbeat stale 或 soft timeout，执行追问一次 / 重启一次 / 阻塞规则。
9. 若恢复时发现 checkpoint / manifest / 迁移清单显示 `next_action` 指向可启动阶段，但 `active_agents` 为空或缺少预期 agent，且无 hard stop / blocking confirmation，必须判定为 `controller_transition_gap`：立即补做下游阶段 bootstrap + Agent 启动 + watchdog，并写入 `logs/controller-event-log.jsonl`；不得只向用户汇报“下一步将启动”。
10. 对 `04 completed -> 05x -> 05a/05b/05c`，恢复时若 `05x-target-shared-search.compact.json` 已存在且 fresh、目标分支门禁已关闭、05a/05b/05c 产物缺失且无 active agents，必须立即启动 05a/05b/05c fan-out；不得把 05x 当作完成态停留。


旧产物没有 heartbeat 时，不得判定失败；应记录 `legacy_no_heartbeat: true`，然后按 required artifacts + state compact 继续。

### Controller event log（main 调度历史外置）

目标迁移目录必须维护结构化调度事件日志：

```text
<target-project>/.claude/cocos-feature-migration/migrations/<feature-slug>/logs/controller-event-log.jsonl
```

每行一个 JSON 对象，建议事件：

```json
{"event":"phase_start","phase":"03-source-code-closure","ts":"...","agent":"source-code-closure-analyzer"}
{"event":"agent_harvest","phase":"03-source-code-closure","status":"completed","state_compact":"..."}
{"event":"completed_with_agent_output_missing","phase":"04-source-resource-closure","state_compact":"..."}
{"event":"user_confirmation_closed","id":"feature-boundary-001","decision":"B"}
{"event":"phase_complete","phase":"03-source-code-closure","next":"04-source-resource-closure"}
{"event":"repair_round","from":"07-static-verifier","to":"06-migration-applier","reason":"missing WGameConst constants"}
```

Main 最终回复不保存完整调度历史，只引用 event log、checkpoint 和 manifest。Resume 时如 checkpoint 与 manifest 冲突，可读取 event log 最近 80 行以内片段辅助判断。



在进入第 2 步前，必须先检查源项目内是否已存在：

`<source-project>/.claude/cocos-feature-migration/source-features/<feature-slug>/源分析清单.md`

同时检查是否存在技术加速缓存：

```text
<source-project>/.claude/cocos-feature-migration/source-features/<feature-slug>/.cocos-migration-cache/
<source-project>/.claude/cocos-feature-migration/source-features/<feature-slug>/logs/cache/
```

若存在历史源分析或技术加速缓存，必须先判断是否可复用，至少检查：

1. 源项目路径是否一致；
2. 功能名 / `feature_slug` 是否一致；
3. 已确认入口是否一致（若已有）；
4. 上次分析记录的 branch / commit 是否与当前一致；
5. `confirmed-entries.json`、`source-entry-closures/<entry-hash>.json`、资源索引中的 `source_branch` / `source_commit` 是否与当前一致；
6. 用户本轮是否明确要求强制刷新。

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

每个步骤开始前，必须先读取 `controller-checkpoint.compact.md`（如存在）和对应侧的 manifest；再优先读取 compact 摘要；只有 checkpoint / compact 缺失、不一致、状态为 `stale` 或需要核查具体证据时，才读取完整步骤文件。

#### 目标侧步骤（第 1、5、6、7 步）

1. 读取 `迁移清单.md`。
2. 按阶段优先读取结构化 JSON 与 compact：
   - 第 5 步优先读取 `05x-target-shared-search.compact.json`（如存在）、`源侧摘要.compact.md`、`目标能力摘要.compact.md`、`保真风险摘要.compact.md`、`资源迁移计划摘要.compact.md` 与 `目标差异摘要.compact.md`（如存在）；
   - 第 6 步优先读取 `migration-dry-run.json`（如存在）、`目标差异摘要.compact.md` 与 `迁移状态摘要.compact.md`（如存在）；
   - 第 7 步优先读取 `migration-static-check.json`、`最终状态摘要.compact.md`、`源侧摘要.compact.md`、`目标差异摘要.compact.md`、`迁移状态摘要.compact.md`（如存在）；若 `migration-static-check.json` fresh，final-report-writer 不读取完整 `07-迁移验证.md`，只引用路径。
3. 若 `phase_runtime` 显示某 agent `running` 但 required artifacts 已存在，按 `completed_with_agent_output_missing` 收割；若 required artifacts 缺失且 agent 已 idle/无返回，按 `agent-output-missing` 规则追问一次或重启一次。
4. 仅在 compact 缺失、不一致、状态为 `stale`、证据不足或用户要求细节时，读取当前步骤对应的完整 md 文件。

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
7. Main/controller 写回或恢复时默认只读 checkpoint、当前阶段 state compact、结构化 JSON 和 manifest 必要片段；完整步骤 md 只在 compact/JSON 缺失、stale、冲突、证据不足或用户要求时读取。

写回位置要求：

- 第 2、3、4 步：默认写回源项目目录；
- 第 1、5、6、7 步：默认写回目标项目目录；
- 目标项目 `迁移清单.md` 必须记录当前引用了哪份源分析，以及引用模式。

如果流程在等待用户确认时中断，新的对话应能仅通过读取 `迁移清单.md` 和 `源分析清单.md` 判断当前卡点。

### Final manifest phase_runtime 收口

`final-report-writer` 收口时必须更新 `迁移清单.md` 的 `phase_runtime`：

```yaml
phase_runtime:
  current_phase: completed
  last_completed_phase: 07-final-report
  workflow_status: static-pass | partial-pass-static | blocked-static
  active_agents: []
  active_agent: null
  watchdog:
    enabled: false
    status: completed
  pending_agent_shutdowns: []
  superseded_agents: []
  required_artifacts:
    declared: []
    existing: []
    missing: []
  required_artifacts_pending: []
  output_mode: compact_plus_logs
  merge_owner: final-report-writer
  user_confirmation_owner: controller
```

如果未能写入，必须在 `使用效果监控.md` 记录 `execution_gap.manifest_phase_runtime_not_closed`。

### 使用效果监控写回要求

本 skill 已接入使用效果监控。监控规范文档固定保存在本 skill 目录下：

`USAGE_MONITORING.md`

读取规则：只读取当前 skill 目录中的 `USAGE_MONITORING.md`。若监控规范不存在或不可读，应在 `使用效果监控.md` 的“发现的问题”中记录监控规范缺失风险，并继续按本 skill 的最低监控字段生成阶段性或最终记录。

每次执行本 skill 时，必须在以下时机读取该监控规范，并生成或更新 `使用效果监控.md`：

1. **迁移流程正常完成时**：在写入 `迁移总结.md` 后生成最终 `使用效果监控.md`。
2. **流程被阻塞时**：例如等待用户确认入口、ts-graph MCP 不可用、`cli-anything-cocoscreator` 不可用时，也必须生成阶段性 `使用效果监控.md`，记录当前阻塞点和已完成步骤。
3. **流程中断但已有阶段产物时**：若已经写入任一步骤 md 或任一侧 manifest，应同步生成阶段性监控记录，方便后续复盘。

`使用效果监控.md` 默认保存到当前目标迁移任务目录：

`<target-project>/.claude/cocos-feature-migration/migrations/<feature-slug>/使用效果监控.md`

`使用效果监控.md` 至少按监控等级输出。

#### standard 监控（默认）

适用于正常完成、小任务、阶段性阻塞和中断恢复。至少包含：

- 任务信息：skill、源项目、目标项目、功能名、日期、最终状态
- 总评分：默认使用 **100 分制** 输出；如监控规范或历史样例使用 5 分制，必须同时给出折算分，例如 `88/100（4.4/5，A-）`
- 分模块得分：触发与参数澄清、前置检查、Resume、入口定位、代码闭包、资源闭包、目标差异、迁移动作、验证摘要
- Agent 总耗时汇总：每个阶段 agent 的 `started_at`、`ended_at`、`total_duration_seconds`、状态、最慢步骤摘要；若未记录精确耗时，写“未记录精确耗时”
- 慢操作 Top 3：跨所有 agent 汇总耗时最长或影响最大的 3 个步骤；若没有精确耗时，可按阻塞/重试/工具慢点列出
- 硬门禁执行结果：ts-graph MCP、`cli-anything-cocoscreator`、Git 快速预检、目标 feature 分支确认、源入口/边界确认、高风险语义确认等是否执行和证据
- 待确认项生命周期：只列 open / 本轮关闭 / 影响最终状态的确认项
- Compact 摘要质量：只列缺失、stale、冲突或无法支撑下一阶段的 compact
- Agent 协作风险：只列实际出现或高风险接近触发的问题，例如共享文件覆盖、越权写业务代码、待确认项被覆盖
- 关键证据路径：`迁移清单.md`、`源分析清单.md`、步骤 md、`迁移总结.md` 等
- 发现的问题、用户反馈、优化建议、是否需要更新 `SKILL.md`

#### detailed 监控（按需）

仅在用户要求性能复盘、出现明显慢操作、流程阻塞、回派修复超过 1 次、大型迁移任务或 final-report-writer 判断必要时输出。除 standard 字段外，补充：

- 步骤耗时：每个步骤的 `started_at`、`ended_at`、`duration_seconds`，并区分工具耗时、等待用户确认耗时和主要人工/AI 分析耗时
- Agent 步骤耗时明细：每个 agent 内部每个步骤的类型、主要操作、输出/证据、是否慢操作、慢操作原因和优化建议
- 慢操作 Top 10
- Agent 耗时结构分析：按工具调用、AI 分析、文件写入、等待用户、等待主控等类别汇总总秒数和占比
- Agent 耗时可观测性评分
- Agent 执行质量完整概览
- 待确认项完整生命周期
- Compact 摘要完整质量矩阵
- 下一次复用清单

阻塞态或中断态若只完成少量步骤，默认输出 standard 监控，不强制生成 detailed 的 Top10、完整结构分析或全量步骤耗时。

“下一次复用清单”至少应覆盖：

| 类别 | 必填内容 |
|---|---|
| 入口 / UIID / route | 本功能关键入口、UI ID、prefab route、bundle 名、目标接入点 |
| API / request 语义 | 关键接口 path、request DTO、activity/task 字段、rankType / timezone / currency 等语义字段 |
| gating / native / KV | 开关链、native/KV key、远端配置 key、默认 fallback 及其风险 |
| 事件闭环 | event enum、producer、consumer、刷新链路 |
| Prefab / UUID | 关键 prefab、脚本 `.meta`、字体/材质/Sprite/子 prefab uuid、默认头像/coin 等隐藏依赖 |
| 动态资源 | 运行时拼接路径、语言/地区/appName 分支资源、fallback 资源 |
| 可复用目标能力 | 目标项目已复用的公共组件、网络层、列表组件、头像/远程图片组件、公共字体/材质 |

如果某类不存在，应写“本功能未发现”，不要省略。该清单用于下一次同类 Cocos 功能迁移快速复核，但不得替代新任务的源侧边界确认和目标差异分析。

最终回复用户时，必须明确报告监控输出路径，例如：

`监控记录已输出：<target-project>/.claude/cocos-feature-migration/migrations/<feature-slug>/使用效果监控.md`

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
