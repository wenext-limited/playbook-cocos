# Cache Schemas、Hash 与失效规则

本文件定义 `cocos-feature-migration` 技术加速缓存的统一 schema、hash 策略和失效判定。缓存只用于加速，不得跳过入口/边界确认、目标分支确认、高风险语义确认、pending confirmations 回扫、职责级验证或保真验证。

## 1. 通用缓存信封（所有 cache 必须包含）

所有缓存 JSON 顶层都必须包含以下字段，后续可追加阶段专属字段：

```json
{
  "version": 1,
  "schema_name": "prefab-static-check-cache | source-resource-closure-cache | target-capability-index | source-entry-closure-cache | uuid-reverse-index | asset-deps-cache | resource-path-index | phase-summary",
  "feature_slug": "jackpot_rank",
  "project_path": "/abs/path/project",
  "project_role": "source | target",
  "branch": "main",
  "commit": "abcdef12",
  "generated_at": "YYYY-MM-DD HH:mm:ss",
  "generated_by": "agent-name-or-controller",
  "cache_status": "fresh | partial | stale | missing | unavailable",
  "hash_method": "sha256 | size-mtime-fallback | mixed | unavailable",
  "inputs": {},
  "artifacts": {},
  "invalidation_reasons": [],
  "evidence_paths": []
}
```

字段要求：

| 字段 | 要求 |
|---|---|
| `version` | 从 `1` 开始；schema 不兼容时递增 |
| `schema_name` | 必须是稳定字符串，禁止自由发挥 |
| `project_path` | 绝对路径 |
| `branch` / `commit` | 生成缓存时的 Git 基线；非 Git 项目写 `null` 并说明原因 |
| `cache_status` | 当前缓存自评；读取方必须重新判定 fresh/stale |
| `hash_method` | 说明 hash 可信度；不能计算时写 `unavailable` |
| `inputs` | 影响缓存有效性的输入 hash / ref |
| `artifacts` | 本缓存实际覆盖的产物摘要 |
| `invalidation_reasons` | stale / partial / unavailable 的原因列表 |
| `evidence_paths` | 支撑缓存内容的步骤 md / logs / JSON 路径 |

## 2. Hash 策略（硬规则）

### 2.1 文件 hash

优先使用文件内容 sha256：

```json
{
  "path": "assets/.../Panel.prefab",
  "hash_method": "sha256",
  "hash": "<sha256>",
  "size": 12345,
  "mtime": 1780000000
}
```

若环境不适合读取完整文件，可降级为 size + mtime：

```json
{
  "path": "assets/.../Panel.prefab",
  "hash_method": "size-mtime-fallback",
  "hash": "size:12345|mtime:1780000000",
  "size": 12345,
  "mtime": 1780000000,
  "fallback_reason": "large file or tool limitation"
}
```

要求：

- 能用 sha256 时不得只用文件名或路径当 hash。
- fallback hash 只能用于加速判定；如果缓存结论会影响 `static-pass`，应标记 `confidence: medium` 或 `partial`。
- 目录 hash 必须由子文件相对路径 + 子 hash 排序后再 hash，不得只用目录 mtime。

### 2.2 输入 hash

影响缓存有效性的输入必须记录 hash 或稳定 ref：

```json
"inputs": {
  "confirmed_entry": "SubUIID.TotalRankEntrance + SubUIID.TotualRank",
  "confirmed_boundary_hash": "sha256:...",
  "source_code_closure_hash": "sha256:...",
  "resource_plan_hash": "sha256:...",
  "migration_dry_run_hash": "sha256:...",
  "target_diff_compact_hash": "sha256:..."
}
```

若无法计算 hash，记录：

```json
"inputs_unhashed": [
  {"name": "source_code_closure", "reason": "missing file"}
]
```

读取方遇到关键输入缺 hash，应最多判定为 `partial`，不得判定为完整 `fresh`。

## 3. 通用失效判定 checklist

