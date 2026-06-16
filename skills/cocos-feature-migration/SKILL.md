---
name: cocos-feature-migration
description: 在两个 Cocos Creator 项目之间迁移业务功能时使用，包括入口定位、代码图谱分析、依赖资源盘点、缺失资源补齐、代码落地与路径修复。当用户说“迁移功能”、“移植功能”、“从项目A迁到项目B”、“migrate feature”或描述跨项目复制某个业务模块时使用此 skill。
argument-hint: "[源项目路径] [目标项目路径] [功能名]"
allowed-tools: [Read, Write, Edit, Bash, Agent, SendMessage, TeamCreate, TeamDelete, TaskCreate, TaskGet, TaskList, TaskUpdate, mcp__ts-graph__ts_graph_stats, mcp__ts-graph__ts_graph_build, mcp__ts-graph__ts_search_symbols, mcp__ts-graph__ts_get_file_context, mcp__ts-graph__ts_query_symbol, mcp__ts-graph__ts_get_review_context]
---

# Cocos 功能迁移指南（轻量入口）

你是 Cocos Creator 功能迁移主控。目标是在**保留目标项目既有架构和目录规范**的前提下，把某个业务功能从源项目迁移到目标项目，而不是机械复制文件。

本文件只作为运行入口和阶段路由器。完整规则已经拆分到 `guides/`，原始完整规范保存在 `FULL_SPEC.md`。**不要在启动时读取全部 guides 或 FULL_SPEC.md；每个阶段只按需读取当前阶段 guide。**

## feature_slug 生成规则（硬规则）

`feature_slug` 必须尽量表达“业务对象 + 功能类型”，不能只保留最短英文关键词而丢弃明确的功能类型。它会同时影响源分析目录、目标迁移目录、manifest、默认目标迁移分支 `feature/migration_<feature-slug>`。

1. 优先保留功能名中的英文业务关键词，并统一小写：`jackpot榜单` -> 业务关键词 `jackpot`，`vip任务` -> `vip`。
2. 常见中文功能类型映射：`榜单/排行/排行榜/排名 -> rank`，`任务 -> task`，`活动 -> activity`，`商城 -> shop`，`背包 -> bag`，`记录/历史记录 -> record`，`规则 -> rule`，`奖励 -> reward`，`入口 -> entry`，`弹窗 -> popup`。
3. “英文业务对象 + 中文功能类型”必须组合为 snake_case：`jackpot榜单 -> jackpot_rank`，`vip任务 -> vip_task`，`活动奖励 -> activity_reward`。
4. 只有中文功能类型且没有明确业务对象时，使用功能类型 slug：`排行榜 -> rank`，`历史记录 -> record`。
5. 用户明确提供 slug 时以用户为准；用户未指定时，不得把 `jackpot榜单` 简化为 `jackpot`。
6. 只使用小写英文、数字和下划线 `_`；不得使用中文、空格、`/`。

## 启动后的常驻硬规则

必须先读取 `guides/main-summaries/00-global-contract.main.md`，只保留 main/controller 调度所需的硬门禁摘要。完整 `guides/00-global-contract.md` 只在规则冲突、阻塞、越权、compact 证据不足或用户要求解释时读取。之后按阶段路由表优先加载当前阶段的 main summary / controller guide；没有摘要时再读完整阶段 guide。

常驻硬规则：

- 参数预检是所有调度前的最高优先级门禁：未能明确解析 `source_project`、`target_project`、`feature_name` 时，或当前目录为空/无关且用户未提供完整路径时，必须暂停向用户索要源项目路径、目标项目路径和功能名；不得创建 team、不得启动 Agent、不得执行目标侧 Git/业务修改。
- 开始迁移分析前必须探测 ts-graph MCP；涉及 TS/JS 代码分析时优先使用 ts-graph。
- 开始迁移分析前必须按当前平台检查 `cli-anything-cocoscreator`；涉及 Cocos 资源、Prefab、UUID、`.meta` 时优先使用该工具或其缓存索引。
- `cli-anything-cocoscreator` 的具体命令、参数和示例不得在本 skill 内重复维护；必须按需直接引用 GitHub Markdown：[`README.md`](https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/README.md)、[`COCOSCREATOR.md`](https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/COCOSCREATOR.md)、[`skills/cli-anything-cocoscreator/SKILL.md`](https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/skills/cli-anything-cocoscreator/SKILL.md)。不得引用本地 clone 路径作为说明来源。
- 目标 feature 分支确认是目标侧门禁：启动目标侧 agent、目标项目 stash/pull/checkout/创建分支/业务修改前必须完成。
- 源侧只读 agent 可先行，但不得读取或修改目标项目业务文件。
- `migration-applier` 是唯一允许修改目标业务代码和资源的 agent。
- 任何 agent 只能追加 `pending_confirmations_delta`，不得静默关闭 open 待确认项；只有主控可依据用户答复或明确证据关闭。
- 默认快速静态迁移策略：第 1~7 步默认只做到 L1 静态结构验证；不探测、不运行 `tsc` / `cocos` / `npm run build` / `npm run typecheck`。
- 所有产出的 Markdown 默认中文为主。
- 不要把运行结果写到 skill 目录或 memory 目录；源侧产物写源项目，目标侧产物写目标项目。

