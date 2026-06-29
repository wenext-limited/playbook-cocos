# 第 5 步：目标差异、保真风险与资源计划

### 第 5 步：在目标项目构建图谱并做差异分析

开始本步骤前：先读取 `迁移清单.md`、`源侧摘要.compact.md`、`03-源代码闭包.md`、`04-源资源闭包.md` 以及第 5 步私有产物（如果存在）。

第 5 步采用**私有产物 + 单点合并 + 05x 后默认 fan-out DAG**模式，避免多个 agent 并发覆盖同一最终文件，也避免 05b/05c 因等待 05a 或最终合并文件而卡住。

默认 DAG：

```text
Controller 生成/刷新 05x-target-shared-search.compact.json
  -> 05a target-capability-analyzer
  -> 05b fidelity-risk-analyzer
  -> 05c resource-migration-planner
05a / 05b / 05c 默认可并行 fan-out，只写私有产物
主控最后合并 05a/05b/05c -> 05-目标差异分析.md / 目标差异摘要.compact.md
```

硬规则：

- `05x-target-shared-search.compact.json` 是 05a/05b/05c 并行 fan-out 的唯一 hard input；主控应在 phase packet 写入 `allow_05_fanout: true`、`shared_search_bundle_path` 和 optional index paths。`target_capability_index_path` / `target_resource_index_path` / `target_uuid_index_path` 只能作为 optional performance cache，不得进入 fan-out `required_artifacts`，缺失时由对应 05 agent targeted refresh。
- `05a` / `05b` / `05c` 默认可以并行启动；三者只能写各自私有产物，不得互相等待。
- 若 05b/05c 需要 05a 尚未产出的目标同职责结论，必须写 `unknown` / `pending-merge` / `needs_controller_merge_resolution`，不得等待 05a 完成。
- `05b` / `05c` 不得等待、读取为必需项、或要求预先存在 `05-目标差异分析.md` / `目标差异摘要.compact.md`；这两个最终文件由主控在三份私有产物之后合并生成。
- 若 `05x-target-shared-search.compact.json` 缺失或 stale，主控不得启动 05a/05b/05c fan-out，也不得退回会重新引入互等风险的旧两段式 DAG；必须先执行 05x helper/rebuild。若 prompt-once / helper / restart 后仍无法生成 fresh 或可受限消费的 05x compact，则以 `artifact_contract` 阻塞第 5 步，并在 controller event log 和 `使用效果监控.md` 记录 `execution_gap.05x_shared_search_missing_or_stale`。只有用户显式授权 legacy constrained mode，且 controller 写明状态上限与互等防护时，才允许临时采用旧两段式流程。


私有产物：

| 子阶段 | 产物 | compact | 写入者 |
|---|---|---|---|
| 目标能力分析 | `05a-目标能力分析.md` | `目标能力摘要.compact.md` | `target-capability-analyzer` |
| 保真风险审计 | `05b-保真风险分析.md` | `保真风险摘要.compact.md` | `fidelity-risk-analyzer` |
| 资源迁移计划 | `05c-资源迁移计划.md` | `资源迁移计划摘要.compact.md` | `resource-migration-planner` |
| 第 5 步合并 | `05-目标差异分析.md` | `目标差异摘要.compact.md` | 主控或单一汇总者 |

主控合并 `05a/05b/05c` 时，必须输出合并完整性 checklist，避免私有产物都存在但最终 `05-目标差异分析.md` 漏掉风险或约束：

```yaml
target_diff_merge_check:
  includes_target_capability: true | false
  includes_fidelity_risks: true | false
  includes_resource_plan: true | false
  includes_pending_confirmations_delta: true | false
  includes_migration_constraints_for_step6: true | false
  includes_resource_decision_reason: true | false
  no_conflicting_status_between_05a_05b_05c: true | false
  merge_owner: controller | designated-single-writer
```

若任一关键项为 `false`，不得启动 `migration-applier`；必须先补合并或记录阻塞原因。

#### 5.merge 冲突裁决模板（硬规则）

#### 5.z fanout_unknown_pending_merge_gate（P0 硬门禁）

05a/05b/05c 私有 agent 在 fan-out 模式下允许写 `unknown` / `pending-merge`，但不得让这些字段成为普通风险被忽略。所有 05 agent 的 phase-summary JSON、compact 和 `agent_result` 必须输出：

```yaml
fanout_gate_fields:
  blocks_next_phase: true | false
  blocks_step6: true | false
  unknown_pending_merge_count: 0
  unresolved_claims: []
  known_missing_risk_sections: []
  core_sections_complete:
    capability: true | false | not_applicable
    fidelity: true | false | not_applicable
    resource: true | false | not_applicable
    entry: true | false | not_applicable
````

默认规则：

- `unknown_pending_merge_count > 0` 默认 `blocks_step6: true`。
- 只有 controller 在 `controller_merge_resolution_summary.decisions` 中逐项裁决，并把某个 unknown 显式降为 `allow-with-constraint` / `mark-risk`，才允许不阻塞第 6 步。
- claims JSON 若缺 `capability` / `fidelity` / `resource` / `entry` 任一与本阶段相关的核心 section，必须把该 section 写入 `known_missing_risk_sections`，并 `blocks_step6: true`；只能继续补文档，不能进入第 6 步。
- controller merge 必须汇总所有 `blocks_step6`、`unresolved_claims`、`known_missing_risk_sections`；任一未裁决时 `step6_merge_gate.can_start_migration_applier=false`。

##### 05a entry semantics gate（P0）

若 05a 发现迁移方案会复用或替换目标已有入口 / 按钮 / deeplink / banner 行为，且无 `target-existing` / `user-specified` / `backend-doc` 证据证明语义等价，必须输出：

```yaml
pending_confirmations_delta:
  - topic: entry-semantics
    reason: replacing existing target entry semantics