读取缓存时，按以下顺序判定：

1. `schema_name` 是否符合预期；
2. `version` 是否兼容；
3. `project_path` 是否等于当前项目绝对路径；
4. `branch` / `commit` 是否等于当前基线；
5. `feature_slug` 是否一致；
6. `confirmed_entry` / `confirmed_boundary_hash` 是否一致；
7. 所有关键输入 hash 是否一致；
8. 缓存覆盖的关键文件 hash 是否一致；
9. `invalidation_reasons` 是否为空；
10. required fields 是否完整。

判定结果：

| 条件 | cache_status |
|---|---|
| 全部一致且字段完整 | `fresh` |
| 只有非关键字段缺失，或只缺部分可局部刷新项 | `partial` |
| commit / boundary / key file hash / schema 不一致 | `stale` |
| 文件不存在 | `missing` |
| 文件损坏、JSON parse 失败、无法读取 | `unavailable` |

缓存读取方必须把判定结果写入本阶段 compact：

```yaml
cache_usage:
  cache_path:
  cache_status: fresh | partial | stale | missing | unavailable
  reused_items_count:
  refreshed_items_count:
  invalidation_reasons: []
```

## 4. source-resource-closure-cache.json

用于第 4 步源资源闭包复用。

最低 schema：

```json
{
  "version": 1,
  "schema_name": "source-resource-closure-cache",
  "feature_slug": "jackpot_rank",
  "project_role": "source",
  "project_path": "/abs/source",
  "branch": "main",
  "commit": "abcdef12",
  "generated_at": "YYYY-MM-DD HH:mm:ss",
  "generated_by": "source-resource-closure-analyzer",
  "cache_status": "fresh",
  "hash_method": "sha256",
  "inputs": {
    "confirmed_entry": "SubUIID.TotalRankEntrance + SubUIID.TotualRank",
    "confirmed_boundary_hash": "sha256:...",
    "source_code_closure_hash": "sha256:..."
  },
  "critical_prefabs": [
    {"path": "assets/.../Panel.prefab", "prefab_hash": "sha256:...", "meta_hash": "sha256:..."}
  ],
  "asset_deps_summary": [
    {"asset": "assets/.../Panel.prefab", "missing_count": 0, "unresolved_count": 0, "log_path": "logs/asset-deps-panel.txt"}
  ],
  "script_uuid_refs": [
    {"script": "assets/.../Panel.ts", "uuid": "...", "refs": ["assets/.../Panel.prefab"], "log_path": "logs/asset-refs-panel.txt"}
  ],
  "required_assets": [],
  "dynamic_assets": [],
  "resource_roots": [],
  "invalidation_reasons": [],
  "evidence_paths": []
}
```

失效条件：

- source commit 变化且无法证明关键文件 hash 未变；
- confirmed entry / boundary 变化；
- `03-源代码闭包.md` 或其 compact hash 变化；
- 任一 critical prefab / meta hash 变化；
- resource roots / bundle 配置变化；
- 关键 script `.meta` uuid 变化；
- cache 中 unresolved 为 `unknown` 且本轮需要更高置信度。

## 5. asset-deps-cache.json

用于缓存 CLI `asset deps` 输出摘要，避免重复展开相同 prefab。

```json
{
  "version": 1,
  "schema_name": "asset-deps-cache",
  "project_role": "source | target",
  "project_path": "/abs/project",
  "branch": "",
  "commit": "",
  "assets": {
    "assets/.../Panel.prefab": {
      "asset_hash": "sha256:...",
      "meta_hash": "sha256:...",
      "deps_count": 29,
      "missing_count": 0,
      "unresolved_count": 0,
      "unresolved": [],
      "deps_summary": [],
      "raw_log_path": "logs/asset-deps-panel.txt",
      "checked_at": "YYYY-MM-DD HH:mm:ss"
    }
  },
  "cache_status": "fresh",
  "invalidation_reasons": []
}
```

