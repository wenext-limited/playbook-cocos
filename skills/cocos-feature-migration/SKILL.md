---
name: cocos-feature-migration
description: 在两个 Cocos Creator 项目之间迁移业务功能时使用，包括入口定位、代码图谱分析、依赖资源盘点、缺失资源补齐、代码落地与路径修复。当用户说“迁移功能”、“移植功能”、“从项目A迁到项目B”、“migrate feature”或描述跨项目复制某个业务模块时使用此 skill。
argument-hint: "[源项目路径] [目标项目路径] [功能名]"
allowed-tools: [Read, Write, Edit, Bash, Agent, SendMessage, Monitor, TaskCreate, TaskGet, TaskList, TaskUpdate, mcp__ts-graph__ts_graph_stats, mcp__ts-graph__ts_graph_build, mcp__ts-graph__ts_search_symbols, mcp__ts-graph__ts_get_file_context, mcp__ts-graph__ts_query_symbol, mcp__ts-graph__ts_get_review_context]
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
- 开始迁移分析前必须探测 ts-graph MCP；涉及 TS/JS 代码分析时优先使用 ts-graph。若 ts-graph 不可用，不默认完全卡住流程：进入 `execution_mode: degraded`，用 `rg`/Read/import 文本扫描降级完成代码闭包，并把代码依赖置信度和最终状态上限写入 manifest / compact / 使用效果监控。
- 开始迁移分析前必须按当前平台检查 `cli-anything-cocoscreator`；涉及 Cocos 资源、Prefab、UUID、`.meta` 时优先使用该工具或其缓存索引。若 CLI 不可用，不默认完全卡住流程：进入 `execution_mode: degraded`，用 Prefab / `.meta` 文本扫描、uuid reverse index、缓存索引降级分析；关键 Prefab / 资源无法静态证明时最终最高 `partial-pass-static` 或 `blocked-static`。
- `cli-anything-cocoscreator` 的具体命令、参数和示例不得在本 skill 内重复维护；必须按需直接引用 GitHub Markdown：[`README.md`](https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/README.md)、[`COCOSCREATOR.md`](https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/COCOSCREATOR.md)。不得引用本地 clone 路径作为说明来源。
- 所有需要用户选择的确认菜单必须使用大写字母选项（`A/B/C/...`），不得使用 `1/2/3/...` 作为可回复选项；提示语写“直接回复字母或文本即可”。数字只允许用于过程步骤、检查项、问题分组编号或文档内部有序说明，不得作为目标分支策略、迁移范围/功能边界、源分析缓存处理、保真风险确认等菜单内的可回复选项。
- 当同一轮需要向用户展示多个确认菜单时，必须使用数字只做问题分组标题，例如 `1、目标分支策略`、`2、功能边界`；每个问题分组内的菜单选项都必须从 `A` 重新开始，不得跨分组延续为 `D/E/F/...`。提示语必须明确可回复格式，例如“直接回复 `1C，2A`，或回复 `分支 C，边界 A`；也可直接回复完整策略文本”。示例：
  ```text
  1、目标分支策略
  A. 继续当前本地分支：适合确认当前分支就是承接分支。
  B. 从当前本地分支创建默认迁移分支：base=当前本地分支。
  C. 从 origin/main 创建默认迁移分支：选择后先只读校验 origin/main。
  D. base=origin/xxx：用户指定远程基线，选择后先校验。
  E. branch=feature/xxx：用户指定目标功能分支，选择后先校验/切换。
  F. 暂停。

  2、功能边界
  A. 入口 + 主榜单闭环：纳入入口、榜单入口浮层、榜单详情页、数据闭环。
  B. 仅入口：只纳入入口和入口浮层，不纳入完整榜单页。
  C. 扩大到相邻链路：纳入入口、榜单、中奖弹窗、规则页、结算相关链路。

  直接回复 1C，2A；或回复“分支 C，边界 A”；也可直接回复完整策略文本。
  ```
- 目标 feature 分支确认是目标侧门禁：启动目标侧 agent、目标项目 stash/pull/checkout/创建分支/业务修改前必须完成。确认菜单必须使用纯文本字母策略菜单，不得压缩成二选一；至少保留“继续当前本地分支”“从当前本地分支创建默认迁移分支”“从 origin/main 创建（选择后校验或已校验）”“base=origin/xxx”“branch=feature/xxx”“暂停”，并在条目中写明创建基线和适用场景。默认推荐顺序：用户显式指定分支优先；否则优先推荐“从 origin/main 创建”以获得干净迁移基线；若远程不可用或校验失败，推荐“从当前本地分支创建”；只有用户明确希望叠在当前分支上时才推荐“继续当前本地分支”。未提前远程探测时，远程基线/远程迁移分支可作为“选择后校验”策略展示；用户选择后再做只读远程校验，失败则阻塞说明原因。
- 源侧只读 agent 可先行，但不得读取或修改目标项目业务文件。入口/边界确认关闭后，`source-code-closure-analyzer` 与资源预取可并行：资源预取只允许基于已确认入口、UIConfig、route、关键 Prefab 和缓存索引提前生成 Prefab/UUID/asset index；最终 `04-源资源闭包.md` 仍必须在第 3 步代码闭包完成后合并动态资源语义。
- 第 5 步默认采用 `05x shared search -> 05a/05b/05c fan-out -> controller merge`：生成 fresh `05x-target-shared-search.compact.json` 后，`target-capability-analyzer`、`fidelity-risk-analyzer`、`resource-migration-planner` 可并行启动。三个 agent 只能写私有产物，缺少彼此结论时写 `unknown/pending-merge`，不得等待对方或等待最终 `05-目标差异分析.md`；最终由 controller 单点合并和裁定确认项。**05x fan-out 的唯一 hard input 是 `05x-target-shared-search.compact.json`；`logs/05x-target-capability-index.json`、`logs/05x-target-resource-index.json`、`logs/05x-target-uuid-index.json` 只能作为 optional performance cache / best-effort 旁路输入，缺失、partial、skipped 不得阻塞 05a/05b/05c 启动，不得进入 fan-out `required_artifacts`。** **05x 后 fan-out 是硬门禁：只要 `05x` fresh、目标分支门禁已关闭且无 blocking confirmation，Main/controller 必须在同一轮 controller turn 内完成 05a/05b/05c 的 state bootstrap、artifact-contract-manifest 更新、Agent 启动和 watchdog 安排；禁止只生成 05x 后结束回复、等待用户追问或等待下一轮。若任一 fan-out 启动失败，必须立即写入 checkpoint / controller-event-log / 阶段性 `使用效果监控.md`，并在聊天中说明阻塞原因与已启动/未启动清单。** Controller merge 必须执行 `controller_merge_resolution_summary`：按 `user-specified > backend-doc > target-existing > source > static-tool > inferred > unknown` 证据优先级裁决 05a/05b/05c 冲突；保真风险与 open confirmation 优先于复用/资源计划；未裁决的 blocking conflict 不得进入第 6 步，非阻塞冲突写入 `step6_constraints` / 第 7 步 review，不得卡主整个流程。
- 第 2 步 entry-boundary 是 03/04 authoritative source closure 的硬前置：若存在多个合理入口、多个合理功能边界、`needs_user_confirmation=true`、`confirmation_topic: exact-entry|feature-boundary` 或任何未关闭的边界不清信号，Main/controller 不得启动 03/04 正式闭包；最多只允许继续非权威候选收集或 compact/cache 读取，必须先向用户确认并写入 `confirmed_entry` / `confirmed_boundary`。
- 阶段写入权限分层是硬规则：01/02/03/04/05/07/final 只能只读源/目标业务文件或写 `.claude/cocos-feature-migration/**` 迁移分析产物、logs、compact、manifest；不得修改目标 `assets/**`、业务源码、prefab、meta、config。05c resource-migration-planner 只能规划 copy/reuse/rebind，不得实际复制资源。
- `migration-applier` 是唯一允许修改目标业务代码和资源的 agent。
- 资源复制必须以 confirmed boundary 内的 `source_path + uuid + referenced_by/entry_chain` 为准，不得按 basename、目录 glob 或“同名资源全量复制”扩散。04 必须标记资源 `boundary_status`，05c 的 copy plan 只能消费 `must_copy/rebind_required`，06 复制前必须执行 copy manifest preflight；同名候选未消歧或只被 excluded 模块引用的资源不得复制。
- 第 6 步业务语义落地必须默认照源保真，禁止 AI 自行发挥：除 import 路径、bundle 名、UI 注册路径、资源根路径、目标已有公共能力接入等必要适配外，不得无证据改写源 feature 相关字符串常量、接口地址、枚举值、请求参数、默认值、分支逻辑、静态字段结构和关键方法结构。任何“看起来应该适配目标项目”的改动，必须先有 `user-specified`、`target-existing` 或 `backend-doc` 证据；没有证据时保持源值 / 源结构，并把建议适配写入待确认项。该规则在迁移动作时生效，不要求新增迁移后全量 diff 流程。
- 第 6 步进入第 7 步前必须执行 `prefab script binding preflight`：关键 Prefab 的 expected scripts、目标脚本 `.meta` uuid、Prefab 文本 uuid / 短 uuid / 序列化脚本字段、Missing Script 特征必须写入 `prefab-static-check-cache.json`。可确定的一一映射问题由 `migration-applier` 修复；有歧义时不得自动改 Prefab，只输出 `repair_recommendations` 和 `must_not_run_automatically: true` 的 editor spot check 建议。
- 第 6/7 步必须执行关键 Prefab `__uuid__` 目标侧闭合检查：对入口 Prefab、主面板 Prefab、列表项 Prefab 和 confirmed core boundary 内 Prefab 文本中的所有 `__uuid__` 全量提取，剥离 `@subid` 后用目标项目 `.meta` uuid reverse index 反查。未命中项必须分类为 `missing-business-resource | public-resource-unrebound | builtin-like | unknown`；除充分分类的 builtin-like/editor-only 项外，关键 Prefab `prefab_uuid_closure.missing_count` 必须为 0 才能进入 `static-pass`。确定缺失的独立 Prefab/字体/材质/SpriteFrame/默认头像/coin 等资源必须在第 6 步补迁、复用改绑或阻塞，不得只依赖脚本绑定检查。
- 任何 agent 只能追加 `pending_confirmations_delta`，不得静默关闭 open 待确认项；只有主控可依据用户答复或明确证据关闭。
- 默认快速静态迁移策略：第 1~7 步默认只做到 L1 静态结构验证；不探测、不运行 `tsc` / `cocos` / `npm run build` / `npm run typecheck`。
- 所有产出的 Markdown 默认中文为主。
- 不要把运行结果写到 skill 目录或 memory 目录；源侧产物写源项目，目标侧产物写目标项目。