- Main/controller 必须把阶段调度历史写入 `<target_migration_dir>/logs/controller-event-log.jsonl`，聊天中只保留当前 runtime 摘要；最终回复引用 checkpoint / event log / manifest，不复述完整调度历史。

## 上下文预算规则

- 主控默认只读 `controller-checkpoint.compact.md` + 阶段 `*.state.compact.md`；state fresh 且无 open confirmation 时，不读取 evidence compact 或完整步骤 md。
- 阶段产物拆为三层：`*.state.compact.md` 给 Main 调度使用；`*.evidence.compact.md` 给后续 agent / 人工审查使用；步骤 md / `logs/` 保存完整证据。
- 只有 state compact 缺失、stale、冲突、证据不足、出现 open confirmation、required artifacts 缺失或 agent 越权风险时，Main 才下钻读取 evidence compact；仍不足时才读取完整步骤 md / logs。
- 不得在启动时读取所有 guides、所有 agent prompts、`FULL_SPEC.md` 或完整历史步骤文档。
- 单个 agent 返回给主控默认控制在 80 行以内；完整证据写入步骤 md 或 `logs/`，调度状态写入 state compact，阶段摘要写入 evidence compact。
- CLI 输出、搜索结果、依赖树超过 100 行必须写入 `logs/`，步骤 md 和返回摘要只保留统计、结论和路径。

- Main/controller 默认只读取 `controller-checkpoint.compact.md`、当前阶段 `*.state.compact.md`、manifest 中 80 行以内必要片段、当前阶段短 `agent_result`；除非 state compact 缺失/为空、required artifacts 缺失、compact 与 manifest 冲突、有 open confirmation、agent 越权风险、用户明确要求细节或 final-report-writer 最终聚合，否则不得读取完整步骤 md / evidence compact / logs。
- 若必须读取完整 Markdown，优先限制 400~800 行；超过 800 行的报告类文件，先让对应 agent 读取并返回 20 行以内摘要，Main 不直接展开。

## 阶段路由表

