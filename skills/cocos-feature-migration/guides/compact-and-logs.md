# Compact、Logs、大输出治理与耗时记录

### Required artifacts 契约（硬规则）

每个阶段 agent 的完成状态以 phase packet 中声明的 `required_artifacts` 为准，而不是以聊天消息、idle 通知或“已完成”文字为准。

阶段 agent 必须写出并返回以下最小产物契约：

```yaml
required_artifacts_contract:
  main_artifact:
    path: "<阶段主产物.md>"
    required: true
    must_be_non_empty: true
  state_compact_artifact:
    path: "<阶段>.state.compact.md"
    required: true
    must_be_non_empty: true
    purpose: "只保存调度状态，供 Main 默认读取"
  evidence_compact_artifact:
    path: "<阶段>.evidence.compact.md"
    required: true
    must_be_non_empty: true
    purpose: "保存阶段摘要/证据索引，供后续 agent / 人工审查读取"
  aggregate_compact_artifact:
    path: "源侧摘要.compact.md / 目标差异摘要.compact.md / 迁移状态摘要.compact.md / 最终状态摘要.compact.md"
    required_when_declared: true
    purpose: "跨阶段聚合摘要；不能替代本阶段 state/evidence compact"
  status_fields:
    required: true
    fields:
      - status
      - needs_user_confirmation
      - pending_confirmations_delta
      - evidence_paths
      - next_action
      - timing
      - step_timings_summary
```

主控收割规则：

1. agent 返回 compact 且 required artifacts 存在：标记 `completed` / `partial` / `blocked` 等阶段状态。
2. agent 只发 idle 或未返回 compact，但 required artifacts 和 compact 文件存在且字段达标：标记 `completed_with_agent_output_missing`，继续推进，并在 `使用效果监控.md` 记录。
3. main artifact 或 compact 缺失、为空、或缺少关键状态字段：标记 `blocked_missing_required_artifacts` 或 `agent-output-missing`，最多追问 / 重启一次。
4. required artifacts 之间状态冲突时，以主控读取后的 manifest / compact 状态一致性检查为准；不得直接信任最后一条聊天消息。
5. 子 agent 不得用“我已经完成”替代产物写入；如果写文件失败，必须返回 failure compact，说明失败原因和是否建议重试。
6. 主控每次 phase start / agent harvest / user confirmation close / phase complete / repair round 都应追加 `<target_migration_dir>/logs/controller-event-log.jsonl`；聊天中不保存完整调度历史。
7. agent 仅 idle 但 required artifacts + state compact 完整时，Main 读取 state compact，记录 `completed_with_agent_output_missing` 到 event log 和监控，不向用户输出阶段性说明，继续推进下一阶段。

### Short agent_result 回传格式（main 上下文压缩硬规则）

agent 返回给 main 的最后一条正常消息必须优先使用短 YAML `agent_result`，控制在 80 行以内；完整 compact 和完整证据写入文件，不在 main 对话中展开。

```yaml
agent_result:
  agent:
  phase:
  status: completed | partial | blocked | failed | tool-unavailable
  main_artifact:
  compact_artifact:
  needs_user_confirmation: false
  pending_confirmations_delta: []
  key_outputs: {}
  risks: []
  repair_recommendations: []
  next_action:
  timing_precision: exact | coarse | unknown
```

要求：

- `main_artifact` 和 `compact_artifact` 必须是绝对路径或相对目标/源分析目录的明确路径。
- `key_outputs` 只放 3~8 个可调度字段，不放完整表格。
- `risks` 只列 id / 简短标题 / severity；完整风险表写步骤 md。
- 如果用户要求详细解释，main 再读取 compact 或步骤 md 展开。

### Compact 标准字段模板

所有 `*.compact.md` 应尽量使用同一顶层字段，方便断点恢复、上下文压缩和跨 agent 合并。不同阶段可以增加阶段专属字段，但不得省略以下通用字段：