- Main/controller 必须把阶段调度历史写入 `<target_migration_dir>/logs/controller-event-log.jsonl`，聊天中只保留当前 runtime 摘要；最终回复引用 checkpoint / event log / manifest，不复述完整调度历史。
- 必须假设主对话上下文会在任意时刻自动压缩。压缩、恢复、中断或长时间空档后的第一动作必须是 `compaction_resume_handshake`：读取 `controller-checkpoint.compact.md`、`logs/artifact-contract-manifest.json`、`迁移清单.md` 的 `phase_runtime` 和当前阶段 `*.state.compact.md`，按文件事实恢复阶段、待确认项、active agents、required artifacts 和下一跳；不得凭聊天记忆继续。主控在用户确认关闭后、agent 启动前后、DAG transition 前后、第 6 步业务写入前后、最终回复前都必须写入耐压缩落盘快照：checkpoint + manifest phase_runtime + 当前 state compact + controller event log。

## 上下文预算规则

- Main/controller 默认优先读取阶段 `logs/phase-summary/<phase>-<agent>.summary.json`；JSON 缺失、stale、字段不足或冲突时才读取 `*.state.compact.md`，再按需下钻 evidence compact / 步骤 md / logs。
- 阶段产物拆为三层：`*.state.compact.md` 给 Main 调度使用；`*.evidence.compact.md` 给后续 agent / 人工审查使用；步骤 md / `logs/` 保存完整证据。
- 只有 state compact 缺失、stale、冲突、证据不足、出现 open confirmation、required artifacts 缺失或 agent 越权风险时，Main 才下钻读取 evidence compact；仍不足时才读取完整步骤 md / logs。
- 不得在启动时读取所有 guides、所有 agent prompts、`FULL_SPEC.md` 或完整历史步骤文档。
- 单个 agent 返回给主控默认控制在 80 行以内；完整证据写入步骤 md 或 `logs/`，调度状态写入 state compact，阶段摘要写入 evidence compact。
- CLI 输出、搜索结果、依赖树超过 100 行必须写入 `logs/`，步骤 md 和返回摘要只保留统计、结论和路径。

- Main/controller 默认只读取阶段 phase-summary JSON、`controller-checkpoint.compact.md`、当前阶段 `*.state.compact.md`、manifest 中 80 行以内必要片段、当前阶段短 `agent_result`；除非 JSON/state compact 缺失/为空、required artifacts 缺失、compact 与 manifest 冲突、有 open confirmation、agent 越权风险、用户明确要求细节或 final-report-writer 最终聚合，否则不得读取完整步骤 md / evidence compact / logs。
- 若必须读取完整 Markdown，优先限制 400~800 行；超过 800 行的报告类文件，先让对应 agent 读取并返回 20 行以内摘要，Main 不直接展开。

## 阶段路由表

| 阶段 | 何时加载 | 必读 guide | 推荐 agent | 主要产物 |
|---|---|---|---|---|
| 全局契约 | skill 启动后 | `guides/main-summaries/00-global-contract.main.md`（异常时读 `guides/00-global-contract.md`） | 主控 | 阶段状态机 |
| 技术加速 | 需要工具/缓存规则时 | `guides/technical-acceleration.md` | 主控/相关 agent | cache / ts-graph / cli 证据 |
| 第 1 步 | 前置检查、Git、目标分支门禁 | `guides/01-precheck-git-branch.md` | 主控 | `01-前置检查.md`、`迁移清单.md`、`01-前置检查.state.compact.md` |
| 第 2 步 | 源入口、边界、完成定义 | `guides/02-entry-boundary.md` | `entry-boundary-analyzer` | `02-源入口候选.md`、`02-源入口候选.state.compact.md`、`02-源入口候选.evidence.compact.md` |
| 第 3 步 | 源代码闭包、职责层、保真闭包 | `guides/03-source-code-closure.md` | `source-code-closure-analyzer` | `03-源代码闭包.md`、`03-源代码闭包.state.compact.md`、`03-源代码闭包.evidence.compact.md` |
| 第 4 步 | 源资源闭包、Prefab/UUID；入口确认后可先做 04a 资源预取，第 3 步完成后做 04b 合并闭包 | `guides/04-source-resource-closure.md` | `source-resource-closure-analyzer` | `04a-源资源预取.state.compact.md`（可选）、`04-源资源闭包.md`、`04-源资源闭包.state.compact.md`、`04-源资源闭包.evidence.compact.md`、`logs/asset-*` |
| 第 5 步 | 目标差异、保真风险、资源计划；默认 05x 后 05a/05b/05c 并行 fan-out | `guides/05-target-diff-fidelity-resource.md` | `target-capability-analyzer`、`fidelity-risk-analyzer`、`resource-migration-planner` | `05x-target-shared-search.compact.json`、`05a/05b/05c`、`05-目标差异分析.md`、`05-目标差异分析.state.compact.md`、`05-目标差异分析.evidence.compact.md` |
| 第 6 步 | 实际迁移代码与资源 | `guides/06-migration-applier.md` | `migration-applier` | `migration-dry-run.json`、`06-迁移动作记录.md`、`06-迁移动作记录.state.compact.md`、`06-迁移动作记录.evidence.compact.md` |
| 第 7 步 | L1 验证、最终报告、监控 | `guides/main-summaries/07-step.main.md`（执行细则读 `guides/07-static-verifier-final.md`） | `static-verifier`、`final-report-writer` | `migration-static-check.json`、`07-迁移验证.md`、`07-迁移验证.state.compact.md`、`最终状态摘要.compact.md`、`迁移总结.md`、`使用效果监控.md` |