blocks_step6: true
````

仅新增独立 SubUIID/入口且不替换目标既有入口时，可作为 non-blocking constraint 继续。

##### 05c transitional resource gate（P1）

若 `transitional_dir_required=true`，必须同时输出 `exit_condition`、`latest_cleanup_time`、`transitional_resource_decisions`。缺任一字段时 `blocks_step6: true`。


主控合并 `05a/05b/05c` 时不得简单拼接三份 compact；必须执行结构化冲突裁决，并把结果写入 `目标差异摘要.compact.md`。目标是让 Main 只读取小型合并摘要即可判断是否能进入第 6 步，而不展开完整 05a/05b/05c Markdown。

证据优先级固定如下，冲突时按更高优先级裁决；同级证据冲突时取更保守结论并记录原因：

```yaml
evidence_precedence:
  - user-specified        # 用户明确选择或授权
  - backend-doc           # 后端/产品/接口文档
  - target-existing       # 目标项目现有代码、配置、资源、路由、UIConfig、meta 证据
  - source                # 源功能语义、源代码闭包、源资源闭包
  - static-tool           # ts-graph / cli-anything-cocoscreator / cache / index 结构化证据
  - inferred              # 推断，只能作为候选，不得静默落地高风险语义
  - unknown               # unknown / pending-merge / evidence-missing
```

冲突类型与裁决规则：

| conflict_type | 例子 | 默认裁决 |
|---|---|---|
| capability_vs_fidelity | 05a 建议复用目标能力，但 05b 发现 API/gating/event 语义不等价 | 保真风险优先；复用只能作为 `step6_constraints`，必要时需用户确认 |
| resource_vs_fidelity | 05c 建议复用目标公共资源，但资源承载源业务语义或入口视觉风险 | 保真/入口语义优先；资源复用需写证据和回退方案 |
| capability_vs_resource | 05a 认为目标已有同职责组件，05c 发现资源目录/UUID/meta 难以承接 | 不阻塞分析，但第 6 步必须按资源约束落地；高风险则 partial/confirm |
| agent_vs_shared_search | 私有 agent 结论与 05x shared search 不一致 | 取私有深查结论，但必须记录 shared search stale/不足原因 |
| inferred_vs_evidence | 任一 agent 用 inferred 改 API/path/entry/gating | 不得直接落地；需要 `user-specified` / `backend-doc` / `target-existing` 关闭 |
| unknown_pending_merge | 05b/05c 因 fan-out 缺 05a 结论写 unknown/pending-merge | Controller 必须裁决；裁决不了则阻塞第 6 步或输出确认项 |

`目标差异摘要.compact.md` 必须包含：

```yaml
controller_merge_resolution_summary:
  merge_status: completed | partial | blocked
  conflict_count: 0
  blocking_conflict_count: 0
  unresolved_conflict_count: 0
  evidence_precedence_used: []
  decisions:
    - conflict_id:
      conflict_type: capability_vs_fidelity | resource_vs_fidelity | capability_vs_resource | agent_vs_shared_search | inferred_vs_evidence | unknown_pending_merge | artifact_contract | other
      sources: [05a-target-capability, 05b-fidelity-risk, 05c-resource-plan, 05x-shared-search]
      controller_decision: reuse-target | copy-source | adapt-target | ask-user | block-step6 | allow-with-constraint | mark-risk
      decision_basis: user-specified | backend-doc | target-existing | source | static-tool | inferred | unknown
      evidence_precedence_used: []
      evidence_paths: []
      blocks_step6: true | false
      needs_user_confirmation: true | false
      step6_constraints: []
      downgrade_reason_code:
```

进入第 6 步门禁：

`step6_merge_gate` 还必须合并上游 gate：

```yaml
upstream_gate_inputs:
  source_semantic_closure_gate:
    blocks_step6_migration: true | false
    missing_semantic_sections: []
  resource_closure_gate:
    blocks_step6_migration: true | false
    critical_unknown_count: 0
  step6_degraded_gate:
    blocks_step6: true | false
    alternative_evidence_available: true | false
    status_cap:
  fanout_gate_fields:
    blocks_step6: true | false
    unknown_pending_merge_count: 0
    unresolved_claims: []

gate_schema_missing_policy:
  first_action: controller_helper_completion
  second_action: prompt_or_restart_once
  final_action: artifact_contract block if still missing
```

若上游 gate 缺字段，先按 artifact contract 缺口补写一次，不得直接当业务阻塞；补写后仍无法判断时，才以 `artifact_contract` 阻塞第 6。