```markdown
# <Phase Name> Compact

## status
status: completed | partial | blocked | failed | stale | tool-unavailable
last_updated_stage: <phase-id>
updated_at: YYYY-MM-DD HH:mm:ss | 未记录

## inputs
source_project:
target_project:
feature_name:
feature_slug:
source_analysis_dir:
target_migration_dir:

## confirmed_scope
include:
exclude:
assumptions:

## artifacts
evidence_paths:
main_artifact:
logs:

## semantic_invariants
api_paths:
request_params:
native_kv_config_gating:
events:
uiids_routes:
resource_roots:

## target_changes_or_findings
add:
modify:
reuse:
not_migrated:

## risks
- id:
  severity: low | medium | high | blocking
  condition:
  impact:
  recommendation:

## user_confirmation
needs_user_confirmation: true | false
pending_confirmation_count: 0
pending_confirmations_delta: []
confirmation_topic:

## next_action
next_action:
repair_recommendations:

## timing
timing:
step_timings_summary:
full_step_timings_path:
```

阶段专属 compact 至少要保留通用字段，并可追加如 `source_entries`、`resource_plan`、`public_uuid_rebind_audit`、`final_status_matrix_decision` 等字段。最终报告前必须执行 compact 状态一致性检查。

### Agent 结束回传协议（硬规则）

每个阶段 agent 在本轮结束前，最后一条正常消息必须显式返回短 `agent_result`，并确保对应 compact 文件已经写入。无论结果是 completed、confirmed、blocked、partial、tool-unavailable 还是 failed，都必须返回 `agent_result`；不得只写文件后结束，不得只发送 `idle_notification`，也不得只回复“已写入文件”。若主控只能通过产物收割推进，必须在 event log 与 `使用效果监控.md` 记录 `execution_gap.agent_result_missing:<agent>`。

如果已写入步骤 md / compact 文件，返回内容必须包含产物绝对路径、阶段状态、`needs_user_confirmation`、`confirmation_topic`、`pending_confirmations_delta`（如有）和 `timing` / `step_timings_summary` 的摘要字段。若因错误无法写文件，也必须返回 failure `agent_result`，说明错误、已尝试动作、是否需要主控重试。

主控若只收到 idle 而未收到 compact，应按 `SKILL.md` / `00-global-contract.md` 的 agent-output-missing 兜底规则检查约定产物，不得持续等待。

### Timing Bootstrap / Step / Close 协议（硬规则）

为避免最终 `使用效果监控.md` 只能写 `coarse` / `unknown`，每个阶段 agent 必须把耗时记录做成“启动即落盘、步骤边界追加、结束汇总”的事件流，而不是结束时凭记忆补写。

#### 统一 timing 日志路径

主控在 phase packet 中必须声明：

```yaml
timing_log_path: "<source_analysis_dir-or-target_migration_dir>/logs/timing/<phase>-<agent>.timing.jsonl"
timing_mode: standard | detailed
slow_step_threshold_seconds: 120
```

agent 启动后应创建父目录并向该 JSONL 追加事件。若无法写入该路径，必须在 compact 和 `agent_result.timing_observability` 中写明原因，不得静默降级。

#### 事件类型

JSONL 每行一个 JSON 对象，至少支持以下事件。`step_end.duration_seconds` 必须由该 step 的 start/end 时间计算；除非真实小于 1 秒，否则不得写 0；无法精确计算时写 `timing_unavailable` 或在 `timing_observability` 中说明，不得用 0 伪装成功记录。

```json
{"event":"agent_start","agent":"source-resource-closure-analyzer","phase":"04-source-resource-closure","ts":"2026-06-10 14:01:03","note":"received phase packet"}
{"event":"step_start","agent":"source-resource-closure-analyzer","phase":"04-source-resource-closure","step":"asset deps PanelRank","type":"tool","ts":"2026-06-10 14:03:10"}
{"event":"step_end","agent":"source-resource-closure-analyzer","phase":"04-source-resource-closure","step":"asset deps PanelRank","type":"tool","ts":"2026-06-10 14:04:58","duration_seconds":108,"status":"completed","output_or_evidence":"logs/asset-deps-panel-rank.txt","slow_reason":"large prefab dependency tree","optimization_suggestion":"reuse prefab/uuid index on next run"}
{"event":"agent_end","agent":"source-resource-closure-analyzer","phase":"04-source-resource-closure","ts":"2026-06-10 14:12:31","status":"completed","total_duration_seconds":688}
```