04a 资源预取优先使用轻量 prompt `agent-prompts/source-resource-prefetch-analyzer.md`；04b 最终资源闭包再使用 `source-resource-closure-analyzer`。

| State/Evidence/Logs | 每个阶段写回时 | `guides/compact-and-logs.md` | 主控/所有 agent | state compact、evidence compact、logs、timing |
| 待确认项 | 任意阶段出现确认项时 | `guides/pending-confirmations.md` | 主控/所有 agent | `pending-confirmations.state.compact.md` 或 manifest 字段 |
| Resume/持久化 | 每阶段开始、恢复任务时 | `guides/persistence-resume.md` | 主控 | manifest、步骤状态、source_analysis_mode |
| 监控 | 阻塞或最终收口时 | `guides/usage-monitoring.md`；必要时再读 `USAGE_MONITORING.md` | `final-report-writer` | `使用效果监控.md` |

## v2 调度规划图（速度优先 + 不完全卡主）

本 skill 默认采用 v2 调度：**Main/controller 只调度与收割，事实写文件；只读分析尽早并行；工具或缓存不足进入 degraded mode；第 6 步内聚自检；第 7 步 cache-first 收敛**。

```text
用户调用
  -> Main Controller 参数预检 / feature_slug
  -> 并行轻量预检：ts-graph probe / cli probe / Git local read / 历史 compact-cache probe
      -> phase-summary JSON 优先收割，Markdown compact 作为降级读取
      -> 工具不足：execution_mode=degraded，继续只读分析并降低最终状态上限
      -> 硬停仅限：缺参数、目标侧 agent / 目标写入前分支未确认、越权写业务、破坏/覆盖风险、阻塞用户确认

02 entry-boundary confirmed：confirmed_entry + confirmed_boundary + open_confirmations=0
  ├─ 03 source-code-closure-analyzer
  └─ 04a source-resource-prefetch
        -> prefab/uuid/asset/resource-path index 预热

03 completed + 04a completed-or-skipped（AND join）
  -> 04b source-resource-closure final merge

04 completed + artifact harvest + phase_gate pass|constrained
  -> Controller 生成/刷新 05x-target-shared-search.compact.json
  -> 必须在同一 controller turn 内立即 fan-out 05a/05b/05c；不得只生成 05x 后停住或等待用户追问

05x fresh + target branch gate closed + no blocking confirmation
  ├─ 05a target-capability-analyzer
  ├─ 05b fidelity-risk-analyzer
  └─ 05c resource-migration-planner
      -> 三者只写私有产物，缺对方结论写 unknown/pending-merge，不互等
      -> Controller 单点 merge 05a/05b/05c
      -> 05x hard input 只有 05x-target-shared-search.compact.json；optional performance indexes 缺失不得阻塞 fan-out

05 merge completed + no blocking confirmation + step6_merge_gate.can_start_migration_applier=true
  -> 06 migration-applier
      -> migration-dry-run.json
      -> key file self-check
      -> prefab script binding preflight
      -> prefab-static-check-cache.json

06 -> 07 prefab binding gate
  -> critical binding pass：进入 07 static-verifier
  -> critical binding missing / script_uuid_resolvable=false：优先回派 06 修复，不能留到 07 首次阻塞
  -> only unknown 且满足安全条件：允许进入 07，但 final_status_max=partial-pass-static + editor review required

07 static-verifier
  -> cache-first L1 验证
  -> cache/CLI/ts-graph 不足则 verification degraded fallback
  -> 可自动修复静态问题默认最多回派 migration-applier 2 轮

final-report-writer
  -> final-report backscan：未消费 blocking gate / status cap / downgrade reasons
  -> 迁移总结 + 使用效果监控
  -> static-pass / partial-pass-static / blocked-static
```

### 门禁分层

```yaml
gate_layers:
  hard_stop:
    - missing source_project / target_project / feature_name
    - target branch gate before target-side agent / target git / business write
    - unauthorized target business write by non migration-applier
    - destructive overwrite/delete risk without user authorization
    - blocking user confirmation: exact-entry / feature-boundary / fidelity-risk / entry-semantics
    - required artifacts missing after prompt-once + restart-once with no recoverable evidence
  degraded_continue:
    - ts_graph_unavailable_or_query_failed
    - cli_anything_cocoscreator_unavailable_or_command_failed
    - cache_missing_or_stale
    - completed_with_agent_output_missing but required artifacts exist
    - public uuid / builtin-like / editor-only evidence partial
  non_blocking_note:
    - tsc/cocos/npm build/typecheck not run by default
    - editor/runtime/API real request not run by default
    - timing gap when artifacts are complete
```



- 主控是唯一 scheduler：只有主控决定启动哪个阶段 agent、何时合并、何时暂停、何时进入下一阶段。
- 子 agent 是无状态 worker：只读取 phase packet 中列出的输入，只写本阶段私有产物，只返回短 `agent_result`。
- 子 agent 禁止等待 peer agent：不得等待其他 agent 的消息、TaskList 状态、最终合并文件或用户答复。
- 文件产物是事实源：阶段完成以 required artifacts + state compact + manifest 状态为准，不以 agent 自述或 idle 通知为准。
- 每阶段必须优先产出 `*.state.compact.md`；需要给后续 agent 传递分析摘要时再产出 `*.evidence.compact.md`；完整证据写步骤 md / `logs/`。
- 共享/最终产物单点写入：`迁移清单.md`、`05-目标差异分析.md`、`目标差异摘要.compact.md` 和用户确认状态只能由主控或明确指定的单一汇总者写入。
- pending confirmation 只能由主控处理：子 agent 只能追加 `pending_confirmations_delta`，不得直接问用户、不得关闭 open confirmation。


#### Artifact finalization / helper 快速收割补充（P0）

所有阶段 phase packet 默认应带：

```yaml
artifact_write_deadline_seconds: 120
minimum_artifact_first_policy: true
doc_write_budget_seconds: 180
progress_commit_required: true
```

Main/controller 在 checkpoint 发现 required artifacts 仍缺失时，不必等到 soft timeout；第二个 checkpoint 起可向 agent 发送 `enter_artifact_finalization_mode`，要求优先写 phase-summary JSON / minimal artifacts。若主要动作产物已存在、只缺文档/summary/evidence compact，可触发 `controller_helper_completion`，补齐 canonical 产物并继续 DAG。

第 5 步 fan-out agent 必须优先写 `05a/05b/05c-merge-claims.summary.json`；controller merge 可先基于 claims JSON 裁决，完整 Markdown 后补但不得阻塞高风险确认和第 6 步门禁。

第 6 步 migration-applier 必须维护 `migration-progress.json`，业务写入和 prefab cache 完成后先标记 `applied/docs-writeback`，长文档补写不得卡住后续收割。

final-report-writer 必须 minimal-first；timing 聚合超过 120 秒时降级为 `timing_aggregation_status: partial` 并继续写最终报告。

