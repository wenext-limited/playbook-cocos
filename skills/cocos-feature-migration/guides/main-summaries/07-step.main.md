# Main Summary: 第 7 步控制器

本文件是 main/controller 默认读取的第 7 步轻量摘要。完整规则在 `guides/07-static-verifier-final.md`。

## 第 7 步分工

```yaml
step7_controller:
  static_verifier:
    reads: [迁移清单.md, 源侧摘要.compact.md, 目标差异摘要.compact.md, 迁移状态摘要.compact.md, 06-迁移动作记录.md]
    writes: [07-迁移验证.md, 最终状态摘要.compact.md, logs]
    returns: short_agent_result
  final_report_writer:
    reads: [迁移清单.md, 最终状态摘要.compact.md, 07-迁移验证.md, usage-monitoring guide]
    preferred_reads: [migration-static-check.json, 最终状态摘要.compact.md, timing jsonl, usage-monitoring guide]
    writes: [迁移总结.md, 使用效果监控.md, 最终状态摘要.compact.md]
    returns: short_agent_result
```


## 第 7 步新增结构化要求

```yaml
step7_structured_requirements:
  static_verifier_cache_first:
    prefab_static_check_cache_expected_scripts: required_when_available
    binding_evidence_values: [direct, secondary, unknown, missing]
    pass_when: direct_or_secondary
    partial_when: unknown
    fail_when: missing
  final_report_monitoring:
    required_skill_update_fields:
      - should_update_skill_md
      - should_update_agent_prompts
      - should_update_timing_protocol
      - should_update_static_verifier_rules
      - rule_gap
      - execution_gap
      - tooling_gap
      - recommended_patch_tasks
  final_message: short_agent_result_yaml
```

## main 只关心的判定字段

```yaml
step7_status_gate:
  l1_completed:
  final_status_recommendation: static-pass | partial-pass-static | blocked-static
  prefab_static_cache:
    status: fresh | partial | stale | missing | unavailable
    reused_prefab_count:
    cli_rerun_prefab_count:
  static_status_breakdown:
    code_import_symbol:
    ui_config_event_protocol:
    asset_deps_business_missing:
    prefab_script_binding:
    public_uuid_rebind:
    builtin_like_unresolved:
    entry_visual_integration:
    dynamic_resource_paths:
    responsibility_equivalence:
    fidelity:
  open_confirmations:
  repair_recommendations:
  final_status_synthesis:
    final_status:
    status_cap:
    downgrade_reasons:
      - code:
        category: tooling_degraded | artifact_contract | source_boundary | target_branch_gate | entry_semantics | fidelity_semantics | code_static | resource_static | prefab_script_binding | public_uuid_rebind | builtin_like_unresolved | responsibility_equivalence | agent_coordination
        severity: note | partial | blocking
        source_dimension:
        evidence_paths: []
        user_facing_summary:
        recovery:
  downgrade_reason_taxonomy_required: true
  missing_reasons_gap: execution_gap.final_status_reason_missing
  prefab_binding_review:
    present: yes | no
    must_not_run_automatically: true
  resource_governance_review:
    present: yes | no
  entry_visual_integration:
    status: pass | partial | fail | not_applicable
  builtin_like_unresolved:
    status: pass | review-required | fail | not_present
    source: builtin-like allowlist / cache / cli unresolved classification
```

## 默认边界

- 默认只执行 L1 静态验证。
- cache / CLI / ts-graph 不足时进入 verification degraded mode，使用 rg/Read、Prefab 文本 uuid、`.meta` reverse index、`prefab-static-check-cache.json` 降级复验；能证明主链静态闭合但缺 editor/public uuid 完整证据时收敛为 `partial-pass-static`，不得无限等待工具或编辑器。
- 不主动探测 / 运行 tsc、cocos、npm build、npm typecheck。
- Prefab 绑定编辑器复核只作为人工复核建议，不作为 skill 阶段自动执行。
- 第 7 步完成后默认静态迁移交付流程即结束，不因编译、编辑器和运行态人工复核未执行而悬挂。
- final-report-writer 必须关闭 manifest `phase_runtime`，并把最终状态收敛为 `static-pass` / `partial-pass-static` / `blocked-static`。

## agent 不得卡主流程

- `static-verifier` 不得等待 `final-report-writer`。
- `final-report-writer` 不得等待已 idle 且无必要产物的其他 agent；必须按 checkpoint / manifest / compact 收口。
- 若 verifier 缺 compact 但 `07-迁移验证.md` 存在，main 可按 artifact-harvested 推进。
- 若 verifier 缺关键产物，main 最多追问 / 重启一次；仍失败则写 `blocked-static` 或 `partial-pass-static`，不得无限等待。
