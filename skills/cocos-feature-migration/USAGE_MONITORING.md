# Cocos Feature Migration Skill Usage Monitoring

## 2026-06 v2 调度与监控补充

本监控规范必须覆盖 v2 调度优化，除原有阶段质量外，新增监控以下字段：

```yaml
monitoring_quality:
  execution_mode: normal | degraded
  degraded_reasons: []
  final_status_cap:
  scheduling_optimization:
    source_resource_prefetch: used | skipped | failed | unavailable
    target_05_fanout: used | fallback-two-stage | skipped
    fallback_reasons: []
  phase_summary_json:
    status: fresh | stale | missing | unavailable
    missing_phases: []
    conflicts: []
  controller_helper:
    completions: []
    unresolved_gaps: []
  prefab_script_binding_preflight:
    status: pass | partial | fail | missing | unavailable
    checked_in_step6: true | false
    first_detected_in_step7: true | false
    direct_or_secondary_count:
    unknown_or_missing_count:
  controller_timing:
    checked: true | false
    missing_phases: []
    total_duration_missing_phases: []
    step_granularity_insufficient_phases: []
  controller_merge_resolution:
    merge_status: completed | partial | blocked
    conflict_count:
    blocking_conflict_count:
    unresolved_conflict_count:
    evidence_precedence_used: []
    step6_merge_gate: pass | blocked | partial
    unresolved_conflicts: []
```

评分补充：

- `phase_summary_json` 缺失但 Markdown compact 完整：轻扣；若导致 Main 读取完整步骤 md / logs：中扣。
- 已触发 04a / 05 fan-out 且产物完整：加分；因 05x 缺失回退两段式：记录 `fallback-two-stage`。
- ts-graph / CLI 不可用进入 degraded mode 不直接扣阻塞分；若降级后仍虚假给 `static-pass`，按严重问题扣分。
- `controller_helper` 成功补齐缺失 compact / summary JSON：记录为恢复成功；若 helper 仍需 Main 展开大日志，记录上下文控制问题。
- `final_status_synthesis.downgrade_reasons` 必须使用结构化 taxonomy，category 只能为 `tooling_degraded | artifact_contract | source_boundary | target_branch_gate | entry_semantics | fidelity_semantics | code_static | resource_static | prefab_script_binding | public_uuid_rebind | builtin_like_unresolved | responsibility_equivalence | agent_coordination`；最终状态不是 `static-pass` 时至少 1 条，缺失则记录 `execution_gap.final_status_reason_missing`。
- 第 6 步未做 `prefab_script_binding_preflight`，到第 7 步才发现关键脚本绑定缺失：阻塞级扣分。

---

## 1. Purpose

This document defines how to monitor real `cocos-feature-migration` runs, so future iterations can improve the skill workflow, constraints, tool usage, persistence quality, and final migration success rate.

Monitoring should not only record whether the skill was invoked. It should answer:

1. Was the skill triggered in the right scenario?
2. Did the flow follow prechecks, entry confirmation, code closure, resource closure, target gap analysis, migration application, and verification rules?
3. Can the migration state be resumed across conversations?
4. Are resource dependencies complete, especially dynamic dependencies and Prefab static dependencies?
5. Did the user incur extra communication cost because of blocking points, wrong assumptions, or unclear documents?
6. Which rules should be strengthened, reduced, or rewritten?
7. What are the total duration and internal step duration of each stage agent?
8. Which agents or steps are slow, why are they slow, and how can they be optimized?
9. Did agent collaboration introduce unauthorized business-code writes, compact/step-document conflicts, lost confirmations, noisy outputs, peer-agent waiting, idle-only completion ambiguity, or missing required artifacts?

---

## 2. 监控范围

### 2.1 纳入监控的任务

当用户请求符合以下任一特征时，应纳入监控：

- 明确使用 `/cocos-feature-migration`
- 描述“从项目 A 迁移功能到项目 B”
- 提到“移植功能 / 迁功能 / migrate feature / 同步某业务模块”
- 迁移内容包含 Cocos Creator TypeScript 业务代码与资源

### 2.2 不纳入监控的任务

以下场景不应纳入本 skill 效果统计，避免污染指标：

- 单文件 bug fix
- 单纯资源复制，不涉及业务逻辑
- Cocos UI / 网络 / 本地化的单点咨询
- 代码审查任务
- 用户只是询问迁移方法，但未实际执行迁移分析

---

## 3. 数据来源

| 数据来源 | 用途 | 是否必需 |
|---|---|---|
| 会话 transcript | 判断 skill 触发、用户确认、工具调用、最终回答质量 | 是 |
| `<source-project>/.claude/cocos-feature-migration/source-features/<feature-slug>/源分析清单.md` | 判断源分析基线、复用模式、源侧卡点 | 是 |
| `<target-project>/.claude/cocos-feature-migration/migrations/<feature-slug>/迁移清单.md` | 判断目标迁移进度、resume 状态、引用的源分析 | 是 |
| `<target-project>/.claude/cocos-feature-migration/migrations/<feature-slug>/logs/controller-event-log.jsonl` | 判断主控调度历史、idle-only 收割、确认关闭和 repair round | 建议 |
| 源项目 `02-源入口候选.md` ~ `04-源资源闭包.md` | 判断源侧入口、代码闭包、资源闭包质量 | 是 |
| 目标项目 `01-前置检查.md`、`05-目标差异分析.md` ~ `07-迁移验证.md` | 判断目标侧前置检查、差异、动作、验证质量 | 是 |
| `迁移总结.md` | 判断最终迁移摘要完整性 | 是 |
| Git 状态与 commit | 判断分析基线是否可靠 | 建议 |
| ts-graph MCP 调用结果 | 判断代码图谱是否有效使用 | 是 |
| `cli-anything-cocoscreator` 输出 | 判断资源静态依赖是否有效展开 | 是 |
| 用户后续反馈 | 判断迁移是否真实可用 | 强烈建议 |

---

## 4. 核心监控指标

### 4.1 触发准确性

| 指标 | 定义 | 评分 |
|---|---|---|
| 正确触发率 | 应使用该 skill 的任务中，实际进入该 skill 的比例 | 0 / 1 |
| 误触发率 | 不应使用该 skill 的任务中，错误使用该 skill 的比例 | 越低越好 |
| 参数完整率 | 源项目、目标项目、功能名是否明确 | 0-3 分 |
| 首轮澄清质量 | 缺参数时是否一次性问清关键输入 | 0-2 分 |