```yaml
step6_merge_gate:
  can_start_migration_applier: true | false
  must_be_true:
    - target_diff_merge_check.includes_target_capability
    - target_diff_merge_check.includes_fidelity_risks
    - target_diff_merge_check.includes_resource_plan
    - target_diff_merge_check.includes_migration_constraints_for_step6
    - target_diff_merge_check.includes_resource_decision_reason
    - controller_merge_resolution_summary.blocking_conflict_count == 0
    - controller_merge_resolution_summary.unresolved_conflict_count == 0
    - open_blocking_confirmations == 0
```

如果只剩非阻塞冲突（例如过渡目录清理、builtin-like editor review、公共资源治理建议），不得卡主整个流程；应写入 `step6_constraints`、`repair_recommendations` 或第 7 步人工复核建议，并允许继续。



##### 5.x 05b/05c 核心搜索结构化缓存（性能优化 P1）

05b / 05c 不得只把核心搜索证据写入 Markdown 或散落 txt 日志；必须写稳定 JSON，供 controller merge、final-report 和下次同项目迁移复用。

05b 必写：

```text
<target_migration_dir>/logs/05b-fidelity-search-cache.json
```

最低字段：

```yaml
api_path_hits: []
request_param_hits: []
gating_kv_hits: []
event_hits: []
ui_route_hits: []
i18n_hits: []
activity_enum_hits: []
semantic_gaps: []
cache_key:
  target_commit:
  source_closure_hash:
  feature_slug:
```

05c 必写：

```text
<target_migration_dir>/logs/05c-resource-search-cache.json
```

最低字段：

```yaml
prefab_hits: []
resource_basename_matches: []
uuid_matches: []
copy_candidates: []
reuse_candidates: []
rebind_candidates: []
transitional_candidates: []
cache_key:
  target_commit:
  source_resource_hash:
  feature_slug:
```

复用规则：若 target commit、source closure/resource hash、feature_slug 一致且 cache schema 完整，05b/05c 应先复用缓存，只对 stale/missing 类别做 targeted refresh。若缓存缺失，必须写 `cache_status: missing -> refreshed`；若只写 txt 而无 JSON，最终监控记录 `execution_gap.05b_05c_structured_cache_missing`。

05a/05b/05c 私有 compact 应尽量输出供主控快速合并的结构化字段：

```yaml
merge_claims:
  - claim_id:
    claim_type: capability | fidelity | resource | entry | confirmation | constraint
    subject:
    recommendation:
    provenance: user-specified | backend-doc | target-existing | source | static-tool | inferred | unknown
    confidence: high | medium | low
    blocks_step6: true | false
    evidence_paths: []
conflict_candidates:
  - conflict_type:
    with_claim_or_agent:
    reason:
    suggested_controller_resolution:
```

缺少上述字段不应导致 Main 展开完整私有 Markdown；Main 可优先让 controller helper 从私有 compact / phase-summary JSON 补写合并摘要。只有补写后仍无法裁决，才读取 evidence compact 或完整步骤文档。


#### 5.merge Controller 合并 timing（硬规则）

主控或单一汇总者合并 `05a/05b/05c -> 05-目标差异分析.md / 目标差异摘要.compact.md` 时，必须为合并动作单独写 timing JSONL，避免最终监控只能记录 `controller_merge_timing_jsonl_missing` 或 coarse timing：

```text
<target_migration_dir>/logs/timing/05-controller-merge.timing.jsonl
```

最低事件：

```json
{"event":"agent_start","agent":"controller","phase":"05-controller-merge","ts":"..."}
{"event":"step_start","agent":"controller","phase":"05-controller-merge","step":"read 05a/05b/05c compacts","type":"read","ts":"..."}
{"event":"step_end","agent":"controller","phase":"05-controller-merge","step":"read 05a/05b/05c compacts","type":"read","duration_seconds":3,"status":"completed"}
{"event":"step_start","agent":"controller","phase":"05-controller-merge","step":"write target diff artifacts","type":"write","ts":"..."}
{"event":"step_end","agent":"controller","phase":"05-controller-merge","step":"write target diff artifacts","type":"write","duration_seconds":8,"status":"completed","output_or_evidence":"05-目标差异分析.md; 目标差异摘要.compact.md"}
{"event":"agent_end","agent":"controller","phase":"05-controller-merge","ts":"...","status":"completed","total_duration_seconds":11}
```

`目标差异摘要.compact.md` 的 `timing.full_step_timings_path` 必须引用该文件；若因恢复/手工合并无法写入，必须在 `使用效果监控.md` 的 `execution_gap` 中记录 `controller_merge_timing_jsonl_missing`。


主控合并 packet 固定字段：

```yaml
controller_merge_packet:
  phase: 05-controller-merge
  read_inputs:
    target_capability_compact: 目标能力摘要.compact.md
    fidelity_risk_compact: 保真风险摘要.compact.md
    resource_plan_compact: 资源迁移计划摘要.compact.md
  writes:
    target_diff: 05-目标差异分析.md
    target_diff_compact: 目标差异摘要.compact.md
  timing_log_path: <target_migration_dir>/logs/timing/05-controller-merge.timing.jsonl
  merge_check: target_diff_merge_check
  next_gate: open confirmations or migration-applier
```

资源计划还必须为复制 / 复用 / 不迁移输出 decision reason，支撑第 7 步 UUID rebind 审计：