如无法取得可靠墙钟时间，仍必须写：

```json
{"event":"timing_unavailable","agent":"...","phase":"...","ts":"未记录精确耗时","reason":"...","next_run_timing_fix":"..."}
```

#### 可复制的记录方式

agent 可用任意可靠方式记录时间；推荐在需要 shell 辅助时使用 Python 追加 JSONL：

```bash
python - <<'PY'
import json, time, pathlib
path = pathlib.Path(TIMING_LOG_PATH)
path.parent.mkdir(parents=True, exist_ok=True)
with path.open('a', encoding='utf-8') as f:
    f.write(json.dumps({
        "event": "agent_start",
        "agent": AGENT_NAME,
        "phase": PHASE,
        "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
    }, ensure_ascii=False) + "\n")
PY
```

如果环境不适合运行命令，agent 也必须在首个可写产物中先写入 `started_at`，并在结束时写入 `ended_at`；但这种降级必须标记 `timing_precision: coarse` 或 `unknown`。

#### Timing Close 强约束（高成本 agent 必做）

高成本 agent（`source-resource-closure-analyzer`、`migration-applier`、`static-verifier`、`final-report-writer`）以及中高成本目标侧 agent（`target-capability-analyzer`、`fidelity-risk-analyzer`、`resource-migration-planner`）的 `agent_end` 事件必须写入 `total_duration_seconds`，不得只写“见 timing JSONL”或依赖 final-report-writer 事后从相邻时间戳推断。

`agent_end` 最低字段：

```json
{"event":"agent_end","agent":"migration-applier","phase":"06-migration-applier","ts":"2026-06-10 14:12:31","status":"completed","total_duration_seconds":688}
```

final-report-writer 聚合 timing 时，若发现高成本 agent 的 timing JSONL 存在 `agent_start` / `agent_end` 但 `agent_end.total_duration_seconds` 缺失，必须：

1. 在 `使用效果监控.md` 的 `execution_gap` 中记录 `timing_total_duration_missing:<agent>`；
2. 在 Agent 总耗时表中将该 agent 的 `timing_precision` 标为 `coarse`，并说明“由时间戳推断”；
3. 在“优化建议”中列为下一轮需修复的 prompt / timing close 问题；
4. 不得把推断秒数写成 exact。

#### compact 汇总要求

每个阶段 compact 的 `timing` 必须从 timing JSONL 或启动/结束记录中汇总，不能只写空字段：

```yaml
timing:
  started_at:
  ended_at:
  total_duration_seconds:
  timing_precision: exact | coarse | unknown
  timing_log_path:
  slowest_step:
    name:
    type:
    duration_seconds:
    reason:
    evidence_path:
step_timings_summary:
  total_step_count:
  recorded_step_count:
  slow_step_count:
  slowest_steps: []
full_step_timings_path: "logs/timing/<phase>-<agent>.timing.jsonl"
timing_observability:
  timing_available: exact | coarse | unavailable
  unavailable_reason:
  slowest_step_basis: measured | inferred-from-tool-output | inferred-from-artifact-size | unknown
  next_run_timing_fix:
```

`使用效果监控.md` 必须优先读取 `timing_log_path` 聚合精确耗时；若 phase packet 声明了 `timing_log_path` 但文件不存在，应记录为 `execution_gap.timing_log_missing`。


每个阶段 agent 必须在自己的步骤 md、compact 摘要或返回给主控的 compact 中记录耗时信息。耗时记录用于 `使用效果监控.md` 的性能复盘，不得为了好看而编造。

耗时记录分为两档：

- `standard`（默认）：记录 agent 总耗时、最慢步骤、慢步骤数量、等待/重试摘要和证据路径。
- `detailed`（按需）：记录完整 `step_timings` 明细。仅在用户要求性能复盘、阶段耗时超过阈值、出现失败重试、回派修复、大型迁移任务或 final-report-writer 判断需要时启用。