评分建议：

- 5 分：场景判断准确，缺参时只问必要问题。
- 3 分：能进入流程，但参数澄清不完整。
- 1 分：误触发或漏触发明显。

---

### 4.2 前置检查合规性

| 检查项 | 通过标准 | 失败表现 |
|---|---|---|
| ts-graph MCP 检查 | 迁移分析前调用 `ts_graph_stats()` 或等价探测 | 未检查就开始搜索 |
| cli-anything-cocoscreator 检查 | 按当前平台执行可用性检查 | 资源分析时才发现不可用，或完全没查 |
| Git 状态检查 | 分别检查源项目与目标项目工作区状态 | 未确认本地改动风险 |
| pull / stash 授权 | 涉及 stash/pull 前获得用户授权 | 擅自 stash、pull、切分支 |
| 基线记录 | 记录分支与 commit | 产物无法判断是否 stale |
| 一次性 Git 初始化 | stash / pull 仅在第 1 步前置初始化执行一次 | 在后续子步骤重复 clean、重复 stash、重复 pull |

建议量化：

```text
precheck_score = 已完成检查项数量 / 应完成检查项数量
```

补充判定：

- `stash` / `pull --rebase` 应视为**第 1 步一次性 Git 基线初始化动作**。
- 若第 2~7 步再次执行 `stash`、`clean`、`pull`，应视为流程偏离，而不是“更稳妥的默认操作”。
- 若后续步骤把已经存在或刚产生的迁移半成品再次 stash 掉，应在监控记录的“发现的问题”中明确列为高优先级问题。

---

### 4.3 持久化与 Resume 质量

| 指标 | 定义 | 合格标准 |
|---|---|---|
| source-manifest 完整度 | 是否包含源侧必填字段 | 必填字段齐全 |
| target manifest 完整度 | 是否包含目标侧必填字段 | 必填字段齐全 |
| 双目录分离正确性 | 源分析是否落在源项目，目标迁移是否落在目标项目 | 无混放 |
| 源分析引用记录 | 是否记录 `source_analysis_path / mode / commit` | 可追溯 |
| 步骤文件覆盖率 | 已完成步骤是否在对应侧生成 md | 已完成步骤均有 md |
| 状态准确性 | `missing/draft/confirmed/stale` 是否反映真实状态 | 无明显错标 |
| 卡点可恢复性 | 新会话只读 manifest / source-manifest 能否知道下一步 | 能明确继续或等待确认 |
| stale 标记 | commit / 输入变化后是否标记 stale | 必须标记 |
| 复用决策合规性 | 检测到旧源分析后，是否走复用 / 增量 / 重建判定 | 不擅自跳过或重跑 |

推荐评分：

- 5 分：跨会话可无损恢复，且源分析与目标迁移解耦清晰。
- 3 分：主要信息存在，但复用关系或目录边界不够清楚。
- 1 分：几乎没有有效持久化，或源/目标产物混放严重。

---

### 4.4 源项目入口定位质量

| 指标 | 定义 | 风险信号 |
|---|---|---|
| 关键词覆盖 | 是否同时搜索中文名、英文名、缩写、UI ID、prefab 名 | 只搜一个关键词 |
| 候选入口表 | 是否列出多个候选与理由 | 只给一个结论无依据 |
| 用户确认 | 多候选时是否暂停确认精确入口 | 擅自扩大功能范围 |
| 图谱辅助 | 是否结合 ts-graph 分析依赖与调用 | 只靠全文搜索 |
| 功能边界 | 是否明确核心闭环、可选子功能、排除项，而不只确认入口文件 | 迁移范围膨胀 |
| 历史源分析复用 | 发现旧源分析时是否先读取并判断可复用性 | 明明有缓存却全量重跑 |

---

### 4.5 代码闭包质量

| 分类 | 检查点 |
|---|---|
| 迁移 | 是否列出需新增的业务 TS 文件 |
| 复用 | 是否识别目标已有 framework/common/net/event 能力 |
| 适配 | 是否标出 import、UI ID、协议、bundle、appName 等适配点 |
| 不迁移 | 是否排除源项目特有或无关逻辑 |
| 禁止项 | 是否避免整包复制 framework/common |
| 职责层拆解 | 是否识别关键职责层，而不只停留在文件清单 |
| 关键职责标记 | 是否明确哪些职责层属于关键职责层 |
| 完成定义先行 | 是否在深入迁移前先定义 minimum done / full done |

推荐量化：

```text
code_closure_completeness =
  (已分类文件数 / 发现的相关文件数) * 边界准确系数 * 职责层完整系数
```

边界准确系数：

- 1.0：无明显越界或遗漏
- 0.7：存在少量不确定项，但已标风险
- 0.4：范围明显扩大或遗漏关键模块

职责层完整系数：

- 1.0：关键职责层已识别且边界清晰
- 0.7：识别了部分职责层，但关键性判断不充分
- 0.4：只有文件清单，没有职责层拆解

---

### 4.6 资源闭包质量

资源闭包是本 skill 最容易出错的环节，应重点监控。

| 指标 | 合格标准 | 常见失败 |
|---|---|---|
| 资源类型覆盖 | Prefab、Sprite、Atlas、Spine、Font、Audio、Json、i18n 等按需检查 | 只迁 TS 和 PNG |
| UIConfig 使用 | 用于定位入口 prefab，但不当成唯一依据 | 只依赖 UIConfig |
| 动态依赖分析 | 分析 TS 字符串、路径拼接、feature flag、language、appName | 漏掉运行时加载资源 |
| 静态依赖展开 | 对关键 prefab / asset 执行 `asset deps` | 未跑 CLI |
| 反向引用 | 对关键 TS 执行 `asset uuid` + `asset refs` | 漏掉脚本绑定 prefab |
| 合并去重 | AI 动态判断与 CLI 静态结果合并 | 原样贴 CLI 输出，无最终清单 |
| meta 策略 | 说明 `.meta` 是否保留或重建 | UUID 风险未说明 |

资源闭包评分建议：

