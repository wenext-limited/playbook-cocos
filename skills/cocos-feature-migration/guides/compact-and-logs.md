
#### phase_gate 统一门禁外壳（P0）

##### phase_gate missing fallback

所有 state compact / phase-summary JSON 若无法完整写 `phase_gate`，必须至少写：

```yaml
phase_gate:
  gate_status: schema_missing
  missing_fields: []
  recovery:
    controller_action: helper_completion
```

##### 通用 phase_gate missing fallback 子流程（P0）

该 fallback 适用于任意 phase 的 artifact harvest，不只适用于 05 merge 或 Step 6 前置门禁。Main/controller 每次收割阶段产物时，只要发现 `phase_gate` 缺失、`gate_status: schema_missing` 或 schema 无效，都必须走同一套 bounded 子流程：

```yaml
phase_gate_missing_fallback_subflow:
  applies_to: any_phase_artifact_harvest
  trigger:
    - phase_gate missing
    - phase_gate.gate_status == schema_missing
    - phase_gate schema invalid
  order:
    - derive_from_specialized_gate:
        allowed_sources:
          - source_semantic_closure_gate
          - resource_closure_gate
          - fanout_gate_fields
          - step6_degraded_gate
          - step6_merge_gate
          - prefab_script_binding_preflight
          - unknown_criticality_classifier
        on_success:
          - write derived phase_gate
          - append event log: phase_gate_derived_from_specialized_gate
    - controller_helper_completion:
        max_rounds: 1
        forbidden:
          - target business code/resource write
          - new semantic decision without evidence
    - restart_same_phase:
        max_rounds: 1
    - artifact_contract_block:
        only_if_still_missing_or_invalid: true
  forbidden:
    - treat schema_missing as pass
    - treat schema_missing as direct business block before fallback
    - retry without bound
```

若 helper 或 restart 补齐了 `phase_gate`，controller 必须按补齐后的 `blocks.readonly_next` / `blocks.business_write` / `blocks.final_static_status` 继续消费，而不是按原始 schema 缺失状态继续阻塞。



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

- `schema_missing` 是 artifact contract 问题，先补写一次，不直接等同业务阻塞。
- `blocks.final_decision=true` 默认不阻止 05x/05a/05b/05c 只读补证；它阻止的是最终裁决和业务写入。
- `blocks.business_write=true` 必须传播到 `step6_merge_gate.can_start_migration_applier=false`，除非 controller 明确裁决为 `allow-with-constraint` 并设置状态上限。
- `phase_gate` 与专有 gate 冲突时，取更保守结论，并记录 `artifact_contract` 或 `agent_coordination`。 

# Compact、Logs、大输出治理与耗时记录
> 术语索引：state_bootstrap = State Bootstrap；artifact_harvest = Artifact Harvest；DAG transition = 阶段完成后的 controller 下一跳。


### Artifact Writer Deadline 与 Progress Commit（P0 硬规则）

为避免 agent 在 soft timeout 后才开始写产物，每个 phase packet 可声明并默认启用以下字段：

```yaml
artifact_write_deadline_seconds: 120
minimum_artifact_first_policy: true
doc_write_budget_seconds: 180
progress_commit_required: true
```

执行规则：

1. 距 `soft_timeout_seconds` 剩余 `artifact_write_deadline_seconds` 时，agent 必须进入 `artifact_finalization_mode`。
2. 进入 `artifact_finalization_mode` 后，禁止继续大范围搜索、全量 `ts_graph_build`、完整 `asset deps` 扫描、读取大型 logs 或扩展分析；只能做最小证据整理和产物写回。
3. agent 必须优先写 **最小可收割产物**：`phase_summary_json` -> `state_compact_artifact` -> minimal `main_artifact` -> `evidence_compact_artifact`。完整 Markdown 来不及写时，先写 `content_level: minimal_harvestable`，后续由 controller/helper 或同 agent 追加。
4. 长文档补写不得卡住已完成的分析或迁移动作。若 `doc_write_budget_seconds` 内无法完成完整正文，agent 必须返回 `execution_status: partial` 或 `completed`（取决于必需产物是否齐全），并在 `agent_result.key_outputs` 标记：

```yaml
artifact_finalization_mode_entered: true
skipped_expansion_due_to_deadline: []
suggested_controller_helper_completion: true | false
content_level: minimal_harvestable | full
```

5. 对高成本阶段，必须在每个关键 step 后写 `progress_commit`：刷新 heartbeat，并尽量刷新 phase-summary JSON 中的 `current_step`、`partial_outputs`、`missing_required_artifacts`。
6. Main/controller 在第二个 checkpoint 或 soft timeout 前发现 required artifacts 仍缺失时，应优先发送一次 `enter_artifact_finalization_mode` 提醒，而不是等到最终 soft timeout 才追问。

### Controller Durability Barrier（P0）