```yaml
resource_decision_reason:
  copied_private_assets:
    - asset:
      reason: feature-private | source-only | prefab-required | no-target-equivalent
      evidence:
  reused_target_assets:
    - asset:
      target_asset:
      reason: target-existing-equivalent | common-capability | lower-duplication-risk
      evidence:
  not_migrated_assets:
    - asset:
      reason: dynamic-remote | out-of-scope | runtime-loaded | replaced-by-target-existing
      evidence:
```

完成本步骤后：由主控或单一汇总者写回 `05-目标差异分析.md` 和 `目标差异摘要.compact.md`，并更新 `迁移清单.md` 中第 5 步状态。分析 agent 只能返回 `status_delta` / `pending_confirmations_delta`，不得直接覆盖最终 manifest 的确认状态。


性能优化要求：第 5 步默认做**轻量目标差异分析**，优先读取 `源侧摘要.compact.md`、`04-源资源闭包.md` 的资源清单摘要、`target-capability-index.json` 和 `05x-target-shared-search.compact.json`；只在证据不足、索引 stale、发现语义风险或用户要求详细审计时读取完整源步骤文档或做全量搜索。正文应聚焦：目标是否已有同功能、目标可复用公共能力、缺失代码、缺失资源、必须适配点、职责等价风险。长搜索输出必须写入 `logs/`。

第 5 步涉及 TS/JS 目标能力识别时，优先使用 ts-graph 查询目标项目 symbol、file context、review context 和 blast radius；涉及 Prefab / 资源 / UUID / Bundle 时，优先使用 `cli-anything-cocoscreator` 或已生成资源索引。`target-capability-index.json` 用于缩小搜索范围，不能替代保真风险判断或用户确认。

条件展开规则：

- 默认只输出精简的同名/同职责/公共能力表、代码差异摘要、资源差异摘要和关键职责风险。
- 只有发现语义差异、入口替换风险、关键职责层缺失、gating/native/KV/API/request/event 风险，或用户要求详细审计时，才展开完整保真表、完整职责等价表、目标语义确认清单。
- 若未发现对应风险，应写“未发现需展开的保真差异 / 职责差异”，不要强制生成空的大表。

在目标项目构建代码图谱，重点回答两个问题：

1. **目标项目是否已经有同名 / 同职责功能？**
2. **目标项目缺失哪些代码与资源？**

对照源项目的代码清单和资源清单，逐项比对：

#### 5.0.shared 目标共享检索包（默认轻量步骤）

#### 5.0.y 05x layered index policy（防卡死性能优化 P0）

##### 5.0.z 05x artifact contract：required vs optional（P0）

05x 的 artifact contract 必须区分 hard required 与 optional performance artifacts：

```yaml
05x_artifact_contract:
  required_artifacts:
    - <target_migration_dir>/05x-target-shared-search.compact.json
  optional_performance_artifacts:
    - <target_migration_dir>/logs/05x-target-capability-index.json
    - <target_migration_dir>/logs/05x-target-resource-index.json
    - <target_migration_dir>/logs/05x-target-uuid-index.json
  fanout_blocking_rule:
    - missing_or_stale_required_shared_search blocks 05 fan-out
    - missing_or_partial_optional_performance_artifacts never blocks fan-out
  event_log_required:
    - shared_search_status
    - capability_index_status
    - resource_index_status
    - uuid_index_status
    - timed_out_indexes
```

Controller / agents 不得把 optional performance artifacts 放入 05 fan-out required_artifacts。若索引缺失，05a/05b/05c 只能记录 performance fallback / targeted refresh，不得写成业务风险。

流程表达要求：在流程图、phase packet 或 controller checkpoint 中，optional performance indexes 必须表现为从 05x compact 派生的 best-effort 旁路缓存，使用虚线/optional/cache 语义连接到 05a/05b/05c，不得画成 05 fan-out 的前置硬门。05 fan-out 的启动条件只能依赖 fresh required compact、`target branch gate closed`、`no blocking confirmation` 和上游 `phase_gate.blocks.readonly_next=false`。若目标分支门禁未关闭或仍有 blocking confirmation，必须暂停 fan-out、向用户确认或关闭 branch gate，不得仅因 05x compact fresh 就启动目标侧 agent。

05x 分为两层产物：

```yaml
05x_layers:
  hard_input:
    path: <target_migration_dir>/05x-target-shared-search.compact.json
    required_for_fanout: true
  performance_indexes:
    - <target_migration_dir>/logs/05x-target-capability-index.json
    - <target_migration_dir>/logs/05x-target-resource-index.json
    - <target_migration_dir>/logs/05x-target-uuid-index.json
    required_for_fanout: false
```

`05x-target-shared-search.compact.json` 必须包含索引生成状态：

```yaml
index_generation:
  required_shared_search:
    status: fresh | partial | stale | missing | unavailable
    blocks_fanout: true | false
  performance_indexes:
    target_capability_index:
      status: fresh | partial | stale | missing | skipped
      path:
      reason:
      blocks_fanout: false
    target_resource_index:
      status: fresh | partial | stale | missing | skipped
      path:
      reason:
      blocks_fanout: false
    target_uuid_index:
      status: fresh | partial | stale | missing | skipped
      path:
      reason:
      blocks_fanout: false
  fanout_policy:
    can_start_05a: true | false
    can_start_05b: true | false
    can_start_05c: true | false
    agents_must_targeted_refresh_missing_indexes: true
```