- 5 分：动态 + 静态依赖完整合并，风险明确。
- 4 分：大部分资源完整，少量不确定项已列出。
- 3 分：只覆盖显式资源与主要 prefab。
- 1-2 分：只迁代码或只看文件名。

---

### 4.7 目标项目差异分析质量

| 指标 | 合格标准 |
|---|---|
| 同名功能检查 | 搜索目标项目是否已有同名或同职责功能 |
| 异名替代能力识别 | 是否在判定缺失前检查同职责异名实现 / 同流程不同分层实现 |
| 代码差异表 | 逐项给出源能力、目标现状、动作 |
| 资源差异表 | 逐项给出源资源、目标现状、动作 |
| 复用判断 | 优先复用目标项目已有公共能力 |
| 适配点明确 | import、UIConfig、协议、bundle、i18n 等列清楚 |
| 职责等价性分析 | 是否逐项对照关键职责层，而不只比较文件存在性 |
| 部分等价识别 | 是否明确标出“已迁入但职责被削减”的情况 |

---

### 4.8 职责等价性与完成判定质量

这是本 skill 的关键监控项，用于避免“文件和资源都在，但关键业务职责缺失”仍被误判为完成。

| 指标 | 合格标准 | 常见失败 |
|---|---|---|
| 关键职责层保留情况 | 源项目关键职责层在目标项目中逐项核对 | 只看主面板或主 prefab 是否存在 |
| 职责等价性 | 不仅有同名文件，还要职责完整保留 | 入口只剩跳转，原展示职责丢失 |
| 初始化链路完整性 | init / preload / register / request trigger 无断点 | 少一次关键请求或少一次注册 |
| 事件链完整性 | event enum、dispatch、listener 闭环 | 事件声明或监听少一段 |
| 配置链完整性 | UIConfig、常量、i18n、feature switch 接回 | 主代码迁了，但配置链缺失 |
| 完成定义一致性 | 前期定义的 minimum done / full done 是否在最终判定中被遵守 | 前面定义较严，结尾却口径放宽 |
| 入口承接语义 | 复用目标现有入口时，是否确认新增 / 共存 / 替换关系 | 把现有按钮改成新功能入口但未确认产品语义 |
| Prefab unresolved 分类 | 是否区分业务资源缺失、脚本缺绑定、`file=None` 内建资源疑似项 | 只看 unresolved 数量直接 blocked 或直接忽略 |
| 脚本挂载次级证据 | `asset refs` 不命中时是否检查 prefab 文本短 uuid / meta uuid | refs 查不到就误判未绑定，或未补证就放行 |

### 4.8.x Prefab 静态验证专项评分

| 指标 | 满分标准 | 扣分信号 |
|---|---|---|
| deps 分类 | 对每个关键 prefab 记录 missing / unresolved，并按类型分类 | 只记录总数，没有说明来源 |
| `file=None` 处理 | 关键业务资源解析正常时，将疑似内建资源标为 note，并要求人工编辑器复核 | 直接当作通过且不记录，或直接当作阻塞 |
| 脚本 refs 补证 | `asset refs` 不命中时，继续查 `.meta` uuid 与 prefab 文本短 uuid | 未执行补证 |
| 最终状态约束 | 存在无法解释 unresolved 或脚本挂载风险时，最多给 `partial-pass-static` | 风险未闭合仍宣称 completed/static-pass |

### 4.8.y 入口承接策略专项评分

| 指标 | 满分标准 | 扣分信号 |
|---|---|---|
| 入口承接表 | 第 5 步输出源入口、目标承接入口、是否替换原行为 | 第 6 步落地后才发现入口语义问题 |
| 产品语义确认 | 替换目标原入口行为时，标记需确认或引用明确证据 | 擅自把 MyRecords / Record / Activity 等入口改成新功能 |
| 共存策略 | 说明新增入口与原入口如何共存 | 原功能入口被覆盖但未记录风险 |
| 总结跟踪 | 第 6、7 步和迁移总结继续跟踪临时入口策略 | 只在差异分析中提一次，最终不再报告 |

### 4.9 Agent 耗时与协作质量监控

监控分为 `standard` 和 `detailed` 两档，避免监控本身拖慢迁移流程。

- `standard`：默认等级，适用于正常完成、小任务、阶段性阻塞和中断恢复。
- `detailed`：仅在用户要求性能复盘、出现明显慢操作、流程阻塞、回派修复超过 1 次、大型迁移任务或 compact/timing 冲突时启用。若出现 `agent_output_missing`、`restart_once`、任一 agent wall time > 10 分钟、最终状态不是 `static-pass`、第 6/7 步降级或回派、`step_granularity_insufficient`，必须自动升级为 detailed 或至少追加 detailed appendix。

如果本轮没有精确记录，不得编造，必须写“未记录精确耗时”。

#### 4.9.0 standard 监控字段

standard 监控至少覆盖：

| 类别 | 必填内容 |
|---|---|
| 会话级 | `started_at`、`ended_at`、`final_status`、`monitoring_level=standard`、总评分 |
| Agent 级 | agent 名称、是否启动、状态、总耗时、最慢步骤摘要、慢点摘要 |
| 慢操作 | Top 3 或影响最大的慢点；无精确耗时时可按阻塞/重试/工具慢点列出 |
| 失控/等待/重启 TopN | agent_output_missing、superseded、wait-user、wait-main 等非有效工作耗时单独列出 |
| 有效工作 TopN | 工具、分析、写入、验证等真实工作步骤单独列出，避免与失控等待混排 |
| 模块化评分 | 前置检查、入口边界、代码闭包、资源闭包、目标差异、迁移动作、静态验证、最终收口分别评分并列扣分原因 |
| 硬门禁 | ts-graph、cli-anything、Git 快速预检、目标分支确认、入口/边界确认、语义确认 |
| 待确认项 | open、本轮关闭、影响最终状态的确认项 |
| Compact 质量 | 只列缺失、stale、冲突或不足以支撑下一阶段的 compact |
| 协作风险 | 只列实际发生或接近触发的共享写入、越权写业务代码、确认项覆盖、peer-agent waiting、idle-only 无 compact、required artifacts 缺失、主控重启 agent 等风险 |
| Agent DAG / phase_runtime | current_phase、active_agents、required_artifacts、output_mode、agent-output-missing 次数、completed_with_agent_output_missing 次数、merge_owner、user_confirmation_owner |
| 第 5 步 DAG | 05a 是否先行完成、05b/05c 是否在 05a 后并行、是否使用 fresh `05x-target-shared-search.compact.json` 提前并行例外、最终 05 是否由主控合并 |