为降低主对话自动压缩影响，controller 自己也必须执行轻量落盘屏障。屏障只写调度状态，不写完整证据：

```yaml
controller_durability_barrier:
  write_order:
    - current_state_compact_or_bootstrap
    - logs/artifact-contract-manifest.json phase_runtime
    - controller-checkpoint.compact.md resume_cursor
    - logs/controller-event-log.jsonl one_line_event
  required_before:
    - ask_user
    - spawn_agent
    - dag_transition
    - business_write
    - final_response
  required_after:
    - user_confirmation_closed
    - agent_spawned
    - artifact_harvested
    - business_write
    - phase_completed
  if_write_fails:
    action: pause_and_record_controller_durability_gap
```

`resume_cursor.idempotency_key` 应由 `feature_slug + phase + transition_intent + target_branch_or_commit` 组成。同一个 `idempotency_key` 已标记 `committed` 时，恢复后不得重复执行同一业务写入、重复启动同一 fan-out，或重复关闭同一用户确认项。

### Controller Helper Completion（P0 硬规则）

当 agent 已完成主要分析/迁移动作，但缺少文档类产物时，controller 可以启动小上下文 helper 或由 Main 手动补齐 canonical 产物，避免无限等待原 agent。

```yaml
controller_helper_completion:
  trigger:
    - required_artifacts partially complete
    - main business/action artifact exists
    - missing only docs/phase-summary/evidence compact
    - agent soft_timeout after prompt-once
    - failed task notification but required artifacts are present
  allowed_writes:
    - missing phase-summary JSON
    - missing minimal evidence compact
    - canonical state compact
    - controller-manual-completion timing
  forbidden:
    - target business code/resource writes
    - new source/target full project search
    - semantic decisions not already present in existing evidence
  max_time_seconds: 180
```

若 helper 补齐后 schema validation 通过，Main 必须按文件事实继续 DAG transition，并在 event log / 使用效果监控中记录 `controller_helper_completion`，而不是重启完整阶段。

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

#### Artifact Contract Manifest 与 schema validation（硬规则）

为减少 Main 上下文和避免 agent 写错文件名导致“假缺失”，主控必须维护一个机器可读的 artifact contract manifest。它只描述路径契约和轻量校验结果，不保存完整证据：

```text
<target_migration_dir>/logs/artifact-contract-manifest.json
```

最低 schema：

```json
{
  "version": 1,
  "schema_name": "cocos-migration-artifact-contract",
  "feature_slug": "jackpot_rank",
  "source_analysis_dir": "/abs/source/.claude/cocos-feature-migration/source-features/jackpot_rank",
  "target_migration_dir": "/abs/target/.claude/cocos-feature-migration/migrations/jackpot_rank",
  "generated_by": "controller",
  "updated_at": "YYYY-MM-DD HH:mm:ss",
  "phases": {
    "05-controller-merge": {
      "artifacts": [
        {
          "key": "target_diff_compact",
          "path": "目标差异摘要.compact.md",
          "owner": "controller",
          "required": true,
          "must_be_non_empty": true,
          "expected_kind": "markdown-compact",
          "blocks_phase_completion": true,
          "aliases": ["05-目标差异.state.compact.md"]
        }
      ]
    }
  }
}
```

使用规则：

1. 主控在 phase start 前写入或刷新本阶段的 canonical `required_artifacts` 到该 manifest，并把 `artifact_contract_manifest_path` 放进 phase packet。
2. Agent 结束前按 phase packet 的 canonical path 写文件；若因历史兼容写了 alias，必须在 `agent_result.key_outputs.artifact_schema_validation.path_mismatches` 中说明。
3. Artifact harvest / resume 时 Main 先做轻量 schema validation：检查 manifest JSON 可解析、canonical path 是否存在、是否非空、JSON 产物是否可解析、compact 是否有顶层 status / execution_status / artifacts / timing 必要字段。不得因此展开完整 evidence compact 或 logs。
4. 校验结果必须写入 phase-summary JSON 和 state compact：

```yaml
artifact_schema_validation:
  schema_path: <target_migration_dir>/logs/artifact-contract-manifest.json
  validation_status: pass | partial | fail | unavailable
  declared_count: 0
  existing_count: 0
  missing: []
  path_mismatches:
    - expected:
      found_alias:
      action: canonicalize | prompt-agent-once | controller-helper | block
  unexpected_artifacts: []
  canonical_paths_ok: true | false
  blocks_next_phase: true | false
```