shared search status 消费语义固定为：

```yaml
shared_search_status_policy:
  fresh: may fan-out when target branch gate closed and no blocking confirmation
  partial: may fan-out only if required core fields are present and controller records constrained_fanout + status cap if needed
  stale: block fan-out until refresh/helper/restart resolves it
  missing: block fan-out until refresh/helper/restart resolves it
  unavailable: block fan-out unless user explicitly authorizes legacy constrained mode with status cap
```

05x 预算：

```yaml
05x_generation_budget:
  shared_search_budget_seconds: 60
  capability_index_budget_seconds: 90
  resource_index_budget_seconds: 90
  uuid_index_budget_seconds: 90
  total_budget_seconds: 180
  on_budget_exceeded:
    - write_partial_index
    - mark_index_status: partial | skipped
    - allow_fanout_if_shared_search_available: true
```

硬规则：

- 只有 hard input `05x-target-shared-search.compact.json` 缺失 / stale 且无法刷新时，才阻塞 05 fan-out。
- performance indexes 是加速器，不是 fan-out 硬门槛；缺失、partial、skipped 不得阻止 05a/05b/05c 启动。
- 05x target resource/uuid index 应优先复用 `logs/cocos/uuid-reverse-index.json` 与 `logs/cocos/prefab-reverse-index.json` 的轻量视图；若 reverse index missing/stale，先用允许的 `logs/tools/build-cocos-reverse-index.*` 只读脚本或 `.meta` parser 局部生成，再退回 targeted search。reverse index 缺失仍不得阻塞 fan-out，只能记录 performance fallback。
- 05a/05b/05c 必须先读 index_generation；缺索引时只做本 agent 需要的 targeted refresh，并记录 performance fallback，不得把 index missing 当业务风险。


##### 5.0.x target capability/resource/UUID index（性能优化 P0）

05x 不应只生成关键词命中包，还应尽量生成可复用的目标能力 / 资源 / UUID 索引，减少 05a/05b/05c 各自 fallback search。

固定输出：

```text
<target_migration_dir>/logs/05x-target-capability-index.json
<target_migration_dir>/logs/05x-target-resource-index.json
<target_migration_dir>/logs/05x-target-uuid-index.json
```

05x index builder contract：

```yaml
05x_index_builder_contract:
  schema_version: 1
  generated_by: controller-05x-index-builder
  cache_key:
    target_project:
    target_branch:
    target_commit:
    feature_slug:
    source_closure_hash:
    source_resource_hash:
    index_schema_version: 1
  freshness:
    status: fresh | partial | stale | missing | skipped
    stale_reasons: []
    generated_at:
  source_tools:
    file_inventory: rg --files | cached
    ts_semantic: ts-graph | skipped | unavailable
    cocos_assets: cli-anything-cocoscreator | meta-parser | skipped | unavailable
    meta_parser: node | python | unavailable
  limits:
    max_index_seconds_total: 180
    max_records_inline_in_05x_compact: 100
    large_arrays_written_to_logs: true
```

生成顺序固定为：

1. 先用 `rg --files` 或等价文件清单构建目标文件 inventory；
2. TS/JS 能力类索引优先用 ts-graph 的 file context / symbol / import 信息补强，避免全量 Read；
3. 资源与 UUID 索引用 `.meta` JSON parser + prefab 文本轻扫构建；只有必要时才调用 `cli-anything-cocoscreator`；
4. 任一索引超过预算时写 partial/skipped，但只要 required shared search fresh，仍必须允许 fan-out。

stale 判定：

```yaml
05x_index_freshness_policy:
  fresh_when:
    - target_commit matches current target HEAD
    - feature_slug matches
    - index_schema_version matches
    - source_closure_hash/source_resource_hash matches when present
  stale_when:
    - target_commit changed
    - index_schema_version changed
    - source feature boundary changed
    - source resource closure hash changed for resource/uuid index
    - index path missing or JSON parse failed
  stale_action:
    - refresh only stale index category
    - do not rerun all 05x indexes if only one category stale
    - do not block fan-out when stale category is optional performance index
```

索引消费 contract：

```yaml
05x_index_consumption_contract:
  controller_phase_packet_must_include:
    shared_search_bundle_path: <target_migration_dir>/05x-target-shared-search.compact.json
    target_capability_index_path: <target_migration_dir>/logs/05x-target-capability-index.json
    target_resource_index_path: <target_migration_dir>/logs/05x-target-resource-index.json
    target_uuid_index_path: <target_migration_dir>/logs/05x-target-uuid-index.json
  agents_must:
    - read 05x index_generation before fallback search
    - read their relevant optional index when status in [fresh, partial]
    - targeted refresh only missing/stale categories needed by the agent
    - write index_consumption to phase-summary JSON and agent_result
  agents_must_not:
    - treat optional index missing/stale as business risk
    - perform full target search just because one optional index is partial
    - wait for another 05 agent to refresh an index
```

index consumption 最低字段：

