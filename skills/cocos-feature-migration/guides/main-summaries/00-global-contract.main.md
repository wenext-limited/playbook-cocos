# Main Summary: 全局契约
> 术语索引：DAG transition = `dag_transition`，由 controller 在 artifact harvest 完成后推进。

本文件是 main/controller 默认读取的轻量摘要。完整规则在 `guides/00-global-contract.md`；只有规则冲突、阻塞、越权、compact 证据不足或用户要求解释时，才读取完整 guide。

## main 常驻硬门禁

```yaml
main_runtime_contract:
  parameter_precheck:
    required: [source_project, target_project, feature_name]
    before: [TeamCreate, Agent, TaskList, target_git, business_write]
  feature_slug:
    rule: "业务对象 + 功能类型；jackpot榜单必须是 jackpot_rank"
  execution_mode:
    default: normal
    degraded_allowed: true
    degraded_triggers: [ts_graph_unavailable, cli_anything_cocoscreator_unavailable, cache_missing_or_stale, agent_result_missing_but_artifacts_ok]
    hard_stop_triggers: [missing_required_params, target_branch_gate_before_target_write, unauthorized_business_write, destructive_or_overwrite_risk, blocking_user_confirmation]
    degraded_policy: continue_with_lower_confidence_and_cap_final_status
    final_status_cap_examples:
      source_code_without_tsgraph: partial-pass-static
      resource_without_cli: partial-pass-static | blocked-static
  scheduling_optimization:
    source_readonly_can_run_before_target_branch_gate: true
    source_phase_parallelism:
      after_entry_confirmed: [source-code-closure-analyzer, source-resource-prefetch]
      resource_prefetch_scope: entry/UIConfig/route/key_prefab/prefab_uuid_asset_index_only
      resource_final_closure_requires: source-code-closure completed
    target_phase_parallelism:
      after_05x_shared_search_and_target_branch_gate: [target-capability-analyzer, fidelity-risk-analyzer, resource-migration-planner]
      private_outputs_only: true
      final_merge_owner: controller
    target_business_code_and_assets: migration-applier only
    migration_apply_fidelity_first:
      default: preserve_source_behavior_and_structure
      applies_during: 06-migration-applier
      no_post_diff_required: true
      allowed_without_extra_evidence:
        - import path adaptation
        - bundle name / UI registration / resource root adaptation
        - target-existing common capability hookup
      forbidden_without_evidence:
        - rewrite source feature string constants
        - rewrite API/deeplink paths
        - rewrite enum values or request parameters
        - rewrite defaults, branch logic, static field structure, key method structure
      required_evidence_for_changes: [user-specified, target-existing, backend-doc]
      fallback_when_no_evidence: keep_source_value_and_structure_or_open_confirmation
    target_branch_confirmation_menu:
      format: plain_text_letter_menu
      must_not_compress_to_binary_choice: true
      always_include_when_confirmation_needed:
        - continue-current-local-branch
        - create-default-from-current-local-branch
        - create-default-from-origin-main-validate-after-selection
        - "base=origin/xxx"
        - "branch=feature/xxx"
        - pause
      recommendation_order:
        - user-specified-branch
        - create-default-from-origin-main
        - create-default-from-current-local-branch
        - continue-current-local-branch
      fallback_recommendation: "if origin/main validation fails or remote unavailable, recommend create-default-from-current-local-branch"
      item_text_must_include: [base_ref, applies_when]
      show_existing_migration_branch_when_detected: true
      remote_options_policy: "may be shown as 选择后校验; run readonly remote validation only after user selects"
      menu_item_requirement: "creation options must name the base ref explicitly"
      reply_policy: "用户可回复 A/B/C... 或完整策略文本；不得使用 1/2/3 作为可回复选项"
    controller_merge_resolution:
      phase: 05-controller-merge
      evidence_precedence: [user-specified, backend-doc, target-existing, source, static-tool, inferred, unknown]
      fidelity_and_confirmation_override_reuse: true
      unresolved_blocking_conflicts_block_step6: true
      non_blocking_conflicts_continue_as_step6_constraints: true
      compact_required: controller_merge_resolution_summary
  default_validation_level:
    level: L1-static
    forbidden_by_default: [tsc, cocos, npm_build, npm_typecheck]
  completion_source:
    phase_done_by: required_artifacts + compact + manifest
    not_by: [idle_notification, agent_self_report]
  pending_confirmation_owner:
    owner: controller
    agents_can_only: pending_confirmations_delta
  final_status_owner:
    owner: controller
  status_fields:
    execution_status: "agent 阶段执行状态，可为 completed，但不代表功能迁移 completed"
    delivery_status_recommendation: "迁移交付状态建议：static-pass | partial-pass-static | blocked-static | not_applicable"
    status_compat: "旧 status 字段只按 execution_status 兼容读取"
```


