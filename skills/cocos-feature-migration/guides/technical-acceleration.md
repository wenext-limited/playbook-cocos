# 技术加速、缓存、ts-graph 与 cli-anything 协议

### 技术加速与缓存协议

本 skill 默认优先使用 **ts-graph MCP + `cli-anything-cocoscreator` + 结构化缓存 / 索引** 来降低重复搜索、闭包计算、资源反查和静态验证成本。缓存和索引只用于加速，不得替代关键门禁、用户确认或证据复核。

缓存 JSON 的统一 schema、hash 策略和失效规则见 `guides/cache-schemas.md`。当本文件与 `cache-schemas.md` 对缓存字段存在冲突时，以 `cache-schemas.md` 的 schema / hash / invalidation 规则为准；以本文件的阶段使用原则和安全前提为准。

#### 加速产物目录

建议在源分析目录或目标迁移目录下维护：

```text
.cocos-migration-cache/
  source-code-graph.json
  source-symbol-index.json
  source-entry-closures/
    <entry-hash>.json
  asset-index.json
  prefab-component-index.json
  uuid-reverse-index.json
  bundle-index.json
  resource-path-index.json
  confirmed-entries.json
  source-entry-closure-cache.json
  target-capability-index.json
  05x-target-shared-search.compact.json
  migration-dry-run.json
  prefab-static-check-cache.json
  migration-static-check.json
  builtin-like-unresolved-allowlist.json
```

若项目不适合写入 `.cocos-migration-cache/`，可写入本轮 `.claude/cocos-feature-migration/migrations/<feature-slug>/logs/cache/`，但必须在 manifest 中记录实际路径。

#### ts-graph 优先规则

涉及 TS/JS 代码访问、理解、检索、闭包计算、影响面评估、验证 import / symbol 时，必须优先使用 ts-graph：

| 场景 | 优先工具 | 作用 |
|---|---|---|
| 构建项目语义图 | `ts_graph_build` / `ts_graph_stats` | 获取 graph 状态、避免盲目全量搜索 |
| 理解入口文件 | `ts_get_file_context` | 获取 exports、imports、value/type refs |
| 查找入口或目标能力符号 | `ts_search_symbols` | 缩小候选范围 |
| 追调用关系 | `ts_query_symbol` / `ts_trace_call_chain` | 获取 callers / callees / runtime call path |
| 评估改动影响 | `ts_get_blast_radius` / `ts_get_review_context` | 第 6、7 步只验证受影响范围 |
| 删除、重命名、改写符号前 | `ts_analyze_symbol_usage` / `ts_preview_rename` | 避免漏改 value/type refs |
| 类型影响 | `ts_get_type_dependents` | 区分 runtime 影响和 type-only 影响 |

规则：

- ts-graph 可用且 graph 有效时，不得先进行大范围 grep / Read / Bash 搜索 TS/JS 代码。
- ts-graph 结果用于缩小阅读范围；需要检查具体实现、注释、动态字符串或业务语义时，再读取具体文件。
- ts-graph 不覆盖 Prefab、Scene、`.meta`、动态资源路径、运行时拼接、字符串事件、request endpoint、native bridge、KV、i18n 等全部语义；这些必须由 `cli-anything-cocoscreator`、关键词搜索和 AI 业务判断补充。
- ts-graph 不可用、构建失败、graph stale、目标文件不在 graph 覆盖范围内或结果明显不可信时，允许降级搜索，但必须在 compact 中记录 `fallback_reason` 和 `confidence`。

#### cli-anything-cocoscreator 文档来源

`cli-anything-cocoscreator` 的具体命令、参数、输出格式和示例，以 GitHub 仓库 Markdown 为准；本 skill 只维护迁移流程中的使用门禁、证据要求和日志要求，不重复维护完整 CLI 命令说明。

按需引用以下 GitHub Markdown：

- [`README.md`](https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/README.md)：安装、编辑器路径、基础命令、`asset deps` / `asset refs` 等用户级说明。
- [`COCOSCREATOR.md`](https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/COCOSCREATOR.md)：Cocos Creator 后端、离线 asset index、prefab-check 等自动化说明。