Agent 总耗时表：

| Agent | started_at | ended_at | total_duration_seconds | timing_precision | 状态 | slowest_step | 慢点摘要 |
|---|---|---|---:|---|---|---|---|
| `entry-boundary-analyzer` |  |  |  | exact / coarse / unknown |  |  |  |
| `source-code-closure-analyzer` |  |  |  | exact / coarse / unknown |  |  |  |
| `source-resource-closure-analyzer` |  |  |  | exact / coarse / unknown |  |  |  |
| `target-capability-analyzer` |  |  |  | exact / coarse / unknown |  |  |  |
| `fidelity-risk-analyzer` |  |  |  | exact / coarse / unknown |  |  |  |
| `resource-migration-planner` |  |  |  | exact / coarse / unknown |  |  |  |
| `migration-applier` |  |  |  | exact / coarse / unknown |  |  |  |
| `static-verifier` |  |  |  | exact / coarse / unknown |  |  |  |
| `final-report-writer` |  |  |  | exact / coarse / unknown |  |  |  |

#### 4.9.0a timing JSONL 聚合优先级

为避免阶段耗时长期停留在 `coarse` / `unknown`，最终监控必须按以下顺序聚合 timing：

1. 优先读取 phase packet / compact 中声明的 `timing_log_path`，解析 `logs/timing/<phase>-<agent>.timing.jsonl`。
2. 若 timing JSONL 存在，以 `agent_start` / `agent_end` 计算 agent 总耗时，以 `step_end.duration_seconds` 统计慢步骤。
3. 若 timing JSONL 不存在，但 compact 中有完整 `timing.started_at` / `timing.ended_at` / `total_duration_seconds`，可标记 `timing_precision=coarse` 或按 compact 原值使用。
4. 若 phase packet 声明了 `timing_log_path` 但文件缺失，必须在 `skill_update_assessment.execution_gap` 中记录 `timing_log_missing`，并给出下一轮修复建议。
5. 若既无 JSONL 也无 compact timing，不得估算秒数；只能写“未记录精确耗时”，并计入 `unavailable_count`。

慢操作 TopN 的排序规则：

- 精确慢操作：来自 `step_end.duration_seconds`，可参与 Top3 / Top10 精确排序。
- 推断慢操作：来自工具输出、产物规模、重试记录或人工判断，必须标注 `slowest_step_basis=inferred-from-*`，不得伪装成已测量耗时。
- 高成本阶段（资源闭包、迁移动作、静态验证、最终报告）若 `timing_precision=unknown`，应在执行差距中建议强化对应 agent prompt 或 timing 写入协议。



当启用 detailed 时，在 standard 基础上补充完整统计：

| 层级 | 定义 | 字段 |
|---|---|---|
| 会话级 | 从用户首次提出迁移任务到最终交付或明确阻塞 | `started_at`、`ended_at`、`total_duration_seconds`、`final_status`、`observability_score` |
| Agent 级 | 单个阶段 agent 从接收任务到返回 compact 的历时 | `agent_name`、`agent_started_at`、`agent_ended_at`、`agent_total_duration_seconds`、`agent_active_duration_seconds`、`agent_waiting_duration_seconds` |
| 步骤级 | agent 内部一个可命名步骤的历时 | `step_name`、`owner_agent`、`started_at`、`ended_at`、`duration_seconds`、`status`、`retry_count` |
| 操作级 | 单次工具调用或单轮分析动作 | `operation_name`、`operation_type`、`tool_name`、`duration_seconds`、`result_status`、`slow_reason_category` |

统一耗时拆分：

- `active_duration_seconds`：主动分析、搜索、工具执行、写文档等实际工作耗时；
- `waiting_duration_seconds`：等待用户确认、权限确认、主控回派、外部命令或远程服务响应的耗时；
- `rework_duration_seconds`：因入口/边界不清、搜索重复、验证失败回派、文档不一致导致的返工耗时。

推荐结构指标：

```text
active_ratio = active_duration_seconds / total_duration_seconds
waiting_ratio = waiting_duration_seconds / total_duration_seconds
rework_ratio = rework_duration_seconds / total_duration_seconds
```

`timing_precision` 取值：

| 值 | 含义 |
|---|---|
| `exact` | 有明确开始/结束时间戳，可直接计算 |
| `coarse` | 只能根据 transcript 相邻时间、agent 回包或日志区间粗估 |
| `unknown` | 无可靠边界，不能估算 |

粗粒度估算必须显式标记 `timing_precision=coarse`，写明估算依据，不参与慢操作 Top10 的精确排序。

#### 4.9.2 Agent 步骤耗时明细（detailed）

仅 detailed 模式或高成本阶段需要完整步骤耗时明细。例如：

```markdown
### source-resource-closure-analyzer 步骤耗时

| 步骤 | started_at | ended_at | duration_seconds | 类型 | 主要操作 | 输出 / 证据 | 是否慢操作 | 慢操作原因 | 优化建议 |
|---|---|---|---:|---|---|---|---|---|---|
| 读取源侧 manifest / compact |  |  |  | read | 读取源分析清单和源侧摘要 | 源侧摘要.compact.md | 否 |  |  |
| 执行 asset deps |  |  |  | tool | 展开关键 prefab 静态依赖 | logs/asset-deps-*.txt | 是 | prefab 依赖树大 | 缓存 deps；只展开 confirmed_entry 相关 prefab |
```

步骤类型固定使用：`read` / `search` / `tool` / `analysis` / `write` / `wait-user` / `wait-main` / `repair` / `verify`。

#### 4.9.3 慢操作 TopN

- standard：输出 Top 3。
- detailed：输出 Top 10。

| 排名 | Agent | 步骤 | duration_seconds | 类型 | 慢的原因 | 优化建议 |
|---:|---|---|---:|---|---|---|
| 1 |  |  |  |  |  |  |

慢操作阈值：

- `duration_seconds >= 120`：慢操作；
- `duration_seconds >= 300`：明显慢操作；
- `duration_seconds >= 600`：严重慢操作。