### 调度可靠性增强：checkpoint + state bootstrap + heartbeat + watchdog + artifact harvest + DAG transition（硬规则）

为避免“agent 正在执行但主控无可见状态 / agent 只 idle 但主控未自动推进 / 用户询问才触发收割”，本 skill 的阶段调度必须在既有 DAG 模型上增加六件套可靠性机制。该机制只增加磁盘结构化状态和极短事件，不得把完整分析内容写入主对话。

```yaml
scheduling_reliability_contract:
  checkpoint:
    file: <target_migration_dir>/controller-checkpoint.compact.md
    purpose: main/controller 当前调度快照，不保存完整事实
    max_lines_default: 80
    must_include: [resume_cursor, last_user_decision, active_gate, transition_intent, required_artifacts, active_agents]
  state_bootstrap:
    owner: controller
    when: before_each_agent_spawn
    writes: phase state compact with status=running
  heartbeat:
    owner: agent
    file: <source_analysis_dir-or-target_migration_dir>/logs/heartbeat/<phase>-<agent>.heartbeat.json
    max_lines_default: 40
    content: scheduling_only_no_evidence
  watchdog:
    owner: controller
    preferred_tool: Monitor
    fallback: Bash run_in_background one-shot completion_or_timeout_check
    event_format: one_line_only
    unavailable_policy: do_not_wait; resume_or_checkpoint_must_run_artifact_harvest
  artifact_harvest:
    triggers: [agent_result, idle_notification, watchdog_event, user_status_question, resume]
    default_reads: [checkpoint, current_state_compact]
    checks: required_artifacts_existence
  dag_transition:
    owner: controller
    source_of_truth: required_artifacts + state_compact + manifest
  compaction_resume_handshake:
    triggers: [context_compaction, resume, interruption, user_status_question_after_long_gap]
    first_action: read checkpoint + manifest + phase_runtime + current state compact
    forbidden: continue_from_chat_memory
    output: recovered_phase_or_blocking_gap
  durability_barrier:
    required_before: [ask_user, spawn_agent, dag_transition, business_write, final_response]
    required_after: [user_confirmation_closed, agent_spawned, agent_harvested, business_write, phase_completed]
    writes: [checkpoint, artifact_contract_manifest, current_state_compact, controller_event_log]
```

#### State bootstrap

主控启动任何阶段 agent 前，必须先预创建或更新该阶段 `state_compact_artifact`，状态为 `running`。该 bootstrap state 只保存调度状态，不保存完整分析事实。agent 后续可以更新 `current_step` / timing / artifact checklist，但不得删除主控写入的 `phase_runtime`、`required_artifacts`、`restart_count` 等字段。

bootstrap state 至少包含：

```yaml
status: running
execution_status: running
last_updated_stage: <phase>
phase_runtime:
  phase: <phase>
  agent_name: <agent>
  agent_id: pending_until_spawned | <agent-id>
  lease_status: active
  restart_count: 0
  current_step: controller_spawn_prepared
  required_artifacts: []
  required_artifacts_pending: []
  heartbeat_path: <.../logs/heartbeat/<phase>-<agent>.heartbeat.json>
  watchdog_status: scheduled | unavailable
  next_harvest_reason: agent_result | idle | watchdog | checkpoint | soft_timeout | user_status_question | resume
user_confirmation:
  needs_user_confirmation: false
  pending_confirmation_count: 0
timing:
  timing_log_path: <.../logs/timing/<phase>-<agent>.timing.jsonl>
  timing_precision: pending
```

#### Heartbeat

agent 启动后必须尽快写 heartbeat 文件，并在关键步骤边界更新。heartbeat 只允许写调度可观测字段，不得写完整资源清单、完整搜索结果、完整 CLI 输出或完整 compact。

```json
{
  "phase": "04-source-resource-closure",
  "agent": "source-resource-closure-analyzer",
  "status": "running",
  "current_step": "asset deps/uuid/refs refresh",
  "completed_steps": 3,
  "total_known_steps": 5,
  "last_output_path": "logs/asset-deps-PanelGeneralRank-prefab.txt",
  "updated_at": "YYYY-MM-DD HH:mm:ss"
}
```

#### Watchdog

主控启动 agent 后必须安排 bounded watchdog，用于在完成、checkpoint、soft timeout 或失败时唤醒主控收割：

- 优先使用 `Monitor`，监听 required artifacts 是否齐全、state compact 是否完成、soft timeout 是否到达。
- 若 `Monitor` 不可用或权限不允许，使用 `Bash(run_in_background=true)` 启动 one-shot fallback：等到 artifacts 完整或 soft timeout 后退出并唤醒主控。
- 若 `Monitor` 与 Bash fallback 都不可用、watchdog `task_id` 丢失、无法查询、或 `next_checkpoint_at/soft_timeout_at` 已过期，必须在 checkpoint 写 `watchdog.status=unavailable`，并把 `resume_cursor.safe_resume_action` 置为 `harvest`；恢复后不得执行 `wait_watchdog`，必须立即 artifact harvest。
- watchdog 输出必须是单行事件，禁止输出完整文件内容。
- watchdog 不做业务判断，只报告 `artifacts_ok`、`state_status`、`missing_count`、`reason`。

示例：

```text
phase=04-source-resource-closure event=completed artifacts_ok=true state=completed
phase=04-source-resource-closure event=checkpoint elapsed=300 artifacts_ok=false missing_count=2
phase=04-source-resource-closure event=soft_timeout artifacts_ok=false missing_count=1
```

#### Artifact harvest

主控被 `agent_result`、`idle_notification`、watchdog 事件、用户状态询问或 resume 唤醒时，必须统一执行 artifact harvest，而不是按聊天历史猜状态：

1. 读取 `controller-checkpoint.compact.md`。
2. 读取 `<target_migration_dir>/logs/artifact-contract-manifest.json`（若存在），按 canonical required artifacts 做轻量 schema validation；只检查路径、非空、JSON 可解析和 compact 顶层必要字段，不展开 evidence / logs。
3. 检查 phase packet 中声明的 required artifacts 是否存在且非空。
4. 读取当前阶段 `state_compact_artifact`。
5. 若 watchdog unavailable、watchdog 句柄不可查或 checkpoint 已过期，不等待 watchdog，直接按当前磁盘事实执行本次 harvest。
6. 若 required artifacts + state compact 完整，且 `artifact_schema_validation.validation_status=pass|partial` 且不阻塞下一阶段：按文件事实推进；若缺少短 `agent_result`，记录 `completed_with_agent_output_missing`。
7. 若 canonical path 缺失但 alias / 相似产物存在：记录 `artifact_path_mismatch`，优先要求原 agent 或 controller helper 补写 canonical compact / phase-summary JSON；不得让 Main 展开大文件。
8. 若缺失且未追问：最多追问该 agent 一次，要求写 state compact 或返回失败原因。
9. 追问后仍缺失：同阶段最多重启一次，并把旧 agent 写入 `superseded_agents`。
10. 重启后仍缺失：写 manifest 风险并阻塞，不得无限等待。

#### DAG transition

阶段完成后，主控必须根据 checkpoint / state compact / manifest 明确执行下一跳，不能停在“等待用户追问”状态。默认 transition：