禁止把本地 clone 路径作为 `cli-anything-cocoscreator` 说明来源；若需要命令细节，直接读取或引用上述 GitHub Markdown。

#### cli-anything-cocoscreator 优先规则

涉及 Cocos 资源、Prefab、Scene、UUID、`.meta`、bundle、资源引用和脚本绑定时，必须优先使用 `cli-anything-cocoscreator`：

| 场景 | 优先能力 | 作用 |
|---|---|---|
| Prefab / asset outgoing deps | `asset deps` | 展开贴图、子 prefab、字体、材质、SpriteFrame 等静态依赖 |
| UUID 解析 | `asset uuid` | 建立 uuid -> path / meta 映射 |
| 反向引用 | `asset refs` | 找脚本 / 资源被哪些 prefab、scene、asset 引用 |
| TS -> Prefab 绑定 | `asset uuid` + `asset refs` | 先查脚本 uuid，再反查挂载 prefab |
| Prefab 静态验证 | `asset deps` + unresolved 分类 | 第 6 / 7 步验证 missing 与 unresolved |
| 资源复用 / 改绑 | uuid / refs / deps 组合 | 判断复制源资源、复用目标资源或改绑 prefab |

规则：

- 若第 1 步 capability 已确认 CLI 可用，后续 agent 直接复用该结论，不重复做可用性探测。
- CLI 输出不能直接当最终结论；必须与 AI 识别的动态加载路径、运行时拼接、appName / language / region / feature flag 分支合并去重。
- CLI 不作为 TS 代码闭包工具；代码闭包以 ts-graph 为主。
- CLI 命令输出超过 100 行时写入 `logs/`，步骤 md 和 compact 只保留摘要、统计和日志路径。

#### 源代码闭包缓存

源代码闭包缓存优先基于 ts-graph 查询结果生成，缓存的是本次迁移入口对应的查询结果、人工确认边界和动态业务语义补充，而不是替代 ts-graph。

建议结构：

```yaml
entry:
  file:
  symbol:
  prefab:
  source_branch:
  source_commit:

ts_graph:
  graph_built_at:
  graph_scope:
  graph_stats:
  query_methods:
    - ts_get_file_context
    - ts_query_symbol
    - ts_get_blast_radius
    - ts_get_review_context

closure:
  runtime_dependencies:
  type_only_dependencies:
  callers:
  callees:
  affected_files:
  affected_symbols:

manual_supplements:
  dynamic_resource_paths:
  event_keys:
  request_apis:
  native_calls:
  kv_keys:
  i18n_keys:
  config_refs:

cache:
  status: fresh | stale | partial | unavailable
  fallback_reason:
  confidence: high | medium | low
  evidence_paths:
```

复用规则：

- source branch / commit 未变，且入口文件、闭包内 runtime dependency、相关 prefab/meta 未变：允许复用。
- source commit 变化但入口文件和闭包内文件 hash 未变：可标记 `reuse-with-commit-change` 并做最小一致性检查。
- 入口文件、runtime dependency 或关键语义字段变化：必须重算该 entry closure。
- 只改 type-only dependency：代码迁移闭包可部分复用，但 type-check 影响和验证范围必须刷新。

#### 资源 / Prefab / UUID 索引

资源闭包优先读取以下索引：

```text
asset-index.json
prefab-component-index.json
uuid-reverse-index.json
bundle-index.json
resource-path-index.json
```

索引至少应能回答：

- uuid 对应哪个资源路径和 `.meta`；
- 某个 TS 脚本 uuid 被哪些 prefab / scene 绑定；
- 某个 prefab 静态引用哪些资源；
- 某个资源被哪些 prefab / scene / asset 反向引用；
- 某个 bundle 下有哪些资源；
- 动态资源路径能否映射到实际资源。

失效规则：

- source assets / resources / prefab / scene / meta / bundle 配置未变：允许复用索引。
- 单个 prefab 或 meta 变化：局部重算该 prefab 及 reverse refs。
- bundle 配置变化：重算 bundle index。
- uuid 无法解析或 refs 与实物矛盾：标记索引 stale，并触发局部重建。