#### 4.9.4 Agent 耗时结构分析（detailed）

| 类别 | total_seconds | 占比 | 说明 |
|---|---:|---:|---|
| 工具调用 |  |  | 主要来自 ts-graph / asset deps / asset refs / 搜索 |
| AI 分析 |  |  | 主要来自职责层、保真风险、目标能力判断 |
| 文件写入 |  |  | 步骤 md、manifest、compact、总结、监控 |
| 等待用户 |  |  | 入口、边界、分支、语义确认 |
| 等待主控 |  |  | 主控复核、回派、补充输入 |

#### 4.9.5 Agent 执行质量概览

standard 只列异常或风险 agent；detailed 才输出完整矩阵。

| Agent | 是否启动 | 输入来源 | 输出文件 | 状态 | 是否超 200 行 | 是否触发待确认 | 是否越权写业务代码 | main 复核结果 | 评分 |
|---|---|---|---|---|---|---|---|---|---:|
| `entry-boundary-analyzer` |  |  |  |  |  |  |  |  |  |

#### 4.9.6 Agent 耗时可观测性评分（detailed）

| 得分 | 标准 |
|---:|---|
| 10 | 每个 agent 总耗时、步骤耗时、慢操作原因、优化建议均完整 |
| 8 | agent 总耗时完整，部分步骤耗时缺失 |
| 6 | 只有阶段耗时，无 agent 内部步骤 |
| 4 | 只有最终总耗时 |
| 0 | 未记录耗时 |

该项仅 detailed 模式强制计入总评分；standard 模式可只记录“不足以评分 / 未记录精确耗时”。

---

### 4.10 Agent 协作风险、待确认项与 Compact 质量监控

#### 4.10.1 硬门禁执行结果

| 门禁 | 是否执行 | 结果 | 证据 | 是否影响流程 |
|---|---|---|---|---|
| ts-graph MCP |  |  |  |  |
| cli-anything-cocoscreator |  |  |  |  |
| Git 快速预检 |  |  |  |  |
| Git 按需远程探测 |  |  |  |  |
| 目标 feature 分支确认 |  |  |  |  |
| 源入口确认 |  |  |  |  |
| 功能边界确认 |  |  |  |  |
| 高风险语义确认 |  |  |  |  |

#### 4.10.2 待确认项生命周期

待确认项优先读取结构化 `pending_confirmations`；关键词扫描只作为补漏。

| id | topic | 来源文件 | 首次发现阶段 | status | 关闭证据 | 未关闭影响 |
|---|---|---|---|---|---|---|
| feature-boundary-001 | feature-boundary | 02-源入口候选.md | entry-boundary | open / closed / excluded / resolved-by-evidence |  |  |

#### 4.10.3 Compact 摘要质量

standard 只列问题 compact；detailed 输出完整矩阵。

| compact 文件 | 是否存在 | 是否被后续阶段读取 | 是否足够支撑下一阶段 | 是否与步骤 md 矛盾 | 问题 |
|---|---|---|---|---|---|
| 源侧摘要.compact.md |  |  |  |  |  |
| 目标能力摘要.compact.md |  |  |  |  |  |
| 保真风险摘要.compact.md |  |  |  |  |  |
| 资源迁移计划摘要.compact.md |  |  |  |  |  |
| 目标差异摘要.compact.md |  |  |  |  |  |
| 迁移状态摘要.compact.md |  |  |  |  |  |
| 最终状态摘要.compact.md |  |  |  |  |  |

#### 4.10.4 Agent 协作风险

| 风险类型 | 是否发生 | 涉及 agent | 影响 | 处理 |
|---|---|---|---|---|
| 非 `migration-applier` 修改业务代码 |  |  |  |  |
| agent 返回完整源码 |  |  |  |  |
| agent 返回超 200 行 |  |  |  |  |
| compact 与步骤 md 矛盾 |  |  |  |  |
| 待确认项被静默清除 |  |  |  |  |
| 多 agent 写同一 manifest 冲突 |  |  |  |  |
| 多 agent 覆盖同一第 5 步共享产物 |  |  |  |  |
| agent 只发送 idle，未返回 compact |  |  |  |  |
| required artifacts 缺失 |  |  |  |  |
| 主控追问 / 重启 agent |  |  |  |  |
| agent 等待 peer / TaskList / 用户答复 |  |  |  |  |
| phase_runtime 状态与产物不一致 |  |  |  |  |
| final-report 未关闭 phase_runtime |  | final-report-writer | manifest `current_phase` 未收敛到 completed 或 active_agents/required_artifacts 未清空 | 记录 `execution_gap.manifest_phase_runtime_not_closed` |

### 4.11 技术加速与优化 ROI 监控

本节用于回答：**如果先真实运行一次 skill，之后应该优先优化哪个技术点？**

该节建议在以下场景启用：

- 前 1-3 次真实执行 `cocos-feature-migration`；
- 用户明确要求性能复盘或优化优先级；
- 单次迁移总耗时超过 45 分钟；
- 任一 agent 总耗时超过 10 分钟；
- 第 6 / 7 步出现 1 次以上回派修复；
- 资源闭包、目标差异分析或静态验证出现明显重复搜索。

#### 4.11.1 技术加速产物状态

记录本轮是否使用了缓存 / 索引 / 结构化检查产物，以及是否 fresh。缓存只能用于加速，不得用于跳过关键门禁或静默关闭待确认项。

| 产物 | exists | status | hit | build_duration_seconds | miss_or_stale_reason | evidence |
|---|---|---|---|---:|---|---|
| `source-code-graph.json` |  | fresh / stale / partial / missing / unavailable |  |  |  |  |
| `source-symbol-index.json` |  | fresh / stale / partial / missing / unavailable |  |  |  |  |
| `source-entry-closures/<entry-hash>.json` |  | fresh / stale / partial / missing / unavailable |  |  |  |  |
| `asset-index.json` |  | fresh / stale / partial / missing / unavailable |  |  |  |  |
| `prefab-component-index.json` |  | fresh / stale / partial / missing / unavailable |  |  |  |  |
| `uuid-reverse-index.json` |  | fresh / stale / partial / missing / unavailable |  |  |  |  |
| `bundle-index.json` |  | fresh / stale / partial / missing / unavailable |  |  |  |  |
| `resource-path-index.json` |  | fresh / stale / partial / missing / unavailable |  |  |  |  |
| `target-capability-index.json` |  | fresh / stale / partial / missing / unavailable |  |  |  |  |
| `05x-target-shared-search.compact.json` |  | fresh / stale / partial / missing / unavailable |  |  |  |  |
| `migration-dry-run.json` |  | fresh / stale / partial / missing / unavailable |  |  |  |  |
| `migration-static-check.json` |  | fresh / stale / partial / missing / unavailable |  |  |  |  |
| `logs/controller-event-log.jsonl` |  | present / missing |  |  |  |  |