```yaml
index_consumption:
  shared_search_status: fresh | partial | stale | missing | unavailable
  target_capability_index_status: fresh | partial | stale | missing | skipped | unavailable
  target_resource_index_status: fresh | partial | stale | missing | skipped | unavailable
  target_uuid_index_status: fresh | partial | stale | missing | skipped | unavailable
  consumed_indexes: []
  targeted_refresh_performed: true | false
  refreshed_categories: []
  duplicate_search_avoided: 0
  index_missing_is_business_risk: false
```

最低 schema：

```yaml
target_capability_index:
  schema_version: 1
  cache_key:
    target_commit:
    feature_slug:
    source_closure_hash:
  status: fresh | partial | stale | missing | skipped
  summary_counts: {}
  ui_routes: []              # UIID / prefab path / bundle / evidence
  api_paths: []              # path / wrapper / evidence
  api_protocols: []          # request/response/DTO/enum candidates
  events: []                 # event enum / producer-consumer candidate
  native_kv_gating: []       # key / util / config evidence
  i18n_keys: []              # key prefix / file / count
  common_components: []      # avatar/list/language/remote sprite/resource util
  ecs_models: []             # DataComp/ModelComp candidates
  ui_route_framework_hits: []
  network_framework_hits: []
  list_component_hits: []
  avatar_remote_image_hits: []

target_resource_index:
  schema_version: 1
  cache_key:
    target_commit:
    feature_slug:
    source_resource_hash:
  status: fresh | partial | stale | missing | skipped
  summary_counts: {}
  prefabs: []                # path / uuid / meta / basename / bundle
  textures: []
  fonts: []
  materials: []
  spriteframes: []
  atlases: []
  language_files: []
  resource_dirs: []
  basename_to_paths: {}
  public_resource_families:  # coin/head/font/material/common texture candidates
    coin: []
    default_avatar: []
    font: []
    material: []

target_uuid_index:
  schema_version: 1
  cache_key:
    target_commit:
    feature_slug:
    source_resource_hash:
  status: fresh | partial | stale | missing | skipped
  summary_counts: {}
  uuid_to_asset: {}
  asset_to_uuid: {}
  meta_parse_errors: []
  duplicate_uuid_candidates: []
  uuid_prefix_index: {}
```

05x 生成策略：

- 优先使用 `rg --files` / targeted JSON+meta parsing / existing cache；避免全项目大 Read。
- 每类索引超过 100 条时写完整 JSON 到 `logs/`，`05x-target-shared-search.compact.json` 只引用路径和统计。
- 05a/05b/05c phase packet 必须传入这些 index path；若缺失，agent 才允许 fallback targeted search，并必须记录 `target_capability_index_status: missing`。


在启动 `target-capability-analyzer`、`fidelity-risk-analyzer`、`resource-migration-planner` 前，主控默认应生成或刷新轻量共享检索包：

```text
<target_migration_dir>/05x-target-shared-search.compact.json
```

最低 schema：

```json
{
  "target_branch": "",
  "target_commit": "",
  "searched_at": "YYYY-MM-DD HH:mm:ss",
  "ui_config_hits": [],
  "event_hits": [],
  "api_path_hits": [],
  "native_kv_hits": [],
  "activity_enum_hits": [],
  "i18n_hits": [],
  "prefab_hits": [],
  "resource_family_hits": [],
  "common_capability_hits": [],
  "ui_route_framework_hits": [],
  "network_framework_hits": [],
  "ecs_pattern_hits": [],
  "list_component_hits": [],
  "avatar_remote_image_hits": [],
  "i18n_language_hits": [],
  "time_util_hits": [],
  "coin_icon_family_hits": [],
  "default_avatar_family_hits": []
}
```

该文件只记录高价值命中：request / native / event / KV / i18n / prefab / resource dirs / UI common / activity gating 等路径、行号、少量摘要和证据路径。三个第 5 步 agent 必须优先读取该共享包，避免重复全局搜索；但它不能替代各 agent 的私有深查和风险判断。若未生成，主控必须在 `controller-event-log.jsonl` 和最终 `使用效果监控.md` 记录原因与影响；agent 只能按需补充缺口搜索，不得重复展开全量目标搜索。

生成 shared search 时，主控不得只搜索源功能关键词；还必须补充目标公共能力家族关键词，用于填充 `ui_route_framework_hits`、`network_framework_hits`、`ecs_pattern_hits`、`list_component_hits`、`avatar_remote_image_hits`、`i18n_language_hits`、`time_util_hits`、`coin_icon_family_hits`、`default_avatar_family_hits`。若这些数组为空，05a 可补充目标 inventory，但必须在 compact 写明 `fallback_search_reason`。


加速要求：主控生成 shared search 时，应同步写入或刷新 `target-capability-index.json`（优先 `<target_migration_dir>/.cocos-migration-cache/target-capability-index.json`，fallback `<target_migration_dir>/logs/cache/target-capability-index.json`）。05a/05b/05c 必须在 compact 中记录：

```yaml
shared_search_bundle_status: fresh | stale | missing | unavailable
target_capability_index_status: fresh | stale | missing | unavailable
duplicate_search_avoided: number
fallback_search_reason: null | string
```

05b/05c 若发现需要搜索 05a 已覆盖的 API / event / i18n / prefab / resource / common capability，必须先说明 shared/index 证据不足原因；不得为了“更放心”重复全量搜索。


