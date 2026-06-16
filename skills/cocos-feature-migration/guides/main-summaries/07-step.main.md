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
    asset_deps_business_missing:
    prefab_script_binding:
    public_uuid_rebind:
    responsibility_equivalence:
    fidelity:
  open_confirmations:
  repair_recommendations:
  editor_prefab_binding_review_recommendation:
```

## 默认边界

- 默认只执行 L1 静态验证。
- `static-verifier` 必须 cache-first：优先复用 `prefab-static-check-cache.json` / `migration-static-check.json` / `asset-deps-summary.json`；只有 cache missing / stale / unknown 的 prefab 才允许调用完整 CLI deps/refs。
- 不主动探测 / 运行 tsc、cocos、npm build、npm typecheck。
- Prefab 绑定编辑器复核只作为人工复核建议，不作为 skill 阶段自动执行。
- 第 7 步完成后默认静态迁移交付流程即结束，不因编译、编辑器和运行态人工复核未执行而悬挂。
- final-report-writer 必须关闭 manifest `phase_runtime`，并把最终状态收敛为 `static-pass` / `partial-pass-static` / `blocked-static`。

## agent 不得卡主流程

- `static-verifier` 不得等待 `final-report-writer`。
- `final-report-writer` 不得等待已 idle 且无必要产物的其他 agent；必须按 checkpoint / manifest / compact 收口。
- 若 verifier 缺 compact 但 `07-迁移验证.md` 存在，main 可按 artifact-harvested 推进。
- 若 verifier 缺关键产物，main 最多追问 / 重启一次；仍失败则写 `blocked-static` 或 `partial-pass-static`，不得无限等待。