建议量化：

```text
cache_hit_rate = hit_count / applicable_artifact_count
stale_rate = stale_artifact_count / existing_artifact_count
cache_build_cost_seconds = sum(build_duration_seconds)
```

#### 4.11.2 ts-graph 使用收益

用于判断源代码闭包、目标能力分析、迁移影响面验证是否真正受益于 ts-graph。

| 指标 | 值 | 说明 |
|---|---:|---|
| `ts_graph_build_duration_seconds` |  | 构建或增量更新图谱耗时 |
| `ts_graph_query_count` |  | `ts_get_file_context` / `ts_query_symbol` / `ts_get_review_context` 等查询次数 |
| `ts_graph_failed_count` |  | 查询或构建失败次数 |
| `ts_graph_fallback_to_search_count` |  | 因 graph 不足、stale 或 unavailable 回退到搜索的次数 |
| `ts_graph_reduced_files_count` |  | ts-graph 帮助缩小后的候选文件数 |
| `manual_read_after_ts_graph_count` |  | ts-graph 后仍需人工 Read 的文件数 |
| `blast_radius_file_count` |  | 第 6 / 7 步基于 changed files 得到的影响文件数 |

判定建议：

- 如果 `ts_graph_build_duration_seconds` 高，但后续 query 少、fallback 多，说明 ts-graph 使用方式需要优化。
- 如果 `manual_read_after_ts_graph_count` 仍很高，说明入口符号、闭包缓存或 query 粒度需要改进。
- 如果 `blast_radius_file_count` 远小于目标项目总文件数，说明增量验证有明显收益。

#### 4.11.3 `cli-anything-cocoscreator` 与资源索引收益

用于判断资源 / Prefab / UUID / Bundle 索引是否值得优先建设。

| 指标 | 值 | 说明 |
|---|---:|---|
| `cli_total_duration_seconds` |  | CLI 总耗时 |
| `asset_deps_call_count` |  | `asset deps` 调用次数 |
| `asset_uuid_call_count` |  | `asset uuid` 调用次数 |
| `asset_refs_call_count` |  | `asset refs` 调用次数 |
| `cli_slowest_command` |  | 最慢 CLI 命令及目标资源 |
| `missing_count` |  | 关键 prefab / asset missing 数量 |
| `unresolved_count` |  | unresolved 数量，需分类说明 |
| `index_hit_count` |  | 资源索引命中次数 |
| `index_miss_count` |  | 资源索引未命中次数 |
| `repeated_uuid_lookup_count` |  | 重复 uuid 查询次数 |
| `repeated_prefab_scan_count` |  | 重复 prefab / meta 扫描次数 |

判定建议：

- 如果 `asset_deps_call_count`、`asset_refs_call_count` 很高且 `index_hit_count` 低，优先建设资源索引。
- 如果 `repeated_uuid_lookup_count` 高，优先建设 `uuid-reverse-index.json`。
- 如果 `unresolved_count` 高且分类不清，优先优化 Prefab 静态验证与 unresolved 分类规则。

#### 4.11.4 第 5 步 shared search bundle 收益

用于判断 `target-capability-analyzer`、`fidelity-risk-analyzer`、`resource-migration-planner` 是否在重复搜索目标项目。

| 指标 | 值 | 说明 |
|---|---:|---|
| `shared_search_bundle_created` |  | 是否生成 `05x-target-shared-search.compact.json` |
| `shared_search_bundle_schema_valid` |  | 是否包含 ui_config/event/api/native_kv/activity/i18n/prefab/resource/common capability 命中数组 |
| `shared_search_bundle_read_by_agents` |  | 读取该 bundle 的 agent 列表 |
| `duplicate_search_count` |  | 重复搜索次数 |
| `duplicate_search_patterns` |  | 重复搜索的关键词 / 目录 / 能力类型 |
| `target_global_search_count` |  | 目标项目全局搜索次数 |
| `avoided_search_estimate` |  | 因共享包预计减少的重复搜索次数或耗时 |
| `missing_shared_bundle_impact` |  | 未生成共享包造成的影响 |

判定建议：

- 如果第 5 步最慢且 `duplicate_search_count` 高，优先建设 shared search bundle。
- 如果三个第 5 步 agent 都搜索 request / event / i18n / native / prefab 目录，说明 shared bundle 收益高。

#### 4.11.5 migration dry-run 收益

用于判断迁移前 dry-run 是否减少第 6 / 7 步返工。

| 指标 | 值 | 说明 |
|---|---:|---|
| `dry_run_created` |  | 是否生成 `migration-dry-run.json` |
| `dry_run_consumed_by_migration_applier` |  | migration-applier 是否按 dry-run 执行动作并摘要引用 |
| `dry_run_duration_seconds` |  | dry-run 耗时 |
| `copy_conflict_count` |  | copy_files 中 conflict 数量 |
| `overwrite_risk_count` |  | overwrite-risk 数量 |
| `import_rewrite_issue_count` |  | import rewrite 问题数量 |
| `asset_mapping_issue_count` |  | asset mapping 问题数量 |
| `prefab_rebind_issue_count` |  | prefab rebind 问题数量 |
| `target_conflict_count` |  | 目标同名文件、同名资源、UUID 冲突等数量 |
| `dry_run_prevented_rework` |  | 是否提前避免实际返工，记录证据 |

判定建议：

- 如果 dry-run 发现大量 conflict / rewrite / rebind 问题，说明第 6 步前置 dry-run 必须保留。
- 如果 dry-run 耗时低且减少回派修复，应提高优先级。

#### 4.11.6 migration static-check 收益

用于判断静态验证脚本化是否值得优先建设。