默认统一字段：

```yaml
timing:
  started_at: "YYYY-MM-DD HH:mm:ss" | "未记录精确耗时"
  ended_at: "YYYY-MM-DD HH:mm:ss" | "未记录精确耗时"
  total_duration_seconds: number | "未记录精确耗时"
  timing_precision: exact | coarse | unknown
  active_duration_seconds: number | "未记录精确耗时"
  waiting_duration_seconds: number | "未记录精确耗时"
  rework_duration_seconds: number | "未记录精确耗时"
  slow_reason_category: user_wait | permission_wait | tool_startup | large_file_read | repeated_search | repeated_context_rebuild | external_cli_slow | ts_graph_query_slow | writeback_fragmented | retry_after_failure | unclear_scope_rework | other
  slow_step_count: number | "未记录精确耗时"
  slowest_step:
    name:
    type: read | search | tool | analysis | write | wait-user | wait-main | repair | verify
    duration_seconds: number | "未记录精确耗时"
    reason:
    evidence_path:
step_timings_summary:
  total_step_count: number | "未记录精确耗时"
  recorded_step_count: number | "未记录精确耗时"
  slow_step_count: number | "未记录精确耗时"
  slowest_steps:
    - step:
      type:
      duration_seconds: number | "未记录精确耗时"
      evidence_path:
      optimization_suggestion:
full_step_timings_path: path | null
```

`detailed` 模式或高成本阶段需要完整步骤明细时，补充：

```yaml
step_timings:
  - step:
    type: read | search | tool | analysis | write | wait-user | wait-main | repair | verify
    started_at: "YYYY-MM-DD HH:mm:ss" | "未记录精确耗时"
    ended_at: "YYYY-MM-DD HH:mm:ss" | "未记录精确耗时"
    duration_seconds: number | "未记录精确耗时"
    output_or_evidence:
    is_slow: yes | no | unknown
    slow_reason:
    optimization_suggestion:
```

慢操作阈值：

- `duration_seconds >= 120`：慢操作；
- `duration_seconds >= 300`：明显慢操作；
- `duration_seconds >= 600`：严重慢操作。

若 agent 无法可靠获得墙钟时间，必须写“未记录精确耗时”，但仍应记录步骤名称、类型、输出文件、慢点推测和可优化方向。主控与 `final-report-writer` 不得把未记录项换算成虚构秒数。

高成本阶段必须尽量提供 `coarse` 或 `exact` 计时，不能只给空 timing：

- `source-resource-closure-analyzer`
- `target-capability-analyzer`
- `fidelity-risk-analyzer`
- `resource-migration-planner`
- `migration-applier`
- `static-verifier`
- `final-report-writer`

若确实无法取得精确时间，也必须输出 `timing_observability`：

```yaml
timing_observability:
  timing_available: exact | coarse | unavailable
  unavailable_reason:
  slowest_step_basis: measured | inferred-from-tool-output | inferred-from-artifact-size | unknown
  next_run_timing_fix:
```

`使用效果监控.md` 必须区分“精确慢操作”和“推断慢操作”，不得把推断慢操作写成已测量耗时。

即使没有精确耗时，也不得省略 `timing` 字段；必须至少记录：

```yaml
timing:
  started_at: "未记录精确耗时"
  ended_at: "未记录精确耗时"
  total_duration_seconds: "未记录精确耗时"
  timing_precision: unknown
  slowest_step:
    name: "<本阶段影响最大或最慢的步骤>"
    type: read | search | tool | analysis | write | wait-user | wait-main | repair | verify
    duration_seconds: "未记录精确耗时"
    reason: "<无法精确计时或慢点推测>"
```

如果发生明显慢操作，即使没有精确秒数，也必须记录慢操作名称、类型、慢的原因和下次优化建议，用于 `使用效果监控.md` 的慢操作 Top 3 / Top 10。

### 最终 compact 状态一致性检查

最终报告前，`final-report-writer` 必须执行 compact 状态一致性检查，避免 manifest 已收敛但 compact 顶层字段仍停留在阻塞态。