#### Cocos reverse index contract（P0：UUID / Prefab / Script Binding 加速）

本 skill 默认为 Cocos Creator 3.8.x / 3.7.x 项目生成和复用 reverse indexes，用于加速 04 源资源闭包、05x target resource/uuid index、06 prefab binding preflight / repair fast path、07 cache-first static verifier。

本机可按 PATH、包管理器可执行入口或项目级工具配置探测 `cli-anything-cocoscreator`。不得在 Skill 文档中固化用户本机 clone 路径；命令说明仍以 GitHub README / COCOSCREATOR.md 为准。

输出目录固定为：

```text
<source_analysis_dir>/logs/cocos/
<target_migration_dir>/logs/cocos/
```

canonical path 策略：

```yaml
cocos_reverse_index_canonical_paths:
  canonical_dir: logs/cocos
  canonical_summary: logs/cocos/cocos-reverse-index.summary.json
  canonical_indexes:
    - logs/cocos/uuid-reverse-index.json
    - logs/cocos/prefab-reverse-index.json
    - logs/cocos/prefab-script-binding-index.json
  legacy_or_mirror_cache:
    - .cocos-migration-cache/uuid-reverse-index.json
    - .cocos-migration-cache/prefab-component-index.json
    - logs/cache/uuid-reverse-index.json
  rule:
    - Main/controller and 04/05x/06/07 agents consume logs/cocos summary first
    - .cocos-migration-cache may be used only as input cache or mirror, not canonical output
    - if mirror cache and logs/cocos conflict, prefer logs/cocos when summary freshness is fresh/partial and project_commit matches
```

允许在本轮迁移目录生成可复现临时工具脚本：

```text
<source_analysis_dir-or-target_migration_dir>/logs/tools/build-cocos-reverse-index.mjs
<source_analysis_dir-or-target_migration_dir>/logs/tools/build-cocos-reverse-index.py
```

脚本只能读取项目文件并写 `logs/cocos/**` / `logs/tools/**`，不得修改业务 `assets/**`、prefab、meta 或源码。

工具脚本生成策略：

```yaml
reverse_index_tool_script_policy:
  owner:
    preferred: controller
    allowed_generators:
      - 04a-source-resource-prefetch
      - 05x-index-builder
      - 06-migration-applier
      - 07-static-verifier-validate-only-fallback
  reuse_when:
    - script exists
    - script_version matches
    - generated_by_this_skill == true or checksum matches recorded checksum
  regenerate_when:
    - script missing
    - script_version stale
    - checksum mismatch
    - previous script lacks required mode full|partial|validate
  must_record:
    - script_path
    - script_version
    - generated_by
    - checksum
    - mode_used
    - generation_status: fresh | reused | regenerated | failed
  failure_policy:
    - script generation failure is tooling_degraded / execution_gap, not business risk by itself
    - consuming phase falls back to targeted .meta parser / prefab text scan / cli-anything if available
```

固定产物：