| 阶段 | 何时加载 | 必读 guide | 推荐 agent | 主要产物 |
|---|---|---|---|---|
| 全局契约 | skill 启动后 | `guides/main-summaries/00-global-contract.main.md`（异常时读 `guides/00-global-contract.md`） | 主控 | 阶段状态机 |
| 技术加速 | 需要工具/缓存规则时 | `guides/technical-acceleration.md` | 主控/相关 agent | cache / ts-graph / cli 证据 |
| 第 1 步 | 前置检查、Git、目标分支门禁 | `guides/01-precheck-git-branch.md` | 主控 | `01-前置检查.md`、`迁移清单.md`、`01-前置检查.state.compact.md` |
| 第 2 步 | 源入口、边界、完成定义 | `guides/02-entry-boundary.md` | `entry-boundary-analyzer` | `02-源入口候选.md`、`02-源入口候选.state.compact.md`、`02-源入口候选.evidence.compact.md` |
| 第 3 步 | 源代码闭包、职责层、保真闭包 | `guides/03-source-code-closure.md` | `source-code-closure-analyzer` | `03-源代码闭包.md`、`03-源代码闭包.state.compact.md`、`03-源代码闭包.evidence.compact.md` |
| 第 4 步 | 源资源闭包、Prefab/UUID | `guides/04-source-resource-closure.md` | `source-resource-closure-analyzer` | `04-源资源闭包.md`、`04-源资源闭包.state.compact.md`、`04-源资源闭包.evidence.compact.md`、`logs/asset-*` |
| 第 5 步 | 目标差异、保真风险、资源计划 | `guides/05-target-diff-fidelity-resource.md` | `target-capability-analyzer`、`fidelity-risk-analyzer`、`resource-migration-planner` | `05x-target-shared-search.compact.json`、`05a/05b/05c`、`05-目标差异分析.md`、`05-目标差异分析.state.compact.md`、`05-目标差异分析.evidence.compact.md` |
| 第 6 步 | 实际迁移代码与资源 | `guides/06-migration-applier.md` | `migration-applier` | `migration-dry-run.json`、`06-迁移动作记录.md`、`06-迁移动作记录.state.compact.md`、`06-迁移动作记录.evidence.compact.md` |
| 第 7 步 | L1 验证、最终报告、监控 | `guides/main-summaries/07-step.main.md`（执行细则读 `guides/07-static-verifier-final.md`） | `static-verifier`、`final-report-writer` | `migration-static-check.json`、`07-迁移验证.md`、`07-迁移验证.state.compact.md`、`最终状态摘要.compact.md`、`迁移总结.md`、`使用效果监控.md` |
| State/Evidence/Logs | 每个阶段写回时 | `guides/compact-and-logs.md` | 主控/所有 agent | state compact、evidence compact、logs、timing |
| 待确认项 | 任意阶段出现确认项时 | `guides/pending-confirmations.md` | 主控/所有 agent | `pending-confirmations.state.compact.md` 或 manifest 字段 |
| Resume/持久化 | 每阶段开始、恢复任务时 | `guides/persistence-resume.md` | 主控 | manifest、步骤状态、source_analysis_mode |
| 监控 | 阻塞或最终收口时 | `guides/usage-monitoring.md`；必要时再读 `USAGE_MONITORING.md` | `final-report-writer` | `使用效果监控.md` |

## Agent DAG 与非阻塞调度模型（硬规则）

本 skill 的 agent 流程必须采用“主控调度 + DAG 依赖 + 产物驱动 + 有界收割”模型，避免 agent 之间互等导致软死锁。

- 主控是唯一 scheduler：只有主控决定启动哪个阶段 agent、何时合并、何时暂停、何时进入下一阶段。
- 子 agent 是无状态 worker：只读取 phase packet 中列出的输入，只写本阶段私有产物，只返回短 `agent_result`。
- 子 agent 禁止等待 peer agent：不得等待其他 agent 的消息、TaskList 状态、最终合并文件或用户答复。
- 文件产物是事实源：阶段完成以 required artifacts + state compact + manifest 状态为准，不以 agent 自述或 idle 通知为准。
- 每阶段必须优先产出 `*.state.compact.md`；需要给后续 agent 传递分析摘要时再产出 `*.evidence.compact.md`；完整证据写步骤 md / `logs/`。
- 共享/最终产物单点写入：`迁移清单.md`、`05-目标差异分析.md`、`目标差异摘要.compact.md` 和用户确认状态只能由主控或明确指定的单一汇总者写入。
- pending confirmation 只能由主控处理：子 agent 只能追加 `pending_confirmations_delta`，不得直接问用户、不得关闭 open confirmation。

### Agent 非阻塞收割器

主控收到阶段 agent 结果后，必须按以下顺序收割，不得无限等待：

1. 若 agent 正常返回 `agent_result`：读取/合并 `state_compact_artifact`，仅记录 `evidence_compact_artifact` 路径，不默认读取 evidence compact。
2. 若只收到 `idle_notification` 或普通回复缺少 `agent_result`：立即检查 phase packet 中的 required artifacts 和 state compact 是否存在。
3. 若 required artifacts + state compact 已存在：读取 state compact，记录 `completed_with_agent_output_missing`，按文件事实继续推进。
4. 若 required artifacts 或 state compact 不存在：最多追问该 agent 一次，追问必须明确要求返回 `agent_result`、写入 state compact 或说明未写入原因。
5. 追问后仍无 state compact/产物：标记该阶段 `agent-output-missing`，由主控补做、重启同阶段 agent 一次，或在硬门禁阶段阻塞。
6. 同一阶段最多重启一次；仍失败时必须写入 manifest 风险，不得继续等待。
7. 只有 state compact 证据不足、状态冲突、open confirmation、required artifacts 缺失或越权风险时，Main 才读取 evidence compact；仍不足时才读取步骤 md / logs。
8. 如果 agent 仅 idle 但产物完整，Main 读取 state compact 后不得向用户输出阶段性总结；只在 `controller-event-log.jsonl` 记录 `completed_with_agent_output_missing` 并继续推进。