第 7 步之后的最终状态字段必须使用：`static-pass`、`partial-pass-static`、`blocked-static`。只有非默认流程或人工复核扩展阶段才使用 `completed`、`partial`、`blocked`、`abandoned`。final-report-writer 如发现最终 compact 顶层使用 `partial`，但验证矩阵给出 `partial-pass-static`，必须修正为 `partial-pass-static`。

1. 以 `迁移清单.md` / manifest 中的最终状态为准，读取：
   - `final_status`
   - `pending_confirmations`
   - `needs_user_confirmation`
   - 各步骤状态
2. 检查所有 compact 文件顶层字段：
   - `status`
   - `pending_confirmation_count`
   - `needs_user_confirmation`
   - `last_updated_stage`
   - `updated_at`
3. 若 compact 顶层状态与 manifest 冲突：
   - 必须回写 compact 顶层状态；
   - 必须保留正文中的历史阻塞记录；
   - 必须在 `使用效果监控.md` 的 Compact 摘要质量中记录修正。
4. 最终交付时不得保留以下冲突：
   - 正文确认项已关闭，但头部仍为 `blocked_for_user_confirmation`；
   - manifest 显示 `pending_confirmations: []`，但 compact 显示仍有 open confirmation；
   - 最终状态为 `partial-pass-static` / `static-pass`，但阶段 compact 顶层仍显示 blocking 状态。

---

## 上下文预算与大输出治理

为避免上下文耗尽，本 skill 默认采用 compact 摘要 + logs 原始证据模式。

### Compact 摘要

每完成对应阶段，必须同步生成或更新 compact 摘要：

| 阶段 | compact 文件 | 作用 |
|---|---|---|
| 源侧第 2~4 步 | `源侧摘要.compact.md` | 记录源入口、边界、代码闭包、资源闭包、职责层、完成定义 |
| 目标能力分析 | `目标能力摘要.compact.md` | 记录目标同名/同职责能力、公共能力、代码/职责差异 |
| 目标保真审计 | `保真风险摘要.compact.md` | 记录 API/request/native/KV/gating/event/入口语义风险和确认项 delta |
| 资源迁移计划 | `资源迁移计划摘要.compact.md` | 记录复制/复用/改绑/过渡目录/清理条件 |
| 目标第 5 步合并 | `目标差异摘要.compact.md` | 由主控或单一汇总者合并 `目标能力`、`保真风险`、`资源迁移计划`，作为第 6 步事实基线 |
| 第 6 步 | `迁移状态摘要.compact.md` | 记录新增/修改/复制/复用/过渡目录/待验证项 |
| 第 7 步 | `最终状态摘要.compact.md` | 记录验证等级、最终状态建议、风险和下一步 |

后续步骤和 Resume 默认先读取 compact 摘要；只有 compact 缺失、不一致、状态为 `stale`，或需要核查具体证据时，才读取完整步骤 md。第 5 步禁止多个 agent 并发覆盖 `05-目标差异分析.md` 或 `目标差异摘要.compact.md`；并发 agent 只能写私有产物，最终由主控或单一汇总者合并。

Main/controller 读取预算硬约束：默认只读 `controller-checkpoint.compact.md`、当前阶段 `*.state.compact.md`、manifest 80 行以内必要片段和短 `agent_result`；除非 state compact 缺失/为空、required artifacts 缺失、compact 与 manifest 冲突、有 open confirmation、agent 越权风险、用户明确要求细节或 final-report-writer 最终聚合，否则不得读取完整步骤 md / evidence compact / logs。若必须读取完整 Markdown，优先 limit 400~800 行；超过 800 行的报告类文件，先让 agent 返回 20 行以内摘要。

### Logs 原始证据

任何超过 100 行的命令输出、搜索结果、依赖树、引用列表，不得原样写入步骤 md，也不得完整返回主控。必须保存到当前任务目录的 `logs/` 下，并在步骤 md 中记录摘要、结论和日志路径。

建议日志目录：

```text
<source-project>/.claude/cocos-feature-migration/source-features/<feature-slug>/logs/
<target-project>/.claude/cocos-feature-migration/migrations/<feature-slug>/logs/
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