```yaml
cocos_reverse_index_tool_protocol:
  tool_names:
    preferred: build-cocos-reverse-index.mjs
    fallback: build-cocos-reverse-index.py
  tool_locations:
    - <source_analysis_dir-or-target_migration_dir>/logs/tools/build-cocos-reverse-index.mjs
    - <source_analysis_dir-or-target_migration_dir>/logs/tools/build-cocos-reverse-index.py
  invocation:
    full: >
      node logs/tools/build-cocos-reverse-index.mjs
      --project <abs-cocos-project>
      --out <abs-analysis-or-migration-dir>/logs/cocos
      --mode full
      --cocos-version auto|3.8.x|3.7.x
      --max-seconds 180
    partial: >
      node logs/tools/build-cocos-reverse-index.mjs
      --project <abs-cocos-project>
      --out <abs-analysis-or-migration-dir>/logs/cocos
      --mode partial
      --previous-index-dir <abs-analysis-or-migration-dir>/logs/cocos
      --changed-prefabs <comma-separated-prefab-paths>
      --changed-metas <comma-separated-meta-paths>
      --changed-scripts <comma-separated-script-paths>
      --changed-resources <comma-separated-resource-paths>
      --max-seconds 90
    validate: >
      node logs/tools/build-cocos-reverse-index.mjs
      --project <abs-cocos-project>
      --out <abs-analysis-or-migration-dir>/logs/cocos
      --mode validate
      --previous-index-dir <abs-analysis-or-migration-dir>/logs/cocos
      --max-seconds 30
  args:
    project: required absolute Cocos project root
    out: required output directory, must be logs/cocos
    mode: full | partial | validate
    cocos_version: auto | 3.8.x | 3.7.x
    previous_index_dir: optional for partial/validate
    changed_prefabs: optional for partial
    changed_metas: optional for partial
    changed_scripts: optional for partial
    changed_resources: optional for partial
    max_seconds: bounded execution budget
  outputs:
    - logs/cocos/uuid-reverse-index.json
    - logs/cocos/prefab-reverse-index.json
    - logs/cocos/prefab-script-binding-index.json
    - logs/cocos/cocos-reverse-index.summary.json
  forbidden:
    - write outside logs/cocos or logs/tools
    - modify assets/**, prefab, meta, source files, configs
    - install dependencies or mutate package manager state
    - run Cocos Editor or build commands
```

`cocos-reverse-index.summary.json` 是 Main/controller 和阶段 agent 的默认入口；除非需要查询具体 uuid/prefab/script，默认不读取三个大索引。

```json
{
  "schema_version": 1,
  "project_root": "/abs/project",
  "project_commit": "",
  "generated_at": "",
  "mode": "full | partial | validate",
  "cocos_version": "auto | 3.8.x | 3.7.x",
  "outputs": {
    "uuid_reverse_index": "logs/cocos/uuid-reverse-index.json",
    "prefab_reverse_index": "logs/cocos/prefab-reverse-index.json",
    "prefab_script_binding_index": "logs/cocos/prefab-script-binding-index.json"
  },
  "stats": {
    "meta_count": 0,
    "meta_parse_error_count": 0,
    "prefab_count": 0,
    "prefab_scanned_count": 0,
    "script_count": 0,
    "script_binding_count": 0,
    "unresolved_uuid_count": 0,
    "unresolved_script_component_count": 0,
    "duplicate_uuid_count": 0
  },
  "freshness": {
    "status": "fresh | partial | stale | missing | failed",
    "stale_reasons": []
  },
  "partial_refresh": {
    "changed_prefabs": [],
    "changed_metas": [],
    "changed_scripts": [],
    "changed_resources": [],
    "refreshed_prefabs": [],
    "refreshed_uuids": []
  },
  "index_quality": {
    "usable_for_prefab_binding_gate": true,
    "usable_for_uuid_reverse_lookup": true,
    "usable_for_asset_deps_fast_path": true,
    "confidence": "high | medium | low"
  },
  "warnings": [],
  "errors": []
}
```

模式语义：

```yaml
reverse_index_tool_modes:
  full:
    use_when:
      - reverse indexes missing/unparseable before 04/05x
      - project_commit changed and no usable previous index
    behavior:
      - scan all .meta and prefab/scene files once
      - write all three indexes and summary
  partial:
    use_when:
      - after 06 migration-applier business writes
      - only changed prefabs/metas/scripts/resources need refresh
    behavior:
      - read previous indexes
      - refresh affected uuid/prefab/script entries only
      - preserve unaffected entries
      - write summary.partial_refresh
  validate:
    use_when:
      - before 07 static-verifier cache-first decision
      - before deciding whether to rerun targeted CLI
    behavior:
      - check JSON parseability, schema_version, project_commit, required outputs, stats
      - do not rescan project unless explicitly asked by full/partial
```

超时与失败处理：

```yaml
reverse_index_tool_timeout_policy:
  max_seconds_default: 180
  on_timeout:
    - write cocos-reverse-index.summary.json with freshness.status=partial or failed
    - preserve any previously usable index files
    - record warnings/errors and timed_out_step
    - consuming phase uses partial index plus targeted fallback
  missing_or_failed_tool:
    - not a business risk by itself
    - record execution_gap.cocos_reverse_index_tool_failed_or_missing
    - fall back to targeted .meta parser / prefab text scan / cli-anything if available
```