5. 若 alias / 相似路径存在但 canonical path 缺失，不得立刻判定 agent 失败；主控优先让原 agent 或 controller helper 基于已有产物补写 canonical compact / phase-summary JSON，并记录 `artifact_path_mismatch`。补齐仍失败且 required artifact 缺失时，才进入 prompt-once / restart-once / blocked。
6. 若 `completed_with_agent_output_missing` 但 schema validation 为 `pass`，继续 DAG transition；若为 `partial` 且缺失项不阻塞下一阶段，可 degraded continue 并记录 final status cap；若为 `fail` 且阻塞项缺失，按 `agent_output_missing` 处理。
7. 该 manifest 只能用于路径和轻量字段校验，不能替代用户确认、职责等价、保真验证或 Prefab/UUID 证据判断。

主控收割规则：

### Agent artifact_contract_checklist（结束前必做）

每个阶段 agent 在发送最后一条消息前，必须执行并在 `agent_result.key_outputs` 或 compact 中摘要记录以下检查。该检查失败时，不得返回 `execution_status: completed`，也不得只发送 idle：

```yaml
artifact_contract_checklist:
  main_artifact_exists: true | false
  main_artifact_non_empty: true | false
  state_compact_exists: true | false
  state_compact_non_empty: true | false
  evidence_compact_exists: true | false
  evidence_compact_non_empty: true | false
  phase_summary_json_exists: true | false
  phase_summary_json_non_empty: true | false
  required_artifacts_ok: true | false
  artifact_schema_validation:
    schema_path:
    validation_status: pass | partial | fail | unavailable
    declared_count:
    existing_count:
    missing: []
    path_mismatches: []
    canonical_paths_ok: true | false
    blocks_next_phase: true | false
  timing_present: true | false
  step_timings_summary_present: true | false
  timing_observability_present: true | false
  last_message_is_agent_result: true | false
```

若任一 required artifact 缺失，agent 必须返回 `execution_status: failed | partial | blocked` 的 `agent_result`，说明缺失文件、已尝试动作、是否建议主控重启。只写聚合 compact（例如 `源侧摘要.compact.md` / `目标差异摘要.compact.md`）不等于阶段完成；phase packet 中声明的私有 main/state/evidence artifacts 必须同时存在。


1. agent 返回 compact 且 required artifacts 存在：标记 `completed` / `partial` / `blocked` 等阶段状态。
2. agent 只发 idle 或未返回 compact，但 required artifacts 和 compact 文件存在且字段达标：标记 `completed_with_agent_output_missing`，继续推进，并在 `使用效果监控.md` 记录。
3. main artifact 或 compact 缺失、为空、或缺少关键状态字段：标记 `blocked_missing_required_artifacts` 或 `agent-output-missing`，最多追问 / 重启一次。
4. required artifacts 之间状态冲突时，以主控读取后的 manifest / compact 状态一致性检查为准；不得直接信任最后一条聊天消息。
5. 子 agent 不得用“我已经完成”替代产物写入；如果写文件失败，必须返回 failure compact，说明失败原因和是否建议重试。
6. 主控每次 phase start / agent harvest / user confirmation close / phase complete / repair round 都应追加 `<target_migration_dir>/logs/controller-event-log.jsonl`；聊天中不保存完整调度历史。
7. agent 仅 idle 但 required artifacts + state compact 完整时，Main 读取 state compact，记录 `completed_with_agent_output_missing` 到 event log 和监控，不向用户输出阶段性说明，继续推进下一阶段。


### phase-summary JSON first 结束顺序（P0 硬规则）

所有 agent 的结束写回顺序必须服务于 Main/controller 的优先读取策略。即使完整 Markdown 尚未完成，也必须先写机器可读摘要。

推荐顺序：

1. 写或刷新 `phase_summary_json`，状态可为 `partial-running` / `finalizing` / `claims-ready`。
2. 写 minimal `main_artifact`，正文不完整时标记 `content_level: minimal_harvestable`。
3. 写 `evidence_compact_artifact` 或最小 evidence index。
4. 再次刷新 `phase_summary_json` 为最终状态。
5. 写/更新 `state_compact_artifact` 为最终 execution_status。
6. 写 `agent_end.total_duration_seconds`，更新 heartbeat 为 finished。
7. 最后一条消息返回短 `agent_result`。

禁止把 `phase_summary_json` 放到最后才写；否则 watchdog 在 soft timeout 前无法判断阶段是否可收割。

### Phase summary JSON（Main 优先读取，强推荐）

为进一步降低 Main 上下文占用，每个阶段 agent 除 Markdown compact 外，必须尽量写入机器可读的阶段摘要 JSON。Main/controller 在 artifact harvest 时优先读取 JSON；只有 JSON 缺失、stale、字段不足、状态冲突、open confirmation、越权风险或用户要求展开时，才读取 `*.state.compact.md` / `*.evidence.compact.md` / 完整步骤 md。

推荐路径：

```text
<source_analysis_dir-or-target_migration_dir>/logs/phase-summary/<phase>-<agent>.summary.json
```

若阶段已有固定 JSON 产物，可复用并在 `agent_result.phase_summary_json` 中声明，例如：