单个 asset 的 hash 不一致时，只刷新该 asset，不得因此全量丢弃整个 cache。

## 6. uuid-reverse-index.json

用于通过 `.meta` 快速解析 uuid，减少 `asset uuid` / `asset refs` 调用。

```json
{
  "version": 1,
  "schema_name": "uuid-reverse-index",
  "project_role": "source | target",
  "project_path": "/abs/project",
  "branch": "",
  "commit": "",
  "indexed_roots": ["assets/GameBundle/..."],
  "uuid_to_asset": {
    "uuid": {"asset_path": "assets/.../foo.png", "meta_path": "assets/.../foo.png.meta", "type": "texture | prefab | script | font | material | unknown"}
  },
  "asset_to_uuid": {
    "assets/.../foo.png": "uuid"
  },
  "script_uuid_to_ts": {
    "uuid": "assets/.../Panel.ts"
  },
  "root_hash": "sha256:...",
  "cache_status": "fresh",
  "invalidation_reasons": []
}
```

失效条件：indexed roots 内 `.meta` 文件新增、删除、内容 hash 变化；target commit 变化且无法证明 root hash 未变。


## 7. target-capability-index.json

用于第 5 步目标公共能力复用。

```json
{
  "version": 1,
  "schema_name": "target-capability-index",
  "project_role": "target",
  "project_path": "/abs/target",
  "branch": "feature/...",
  "commit": "abcdef12",
  "generated_at": "YYYY-MM-DD HH:mm:ss",
  "ui_routes": [],
  "api_protocols": [],
  "events": [],
  "native_kv_config": [],
  "i18n_key_families": [],
  "common_capabilities": {
    "ui_manager": [],
    "network": [],
    "list": [],
    "avatar_remote_image": [],
    "resource_loader": [],
    "rtl_i18n": []
  },
  "resource_families": {
    "fonts": [],
    "materials": [],
    "coin_icons": [],
    "default_avatars": [],
    "common_textures": []
  },
  "evidence_paths": [],
  "cache_status": "fresh",
  "invalidation_reasons": []
}
```

失效条件：target branch / commit 变化、相关 config / common capability 文件 hash 变化、resource family roots hash 变化。target index 只能证明“目标可能已有能力”，不能静默关闭业务语义确认项。

## 8. prefab-static-check-cache.json

用于第 7 步复用第 6 步 Prefab UUID 闭合预检。

```json
{
  "version": 1,
  "schema_name": "prefab-static-check-cache",
  "feature_slug": "jackpot_rank",
  "project_role": "target",
  "project_path": "/abs/target",
  "branch": "feature/migration_jackpot_rank",
  "commit": "abcdef12",
  "generated_at": "YYYY-MM-DD HH:mm:ss",
  "generated_by": "migration-applier",
  "cache_status": "fresh",
  "inputs": {
    "migration_dry_run_hash": "sha256:...",
    "resource_plan_hash": "sha256:...",
    "target_diff_compact_hash": "sha256:..."
  },
  "prefabs": [
    {
      "path": "assets/.../Panel.prefab",
      "prefab_hash": "sha256:...",
      "meta_hash": "sha256:...",
      "expected_scripts": [
        {
          "script": "assets/.../Panel.ts",
          "script_meta": "assets/.../Panel.ts.meta",
          "meta_uuid": "...",
          "full_uuid_hit": true,
          "short_uuid_hit": true,
          "compressed_uuid_hit": false,
          "serialized_script_field_hit": true,
          "missing_script_signature_hit": false,
          "binding_evidence": "direct | secondary | unknown | missing",
          "evidence_snippets_path": "logs/prefab-script-binding-panel.json"
        }
      ],
      "script_uuid_resolvable": true,
      "asset_uuid_resolvable": true,
      "missing_count": 0,
      "unresolved_count": 0,
      "unresolved": [
        {"uuid": "", "classification": "builtin-like | target-public-resource | source-private-resource | missing-business-resource | unknown", "editor_review_required": true, "evidence": ""}
      ],
      "public_rebind_audit": {
        "fonts": "pass | partial-pass | failed | not_checked",
        "materials": "pass | partial-pass | failed | not_checked",
        "spriteframes": "pass | partial-pass | failed | not_checked",
        "coin_icons": "pass | partial-pass | failed | not_checked",
        "default_avatars": "pass | partial-pass | failed | not_checked",
        "child_prefabs": "pass | partial-pass | failed | not_checked",
        "builtin_like": "pass | review-required | failed | not_present"
      },
      "entry_visual_integration": {
        "status": "pass | partial | fail | not_applicable",
        "visible_entry": true,
        "i18n_key_complete": true,
        "formal_icon_resource": true,
        "click_route_closed": true,
        "placeholder_or_empty_icon": false,
        "evidence_paths": []
      },
      "transitional_resource_decisions": [
        {
          "asset": "assets/.../rank_deps/foo.png",
          "current_dependents": ["assets/.../Panel.prefab"],
          "target_equivalent": "assets/.../common/foo.png or null",
          "decision": "rebind-target-existing | move-to-stable-feature-dir | keep-transitional-with-review | remove-after-rebind",
          "reason": "",
          "phase7_review_required": true
        }
      ],
      "evidence_paths": []
    }
  ],
  "invalidation_reasons": [],
  "evidence_paths": []
}
```