固定产物：

```yaml
cocos_reverse_index_contract:
  outputs:
    uuid_reverse_index:
      path: logs/cocos/uuid-reverse-index.json
    prefab_reverse_index:
      path: logs/cocos/prefab-reverse-index.json
    prefab_script_binding_index:
      path: logs/cocos/prefab-script-binding-index.json
  cocos_versions_supported:
    - 3.8.x
    - 3.7.x
  generation_policy:
    first_choice:
      - rg --files / cached file inventory
      - .meta JSON parser
      - prefab text scan for uuid/full-short-compressed ids
      - Cocos 3.8/3.7 serialized script field scan
    second_choice:
      - cli-anything-cocoscreator targeted asset uuid / asset refs / asset deps
    forbidden_by_default:
      - full asset deps scan for every prefab
      - repeated asset refs for same uuid in same run
      - opening Cocos Editor
      - modifying business files from index builder
  index_missing_policy:
    - reverse index missing is not a business risk by itself
    - missing index triggers targeted fallback or rebuild
    - only unresolved critical prefab/script/resource evidence may downgrade/block via existing phase_gate
```

最低 schema：

```yaml
uuid_reverse_index:
  schema_version: 1
  project_root:
  project_commit:
  generated_at:
  cache_key:
    project_root:
    project_commit:
    schema_version: 1
  uuid_to_asset: {}
  asset_to_uuid: {}
  uuid_prefix_index: {}
  meta_parse_errors: []
  duplicate_uuid_candidates: []

prefab_reverse_index:
  schema_version: 1
  project_root:
  project_commit:
  generated_at:
  prefabs:
    <prefab_path>:
      prefab_path:
      prefab_meta:
      prefab_uuid:
      prefab_hash:
      meta_hash:
      referenced_uuids: []
      referenced_uuid_prefixes: []
      referenced_assets_resolved: []
      unresolved_uuids: []
      builtin_like_candidates: []
  uuid_to_prefabs: {}

prefab_script_binding_index:
  schema_version: 1
  project_root:
  project_commit:
  generated_at:
  script_uuid_to_prefabs: {}
  prefab_to_scripts: {}
  script_path_to_prefabs: {}
  unresolved_script_components: []
```

freshness / 增量刷新：

```yaml
cocos_reverse_index_freshness_policy:
  fresh_when:
    - project_commit matches
    - schema_version matches
    - JSON parseable
  partial_when:
    - changed_prefabs exist but only old index available
    - changed_meta_files exist but uuid index not refreshed
    - meta_parse_errors nonzero
    - unresolved_script_components nonempty
  refresh_policy:
    - full rebuild before 04/05x only when index missing or unparseable
    - local refresh after 06 using migration-dry-run changed_prefabs / changed_meta_files / changed_scripts / changed_resources
    - if only a subset changed, refresh only affected prefab/script/uuid entries
```

阶段消费：

```yaml
cocos_reverse_index_consumers:
  04-source-resource-closure:
    reads:
      - source logs/cocos/uuid-reverse-index.json
      - source logs/cocos/prefab-reverse-index.json
      - source logs/cocos/prefab-script-binding-index.json
    purpose: source prefab deps, script refs, dynamic resource candidate support
  05x-target-shared-search:
    reads:
      - target logs/cocos/uuid-reverse-index.json
      - target logs/cocos/prefab-reverse-index.json
    purpose: build 05x-target-resource-index.json and 05x-target-uuid-index.json views
  06-migration-applier:
    writes_or_refreshes:
      - target logs/cocos/* reverse indexes after business writes
    purpose: prefab binding preflight, meta_uuid_null_policy, repair fast path
  07-static-verifier:
    reads:
      - prefab-static-check-cache.json
      - target logs/cocos/* reverse indexes
    purpose: cache-first L1 verification; rerun CLI only for stale/unknown/missing critical objects
```



目标项目差异分析优先读取：