```text
01 completed -> 02 entry-boundary
02 confirmed no open confirmation -> 03 source-code-closure + optional 04a source-resource-prefetch in parallel
02 boundary ambiguous or confirmation open -> ask user; do not start authoritative 03/04 closure
03 completed + 04a completed-or-skipped -> 04b source-resource-closure final merge
04b completed and phase_gate.blocks.readonly_next=false -> generate/refresh 05x shared search
03/04b phase_gate.blocks.readonly_next=true -> block readonly target analysis / ask user / repair
05x required compact fresh + target branch gate closed + no blocking confirmation -> 05a target-capability + 05b fidelity-risk + 05c resource-plan in parallel
05x optional performance indexes missing/partial/skipped -> still fan-out; agents targeted refresh only
05a + 05b + 05c completed -> controller merge 05a/05b/05c
05 merge completed + phase_gate.blocks.business_write=false + no blocking confirmation -> 06 migration-applier
05/03/04 any phase_gate.blocks.business_write=true -> propagate into step6_merge_gate.can_start_migration_applier=false unless controller explicitly allow-with-constraint + status cap
06 completed + prefab-static-check-cache.json written + critical prefab script binding gate passed -> 07 static-verifier
06 prefab binding missing/unknown on critical prefab -> migration-applier prefab_binding_repair_mode (max 2 rounds); missing/script_uuid_resolvable=false/deterministic repair failed blocks before 07; unknown-only may enter 07 only with final_status_max=partial-pass-static + editor review required
07 verifier completed -> final-report-writer
final-report gate backscan finds unconsumed blocking gate -> downgrade/block final_status before minimal-first writeback
final-report completed -> workflow static-pass | partial-pass-static | blocked-static
```


#### 06 -> 07 Prefab 脚本绑定硬门禁（P0）

第 6 步进入第 7 步前，controller 不得只检查 `prefab-static-check-cache.json` 是否存在；还必须检查关键 Prefab 的脚本绑定结果。

```yaml
step6_to_step7_prefab_binding_gate:
  owner: controller
  required_before_static_verifier: true
  cache: <target_migration_dir>/prefab-static-check-cache.json
  critical_prefab_scope:
    - entry prefab
    - main panel prefab
    - list item prefab
    - any prefab whose expected_scripts is non-empty and belongs to confirmed core boundary
  pass_when:
    - prefab_script_binding_preflight.status == pass
    - unknown_or_missing_count == 0 for critical_prefab_scope
    - every critical expected script has binding_evidence in [direct, secondary]
  repair_when:
    - binding_evidence == missing for critical_prefab_scope
    - binding_evidence == unknown for critical_prefab_scope and no repair attempt has been recorded
    - script_uuid_resolvable == false for critical_prefab_scope
  repair_action:
    - dispatch migration-applier with prefab_binding_repair_mode
    - max_repair_rounds: 2
    - repair must update prefab-static-check-cache.json and phase-summary JSON
  allow_07_with_status_cap_when:
    - only remaining issue is binding_evidence == unknown for critical_prefab_scope
    - target script and .meta exist
    - no Missing Script signature is found
    - at least one repair attempt or deterministic repair evaluation has been recorded
    - no unique safe prefab text rewrite position exists
    - final_status_max: partial-pass-static
    - editor_prefab_binding_review_recommendation.must_not_run_automatically: true
  block_when:
    - repair rounds exhausted and critical expected script remains missing
    - script_uuid_resolvable == false and deterministic repair failed
    - mapping is ambiguous and must_not_run_automatically == true and missing remains
  forbidden_transition:
    - start 07-static-verifier while critical script binding is missing
    - start 07-static-verifier when script_uuid_resolvable=false
    - start 07-static-verifier after deterministic repair failed
```

若第 6 步的 `prefab-static-check-cache.json` 显示关键 UI Prefab / 入口 Prefab / 列表项 Prefab 的 `expected_scripts[*].binding_evidence` 为 `missing`，或 `script_uuid_resolvable=false`，Main/controller 必须优先回派 `migration-applier` 修复；不能把该问题留到第 7 步首次阻塞。若仅剩 `unknown`，且目标脚本与 `.meta` 存在、无 Missing Script 特征、已记录 repair attempt / deterministic repair evaluation、无唯一安全自动改写位置，则允许进入第 7 步，但必须设置 `final_status_max=partial-pass-static` 并输出 `editor_prefab_binding_review_recommendation.must_not_run_automatically: true`。无法确定性修复且仍为 `missing` / `script_uuid_resolvable=false` 时，流程应在第 6 步后直接收敛为 `blocked-static` 并写最终报告，而不是继续执行完整第 7 步。



#### phase_gate 统一门禁外壳（P0）

### phase_gate phase packet / controller-owned / missing fallback 补充（P0）

所有 phase packet 必须显式声明 phase gate 要求，controller-owned 阶段也不例外。

```yaml
phase_gate_required: true
phase_gate_schema_version: 1
artifact_harvest:
  read_phase_gate_first: true
  phase_gate_missing_policy:
    helper_completion_max: 1
    restart_max: 1
    derive_from_specialized_gate: true
    if_derivation_possible: continue_or_block_by_derived_gate
    if_not_derivable: artifact_contract_block
```

Controller-owned 阶段也必须写 `phase_gate`：

```yaml
controller_owned_phase_gate_required:
  - 01-controller-precheck
  - 05-controller-merge
  - controller_helper_completion
  - final-manifest-compact-close
  - repair-dispatch
  - repair-harvest
```

缺失 `phase_gate` 的处理顺序固定为：

1. 先尝试从专有 gate 派生统一 `phase_gate`；
2. 派生失败时触发一次 `controller_helper_completion`；
3. helper 后仍缺失时，同阶段最多 restart 一次；
4. 仍无法派生/补齐，才以 `artifact_contract` 阻塞；不得无限等待或把 schema 缺失直接当业务阻塞。


所有阶段 agent / controller helper / controller-owned merge 都必须在 state compact、phase-summary JSON 和 `agent_result.key_outputs` 中输出统一 `phase_gate`。专有 gate（如 `source_semantic_closure_gate`、`resource_closure_gate`、`step6_merge_gate`、`prefab_script_binding_preflight`）仍保留作为细节证据，但 controller transition 首先消费统一 `phase_gate`。

```yaml
phase_gate:
  gate_name: source-semantic-closure | resource-closure | target-diff-merge | migration-apply | static-verify | final-report | degraded-precheck | other
  gate_status: pass | constrained | blocked | schema_missing
  blocks:
    readonly_next: false          # 是否阻止下一个只读分析阶段启动
    final_decision: false         # 是否阻止当前/下游最终裁决
    business_write: false         # 是否阻止第 6 步或其他目标业务写入
    final_static_status: false    # 是否阻止 static-pass
  reasons:
    - code:
      category: tooling_degraded | artifact_contract | source_boundary | target_branch_gate | entry_semantics | fidelity_semantics | code_static | resource_static | prefab_script_binding | public_uuid_rebind | builtin_like_unresolved | responsibility_equivalence | agent_coordination | performance_index
      severity: note | partial | blocking
      summary:
      evidence_paths: []
  constraints: []
  missing_fields: []
  recovery:
    controller_action: continue | constrained_fanout | helper_completion | ask_user | repair_dispatch | block_step6 | final_report
    max_auto_repair_rounds:
    status_cap_if_continue: static-pass | partial-pass-static | blocked-static | null
  specialized_gate_ref:
    name:
    path_or_section:
```

通用消费算法：

```yaml
phase_gate_missing_fallback_subflow:
  applies_to: any_phase_artifact_harvest
  trigger:
    - phase_gate missing
    - phase_gate.gate_status == schema_missing
    - phase_gate schema invalid
  steps:
    - try_derive_from_specialized_gate:
        inputs:
          - source_semantic_closure_gate
          - resource_closure_gate
          - fanout_gate_fields
          - step6_degraded_gate
          - step6_merge_gate
          - prefab_script_binding_preflight
          - unknown_criticality_classifier
        on_success:
          - consume_derived_phase_gate
          - log_event: phase_gate_derived_from_specialized_gate
    - controller_helper_completion:
        max_rounds: 1
        only_if_derivation_failed: true
        forbidden: business_code_or_resource_write
    - restart_same_phase:
        max_rounds: 1
        only_if_helper_failed: true
    - artifact_contract_block:
        only_if_still_missing_or_invalid: true
  forbidden:
    - treat_schema_missing_as_business_pass
    - treat_schema_missing_as_direct_business_block_before_fallback
    - loop_without_round_limit
```