- `migration-dry-run.json`
- `prefab-static-check-cache.json`
- `migration-static-check.json`
- `05x-target-shared-search.compact.json`

最低 schema：

```json
{
  "version": 1,
  "phase": "03-source-code-closure",
  "agent": "source-code-closure-analyzer",
  "execution_status": "completed | partial | blocked | failed | tool-unavailable",
  "delivery_status_recommendation": "static-pass | partial-pass-static | blocked-static | not_applicable",
  "updated_at": "YYYY-MM-DD HH:mm:ss",
  "feature_slug": "",
  "source_project": "",
  "target_project": "",
  "artifacts": {
    "main_artifact": "",
    "state_compact_artifact": "",
    "evidence_compact_artifact": "",
    "aggregate_compact_artifact": "",
    "logs": []
  },
  "artifact_schema_validation": {
    "schema_path": "",
    "validation_status": "pass | partial | fail | unavailable",
    "declared_count": 0,
    "existing_count": 0,
    "missing": [],
    "path_mismatches": [],
    "unexpected_artifacts": [],
    "canonical_paths_ok": true,
    "blocks_next_phase": false
  },
  "required_artifacts_ok": true,
  "needs_user_confirmation": false,
  "pending_confirmations_delta": [],
  "key_outputs": {},
  "risks": [],
  "repair_recommendations": [],
  "execution_mode": "normal | degraded",
  "degraded_reasons": [],
  "confidence_caps": {},
  "timing": {
    "timing_log_path": "",
    "timing_precision": "exact | coarse | unknown",
    "total_duration_seconds": null,
    "slowest_step": null
  },
  "next_action": ""
}
```

Main 读取优先级：

```text
phase-summary JSON
  -> current *.state.compact.md
  -> evidence compact
  -> full step md / logs
```

phase summary JSON 不替代 Markdown 产物；它是 Main 调度与跨阶段传递的快速索引。若 JSON 与 state compact 冲突，Main 必须按更保守状态处理并记录 `execution_gap.phase_summary_conflict:<phase>`。

### Short agent_result 回传格式（main 上下文压缩硬规则）

agent 返回给 main 的最后一条正常消息必须优先使用短 YAML `agent_result`，控制在 80 行以内；完整 compact 和完整证据写入文件，不在 main 对话中展开。若 phase packet 声明了 `phase_summary_json`，必须在结束前写入该 JSON，并在 `agent_result` 中回传路径。

```yaml
agent_result:
  agent:
  phase:
  execution_status: completed | partial | blocked | failed | tool-unavailable
  delivery_status_recommendation: static-pass | partial-pass-static | blocked-static | not_applicable
  main_artifact:
  state_compact_artifact:
  evidence_compact_artifact:
  phase_summary_json:
  needs_user_confirmation: false
  pending_confirmations_delta: []
  key_outputs: {}
  risks: []
  repair_recommendations: []
  next_action:
  timing_precision: exact | coarse | unknown
```

要求：

- `execution_status` 表示阶段 agent 自身是否把本阶段产物写完，可使用 `completed`；它不代表迁移功能已经完成。
- `delivery_status_recommendation` 表示迁移交付状态建议，只能使用 `static-pass` / `partial-pass-static` / `blocked-static` / `not_applicable`。第 1~6 步通常写 `not_applicable`；第 7 步 verifier 可以给推荐；final-report/controller 才能裁定最终 `delivery_status` / `workflow_status`。
- 为兼容旧产物，若仍出现顶层 `status`，必须按阶段执行状态读取，不得把 `status: completed` 解读为功能迁移 completed。新产物应优先写 `execution_status`，必要时同步保留 `status` 作为兼容别名。

- 默认第 1~7 步交付状态只允许 `static-pass` / `partial-pass-static` / `blocked-static`；`completed` 只能用于 agent 阶段执行状态或用户另行授权的人工复核扩展流程。
- `key_outputs` 只放 3~8 个可调度字段，不放完整表格。
- `risks` 只列 id / 简短标题 / severity；完整风险表写步骤 md。
- 如果用户要求详细解释，main 再读取 compact 或步骤 md 展开。

### Compact 标准字段模板

所有 `*.compact.md` 应尽量使用同一顶层字段，方便断点恢复、上下文压缩和跨 agent 合并。不同阶段可以增加阶段专属字段，但不得省略以下通用字段：