```text
target-capability-index.json
05x-target-shared-search.compact.json
```

`target-capability-index.json` 用于记录目标已有：

- 同名 / 同职责组件、panel、model、controller；
- request wrapper、endpoint、DTO、协议字段；
- native bridge、KV、本地存储、远端配置、feature flag；
- event enum、producer、consumer；
- UI 管理、列表、头像、资源加载等公共能力；
- bundle、公共资源目录、可复用字体 / 材质 / icon。

`05x-target-shared-search.compact.json` 只保存第 5 步三 agent 共享的轻量检索结果：路径、行号、少量摘要和证据路径。它不能替代 `05a/05b/05c` 深查，也不能作为静默改写依据。

失效规则：

- 目标 branch / commit 未变：可复用 target capability index。
- 目标 feature 分支变化、pull / checkout 后 commit 变化，或目标项目能力文件变更：必须重建或标记 stale。
- 目标侧索引不得绕过目标 feature 分支确认门禁；若未来增加 `target-readonly-indexer`，必须明确其只读、不 checkout、不 stash、不 pull、不写业务文件。

#### migration dry-run 与 static-check output

第 6 步落地前应优先生成或读取：

```text
migration-dry-run.json
```

用于提前暴露：复制文件、import 重写、资源映射、Prefab 改绑、同名文件冲突、UUID 冲突、过渡目录风险。

第 7 步验证前应优先生成或读取：

```text
migration-static-check.json
```

用于结构化输出 import、symbol、DTO、event、resource-path、prefab-uuid、asset-missing、i18n、semantic 等问题，并沿用 `static-verifier` 的 repair schema。

若可用 ts-graph，第 7 步还应基于 changed files 计算 blast radius，只验证受影响的 TS / symbol / runtime callers；资源侧则基于 copied assets、modified prefabs、rewritten imports 和 CLI deps / refs 做增量验证。

#### 源入口与代码闭包缓存（第 2 / 3 步加速硬规则）

第 2 步优先读取 / 生成：

```text
<source_analysis_dir>/.cocos-migration-cache/confirmed-entries.json
```

第 3 步优先读取 / 生成：

```text
<source_analysis_dir>/.cocos-migration-cache/source-entry-closure-cache.json
<source_analysis_dir>/.cocos-migration-cache/source-symbol-index.json
<source_analysis_dir>/.cocos-migration-cache/source-entry-closures/<entry-hash>.json
```

fallback 可写入 `<source_analysis_dir>/logs/cache/`。缓存 schema、hash 和失效规则以 `guides/cache-schemas.md` 为准。

使用规则：

1. `confirmed-entries.json` fresh 且 source commit / feature_slug / confirmed boundary 未变化时，第 2 步只做最小一致性检查和必要写回，不重复全量入口搜索；
2. 若候选入口曾超过 1 个，但缓存中没有用户确认闭环证据，不得判定 fresh；
3. `source-entry-closure-cache.json` fresh 时，第 3 步复用代码闭包、职责层、语义字段、gating、event 和 request 语义；
4. source commit 变化但闭包内 runtime dependency hash 未变时，可 `reuse-with-commit-change` 并做轻量复核；
5. runtime dependency / API / KV / event 相关文件变化时，必须局部或完整重算；
6. 缓存命中不得跳过 pending confirmation 回扫、边界一致性检查或语义字段完整性检查。

#### 源资源闭包缓存（第 4 步加速硬规则）

第 4 步 `source-resource-closure-analyzer` 必须优先读取或生成源侧资源闭包缓存，默认路径：

```text
<source_analysis_dir>/.cocos-migration-cache/source-resource-closure-cache.json
<source_analysis_dir>/.cocos-migration-cache/asset-deps-cache.json
<source_analysis_dir>/.cocos-migration-cache/uuid-reverse-index.json
<source_analysis_dir>/.cocos-migration-cache/prefab-component-index.json
<source_analysis_dir>/.cocos-migration-cache/resource-path-index.json
```

若项目或权限不适合 `.cocos-migration-cache/`，可写入：

```text
<source_analysis_dir>/logs/cache/*.json
```

