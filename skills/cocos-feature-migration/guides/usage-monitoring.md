# 使用效果监控写回要求

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
- Agent 总耗时汇总：每个阶段 agent 的 `started_at`、`ended_at`、`total_duration_seconds`、状态、最慢步骤摘要；优先从 `logs/timing/*.timing.jsonl` 聚合，其次读取 compact 的 `timing` 字段；若 phase packet 声明了 `timing_log_path` 但日志不存在，写 `execution_gap.timing_log_missing`；若未记录精确耗时，写“未记录精确耗时”
- 慢操作 Top 3：跨所有 agent 汇总耗时最长或影响最大的 3 个步骤；优先使用 timing JSONL 中 `step_end.duration_seconds` 的精确记录；无法精确计时的推断慢操作必须单独标注 `slowest_step_basis=inferred-*`，不得与精确耗时混排；若没有精确耗时，可按阻塞/重试/工具慢点列出
- 硬门禁执行结果：ts-graph MCP、`cli-anything-cocoscreator`、Git 快速预检、目标 feature 分支确认、源入口/边界确认、高风险语义确认等是否执行和证据
- 待确认项生命周期：只列 open / 本轮关闭 / 影响最终状态的确认项
- Compact 摘要质量：只列缺失、stale、冲突或无法支撑下一阶段的 compact
- Agent 协作风险：只列实际出现或高风险接近触发的问题，例如共享文件覆盖、越权写业务代码、待确认项被覆盖、agent 只 idle 未返回 compact、required artifacts 缺失、主控重启 agent、phase_runtime 状态冲突
- Agent DAG / phase_runtime 摘要：当前阶段、active_agents、required_artifacts、output_mode、agent-output-missing / completed_with_agent_output_missing 次数、merge_owner、user_confirmation_owner
- 第 5 步 DAG 执行情况：05a 是否先行完成，05b/05c 是否在 05a 后并行，是否使用 fresh `05x-target-shared-search.compact.json` 触发提前并行例外
- Controller event log：是否生成 `logs/controller-event-log.jsonl`，关键事件是否覆盖 phase_start / agent_harvest / completed_with_agent_output_missing / user_confirmation_closed / phase_complete / repair_round
- 结构化产物链路：`05x-target-shared-search.compact.json`、`migration-dry-run.json`、`migration-static-check.json` 是否存在、fresh、被后续阶段读取
- Final manifest 收口：`phase_runtime.current_phase=completed`、`active_agents=[]`、`required_artifacts=[]` 是否写回；失败时记录 `execution_gap.manifest_phase_runtime_not_closed`
- 关键证据路径：`迁移清单.md`、`源分析清单.md`、步骤 md、`迁移总结.md` 等
- 发现的问题、用户反馈、优化建议、是否需要更新 `SKILL.md`

standard 监控还必须补充以下结构化质量字段：

```yaml
monitoring_quality:
  timing_observability:
    exact_count:
    coarse_count:
    unavailable_count:
    inferred_slow_operations_count:
  agent_output_quality:
    completed_with_agent_output_missing_count:
    agent_output_missing_count:
    required_artifacts_missing_count:
  l1_static_status_breakdown:
    code_import_symbol:
    ui_config_event_protocol:
    asset_deps_business_missing:
    prefab_script_binding:
    public_uuid_rebind:
    builtin_like_unresolved:
    responsibility_equivalence:
    fidelity:
  target_diff_merge_check:
    includes_target_capability:
    includes_fidelity_risks:
    includes_resource_plan:
    includes_pending_confirmations_delta:
    includes_migration_constraints_for_step6:
    includes_resource_decision_reason:
    no_conflicting_status_between_05a_05b_05c:
  workflow_convergence:
    default_static_delivery_finished: yes | no | blocked
    active_background_agents: []
    pending_agent_shutdowns: []
    team_cleanup_status: not_needed | pending | completed | skipped
    pending_user_confirmations: []
    commit_status: not-committed | committed
    pr_status: not-created | created
  skill_update_assessment:
    should_update_skill_md: yes | no | partial
    rule_gap: []
    execution_gap: []
    tooling_gap: []
  structured_artifacts:
    shared_search_bundle: fresh | stale | missing | unavailable
    migration_dry_run: fresh | stale | missing | unavailable
    migration_static_check: fresh | stale | missing | unavailable
    controller_event_log: present | missing
  manifest_phase_runtime_closed: true | false
```

评分建议：`completed_with_agent_output_missing_count` 为 0 不扣分，1 次轻扣，2 次中等扣分，>=3 次应在 `execution_gap` 中明确建议强化对应 agent prompt；若同时存在 required artifacts 缺失，则按阻塞级协作问题扣分。

Agent 协作风险必须额外记录阶段 agent 是否违反默认非 worktree 规则：

```yaml
worktree_isolation_deviation:
  occurred: true | false
  involved_agents:
  impact:
  mitigation:
```

`是否需要更新 SKILL.md` 不应只写 yes/no；应区分：

- `rule_gap`：规则本身缺失或表述不清；
- `execution_gap`：规则已有，但本轮执行偏差；
- `tooling_gap`：需要新索引、新 static-check、shared search bundle 等工具能力。

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

> 完整监控评分规范仍保留在 `USAGE_MONITORING.md`；只有进入最终报告或阻塞监控写回时才读取。