失效条件：target commit 变化、prefab/meta hash 变化、migration dry-run/resource plan/target diff hash 变化、target public resource uuid 变化、unresolved 从已分类变为 unknown、schema 不兼容。


读取方判定：`binding_evidence=direct|secondary` 可支撑 `prefab_script_binding: pass`；`unknown` 最高 partial；`missing` 应 fail 或回派修复。若 cache 中缺少 `expected_scripts`，读取方必须把该缓存最多判定为 `partial`。

读取方必须把 `prefab-static-check-cache` 转换为第 7 步 `migration-static-check.json` 的 `static_status_breakdown` 和 `final_status_synthesis.downgrade_reasons` 输入，但不得只凭缓存直接给最终状态；职责级验证、保真验证和待确认项回扫仍必须执行。

## 9. builtin-like-unresolved-allowlist.json

用于复用已分类的 `file=None` unresolved，但不作为运行态通过证据。

```json
{
  "version": 1,
  "schema_name": "builtin-like-unresolved-allowlist",
  "items": {
    "uuid": {
      "classification": "builtin-like",
      "builtin_like_resource": "db://internal/... or unknown-builtin-like",
      "first_seen_feature_slug": "jackpot_rank",
      "first_seen_evidence": "logs/asset-deps-xxx.txt",
      "editor_review_required": true,
      "blocks_static_pass": false,
      "max_status_without_editor_review": "partial-pass-static"
    }
  }
}
```

命中 allowlist 时：

- 不重复深挖该 uuid；
- 必须写入 editor review 建议；
- 若除此之外无业务资源缺失，可进入 `partial-pass-static` 或按 guide 矩阵谨慎判定；
- 不得宣称编辑器 / 运行态可用。

## 10. confirmed-entries.json

用于第 2 步复用已确认的入口、边界和完成定义。缓存只表示“上一轮已确认过”，不得在 feature_name / source commit / boundary 输入变化时静默跳过确认。

```json
{
  "version": 1,
  "schema_name": "confirmed-entries",
  "feature_slug": "jackpot_rank",
  "project_role": "source",
  "project_path": "/abs/source",
  "branch": "main",
  "commit": "abcdef12",
  "generated_at": "YYYY-MM-DD HH:mm:ss",
  "generated_by": "entry-boundary-analyzer | controller",
  "cache_status": "fresh",
  "feature_name_aliases": ["jackpot榜单", "jackpot rank"],
  "entries": [
    {
      "confirmed_entry": ["SubUIID.TotalRankEntrance", "SubUIID.TotualRank"],
      "confirmed_boundary_hash": "sha256:...",
      "confirmed_boundary": {
        "user_decision": "B",
        "include": [],
        "exclude": [],
        "core_boundary": [],
        "optional_boundary": [],
        "excluded_boundary": []
      },
      "minimum_done": [],
      "full_done": [],
      "closed_confirmations": [],
      "evidence_paths": []
    }
  ],
  "invalidation_reasons": [],
  "evidence_paths": []
}
```