## main 调度可靠性硬门禁

```yaml
scheduling_reliability_gate:
  state_bootstrap:
    owner: controller
    before: Agent
    action: write phase state compact with status=running
  heartbeat:
    path: <source_analysis_dir-or-target_migration_dir>/logs/heartbeat/<phase>-<agent>.heartbeat.json
    max_lines_default: 40
    content: scheduling_only_no_full_evidence
  watchdog:
    preferred: Monitor
    fallback: Bash run_in_background one-shot
    emits: one_line_events_only
    triggers_harvest: true
    unavailable_policy: "Monitor 与 Bash fallback 都不可用、task_id 丢失/不可查、或 checkpoint 过期时，不得 wait_watchdog；resume/checkpoint 必须立即 artifact_harvest"
  artifact_harvest:
    triggers: [agent_result, idle_notification, watchdog_event, user_status_question, resume]
    default_reads: [controller-checkpoint.compact.md, current_state_compact]
    complete_when: required_artifacts + state_compact + manifest
  dag_transition:
    owner: controller
    must_advance_on_completed_artifacts: true
    atomic_same_turn_required: true
    means: "阶段完成后必须在同一 controller turn 内完成下一阶段最小启动动作；不得只写 next_action 或只生成中间产物"
    required_actions: [checkpoint_update, event_log_append, artifact_manifest_refresh, state_bootstrap_next, agent_launch_next_if_unblocked, watchdog_schedule]
    forbidden_terminal_states:
      - next_action_written_but_next_phase_not_started
      - shared_input_generated_but_downstream_agents_not_started
      - chat_says_will_start_but_no_agent_or_watchdog
      - waiting_for_user_status_question_to_continue
    transition_gap_detection:
      name: controller_transition_gap
      condition: "checkpoint.next_action points to launchable phase AND active_agents empty AND no hard_stop AND no blocking confirmation"
      action: "immediately bootstrap/launch downstream phase, append event log, record in usage monitoring"
    critical_chain_05: "04 completed -> 05x generated -> 05a/05b/05c fan-out must be one atomic transition when target branch gate is closed"
  compaction_resume_handshake:
    triggers: [context_compaction, resume, interruption, long_gap_status_question]
    first_action: "读取 controller-checkpoint.compact.md + artifact-contract-manifest.json + 迁移清单 phase_runtime + 当前阶段 state compact"
    forbidden: "凭聊天记忆继续执行"
    active_agents_policy: "active_agents[] 是唯一活动 agent 事实源；历史 active_agent 只兼容读取为 active_agents[0]，不得写回为主状态"
  durability_barrier:
    required_before: [ask_user, spawn_agent, dag_transition, business_write, final_response]
    required_after: [user_confirmation_closed, agent_spawned, agent_harvested, business_write, phase_completed]
    writes: [checkpoint, manifest_phase_runtime, current_state_compact, controller_event_log]
  artifact_contract_schema:
    path: <target_migration_dir>/logs/artifact-contract-manifest.json
    owner: controller
    validation: lightweight_path_non_empty_json_header_only
    on_path_mismatch: controller_helper_canonicalize_before_restart
    pass_or_nonblocking_partial_allows_dag_transition: true
    fail_with_blocking_missing_uses_prompt_once_restart_once: true
  context_budget:
    checkpoint_max_lines: 80
    heartbeat_max_lines: 40
    watchdog_event_max_lines: 1
    state_compact_max_lines_default: 200
    event_log_read_tail_max_lines: 80
```

## main 必须提醒 agent 的回传 / timing 门禁