`source-resource-closure-cache.json` 最低字段：

```json
{
  "version": 1,
  "feature_slug": "",
  "source_branch": "",
  "source_commit": "",
  "confirmed_entry": "",
  "confirmed_boundary_hash": "",
  "code_closure_hash": "",
  "critical_prefabs": [
    {"path": "", "prefab_hash": "", "meta_hash": ""}
  ],
  "asset_deps_summary": [],
  "script_uuid_refs": [],
  "dynamic_assets": [],
  "required_assets": [],
  "unresolved_static_count": 0,
  "cache_status": "fresh | partial | stale | unavailable",
  "invalidation_reasons": []
}
```

第 4 步执行顺序：

1. 先检查 source branch / commit、confirmed_entry、confirmed_boundary、代码闭包 hash、关键 prefab hash / meta hash；
2. 若缓存 fresh，直接复用 `asset_deps_summary` / `script_uuid_refs` / `dynamic_assets`，只做最小一致性检查，不重复全量 `asset deps` / `asset refs`；
3. 若部分 prefab stale，只对 stale prefab 局部刷新 CLI；
4. 若缓存缺失或 stale，才常规执行 CLI，并把输出写回缓存；
5. 缓存命中不得跳过边界确认、资源风险判断或动态资源审查。

#### 第 5 步目标能力索引与共享检索强化（加速硬规则）

第 5 步主控生成 `05x-target-shared-search.compact.json` 时，应尽量同时维护：

```text
<target_migration_dir>/.cocos-migration-cache/target-capability-index.json
<target_migration_dir>/logs/cache/target-capability-index.json
```

`target-capability-index.json` 用于跨任务复用目标项目公共能力，不代替 05a/05b/05c 判断。最低覆盖：

- UIID / UIConfig / prefab route；
- request wrapper / endpoint / DTO / protocol；
- event enum / producer / consumer；
- native KV / config / feature flag；
- i18n key family；
- common UI/list/avatar/remote image/resource loader；
- fonts/materials/coin/head/common texture resource families；
- target branch / commit / index hash。

第 5 步 agent 规则：

1. 05a 必须先读 `target-capability-index.json` 与 `05x-target-shared-search.compact.json`；fresh 时只补缺口，不做重复全局搜索；
2. 05b / 05c 必须优先消费 05a compact + shared search + target index；不得重复搜索 05a 已覆盖的 API/event/i18n/prefab/resource/common capability；
3. 若必须补搜索，搜索结果写入 agent 私有 logs，并在 compact 中记录 `duplicate_search_avoided` / `fallback_search_reason`；
4. target branch / commit 变化时，target index 必须标记 stale 或重建；不得用旧索引静默关闭确认项。

#### 第 6 / 第 7 步资源静态验证缓存（加速硬规则）

第 6 步 `migration-applier` 完成 Prefab / 资源复制、改绑和自检后，应写入：

```text
<target_migration_dir>/prefab-static-check-cache.json
```

该缓存用于第 7 步 `static-verifier` 的 cache-first 验证，避免在目标 commit、关键 prefab、meta、rebind 计划均未变化时重复执行完整 `asset deps` / `asset refs`。

最低 schema：

```json
{
  "version": 1,
  "feature_slug": "",
  "target_branch": "",
  "target_commit": "",
  "generated_at": "YYYY-MM-DD HH:mm:ss",
  "source": "migration-applier",
  "inputs": {
    "migration_dry_run_hash": "",
    "resource_plan_hash": "",
    "confirmed_target_semantics": []
  },
  "prefabs": [
    {
      "path": "assets/.../Panel.prefab",
      "prefab_hash": "sha256-or-size-mtime-fallback",
      "meta_hash": "sha256-or-size-mtime-fallback",
      "script_uuid_resolvable": true,
      "asset_uuid_resolvable": true,
      "missing_count": 0,
      "unresolved_count": 0,
      "unresolved": [],
      "public_rebind_audit": {
        "fonts": "pass | partial-pass | failed | not_checked",
        "materials": "pass | partial-pass | failed | not_checked",
        "spriteframes": "pass | partial-pass | failed | not_checked",
        "coin_icons": "pass | partial-pass | failed | not_checked",
        "default_avatars": "pass | partial-pass | failed | not_checked",
        "child_prefabs": "pass | partial-pass | failed | not_checked",
        "builtin_like": "pass | review-required | failed | not_present"
      },
      "evidence_paths": []
    }
  ],
  "cache_status": "fresh | partial | stale | unavailable",
  "invalidation_reasons": []
}
```