失效条件：

- source commit 变化且无法证明候选入口相关文件 hash 未变；
- feature_slug / feature_name_aliases 不匹配；
- 用户本轮明确要求重新分析入口或改变边界；
- confirmed_boundary_hash 与 manifest / source compact 不一致；
- `closed_confirmations` 缺少用户确认来源，且候选入口超过 1 个；
- `02-源入口候选.md` 或 `源分析清单.md` 顶层仍有 open confirmation。

fresh 时第 2 步可以只做最小一致性检查和写回，不做全量候选搜索；但主控仍需确认当前没有 open confirmation。

## 11. source-entry-closure-cache.json

用于第 3 步复用源代码闭包、职责层和保真闭包。

```json
{
  "version": 1,
  "schema_name": "source-entry-closure-cache",
  "feature_slug": "jackpot_rank",
  "project_role": "source",
  "project_path": "/abs/source",
  "branch": "main",
  "commit": "abcdef12",
  "generated_at": "YYYY-MM-DD HH:mm:ss",
  "generated_by": "source-code-closure-analyzer",
  "cache_status": "fresh",
  "inputs": {
    "confirmed_entry": ["SubUIID.TotalRankEntrance", "SubUIID.TotualRank"],
    "confirmed_boundary_hash": "sha256:...",
    "entry_boundary_compact_hash": "sha256:..."
  },
  "files": {
    "runtime_dependencies": [
      {"path": "assets/.../RankData.ts", "hash": "sha256:...", "role": "data"}
    ],
    "type_only_dependencies": [],
    "shared_dependencies": [],
    "skip_files": []
  },
  "closure": {
    "migrate_files": [],
    "adapt_files": [],
    "target_reuse_hints": [],
    "critical_responsibility_layers": [],
    "semantic_fields": [],
    "gating_dependencies": [],
    "event_closures": [],
    "interface_branches": [],
    "request_parameter_semantics": [],
    "minimum_done": [],
    "full_done": []
  },
  "ts_graph": {
    "query_methods": [],
    "graph_scope": "",
    "fallback_reason": null
  },
  "invalidation_reasons": [],
  "evidence_paths": []
}
```

失效条件：

- confirmed entry / boundary hash 变化；
- 第 2 步 compact hash 变化且影响 include/exclude；
- 任一 runtime dependency 文件 hash 变化；
- API path / request 参数 / KV / config / event 相关文件 hash 变化；
- source commit 变化且无法证明闭包内文件 hash 未变；
- 缓存缺少 `semantic_fields`、`gating_dependencies`、`event_closures`、`interface_branches`、`request_parameter_semantics` 任一关键字段。

若 source commit 变化但 runtime dependency hash 未变，可标记 `reuse-with-commit-change` 并做轻量复核；若只有 type-only dependency hash 变化，可标记 `partial` 并局部刷新类型影响；runtime dependency 未变时无需重算完整闭包。

## 12. 写回与监控要求

每个使用缓存的阶段 compact 必须记录：

```yaml
cache_usage:
  - cache_name:
    cache_path:
    cache_status:
    reused_items_count:
    refreshed_items_count:
    invalidation_reasons: []
    fallback_search_reason:
```

`使用效果监控.md` 必须聚合：

- cache hit / stale / missing / unavailable 数量；
- 因 cache 命中避免的 CLI / search 次数；
- cache miss 对耗时的影响；
- 是否存在 schema 不稳定或 hash 缺失。