```markdown
# <Phase Name> Compact

## status
status: completed | partial | blocked | failed | stale | tool-unavailable
execution_status: completed | partial | blocked | failed | stale | tool-unavailable
# delivery_status 只允许在第 7 步 / final-report 阶段出现；默认第 1~6 步写 not_applicable
delivery_status: static-pass | partial-pass-static | blocked-static | not_applicable
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

### State Bootstrap / Heartbeat / Watchdog / Artifact Harvest 协议（硬规则）

本节定义调度可靠性增强机制。目标是让主控通过文件事实和 bounded watchdog 自动收割阶段，而不是等用户询问或等 agent 自述。

#### State Bootstrap：主控启动前先落盘

主控启动任何阶段 agent 前，必须先写入或更新该阶段 `state_compact_artifact`，状态为 `running`。该文件必须极短，只保存调度状态；完整事实仍写步骤 md / evidence compact / logs。

最低字段：

```yaml
status: running
execution_status: running
delivery_status: not_applicable
last_updated_stage: <phase>
updated_at: <YYYY-MM-DD HH:mm:ss>
phase_runtime:
  phase: <phase>
  agent_name: <agent>
  agent_id: pending_until_spawned | <agent-id>
  active_agents_ref: controller-checkpoint.compact.md#active_agents
  lease_status: active
  restart_count: 0
  superseded_agents: []
  current_step: controller_spawn_prepared
  required_artifacts: []
  required_artifacts_pending: []
  heartbeat_path: <.../logs/heartbeat/<phase>-<agent>.heartbeat.json>
  watchdog_status: scheduled | unavailable
  last_harvest_at: null
  harvest_policy:
    on_idle_without_agent_result: check_artifacts
    on_checkpoint: check_artifacts
    on_soft_timeout: prompt_once_then_restart_or_block
user_confirmation:
  needs_user_confirmation: false
  pending_confirmation_count: 0
timing:
  timing_log_path: <.../logs/timing/<phase>-<agent>.timing.jsonl>
  timing_precision: pending
```

agent 后续更新 state compact 时，不得删除主控 bootstrap 中的 `phase_runtime` / `required_artifacts` / `restart_count` / `watchdog_status` 字段。

#### Heartbeat：只写调度，不写证据

agent 启动后必须尽快写 heartbeat 文件：

```text
<source_analysis_dir-or-target_migration_dir>/logs/heartbeat/<phase>-<agent>.heartbeat.json
```

heartbeat 默认不超过 40 行，只能包含：

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

禁止在 heartbeat 中写完整代码清单、资源清单、CLI 输出、搜索结果、完整 compact 或大段 markdown。

#### Watchdog：单行事件唤醒主控

主控启动 agent 后必须安排 bounded watchdog。优先使用 `Monitor`；如果不可用或权限不允许，使用 `Bash(run_in_background=true)` one-shot fallback，等待 artifacts 完整或 soft timeout 后退出。

若 `Monitor` 与 Bash fallback 都不可用、后台任务启动失败、`task_id` 丢失/不可查询，或恢复时 `next_checkpoint_at/soft_timeout_at` 已过期，主控必须写入：

```yaml
watchdog:
  status: unavailable
  unavailable_reason: monitor_unavailable | bash_fallback_unavailable | task_id_missing | task_unqueryable | checkpoint_overdue
resume_cursor:
  safe_resume_action: harvest
```

此时不得把 `safe_resume_action` 写成 `wait_watchdog`。恢复、用户询问状态或 checkpoint 到期时，主控必须立即执行 artifact harvest，再按产物完整性决定推进、追问、重启或阻塞。

watchdog 只允许输出单行事件：

```text
phase=<phase> event=checkpoint elapsed=300 artifacts_ok=false missing_count=2
phase=<phase> event=completed artifacts_ok=true state=completed
phase=<phase> event=soft_timeout artifacts_ok=false missing_count=1
phase=<phase> event=failed reason=state_conflict
```

watchdog 不得输出完整文件内容、完整日志或完整 compact。主控收到 watchdog 事件后再执行 artifact harvest。

#### Artifact Harvest 判定矩阵

主控在以下触发源下必须执行同一套收割逻辑：`agent_result`、`idle_notification`、`watchdog_event`、`user_status_question`、`resume`。

| 条件 | 主控动作 | 事件记录 | 是否推进 |
|---|---|---|---|
| required artifacts + state compact 完整，且 agent_result 正常 | 读取 state compact，合并状态 | `agent_harvest` | 是 |
| required artifacts + state compact 完整，但无 agent_result / 只有 idle | 读取 state compact | `completed_with_agent_output_missing` | 是 |
| watchdog unavailable / task_id 不可查 / checkpoint 过期 | 不等待 watchdog，立即检查 manifest + required artifacts + state compact | `watchdog_unavailable_active_harvest` | 视产物 |
| required artifacts 缺失，未追问过 | 追问 agent 一次 | `harvest_missing_prompt_once` | 否 |
| 追问后仍缺失，未重启过 | 标记旧 agent superseded，重启一次 | `agent_output_missing_restart` | 否 |
| 重启后仍缺失 | 写 manifest 风险并阻塞 | `agent_output_missing_blocked` | 否 |
| state compact 与 manifest 冲突 | 下钻 evidence / 步骤 md | `state_conflict` | 视结果 |
| open confirmation > 0 | 主控向用户确认 | `phase_blocked_for_confirmation` | 否 |
| completed transition has launchable next phase, but next phase not bootstrapped/launched | 立即补做原子 DAG transition：更新 checkpoint/event log/manifest，bootstrap 并启动下游 agent，安排 watchdog；记录 `controller_transition_gap` | `controller_transition_gap` | 是 |


#### Controller transition gap 自愈（硬规则）

Artifact harvest 结束后，主控必须额外执行一次 DAG transition gap 检查。该检查不读取完整 evidence/logs，只看 checkpoint、manifest、当前 state compact 和 open confirmation 数量。

```yaml
controller_transition_gap_check:
  when: after_artifact_harvest | user_status_question | resume | watchdog_event | agent_result
  gap_condition:
    - current_phase_artifacts_complete: true
    - open_blocking_confirmations: 0
    - next_transition_launchable: true
    - checkpoint.active_agents[] empty or missing expected next agents
    - no hard_stop recorded
  mandatory_repair:
    - append controller-event-log event=controller_transition_gap
	- update controller-checkpoint current_phase/active_agents/required_artifacts
    - refresh artifact-contract-manifest for next phase
    - write bootstrap state compact for next phase agent(s)
    - launch next phase agent(s)
    - schedule watchdog
  forbidden:
    - reply only with status summary
    - wait for user to ask again
    - mark workflow as running with no active agent when next phase is launchable