```yaml
agent_contract_gate:
  final_message: short_agent_result_yaml
  last_message_must_start_with: agent_result
  exit_checklist_required: true
  checklist_fields:
    - main_artifact_exists
    - state_compact_exists
    - evidence_compact_exists
    - required_artifacts_ok
    - timing_present
    - step_timings_summary_present
    - timing_observability_present
    - final_message_type: agent_result_yaml
  terminology:
    completed_with_agent_output_missing: "产物完整但 agent 未正常返回短 agent_result"
    agent_output_missing: "产物或 compact 缺失，追问/重启仍无有效输出"

migration_applier_prefab_gate:
  before: static-verifier
  required_artifact: <target_migration_dir>/prefab-static-check-cache.json
  required_check: prefab script binding preflight
  checks:
    - expected_scripts
    - target_script_meta_uuid
    - prefab_full_or_short_uuid_hit
    - serialized_script_field_hit
    - missing_script_signature_hit
  repair_policy: migration-applier fixes only deterministic one-to-one mappings; ambiguous prefab edits become repair_recommendations/editor spot check
  editor_review: must_not_run_automatically

controller_timing_gate:
  controller_owned_phases:
    - 01-controller-precheck
    - 04-controller-manual-completion
    - 05-controller-merge
    - 06-repair-dispatch
    - 06-repair-harvest
    - final-manifest-compact-close
  required_schema: agent_start + step_start/step_end_when_nontrivial + agent_end.total_duration_seconds
  timing_dir: <target_migration_dir>/logs/timing/
  missing_gap_keys:
    - controller_timing_missing:<phase>
    - controller_timing_total_duration_missing:<phase>
    - controller_step_granularity_insufficient:<phase>
  phase_05_merge_timing: <target_migration_dir>/logs/timing/05-controller-merge.timing.jsonl
  required_when: merging_05a_05b_05c
```

## main 默认不做

- 不全量搜索源项目代码。
- 不全量搜索目标项目代码。
- 不展开 asset deps 原始输出。
- 不读取大型 prefab 全文。
- 不复制 agent 已写入步骤 md 的完整表格。
- 不把 agent compact 全文粘贴进最终回复。
- 不在聊天里维护完整历史状态。
- 不读取完整 agent prompt；只在 phase packet 中要求子 agent 自行读取对应 prompt / guide。
- 不读取完整步骤 md / evidence compact / logs，除非 state compact 缺失、状态冲突、required artifacts 缺失、open confirmation、agent 越权风险或用户要求细节。

例外：compact 缺失、产物冲突、agent 越权、阻塞门禁、用户要求细节时，main 才下钻完整 guide / 步骤 md / logs。

## 调度原则

- main 是 scheduler，不是事实仓库。
- 当前状态写入 `迁移清单.md` 和 `controller-checkpoint.compact.md`。
- agent 是 worker，只写私有产物，只回短结构化结果。
- agent 不得等待 peer、TaskList、最终合并文件或用户。
- main 对 agent 收割必须有界：idle-only 立即查产物；缺产物最多追问一次；仍失败则补做 / 重启一次 / 阻塞，不得卡住整流程。
- main 执行 DAG transition 必须原子推进：阶段产物完成且无 hard_stop / blocking confirmation 时，必须同轮更新 checkpoint/event log/manifest、bootstrap 并启动下一阶段 agent、安排 watchdog；不得只写 `next_action`、只生成 05x 等中间产物、或等用户追问才继续。
- main 恢复或被用户询问状态时，若发现 `controller_transition_gap`（checkpoint 指向可启动阶段、active_agents 为空、无阻塞），必须立即补启动并记录 gap 到 event log / 使用效果监控。
- main 恢复时若 watchdog 不可用、不可查询或已过 checkpoint/soft timeout，不得等待 watchdog；必须立刻 artifact harvest，再按产物完整性推进、追问、重启或阻塞。
- main 判断并行阶段必须遍历 `active_agents[]`；05a/05b/05c 任一缺失、superseded 或未收割都不得被单个 `active_agent` 覆盖。
- main 默认读取预算：`controller-checkpoint.compact.md` + 当前阶段 `*.state.compact.md` + manifest 80 行以内必要片段 + 短 `agent_result`。完整 Markdown 读取优先 limit 400~800 行。
- main 调度历史写入 `<target_migration_dir>/logs/controller-event-log.jsonl`，事件包括 `phase_start`、`agent_harvest`、`completed_with_agent_output_missing`、`user_confirmation_closed`、`phase_complete`、`repair_round`。