通用消费算法：

```yaml
phase_gate_controller_algorithm:
  if phase_gate missing or gate_status == schema_missing:
    action: controller_helper_completion_or_prompt_once
    not: direct_business_block
  elif phase_gate.blocks.readonly_next:
    action: stop_or_ask_or_repair
  elif next_action_is_business_write and phase_gate.blocks.business_write:
    action: block_step6_or_repair_or_ask_user
  elif phase_gate.blocks.final_decision:
    action: allow_readonly_evidence_collection_only
  else:
    action: continue
```

约束：

- `schema_missing` 是 artifact contract 问题，任意阶段 artifact harvest 都必须先走通用 `phase_gate_missing_fallback_subflow`，不直接等同业务阻塞。
- `blocks.readonly_next=true` 才阻止下一跳只读分析；`blocks.final_decision=true` 默认不阻止 05x/05a/05b/05c 只读补证，它阻止的是最终裁决和业务写入。
- `blocks.business_write=true` 必须传播到 `step6_merge_gate.can_start_migration_applier=false`，除非 controller 明确裁决为 `allow-with-constraint` 并设置状态上限。
- `phase_gate` 与专有 gate 冲突时，取更保守结论，并记录 `artifact_contract` 或 `agent_coordination`。 

#### Controller gate 消费与防卡死调和（P0）

Main/controller 每次 DAG transition 前必须消费当前阶段 compact / phase-summary JSON 中的 `*_gate` 字段，而不能只看 `execution_status: completed` 和 required artifacts 是否存在。

```yaml
controller_gate_consumption:
  before_each_transition:
    read_gate_fields:
      - source_semantic_closure_gate
      - resource_closure_gate
      - fanout_gate_fields
      - step6_degraded_gate
      - step6_merge_gate
      - prefab_script_binding_preflight
    propagation:
      - any blocks_step6=true must propagate into step6_merge_gate
      - open blocking confirmations must propagate into step6_merge_gate
      - unresolved_claims and known_missing_risk_sections must be controller-merged or block step6
      - phase_gate.blocks.business_write=true must propagate into step6_merge_gate.can_start_migration_applier=false unless controller records allow-with-constraint + status_cap
      - phase_gate.blocks.final_static_status=true must propagate into final_status_synthesis.status_cap and final-report backscan
      - phase_gate.blocks.readonly_next=true blocks the next readonly analysis; phase_gate.blocks.final_decision=true alone does not block readonly evidence collection
    anti_deadlock:
      - blocks_step5_* means block final decision / business write by default, not readonly evidence collection
      - readonly 05x/05a/05b/05c may run in constrained mode to gather evidence unless hard_stop or open blocking confirmation prevents reads
      - missing gate schema is artifact_contract gap; run controller_helper_completion or prompt/restart once before treating it as business block
    hard_block_only_when:
      - user confirmation required and open
      - critical source semantic or resource evidence absent with no readonly recovery path
      - step6_merge_gate.can_start_migration_applier=false after controller helper/restart
      - critical prefab script binding is confirmed missing or deterministic repair failed
```

阶段 gate 语义：

- `blocks_step5_target_diff` / `blocks_step5_resource_plan` 默认阻塞第 5 步最终裁决和第 6 写入，不默认阻塞只读补证 fan-out。
- `blocks_step6_migration` / `blocks_step6` 必须阻塞 `migration-applier`，除非 controller merge 有明确 `allow-with-constraint` 裁决和状态上限。
- `unknown` 与 `missing` 必须区分：`missing` 或确定断链可 blocking；仅静态证据不足的 `unknown` 应优先进入受限补证或第 7 partial 收敛，而不是无限卡住。

#### DAG transition 原子推进硬规则（防卡死第一要求）

每个 DAG transition 不只是“写下一个动作”，而是一个必须在当前 controller turn 内完成的原子推进单元。Main/controller 在判定某阶段完成后，必须立即执行下一跳所需的最小动作，除非遇到 hard_stop 或 blocking confirmation。

原子推进定义：

```yaml
dag_atomic_transition_gate:
  applies_to:
    - 01 completed -> 02 entry-boundary
    - 02 confirmed -> 03 source-code-closure + 04a source-resource-prefetch
    - 03 completed + 04a completed-or-skipped -> 04b source-resource-closure
    - 04 completed -> 05x shared search -> 05a/05b/05c fan-out
    - 05a/05b/05c completed -> 05-controller-merge
    - 05 merge completed -> 06 migration-applier
    - 06 completed -> 07 static-verifier
    - 07 verifier completed -> final-report-writer
  same_turn_required_actions:
    - update controller-checkpoint.compact.md current_phase/next_action
    - append controller-event-log.jsonl transition event
    - write or refresh artifact-contract-manifest.json for next phase
    - state_bootstrap next phase agent(s) when next phase uses agent(s)
    - launch next phase agent(s) when no hard_stop/blocking confirmation
    - schedule watchdog for launched agent(s)
  forbidden_terminal_states:
    - "只写 next_action 但不启动下一阶段"
    - "只生成共享输入（如 05x）但不 fan-out 下游 agent"
    - "仅在聊天中说下一步将启动，但未实际 Agent/Monitor"
    - "等待用户追问才继续 artifact harvest 或 DAG transition"
  allowed_to_pause_only_when:
    - hard_stop triggered
    - blocking user confirmation open
    - required artifact missing after prompt-once/restart-once
    - target branch gate not closed before target-side agent/write
    - tool permission denied or unavailable with no degraded fallback
  pause_requirements:
    - checkpoint.workflow_status: blocked | partial
    - checkpoint.current_phase records exact blocked phase
    - event_log records blocked_reason
    - chat reply states exact blocker and next unblock action
```

尤其是第 5 步：`04 completed -> 05x -> 05a/05b/05c` 必须视为一个连续原子推进链。

05x layered index 防卡死补充：`05x-target-shared-search.compact.json` 是 fan-out 硬输入；

05x artifact contract 必须声明：

```yaml
required_artifacts:
  - 05x-target-shared-search.compact.json
optional_performance_artifacts:
  - logs/05x-target-capability-index.json
  - logs/05x-target-resource-index.json
  - logs/05x-target-uuid-index.json
```

optional performance artifacts 不得进入 fan-out required_artifacts，缺失/partial/skipped 只触发 targeted refresh。
`05x-target-capability-index.json`、`05x-target-resource-index.json`、`05x-target-uuid-index.json` 是性能索引，缺失/partial/skipped 不得阻塞 05a/05b/05c，同轮必须启动 fan-out 并让对应 agent targeted refresh。
`05x-target-shared-search.compact.json` 生成成功后，若目标分支门禁已关闭且无 blocking confirmation，Main/controller 必须立即启动 05a/05b/05c 并安排 watchdog；不得把“05x 已生成”当作可暂停状态。

若 controller 发现 checkpoint 中 `next_action` 指向可启动阶段，但 `active_agents` 为空、无 hard_stop、无 blocking confirmation，必须把它视为 `controller_transition_gap`，立即补启动下游阶段，并在 `logs/controller-event-log.jsonl` 和最终 `使用效果监控.md` 记录该 gap。

`active_agents[]` 是 checkpoint / manifest / phase_runtime 的唯一活动 agent 事实源；不得以单个 `active_agent` 字段判断并行阶段。05a/05b/05c、修复回派与 verifier/final-report 等多 agent 场景必须逐项记录 `agent_id`、`phase`、`fanout_group`、`required_artifacts`、`restart_count`、`lease_status`、`watchdog_status`、`idempotency_key` 和 `status`。历史 `active_agent` 字段只能兼容读取为 `active_agents[0]`，不得写回为主状态。