```

特殊链路 `04 -> 05x -> 05a/05b/05c`：`05x-target-shared-search.compact.json` 是 fan-out 输入，不是可暂停的阶段终点。生成 05x 后必须立即启动 05a/05b/05c；若启动失败，必须写明失败的具体 agent 和原因。

`active_agents[]` 是 checkpoint / manifest / phase_runtime 的唯一活动 agent 事实源。并行阶段必须逐个 agent 写入 `name`、`agent_id`、`phase`、`fanout_group`、`required_artifacts`、`restart_count`、`lease_status`、`watchdog_status`、`idempotency_key` 和 `status`；历史 `active_agent` 字段只能兼容读取，不得作为是否 fan-out 完整的判断依据。


#### Timing coverage 校验

主控或 final-report-writer 汇总 timing 时必须检查 step 覆盖率：

```yaml
timing_quality_check:
  total_duration_seconds: <agent_end.total_duration_seconds>
  sum_step_duration_seconds: <sum(step_end.duration_seconds)>
  coverage_ratio: sum_step_duration_seconds / total_duration_seconds
  step_granularity_insufficient: true | false
```

若 `total_duration_seconds >= 120` 且 `coverage_ratio < 0.5`，必须在 compact 与 `使用效果监控.md` 记录：

```yaml
step_granularity_insufficient: true
timing_gap_reason: step durations do not cover agent total runtime
next_run_timing_fix: update heartbeat and add step_start/step_end for long analysis/wait/tool phases
```

不得把这种 agent 的 slowest step 当作完整可观测慢点。

### Agent 结束回传协议（硬规则）

每个阶段 agent 在本轮结束前，最后一条正常消息必须显式返回短 `agent_result`，并确保对应 compact 文件已经写入；若 phase packet 声明了 `phase_summary_json`，还必须确保机器可读 summary JSON 已写入。无论结果是 completed、confirmed、blocked、partial、tool-unavailable 还是 failed，都必须返回 `agent_result`；不得只写文件后结束，不得只发送 `idle_notification`，也不得只回复“已写入文件”。若主控只能通过产物收割推进，必须在 event log 与 `使用效果监控.md` 记录 `execution_gap.agent_result_missing:<agent>`。

如果已写入步骤 md / compact 文件，返回内容必须包含产物绝对路径、阶段状态、`needs_user_confirmation`、`confirmation_topic`、`pending_confirmations_delta`（如有）和 `timing` / `step_timings_summary` 的摘要字段。若因错误无法写文件，也必须返回 failure `agent_result`，说明错误、已尝试动作、是否需要主控重试。


#### Artifact Contract Exit Checklist（硬规则）

每个阶段 agent 发送最后一条正常消息前，必须执行并在 `agent_result.key_outputs.artifact_contract_checklist` 或对应 state compact 中记录以下检查。该检查是防止“文件已写但只 idle / 无短回传”的最终门禁：

```yaml
artifact_contract_exit_checklist:
  main_artifact_exists: true | false
  main_artifact_non_empty: true | false
  state_compact_exists: true | false
  state_compact_non_empty: true | false
  evidence_compact_exists: true | false
  evidence_compact_non_empty: true | false
  phase_summary_json_exists: true | false
  phase_summary_json_non_empty: true | false
  required_artifacts_ok: true | false
  artifact_schema_validation:
    schema_path:
    validation_status: pass | partial | fail | unavailable
    declared_count:
    existing_count:
    missing: []
    path_mismatches: []
    canonical_paths_ok: true | false
    blocks_next_phase: true | false
  timing_present: true | false
  step_timings_summary_present: true | false
  timing_observability_present: true | false
  final_message_type: agent_result_yaml