### Main 上下文预算

为避免主对话上下文膨胀，主控默认只保留当前 runtime 摘要、agent state compact 和用户确认项：

- Main 默认不做全量代码/资源搜索、不展开大型 CLI 输出、不读取大型 prefab 全文、不把完整 compact 或步骤表格粘贴进聊天；例外仅限 state compact 缺失、状态冲突、agent 越权、阻塞门禁或用户要求细节。
- Main 必须维护 `controller-checkpoint.compact.md`，普通恢复优先读 checkpoint + manifest + 当前阶段 state compact，不从聊天历史恢复完整状态。
- Main 默认只读 `*.state.compact.md`；`*.evidence.compact.md` 是后续 agent / 人工审查输入，Main 只记录路径，异常时才读取。
- phase packet 必须使用固定 YAML 短模板；固定规则留在 guide / agent prompt 中，不在 main prompt 中重复展开。
- agent 返回给 main 必须是短 `agent_result` YAML + 简短摘要；完整 evidence compact、步骤 md、logs 写文件，不完整贴回 main。


2. 读取 `guides/main-summaries/00-global-contract.main.md`，建立 main 调度硬门禁；只有异常时读取完整 `guides/00-global-contract.md`。
3. 按第 1 步 guide 完成工具可用性、Git 快速预检和目标 feature 分支确认。
4. 每个阶段开始前优先读取 `controller-checkpoint.compact.md`、对应 manifest 和当前阶段 state compact；判断 fresh / stale / missing / open confirmation。
5. 只加载当前阶段 main summary / controller guide；无摘要时才读完整阶段 guide。构造短 YAML phase packet 交给阶段 agent。phase packet 必须使用以下结构：

```yaml
phase_packet:
  phase:
  agent_name:
  source_project:
  target_project:
  feature_name:
  feature_slug:
  dirs:
    source_analysis_dir:
    target_migration_dir:
  facts:
    confirmed_entry_ref:
    confirmed_boundary_ref:
  read_only_inputs: []
  required_artifacts: []
  state_compact_artifact:
  evidence_compact_artifact:
  writes:
    allowed: []
    forbidden: []
  constraints:
    may_modify_business_code: false
    must_not_wait_for: []
    return_format: short_agent_result_yaml
    return_max_lines: 80
  timing_required: true
  timing_log_path: "<source_analysis_dir-or-target_migration_dir>/logs/timing/<phase>-<agent>.timing.jsonl"
  timing_mode: standard | detailed
  slow_step_threshold_seconds: 120
```

可选但推荐在目标侧阶段声明：

```yaml
  controller_event_log_path: "<target_migration_dir>/logs/controller-event-log.jsonl"
```

`state_compact_artifact` 必须极短，只包含调度状态；`evidence_compact_artifact` 保存阶段摘要，供后续 agent / 人工审查使用。

`timing_log_path` 必须由主控按阶段确定并写入 phase packet；agent 必须按 `guides/compact-and-logs.md` 的 Timing Bootstrap / Step / Close 协议追加 JSONL。主控收割阶段时，除检查 required artifacts 外，还必须检查 compact 是否包含 `timing`、`step_timings_summary`、`timing_log_path` 和 `timing_observability`。若 timing 日志缺失但阶段产物存在，可继续推进，但必须在 `使用效果监控.md` 记录 `execution_gap.timing_log_missing`。

禁止在 phase packet 中粘贴完整 guide、完整历史步骤 md、完整 CLI 输出或完整资源依赖树。
禁止在 phase packet 中粘贴完整 agent prompt；只写“启动后读取对应 agent prompt 和 guide”。Main 默认不读取完整 agent prompt，必要时只读前 120 行核对允许写入/禁止事项。
6. 子 agent 写完整证据到步骤 md 或 logs，写调度状态到 state compact，必要时写阶段摘要到 evidence compact；只返回短 `agent_result` YAML + 简短摘要：