第 7 步必须优先读取该缓存，并按以下顺序判断：

1. `target_commit` 与当前目标项目 commit 一致；
2. `migration_dry_run_hash` / `resource_plan_hash` 与当前输入一致，或能证明未变化；
3. 每个关键 prefab 的 `prefab_hash` / `meta_hash` 未变化；
4. 第 6 步记录的 copy / reuse / rebind 计划未变化；
5. 缓存中 `missing_count=0`，脚本与业务资源 uuid 均可解析；
6. unresolved 均已分类，且没有 `missing-business-resource`。

若以上均满足，`static-verifier` 不得重复执行完整 `asset deps`；只允许读取缓存并做轻量一致性复核。若只有部分 prefab stale，则只对 stale / missing / unknown 的 prefab 调用 CLI。缓存缺失或 stale 只影响速度，不得阻塞迁移；应降级为常规验证并记录 `execution_gap.prefab_static_cache_miss`。

可选缓存：

```text
<target_migration_dir>/.cocos-migration-cache/uuid-reverse-index.json
<target_migration_dir>/logs/cache/uuid-reverse-index.json
<target_migration_dir>/builtin-like-unresolved-allowlist.json
```

`uuid-reverse-index.json` 用于通过 `.meta` 快速建立 `uuid -> asset path` / `script uuid -> ts` 映射；`builtin-like-unresolved-allowlist.json` 用于复用已分类的 `file=None` 内建资源疑似项。命中 allowlist 时仍必须输出人工编辑器复核建议，不得把它当作运行态通过证据。

#### 安全前提

- 不得因为缓存命中而跳过入口 / 边界确认、目标分支确认、高风险保真确认或 pending confirmations 回扫。
- 不得因为缓存命中而静默关闭待确认项；关闭必须有用户答复或 `target-existing` / `user-specified` / `backend-doc` / 明确证据。
- 不得在 source / target commit 变化后继续使用未验证的旧索引。
- 不得让技术加速产物覆盖步骤 md、manifest 或最终 compact 的单一事实源；它们只能作为证据和加速输入。
- 缓存缺失或失效只影响速度，不得阻塞迁移；应降级为常规分析并记录性能风险。

---

| 状态 | 含义 | 是否默认第 1~7 步状态 |
|---|---|---|
| `static-pass` | L1 静态结构验证通过，关键职责层在静态层等价，无已知 L1 阻塞；未做编译、编辑器或运行态复核。 | 是 |
| `partial-pass-static` | L1 静态结构基本通过，但存在关键职责层部分等价、fallback 策略、运行配置链未恢复或需业务确认的风险；未做编译、编辑器或运行态复核。 | 是 |
| `blocked-static` | L1 静态验证仍有阻塞，例如关键 DTO/enum 缺失、import 明显不存在、Prefab `missing>0`、关键脚本未绑定或关键资源缺失。 | 是 |

这些状态不取代传统状态，而是在“默认不做 tsc/cocos/editor/runtime 验证”的前提下提供更准确的结果表达。若用户明确要求完整验证，可继续使用 `completed` / `partial` / `blocked`。

---



适用于以下场景：

- 从项目 A 迁移某个完整业务功能到项目 B
- 目标项目缺少功能代码、Prefab、Sprite、Atlas、配置或本地化资源
- 两个项目同属 Cocos Creator / TypeScript 体系，但目录、入口和 UI 配置可能不同
- 用户已经明确给出源项目路径、目标项目路径和要迁移的功能名

不适用于：

- 单文件工具类拷贝
- 纯资源同步但没有业务逻辑的场景
- 仅做 bug fix，而不是跨项目迁移

---