| 指标 | 值 | 说明 |
|---|---:|---|
| `static_check_created` |  | 是否生成 `migration-static-check.json` |
| `static_check_consumed_by_final_report` |  | final-report-writer 是否优先消费该 JSON |
| `static_check_duration_seconds` |  | 静态检查耗时 |
| `static_issue_count_total` |  | 自动发现 issue 总数 |
| `static_issue_count_by_type` |  | import / symbol / dto / event / resource-path / prefab-uuid / i18n 等分类数量 |
| `repair_rounds_triggered` |  | 触发修复回合数量 |
| `issues_auto_detected` |  | static-check 自动发现的问题数 |
| `issues_found_later` |  | static-check 后续才发现的问题数 |
| `false_positive_count` |  | 误报数量 |

判定建议：

- 如果第 7 步慢且 `repair_rounds_triggered` 高，优先建设 static-check。
- 如果 `issues_found_later` 高，说明 static-check 覆盖不足。
- 如果 `false_positive_count` 高，说明静态检查规则需要分级，不应直接阻塞。

#### 4.11.7 返工、等待与重复劳动来源

| 指标 | 值 | 说明 |
|---|---:|---|
| `user_confirmation_count` |  | 用户确认次数 |
| `pending_confirmations_open_count` |  | 结束时仍 open 的确认项数量 |
| `repair_round_count` |  | 第 6 / 7 步回派修复次数 |
| `migration_applier_rework_count` |  | migration-applier 返工次数 |
| `duplicated_agent_work_count` |  | 多 agent 重复劳动次数 |
| `rework_duration_seconds` |  | 返工总耗时 |
| `waiting_duration_seconds` |  | 等待用户、权限、主控、外部命令耗时 |

判定建议：

- 如果 `waiting_duration_seconds` 高，优先优化确认点合并和前置澄清。
- 如果 `rework_duration_seconds` 高，优先优化 dry-run、static-check 和差异分析质量。
- 如果 `duplicated_agent_work_count` 高，优先优化 shared bundle 和 compact 结构化。

#### 4.11.8 优化候选排序模板

每次 detailed 监控结束时，建议输出以下排序表，直接服务下一轮 skill 优化：

| 优化候选 | 影响阶段 | 观察到的问题 | 证据 | 预计节省时间 | 实现成本 | 优先级 |
|---|---|---|---|---:|---|---|
| 资源 / Prefab / UUID 索引 | 第 4 / 7 步 |  |  |  | low / medium / high | P0 / P1 / P2 |
| 源代码闭包缓存 + ts-graph 查询缓存 | 第 2 / 3 / 7 步 |  |  |  | low / medium / high | P0 / P1 / P2 |
| target capability index | 第 5 步 |  |  |  | low / medium / high | P0 / P1 / P2 |
| shared search bundle | 第 5 步 |  |  |  | low / medium / high | P0 / P1 / P2 |
| migration dry-run | 第 6 / 7 步 |  |  |  | low / medium / high | P0 / P1 / P2 |
| migration static-check | 第 7 步 |  |  |  | low / medium / high | P0 / P1 / P2 |
| Markdown + JSON 双 compact | 跨阶段 |  |  |  | low / medium / high | P0 / P1 / P2 |
| final report 模板化 | 最终报告 |  |  |  | low / medium / high | P0 / P1 / P2 |

优先级判断规则：

```text
P0 = 高耗时或高返工，且预计节省明显，或影响迁移正确性
P1 = 中等耗时 / 中等返工，预计能改善下一轮效率
P2 = 主要改善可读性、报告质量或小幅减少耗时
```

推荐结论格式：

```markdown
本次最值得优先优化：

1. <优化候选>
   - 影响阶段：
   - 证据：
   - 预计收益：
   - 实现成本：
   - 优先级：

2. <优化候选>
   ...
```

### 9.1 前置检查遗漏

现象：未检查 ts-graph 或 CLI 就开始搜索文件。

优化方向：

- 在 SKILL.md 顶部强化“前置检查是硬门禁”。
- 增加失败时的标准回复模板。
- 将 `ts_graph_stats` 和 `command -v cli-anything-cocoscreator` 写成固定首步 checklist。

### 9.2 入口与边界未确认导致范围膨胀

现象：候选入口超过一个时，Claude 默认选择并继续分析；或虽然入口已确认，但未继续确认功能边界，导致把相邻详情页、规则页、宿主外壳一并纳入。

优化方向：

- 在入口分析后增加强制停顿规则。
- 要求 manifest 写入 `needs_user_confirmation: true`。
- 将“下一级 panel 不默认纳入范围”放到更醒目的位置。
- 增加“核心闭环 / 可选子功能 / 明确排除项”的边界确认模板。

### 9.3 资源闭包不完整

现象：只复制 TS、Prefab 或 PNG，遗漏字体、图集、i18n、动态路径。

优化方向：

- 增加资源闭包评分表。
- 要求明确区分“AI 动态依赖”和“CLI 静态依赖”。
- 对每个关键 TS 必须执行 `uuid + refs` 或说明无法执行原因。

### 9.4 文档写回不稳定

现象：步骤完成但未更新 manifest，后续无法 resume。

优化方向：

- 在每一步末尾加入固定写回三件套：步骤 md、manifest、下一步/卡点。
- 在 skill 中增加“开始步骤前读取 manifest”的强提示。

### 9.5 目标项目适配不足

现象：迁移代码仍保留源项目 import、bundle、UI ID、协议入口。

优化方向：

- 在目标差异步骤增加“适配项矩阵”。
- 要求每个新增 TS 文件都列出 import 适配结果。

### 9.6 验证不足

现象：迁移后只说“已完成”，没有检查命令和失败项。

优化方向：

- SUMMARY 必须包含“已验证 / 未验证 / 无法验证原因”。
- 对无法运行构建的项目，至少执行静态路径与 import 检查。

---

## 10. 复盘问题清单

每次任务结束后，可按以下问题复盘：