#### 5.0.z merge_claims.summary.json 快速合并产物（P1 硬规则）

05a/05b/05c 私有 agent 必须先写轻量 claims-ready JSON，再补完整 Markdown。Controller merge 优先消费 claims JSON；完整 Markdown/compact 用作证据补充。

推荐路径：

```text
logs/phase-summary/05a-merge-claims.summary.json
logs/phase-summary/05b-merge-claims.summary.json
logs/phase-summary/05c-merge-claims.summary.json
```

最低 schema：

```json
{
  "version": 1,
  "phase": "05b-fidelity-risk",
  "status": "claims-ready | partial | blocked | failed",
  "feature_slug": "",
  "updated_at": "",
  "merge_claims": [],
  "conflict_candidates": [],
  "pending_confirmations_delta": [],
  "blocks_step6": false,
  "confidence": "high | medium | low",
  "evidence_paths": [],
  "missing_for_full_markdown": []
}
```

写入规则：

1. 每个 05 agent 在完成核心判断后必须立即写 claims JSON，目标是在 2~5 分钟内可供 controller merge 使用。
2. 若完整 `05a/05b/05c.md` 仍在写，claims JSON 可先标记 `status: claims-ready`。
3. Controller merge 若 claims JSON 足够裁决，不必等待完整 Markdown；但最终产物中必须记录 `detail_markdown_status: complete | pending | helper-completed`。
4. 若 agent 到 checkpoint 仍未写 claims JSON，Main 应发送 `enter_artifact_finalization_mode`，要求先写 claims，不再继续全量搜索。

#### target-capability-index 结构化 schema（P2 推荐）

`target-capability-index.json` 不应只包含 summary_counts；应尽量包含下列结构化数组，以减少 05 fan-out 重复搜索：

```json
{
  "ui_routes": [],
  "api_protocols": [],
  "events": [],
  "native_kv": [],
  "resource_families": [],
  "common_capabilities": [],
  "i18n_keys": [],
  "prefab_inventory": []
}
```

若主控只能生成 counts，必须写 `target_capability_index_status: partial`；05a/05b/05c 只能做 targeted fallback search，并在 compact 中写明 `fallback_search_reason`。

#### 5.0 目标项目原生替代能力识别（必做但默认轻量）

在判断“目标缺失某能力”之前，必须先检查目标项目是否已经存在可复用的**原生替代能力**，不能只按文件名是否一致来判断。

默认轻量模式只需覆盖三类结论：

1. **同名实现**：文件名、类名、资源名基本一致；
2. **同职责但异名实现**：命名不同，但承担相同业务职责；
3. **公共基础能力**：列表、头像、网络、事件、UI 管理、资源加载、时间/字符串工具等可复用能力。

若目标项目明显不存在同功能，只需要输出一张精简表，不必展开冗长替代关系：

| 源能力 | 目标同名/同职责能力 | 可复用公共能力 | 最终动作 | 说明 |
|---|---|---|---|---|
| `assets/...` | 无 / `assets/...` | `LazyListView` / 网络层 / UI 管理等 | 新增 / 适配 / 复用 | 说明原因 |

只有当目标项目存在多个相近实现、是否复用存在争议，或用户要求详细审计时，才展开完整的“同名 / 异名 / 同流程不同分层”分析。

要求：

- 若目标项目已有可承接的原生能力，应优先复用或适配，不应机械复制一套源实现。
- 只有在确认目标不存在等价能力，或现有能力无法承接该职责时，才能判定为“缺失需新增”。
- 若是否可复用存在争议，应在 `05-目标差异分析.md` 中明确列为待确认项，不要直接按“缺失”处理。

#### 5.0.x 入口承接策略与产品语义风险（必做）

若源功能存在入口、按钮、菜单、系统挂点、红点 / badge 或路由触发点，第 5 步必须在迁移动作前明确目标项目如何承接入口，不能等第 6 步落地后才暴露产品语义风险。

必须输出入口承接策略表：

| 源入口 | 目标承接入口 | 目标行为 | 是否替换目标已有入口行为 | 变更来源 | 是否需产品确认 | 风险 |
|---|---|---|---|---|---|---|
| `assets/...` | `assets/...` / 新增入口 / 复用按钮 | 打开 xxx | 是/否 | source / target-existing / user-specified / inferred | 是/否 | 说明 |

判定要求：

- **新增入口**且不影响目标既有入口行为：通常无需确认，但仍需记录接入位置和证据。
- **复用目标现有入口且不改变原行为**：可作为合理复用，需说明如何共存。
- **复用目标现有入口并替换原行为**：默认属于产品语义风险；如果没有 `target-existing` / `user-specified` / `backend-doc` 证据，应在 `迁移清单.md` 写入 `needs_user_confirmation: true`、`confirmation_topic: entry-semantics`，由主控向用户确认。
- 若只是临时承接策略（例如先挂到已有 Record 按钮），必须在第 6、7 步和 `迁移总结.md` 中继续跟踪，不得把它当作无风险最终方案。

#### 代码差异

| 源文件/能力 | 目标项目现状 | 动作 |
|------------|-------------|------|
| RankPanel | 不存在 | 新增 |
| RankItem | 有同类列表项基类 | 适配复用 |
| RankApi | 目标已有统一排行榜接口模块 | 对接现有实现 |