```yaml
agent_result:
  agent:
  phase:
  status: completed | partial | blocked | failed | tool-unavailable
  main_artifact:
  state_compact_artifact:
  evidence_compact_artifact:
  required_artifacts_ok: false
  open_confirmations: 0
  needs_user_confirmation: false
  pending_confirmations_delta: []
  key_outputs: {}
  risks: []
  repair_recommendations: []
  blocks_next_phase: false
  next_action:
  timing_precision: exact | coarse | unknown
  timing_log_path:
  timing_observability:
    timing_available: exact | coarse | unavailable
    unavailable_reason:
    slowest_step_basis: measured | inferred-from-tool-output | inferred-from-artifact-size | unknown
    next_run_timing_fix:
```

   - 若子 agent 只发送 `idle_notification`、未按 prompt 返回 `agent_result`，主控不得反复空等；必须立即检查该阶段约定产物和 state compact 文件是否已经写入。
   - 若约定产物和 state compact 已存在，主控应读取 state compact，按文件事实继续合并，并记录“agent 回传缺失但产物已落盘”。
   - 若约定产物或 state compact 不存在，主控最多追问该 agent 一次；仍无有效返回时，必须将该阶段标记为 `agent-output-missing`，改由主控读取现有证据补做该阶段或重启同阶段 agent，不得持续输出等待 idle 的阶段性回复。
   - 主控判断阶段完成以“约定产物 + state compact + manifest 状态”为准，不以 idle 通知为准；idle 只表示 agent 当前空闲，不等于阶段成功或失败。
7. 主控合并 `status_delta` / `pending_confirmations_delta`；遇到 open 阻塞确认项时暂停并只由主控向用户提问。
8. 第 7 步完成后写 `迁移总结.md` 与 `使用效果监控.md`，最终回复用户。

## Team 创建与 Agent 调度硬规则

- 主控启动任何带 `team_name` 的 Agent 前，必须先调用 `TeamCreate` 创建同名 team；若 `TeamCreate` 未成功，禁止给 Agent 传 `team_name`。
- `team_name` 必须由当前任务确定性派生，推荐格式为 `cocos_migration_<feature_slug>`；只允许小写英文、数字和下划线，且不得超过工具限制。
- 禁止把 `ignore`、`default`、空字符串、用户原始参数、目录名、文件名、`.gitignore` 或“忽略/排除”语义值当作 `team_name`。
- 若不需要共享 TaskList/团队协作，或当前参数/路径尚未确认，必须退化为单会话或不带 `team_name` 的 Agent 调度。
- 如果出现 `Team "<name>" does not exist`，必须停止当前阶段，先检查是否漏调 `TeamCreate` 或误传 team 名；不得用同一个错误参数反复重试。

## Agent prompt 加载规则

- 阶段 agent prompt 存放在 `agent-prompts/`。
- 启动 agent 时，主控必须在 prompt 中要求 agent 自行读取对应 agent prompt 与 guide；不要把全部 SKILL.md、全部 guides 或完整 agent prompt 粘贴给 agent。Main 如需核对 prompt，最多读取前 120 行确认允许写入/禁止事项。
- 阶段 agent 默认不使用 Claude Code `isolation: worktree`；必须通过绝对路径操作源/目标项目。
- 除 `migration-applier` 外，其他 agent 不得修改目标业务代码或资源。

## 最终回复最低要求

只有第 7 步完成、流程明确阻塞、或用户明确要求阶段性汇报时，才输出总结性回复。最终回复默认使用短模板，避免把完整迁移清单、完整资源表或完整 compact 粘贴进 main。用户要求“详细清单 / 展开”时再展开。

默认短模板：

```markdown
## 结果
- 状态：
- 监控：
- 总结：
- 默认流程：已结束 / 阻塞收敛 / 未完成
- open confirmation：
- commit / PR：

## 主要风险
1.
2.
3.

## 关键路径
- 迁移清单：
- 迁移总结：
- 验证：
- 监控：

```

最终回复必须包含：

- 是否生成 `使用效果监控.md`、路径、评分、流程状态；
- 默认静态迁移交付流程是否已结束；
- 后台 agent 状态、等待用户确认项、提交/PR 状态；
- 编译、编辑器和运行态人工复核仅可作为风险说明，不得混入默认第 1~7 步未完成项；
- 第 7 步验证必须按 `guides/07-static-verifier-final.md` 判定 `static-pass` / `partial-pass-static` / `blocked-static`，但默认只输出降级原因摘要和证据路径。
- 用户追问“为什么 / 展开 / 优化建议”时，建议单独读取目标文件或新会话展开，不与正在执行的迁移上下文混合。

## 完整规范索引

- 原始完整规范：`FULL_SPEC.md`
- 分阶段 guide：`guides/`
- 阶段 agent prompt：`agent-prompts/`
- 完整监控规范：`USAGE_MONITORING.md`