1. 用户是否一开始就提供了源项目、目标项目、功能名？如果没有，skill 是否一次性问清？
2. 是否在迁移分析前完成 ts-graph 与 CLI 检查？
3. 是否因 git 状态不干净而等待用户授权？处理是否合规？
4. 是否生成了完整 manifest？新会话是否能继续？
5. 候选入口是否超过一个？是否等待用户确认？
6. 代码闭包是否区分迁移、复用、适配、不迁移？
7. 是否避免复制 framework/common 整包？
8. 资源闭包是否同时使用动态分析与 CLI 静态依赖？
9. 是否对关键 TS 做了 `asset uuid` + `asset refs`？
10. 复用历史源分析前，是否清楚说明了三种处理模式（复用 / 增量复核 / 重建）？
11. 目标项目已有能力是否被优先复用或识别为同职责异名替代实现？
12. 迁移动作是否按时间追加记录？
13. 是否记录了过渡目录的退出条件与最晚清理时机？
14. 验证是否真实执行？是否声明了验证等级？失败是否如实报告？
15. 最终 SUMMARY 是否足够给其他人接手？
16. 用户是否对结果提出返工、漏资源、路径不对等反馈？
17. 哪条 skill 规则需要调整？

---

## 11. 月度优化报告模板

```markdown
# cocos-feature-migration Skill 月度效果报告

## 时间范围

- 起始日期：
- 结束日期：

## 样本概览

| 指标 | 数量 |
|---|---:|
| 总调用次数 |  |
| 有效迁移任务数 |  |
| 完成任务数 |  |
| 阻塞任务数 |  |
| 平均评分 |  |
| A/B/C/D/E 分布 |  |

## 指标趋势

| 指标 | 本月 | 上月 | 变化 | 说明 |
|---|---:|---:|---:|---|
| 前置检查合规率 |  |  |  |  |
| manifest 完整率 |  |  |  |  |
| 入口确认合规率 |  |  |  |  |
| 资源闭包完整率 |  |  |  |  |
| 验证执行率 |  |  |  |  |
| 用户返工反馈次数 |  |  |  |  |

## Top 问题

| 排名 | 问题 | 出现次数 | 影响 | 优先级 |
|---:|---|---:|---|---|
| 1 |  |  |  |  |
| 2 |  |  |  |  |
| 3 |  |  |  |  |

## 优秀样例

| 任务 | 好在哪里 | 可沉淀规则 |
|---|---|---|
|  |  |  |

## 本月建议修改 SKILL.md

1. 
2. 
3. 

## 下月观察重点

1. 
2. 
3. 
```

---

## 12. 建议沉淀到 skill 的优化项

后续如果多次监控发现同类问题，可考虑把以下内容直接写入 `SKILL.md`：

1. **固定前置检查输出模板**：减少漏查 ts-graph / CLI 的概率。
2. **入口候选确认模板**：统一多候选时的用户确认话术。
3. **资源闭包强制表格**：区分动态依赖、静态依赖、反向引用来源。
4. **manifest 更新 checklist**：每步结束必须更新哪些字段。
5. **验证失败报告模板**：要求列出命令、结果、失败原因、下一步。
6. **评分与自检机制**：每次 SUMMARY 前先自评一次，低于阈值则补分析。

---

## 13. 推荐执行方式

### 13.1 单次任务结束后

1. 读取该任务的 `迁移清单.md` 与步骤文档。
2. 对照第 5 节评分模型打分。
3. 生成 `使用效果监控.md`。
4. 如果出现高严重度问题，记录为 skill 优化候选。

### 13.2 多任务周期复盘

1. 汇总多个 `使用效果监控.md`。
2. 统计低分模块。
3. 找出重复出现的失败模式。
4. 修改 `SKILL.md` 中对应规则。
5. 用下一批任务验证优化是否有效。

---

## 14. 最小可用监控 checklist

如果没有时间写完整监控报告，至少检查以下 10 项：

- [ ] 是否正确触发 `cocos-feature-migration`
- [ ] 是否检查 ts-graph MCP
- [ ] 是否检查 `cli-anything-cocoscreator`
- [ ] 是否处理 git 状态与用户授权（仅第 1 步执行一次性 stash / pull 初始化）
- [ ] 是否写入并更新 `迁移清单.md`
- [ ] 多候选入口是否等待用户确认
- [ ] 代码闭包是否分类为迁移 / 复用 / 适配 / 不迁移
- [ ] 资源闭包是否包含动态依赖 + CLI 静态依赖
- [ ] 目标差异是否分别覆盖代码和资源
- [ ] 是否有真实验证结果与最终 SUMMARY

---

## 15. 结论

`cocos-feature-migration` skill 的优化重点应围绕三件事持续监控：

1. **流程合规**：前置检查、用户确认、持久化写回是否严格执行。
2. **迁移完整性**：代码闭包与资源闭包是否足够完整，是否避免机械复制。
3. **可恢复与可验证**：跨对话能否继续，最终结果能否被验证和接手。

只要每次迁移都能留下可评分、可复盘、可对比的 `使用效果监控.md`，后续就能基于真实失败模式持续优化该 skill，而不是凭感觉修改规则。


### recommended_patch_tasks 输出要求

`skill_update_assessment` 应输出 `recommended_patch_tasks`，把 rule_gap / execution_gap / tooling_gap 转换成可执行补丁任务，包含 target_file、change_type、priority、reason。


#### skill_update_assessment 可执行补丁任务

监控中的 `skill_update_assessment` 不得只写 yes/no/partial；若 `should_update_skill_md`、`should_update_agent_prompts`、`should_update_timing_protocol` 任一为 yes/partial，必须补充：

```yaml
recommended_patch_tasks:
  - priority: P0 | P1 | P2
    target_file: guides/... | agent-prompts/... | SKILL.md | tooling
    change_type: rule | prompt | timing | schema | tooling
    reason:
    suggested_change:
```

`rule_gap` 表示规则本身缺失；`execution_gap` 表示规则已有但执行偏差；`tooling_gap` 表示需要新增/增强结构化产物、索引或验证 fast path。


#### Agent 输出缺失术语

```yaml
agent_output_terms:
  completed_with_agent_output_missing: "产物完整但未正常返回短 agent_result"
  agent_output_missing: "产物或 state compact 缺失，追问/重启后仍无有效输出"
  agent_result_missing: "deprecated alias；新监控应归并到 completed_with_agent_output_missing"
```

监控评分时，`completed_with_agent_output_missing` 属协作质量扣分但不阻塞流程；`agent_output_missing` 属阶段产物缺失风险，应按阻塞/重启问题扣分。