通用图示约定：所有阶段的 artifact harvest 都隐式执行 `phase_gate valid?` 检查，并在缺失/`schema_missing`/schema invalid 时进入 `phase_gate_missing_fallback_subflow`；流程图或 checkpoint 中只需要显式展开 03/04 harvest、05 controller merge、final-report 等高风险节点，不能因此理解为其他阶段不检查 `phase_gate`。

- checkpoint 默认不超过 80 行。
- heartbeat 默认不超过 40 行。
- watchdog 每条事件必须为 1 行。
- state compact 默认不超过 200 行；大型事实写 evidence compact / 步骤 md / logs。
- event log 默认不读；checkpoint/manifest 冲突或 resume 证据不足时最多读最近 80 行。
- artifact harvest 默认只做存在性检查 + 读取 state compact。

### Agent 非阻塞收割器

主控收到阶段 agent 结果后，必须按以下顺序收割，不得无限等待：

1. 若 agent 正常返回 `agent_result`：读取/合并 `state_compact_artifact`，仅记录 `evidence_compact_artifact` 路径，不默认读取 evidence compact。
2. 若只收到 `idle_notification` 或普通回复缺少 `agent_result`：立即检查 phase packet 中的 required artifacts 和 state compact 是否存在。
3. 若 required artifacts + state compact 已存在：读取 state compact，记录 `completed_with_agent_output_missing`，按文件事实继续推进。
4. 若 required artifacts 或 state compact 不存在：最多追问该 agent 一次，追问必须明确要求返回 `agent_result`、写入 state compact 或说明未写入原因。
5. 主控不得只等 idle；到达 `harvest_checkpoints_seconds` 或 `soft_timeout_seconds` 时，即使 agent 未主动回包，也必须主动检查 required artifacts。若完整，记录 `soft_timeout_harvest_completed` 并继续；若缺失，执行第 4 条追问。
6. 追问后仍无 state compact/产物：标记该阶段 `agent-output-missing`，由主控补做、重启同阶段 agent 一次，或在硬门禁阶段阻塞。
7. 同一阶段最多重启一次；仍失败时必须写入 manifest 风险，不得继续等待。被重启或废弃的 agent 必须在 event log 记录 `superseded_at`，后续 idle 时间不得计入有效工作耗时，只能计入 wait/superseded gap。
8. 只有 state compact 证据不足、状态冲突、open confirmation、required artifacts 缺失或越权风险时，Main 才读取 evidence compact；仍不足时才读取步骤 md / logs。
9. 如果 agent 仅 idle 但产物完整，Main 读取 state compact 后不得向用户输出阶段性总结；只在 `controller-event-log.jsonl` 记录 `completed_with_agent_output_missing` 并继续推进。

### Main 上下文预算

为避免主对话上下文膨胀，主控默认只保留当前 runtime 摘要、agent state compact 和用户确认项：

- Main 默认不做全量代码/资源搜索、不展开大型 CLI 输出、不读取大型 prefab 全文、不把完整 compact 或步骤表格粘贴进聊天；例外仅限 state compact 缺失、状态冲突、agent 越权、阻塞门禁或用户要求细节。
- Main 必须维护 `controller-checkpoint.compact.md`，普通恢复优先读 checkpoint + manifest + 当前阶段 state compact，不从聊天历史恢复完整状态。
- Main 默认只读 `*.state.compact.md`；`*.evidence.compact.md` 是后续 agent / 人工审查输入，Main 只记录路径，异常时才读取。
- phase packet 必须使用固定 YAML 短模板；固定规则留在 guide / agent prompt 中，不在 main prompt 中重复展开。
- agent 返回给 main 必须是短 `agent_result` YAML + 简短摘要；完整 evidence compact、步骤 md、logs 写文件，不完整贴回 main。