```

结束判定：

- `required_artifacts_ok: true` 时，最后一条消息仍必须是短 YAML `agent_result`；不得只写文件、不得只发送 `idle_notification`、不得只回复“完成/已写入”。
- `required_artifacts_ok: false` 时，不得返回 `execution_status: completed`；必须返回 `partial` / `blocked` / `failed` / `tool-unavailable`，列出缺失产物与建议动作。
- `agent_result.execution_status=completed` 只表示本阶段执行完成；若需要表达迁移交付状态，必须另写 `delivery_status_recommendation`，不得用 `status: completed` / `execution_status: completed` 代替 `static-pass`。
- `final_message_type` 只能写 `agent_result_yaml`；若主控只能靠产物收割推进，最终监控必须记录 `completed_with_agent_output_missing:<agent>`。

推荐最后一条消息模板：

```yaml
agent_result:
  agent:
  phase:
  execution_status: completed | partial | blocked | failed | tool-unavailable
  delivery_status_recommendation: static-pass | partial-pass-static | blocked-static | not_applicable
  main_artifact:
  state_compact_artifact:
  evidence_compact_artifact:
  phase_summary_json:
  required_artifacts_ok: true | false
  open_confirmations: 0
  needs_user_confirmation: false
  pending_confirmations_delta: []
  key_outputs:
    artifact_contract_checklist:
      main_artifact_exists:
      main_artifact_non_empty:
      state_compact_exists:
      state_compact_non_empty:
      evidence_compact_exists:
      evidence_compact_non_empty:
      phase_summary_json_exists:
      phase_summary_json_non_empty:
      required_artifacts_ok:
      timing_present:
      step_timings_summary_present:
      timing_observability_present:
      final_message_type: agent_result_yaml
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

主控若只收到 idle 而未收到 compact，应按 `SKILL.md` / `00-global-contract.md` 的 agent-output-missing 兜底规则检查约定产物，不得持续等待。


#### Agent 输出缺失术语（统一口径）

```yaml
agent_output_terms:
  completed_with_agent_output_missing:
    meaning: required artifacts + state compact 完整，但 agent 最后一条消息不是短 agent_result
    action: 主控按文件事实推进，并在 event log / 使用效果监控记录协作风险
  agent_output_missing:
    meaning: required artifacts 或 state compact 缺失，且追问/重启后仍无有效产物
    action: 标记阶段失败/阻塞/重启一次，不得继续等待
  agent_result_missing:
    deprecated_alias_of: completed_with_agent_output_missing
    note: 新报告不再使用该主键，历史报告可保留原文
```

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

#### Controller helper / manual completion 小上下文补做机制

当阶段 agent 产物缺失、只返回 idle、或 required artifacts 部分缺失时，Main 不应直接读取大量 logs 或完整步骤文档来补做。优先使用小上下文 controller helper 补做机制：

```yaml
controller_helper_policy:
  trigger:
    - required_artifacts_missing_after_prompt_once
    - agent_output_missing_after_restart_once
    - phase_summary_json_missing_but_logs_exist
    - state_compact_missing_but_main_artifact_exists
  helper_task:
    owner: controller | lightweight-helper-agent
    input_budget: phase-summary JSON if any + state compact if any + explicit evidence_paths + tail/head of selected logs only
    forbidden: full project scan, full logs paste, business code/resource write
    writes:
      - missing state compact / evidence compact / phase-summary JSON
      - controller-manual-completion timing JSONL
      - controller-event-log entry
    output: short controller_helper_result YAML
```

补做顺序：

1. Main 先检查 phase-summary JSON / state compact / required artifact 存在性；
2. 若缺失，最多追问原 agent 一次；
3. 仍缺失但已有足够 evidence paths 时，启动 controller helper 补做，而不是 Main 展开大文件；
4. helper 只能基于已有 evidence paths 汇总缺失产物，不能新增业务事实、不能修改目标业务代码或资源；
5. helper 必须写 `logs/timing/<phase>-controller-manual-completion.timing.jsonl`，包含 `agent_start` / step / `agent_end.total_duration_seconds`；
6. helper 输出短结果：

```yaml
controller_helper_result:
  phase:
  helper_mode: controller-manual-completion
  execution_status: completed | partial | blocked | failed
  artifacts_written: []
  phase_summary_json:
  evidence_used: []
  unresolved_gaps: []
  next_action:
```

若 helper 仍无法补齐 required artifacts，Main 才按该阶段 `agent_output_missing_blocked` 处理，不得继续无限等待或继续扩大 Main 上下文。



适用范围包括但不限于：