#### 资源差异

| 源资源 | 目标项目现状 | 动作 |
|-------|-------------|------|
| RankPanel.prefab | 不存在 | 复制并修复引用 |
| icon_top1.png | 存在但命名不同 | 复用并改路径 |
| rankReward.json | 不存在 | 新增 |

#### 5.x 职责等价性差异分析（必做）

完成代码差异表和资源差异表后，必须继续做**职责等价性差异分析**。

目标是回答：

- 源功能的关键职责层，在目标项目中是否都存在？
- 这些职责层是否只是“有对应文件”，还是“职责也完整保留”？
- 是否存在“主要面板已迁入，但入口职责、初始化链路、事件链或配置链被削弱/遗漏”的情况？

必须基于第 3 步输出的职责层表逐项对照，建议输出：

| 职责层 | 源项目实现 | 目标项目现状 | 是否等价 | 差异说明 | 后续动作 |
|---|---|---|---|---|---|
| 触发层 | `assets/...` | 已有 / 缺失 / 部分存在 | 是/否/部分 | 说明差异 | 新增 / 适配 / 复用 / 不迁移 |
| 展示层 | `assets/...` | ... | ... | ... | ... |
| 数据层 | `assets/...` | ... | ... | ... | ... |
| 事件层 | `assets/...` | ... | ... | ... | ... |
| 配置层 | `assets/...` | ... | ... | ... | ... |

判定要求：

- “目标有同名文件”不等于“职责等价”。
- “目标已有主面板 / 主 prefab”不等于“功能完整”。
- 如果关键职责层缺失，必须在 `05-目标差异分析.md` 明确标记为功能缺口。
- 如果是“已迁入但职责被削减”，必须明确写成“部分等价”，不能写成“已完成”。

#### 5.y 迁移保真差异分析（必做）

除代码 / 资源 / 职责等价外，必须基于源侧 `semantic_fields`、`gating_dependencies`、`event_closures`、`interface_branches`、`request_parameter_semantics` 做迁移保真差异分析。

必须输出以下表格：

1. **业务语义字段差异表**

| 字段 | 源值 | 目标现状 / 拟迁移值 | 变更来源 | 是否允许 | 风险 |
|---|---|---|---|---|---|

`变更来源` 只能是：`source` / `target-existing` / `user-specified` / `backend-doc` / `inferred`。涉及 API path、activity/task、native/KV、接口分支、请求参数的 `inferred` 改动必须列为待确认项。

2. **gating / config 等价表**

| 依赖类型 | 源项目行为 | 目标项目现状 | 是否等价 | 后续动作 |
|---|---|---|---|---|

3. **事件闭环等价表**

| 事件 | 源闭环 | 目标闭环 | 是否等价 | 结论 |
|---|---|---|---|---|

4. **请求参数 / 接口分支语义差异表**

| 参数 / 分支 | 源项目 | 目标项目 | 是否语义变化 | 风险 | 是否需确认 |
|---|---|---|---|---|---|

5. **目标语义确认清单**

当目标项目没有同功能，或存在接口、gating、入口语义、文案语义、活动/task 语义、UIID / route 语义差异时，`fidelity-risk-analyzer` 必须把需要主控确认的问题整理为 1~4 个清晰选项组。每组选项应说明：

- `A`：保留源语义会落地什么值、影响哪些文件；
- `B`：适配目标语义会落地什么值、需要哪些 `target-existing` / `backend-doc` 证据；
- 风险：不确认直接落地会导致什么业务偏差。

建议格式：

| 确认主题 | 选项 A：保留源语义 | 选项 B：适配目标语义 | 推荐 | 风险 |
|---|---|---|---|---|
| API 语义 | 保留源接口 path 与请求字段 | 改用目标已有接口 | A/B | 说明 |
| gating 语义 | 保留源 native/KV/config 链 | 改成目标开关或无条件展示 | A/B | 说明 |
| 入口 / 文案语义 | 保留源 UIID、业务文案和展示语义 | 使用目标现有入口/文案 | A/B | 说明 |

主控必须把这些确认项提交给用户；用户确认前，不得进入第 6 步落地相关高风险改写。用户确认后，`迁移清单.md`、`05-目标差异分析.md` 和 `目标差异摘要.compact.md` 必须记录 `confirmed_target_semantics`，包括确认项、用户选择、最终落地策略和仍保留的风险。

判定要求：

- 目标没有同名文件不等于缺失；但目标把源动态配置改成默认值、空值、直通或硬编码，必须标记为语义变化。
- API path 与源项目不一致且无证据时，不得写成“已适配”，必须写成“高风险可疑 / 需确认”。
- native/KV/config/gating 链如果源项目存在而目标项目缺失，必须标记为“确定缺口”或“目标等价链待证明”。
- 事件闭环缺定义、派发、监听任一环节，都必须标记为“部分等价 / 缺失”。
- 若用户提供参考/标准答案项目，必须三方分类：确定问题 / 高风险可疑 / 合理业务适配 / 参考项目差异。

如果触发“迁移保真与隐性依赖规则”的阻断项，必须在 `迁移清单.md` 写入：

```text
needs_user_confirmation: true
confirmation_topic: fidelity-risk
```

并列出需要用户确认的具体问题。

---