2. 读取 `guides/main-summaries/00-global-contract.main.md`，建立 main 调度硬门禁；只有异常时读取完整 `guides/00-global-contract.md`。
3. 按第 1 步 guide 完成工具可用性、Git 快速预检和目标 feature 分支确认。
4. 每个阶段开始前优先读取 phase-summary JSON、`controller-checkpoint.compact.md`、对应 manifest 和当前阶段 state compact；判断 fresh / stale / missing / open confirmation。
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
    permission_model:
      readonly_or_artifact_only_phases:
        - 01-controller-precheck
        - 02-entry-boundary
        - 03-source-code-closure
        - 04-source-resource-closure
        - 05x-shared-target-search
        - 05a-target-capability
        - 05b-fidelity-risk
        - 05c-resource-plan
        - 05-controller-merge
        - 07-static-verifier
        - final-report-writer
      business_write_phase:
        - 06-migration-applier
      forbidden_for_non_06:
        - target assets/source/prefab/meta/config modification
        - resource copy into target business tree
        - prefab uuid/script rebind
      allowed_for_non_06:
        - read source/target business files
        - write migration artifacts under .claude/cocos-feature-migration/**
        - write logs/compact/manifest/checkpoint/timing

  constraints:
    may_modify_business_code: false
    must_not_wait_for: []
    return_format: short_agent_result_yaml
    return_max_lines: 80
  state_bootstrap_required: true
  heartbeat_path: "<source_analysis_dir-or-target_migration_dir>/logs/heartbeat/<phase>-<agent>.heartbeat.json"
  timing_required: true
  timing_log_path: "<source_analysis_dir-or-target_migration_dir>/logs/timing/<phase>-<agent>.timing.jsonl"
  phase_summary_json: "<source_analysis_dir-or-target_migration_dir>/logs/phase-summary/<phase>-<agent>.summary.json"
  timing_mode: standard | detailed
  slow_step_threshold_seconds: 120
  soft_timeout_seconds: 900
  harvest_checkpoints_seconds: [300, 600, 900]
  watchdog:
    enabled: true
    preferred_tool: Monitor
    fallback: Bash_run_in_background_one_shot
    event_max_lines: 1
    unavailable_policy: immediate_artifact_harvest_on_resume_or_checkpoint
  artifact_contract_manifest_path: "<target_migration_dir>/logs/artifact-contract-manifest.json"
  artifact_schema_validation:
    enabled: true
    mode: lightweight_path_and_header_only
    on_alias_found: controller_helper_canonicalize_before_restart
    must_not_read_full_logs: true
  artifact_harvest:
    required_artifacts: []
    read_phase_summary_json_first: true
    read_state_compact_only_by_default: true
    read_phase_gate_first: true
    phase_gate_missing_policy:
      helper_completion_max: 1
      restart_max: 1
      derive_from_specialized_gate: true
      if_not_derivable: artifact_contract_block

  phase_gate_required: true
  phase_gate_schema_version: 1

  controller_helper:
    trigger: missing artifacts after prompt-once / restart-once, or phase-summary JSON missing but evidence paths exist
    purpose: small-context manual completion; Main must not absorb full logs
    writes: missing compact/phase-summary JSON + controller-manual-completion timing + event log
    forbidden: business code/resource writes, full project scan, full logs paste
  dag_transition:
    on_completed: <next-phase>
    on_blocked: ask_user_or_stop
  on_soft_timeout: check_required_artifacts_then_prompt_once
```

可选但推荐在目标侧阶段声明：

```yaml
  controller_event_log_path: "<target_migration_dir>/logs/controller-event-log.jsonl"
```

`state_compact_artifact` 必须极短，只包含调度状态；`evidence_compact_artifact` 保存阶段摘要，供后续 agent / 人工审查使用。

`timing_log_path` 必须由主控按阶段确定并写入 phase packet；agent 必须按 `guides/compact-and-logs.md` 的 Timing Bootstrap / Step / Close 协议追加 JSONL。主控收割阶段时，除检查 required artifacts 外，还必须检查 compact 是否包含 `timing`、`step_timings_summary`、`timing_log_path` 和 `timing_observability`。若 timing 日志缺失但阶段产物存在，可继续推进，但必须在 `使用效果监控.md` 记录 `execution_gap.timing_log_missing`。


所有 controller-owned 阶段也必须写标准 timing JSONL。包括 `01-controller-precheck`、`04-controller-manual-completion`、`05-controller-merge`、回派修复 dispatch/harvest、最终 manifest/compact 收口等。路径统一放在 `<target_migration_dir>/logs/timing/`，事件 schema 与 agent timing 相同，`agent` 字段写 `controller` / `controller-manual-completion`，且必须包含 `agent_start`、必要的 `step_start` / `step_end`、`agent_end.total_duration_seconds`。缺失时最终监控必须记录 `controller_timing_missing:<phase>`；缺 `total_duration_seconds` 时记录 `controller_timing_total_duration_missing:<phase>`；总耗时 >=120 秒但 step 覆盖不足时记录 `controller_step_granularity_insufficient:<phase>`。

第 5 步主控合并 `05a/05b/05c` 时也必须写 controller timing：`<target_migration_dir>/logs/timing/05-controller-merge.timing.jsonl`，并在 `目标差异摘要.compact.md` 引用。该 timing 不属于子 agent，但属于主控调度耗时；缺失时最终监控记录 `execution_gap.controller_merge_timing_jsonl_missing`。


第 5 步主控合并推荐模板：

```yaml
controller_merge_packet:
  phase: 05-controller-merge
  timing_log_path: <target_migration_dir>/logs/timing/05-controller-merge.timing.jsonl
  read_inputs:
    - 目标能力摘要.compact.md
    - 保真风险摘要.compact.md
    - 资源迁移计划摘要.compact.md
  writes:
    - 05-目标差异分析.md
    - 目标差异摘要.compact.md
  required_steps:
    - read 05a/05b/05c compacts
    - resolve 05a/05b/05c conflicts with evidence precedence
    - write target diff artifacts
  output_compact_must_include:
    - target_diff_merge_check
    - controller_merge_resolution_summary
    - step6_merge_gate
    - timing.full_step_timings_path
```

`soft_timeout_seconds` / `harvest_checkpoints_seconds` 必须由主控按阶段设置，用于主动收割而不是等待 idle：默认建议第 2/5 步 480~600 秒，第 3 步 900 秒，第 4 步 720 秒，第 6 步 1200 秒，第 7 步 verifier 900 秒、final-report 600 秒。到达 checkpoint 或 soft timeout 时，主控应检查 required artifacts；产物完整则按文件事实推进，产物缺失则追问一次并记录 `soft_timeout_harvest`。

禁止在 phase packet 中粘贴完整 guide、完整历史步骤 md、完整 CLI 输出或完整资源依赖树。
禁止在 phase packet 中粘贴完整 agent prompt；只写“启动后读取对应 agent prompt 和 guide”。Main 默认不读取完整 agent prompt，必要时只读前 120 行核对允许写入/禁止事项。
6. 子 agent 写完整证据到步骤 md 或 logs，写调度状态到 state compact，必要时写阶段摘要到 evidence compact；只返回短 `agent_result` YAML + 简短摘要：

```yaml
agent_result:
  agent:
  phase:
  execution_status: completed | partial | blocked | failed | tool-unavailable
  delivery_status_recommendation: static-pass | partial-pass-static | blocked-static | not_applicable
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
   - `execution_status: completed` 只表示阶段产物完成，不代表迁移功能 completed；默认交付状态必须通过 `delivery_status_recommendation` / 第 7 步 `workflow_status` 表达为 `static-pass` / `partial-pass-static` / `blocked-static`。

   - 若约定产物和 state compact 已存在，主控应读取 state compact，按文件事实继续合并，并记录“agent 回传缺失但产物已落盘”。
   - 若约定产物或 state compact 不存在，主控最多追问该 agent 一次；仍无有效返回时，必须将该阶段标记为 `agent-output-missing`，改由主控读取现有证据补做该阶段或重启同阶段 agent，不得持续输出等待 idle 的阶段性回复。
   - 主控判断阶段完成以“约定产物 + state compact + manifest 状态”为准，不以 idle 通知为准；idle 只表示 agent 当前空闲，不等于阶段成功或失败。
7. 主控合并 `status_delta` / `pending_confirmations_delta`；遇到 open 阻塞确认项时暂停并只由主控向用户提问。
8. 第 7 步完成后写 `迁移总结.md` 与 `使用效果监控.md`，最终回复用户。

## Agent 调度硬规则

- 当前 Claude Code Agent 的 `team_name` 参数已废弃并会被忽略；本 skill 默认不得创建 Team、不得传 `team_name`，也不得依赖团队创建/删除工具作为调度前置。
- 若未来运行环境重新提供团队管理工具，应由运行环境 adapter 明确启用；未显式启用前，所有阶段按单会话主控 + 独立 Agent 调度，不把 team 缺失当作阻塞。
- 禁止把 `ignore`、`default`、空字符串、用户原始参数、目录名、文件名、`.gitignore` 或“忽略/排除”语义值当作 agent 分组名或调度标识。
- 若出现历史产物中的 `Team "<name>" does not exist`，应记录为 stale orchestration rule / execution_gap，并按当前无 team 模式继续；不得用同一个错误参数反复重试。

## Agent prompt 加载规则

- 阶段 agent prompt 存放在 `agent-prompts/`。
- 启动 agent 时，主控必须在 prompt 中要求 agent 自行读取对应 agent prompt 与 guide；不要把全部 SKILL.md、全部 guides 或完整 agent prompt 粘贴给 agent。Main 如需核对 prompt，最多读取前 120 行确认允许写入/禁止事项。
- 阶段 agent 默认不请求 Claude Code `isolation`；必须通过绝对路径操作源/目标项目。
- **Agent 工具调用硬规则**：启动阶段 agent 时，禁止传 `isolation: "worktree"`。若当前 Agent 工具允许省略 `isolation`，必须省略。若当前工具 schema 强制要求 `isolation` 且不能省略，不得默认改用 `remote`；应先改由主控单会话 / controller helper 执行，或在确认 remote 环境可访问源/目标项目且用户明确授权后，才允许 `isolation: "remote"`。不得因为“需要隔离/后台执行/并行分析”而选择 worktree 或默认 remote。
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
- 第 7 步验证必须按 `guides/07-static-verifier-final.md` 判定 `static-pass` / `partial-pass-static` / `blocked-static`，并输出 `static_status_breakdown` 与结构化 `final_status_synthesis`。最终状态解释必须使用 `downgrade_reason_taxonomy`：`tooling_degraded | artifact_contract | source_boundary | target_branch_gate | entry_semantics | fidelity_semantics | code_static | resource_static | prefab_script_binding | public_uuid_rebind | builtin_like_unresolved | responsibility_equivalence | agent_coordination`。`partial-pass-static` / `blocked-static` 至少包含 1 条结构化 `downgrade_reasons`，最终回复只展示 3~5 条面向用户的摘要，完整证据写入 `migration-static-check.json` / `最终状态摘要.compact.md` / `使用效果监控.md`。
- 第 6/7 步涉及 Prefab 时，应通过 `prefab-static-check-cache.json`、builtin-like unresolved 分类、`entry_visual_integration` 和公共 UUID 改绑审计降低重复验证与误判风险。
- 用户追问“为什么 / 展开 / 优化建议”时，建议单独读取目标文件或新会话展开，不与正在执行的迁移上下文混合。

## 完整规范索引

- 原始完整规范：`FULL_SPEC.md`
- 分阶段 guide：`guides/`
- 阶段 agent prompt：`agent-prompts/`
- 完整监控规范：`USAGE_MONITORING.md`