- `01-controller-precheck`；
- `04-controller-manual-completion`（例如资源闭包 agent 产物缺失后由 controller 基于 logs 补做）；
- `05-controller-merge`；
- `06-repair-dispatch` / `06-repair-harvest`；
- 第 7 步 final-report 前由 controller 执行的状态修正、确认项关闭或 manifest 收口。

这些 controller-owned timing JSONL 必须写在 `<target_migration_dir>/logs/timing/` 下，命名建议为 `<phase>-controller.timing.jsonl` 或 `<phase>-controller-manual-completion.timing.jsonl`。事件 schema 与 agent timing 保持一致，只是 `agent` 字段写 `controller` / `controller-manual-completion`：

```json
{"event":"agent_start","agent":"controller","phase":"04-controller-manual-completion","ts":"YYYY-MM-DD HH:mm:ss","note":"manual artifact completion started"}
{"event":"step_start","agent":"controller","phase":"04-controller-manual-completion","step":"read available logs","type":"read","ts":"YYYY-MM-DD HH:mm:ss"}
{"event":"step_end","agent":"controller","phase":"04-controller-manual-completion","step":"read available logs","type":"read","ts":"YYYY-MM-DD HH:mm:ss","duration_seconds":12,"status":"completed","output_or_evidence":"logs/..."}
{"event":"agent_end","agent":"controller","phase":"04-controller-manual-completion","ts":"YYYY-MM-DD HH:mm:ss","status":"completed","total_duration_seconds":180}
```

最低要求：

1. 每个 controller/manual 阶段必须有 `agent_start` 与 `agent_end.total_duration_seconds`；
2. 耗时超过 60 秒或包含 2 个以上动作时，必须写成对 `step_start` / `step_end`；
3. 由 controller 补做 required artifacts 时，必须至少记录 `read existing evidence`、`synthesize missing artifact`、`write state/evidence compact`、`update manifest/event log` 四类 step；
4. 若无法写 controller timing，必须在对应 state compact / `使用效果监控.md` 记录 `controller_timing_missing:<phase>`；
5. 若 `agent_end.total_duration_seconds` 缺失，记录 `controller_timing_total_duration_missing:<phase>`；
6. 若 controller/manual 总耗时 >= 120 秒但 step 覆盖率 < 0.5，记录 `controller_step_granularity_insufficient:<phase>`。

final-report-writer 聚合 timing 时，必须把 controller/manual timing 与 agent timing 分开标注，但都纳入“Agent/Controller 总耗时汇总”和慢操作复盘；不得把 controller 事后补做耗时计入已 superseded agent 的有效工作耗时。

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


#### 高成本阶段最低 step 边界（硬规则）

为避免出现“agent 总耗时精确但慢点只剩一个粗粒度 writeback / analysis”的情况，以下阶段即使 `timing_mode: standard` 也必须记录最低 step 边界。每个 step 都必须成对写入 `step_start` / `step_end`，`duration_seconds` 由真实 start/end 计算。

```yaml
required_step_boundaries:
  migration-applier:
    - dry-run
    - code/import rewrite
    - resource/meta copy
    - config/event/protocol/SubGame integration
    - prefab uuid precheck/rebind
    - self-check/docs writeback
  static-verifier:
    - input/cache read
    - import_symbol_tsgraph_review
    - ui_config_event_protocol_check
    - prefab_static_cache_or_cli_check
    - prefab_script_binding_check
    - public_uuid_rebind_audit
    - dynamic_resource_paths_check
    - responsibility_fidelity_matrix
    - write static check artifacts
  final-report-writer:
    - read static check and final compact
    - aggregate timing jsonl
    - write migration summary
    - write usage monitoring
    - close manifest phase_runtime
    - write final compact
    - self timing finalization
  source-resource-closure-analyzer:
    - input/compact read
    - resource cache check
    - dynamic resource search
    - asset deps/uuid/refs refresh
    - write resource closure artifacts
  target-capability-analyzer:
    - shared-search/index read
    - target capability gap search
    - responsibility equivalence synthesis
    - write target capability artifacts
```

若 `agent_end.total_duration_seconds >= 120`，但上述必需步骤缺失、所有步骤都写成 0/1 秒，或 step 总耗时明显小于 agent 总耗时，必须在 compact 与 `agent_result.timing_observability` 中写：

```yaml
step_granularity_insufficient: true
missing_step_boundaries: []
next_run_timing_fix: add required step_start/step_end boundaries from compact-and-logs.md
```


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

若 agent 总耗时 `total_duration_seconds >= 120`，但所有已记录 `step_end.duration_seconds <= 1` 或 step 总耗时明显小于 agent 总耗时，必须在 compact / `agent_result.timing_observability` 记录 `step_granularity_insufficient: true`，并说明缺失的步骤边界。final-report-writer 必须把这种情况列为 `execution_gap.step_granularity_insufficient:<agent>`，不得把该 agent 的 step timing 当作完整可观测。

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
