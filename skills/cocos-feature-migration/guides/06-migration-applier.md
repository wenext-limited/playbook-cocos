# 第 6 步：迁移动作落地

### 第 6 步：迁移代码与资源

开始本步骤前：先读取 `迁移清单.md`、`05-目标差异分析.md` 和 `06-迁移动作记录.md`（如果存在）。

完成本步骤后：把本轮实际改动按时间追加写入 `06-迁移动作记录.md`，并更新 `迁移清单.md` 中第 6 步状态。

**阶段边界要求：第 6 步只执行迁移动作、必要的文件存在性检查、关键文件自检和动作记录；不要执行 TypeScript / lint / 构建 / Cocos build 等命令。** 本 skill 默认不检测也不运行 `tsc` / `cocos`，第 7 步也只做 L1 静态验证，除非用户另行授权人工复核。如果在第 6 步为了辅助迁移做了只读检查（如确认文件是否存在、资源路径是否可解析、关键类型名是否实际落地），只能作为迁移动作依据记录，不应把它当作最终验证结论。

执行迁移时遵循以下策略：

#### 6.0 迁移 dry-run（推荐加速）

在实际修改目标业务代码 / 资源前，`migration-applier` 应优先生成或读取：

```text
migration-dry-run.json
```

dry-run 必须尽量使用固定 schema，减少后续读取完整 Markdown：

```json
{
  "copy_files": [
    {
      "source": "",
      "target": "",
      "status": "ok | conflict | overwrite-risk | missing-source",
      "decision": "copy | skip | adapt | reuse-target"
    }
  ],
  "rewrite_imports": [],
  "asset_mapping": [],
  "prefab_rebind": [],
  "target_conflicts": [],
  "semantic_changes": [],
  "self_check_plan": []
}
```

规则：

- dry-run 是迁移动作计划，不是最终事实；实际执行后必须以目标实物自检结果为准。
- 发现 overwrite-risk、UUID 冲突、目标已有同职责资源但无法判断是否复用时，应写入待确认项或在第 5 步补充分析，不得静默覆盖。
- dry-run 输出超过 100 行时写入 `logs/`，`06-迁移动作记录.md` 只保留摘要和路径。

#### 6.0.w copy manifest preflight 与无关资源审计（P0）

实际复制任何资源前，`migration-applier` 必须把 `migration-dry-run.json.copy_files` 视为 copy manifest，并执行准入检查。每个 `decision: copy` 的资源必须具备：

```json
{
  "source": "",
  "target": "",
  "source_uuid": "",
  "canonical_source_path": "",
  "included_by": [],
  "boundary_status": "must_copy | rebind_required",
  "excluded_boundary_check": {
    "checked": true,
    "excluded_modules_hit": [],
    "excluded_resource_paths_hit": [],
    "excluded_referenced_by": []
  },
  "same_basename_disambiguation": []
}
```

准入规则：

- `source_uuid`、`canonical_source_path`、`included_by` 或 `boundary_status` 缺失时，不得复制该资源。
- basename 在源项目存在多个候选时，必须确认选中的 `source_uuid` 被 included boundary 引用；否则 block/skip。
- 命中 `excluded_modules`、excluded boundary 或 `excluded_resource_paths` 的资源不得复制。
- 禁止使用 basename、目录 glob 或“copy all same name”生成实际复制列表。

复制完成后必须执行 `extraneous_copied_resource_audit`：遍历本轮新增资源，检查它是否被核心 Prefab UUID 闭包、included dynamic load、UIConfig/route 或迁入代码 import/reference 引用。无法证明引用且存在 excluded chain / 同名误带证据的资源，必须标记 `extraneous_copied_resource`；不得进入 `static-pass`，并应在安全时回滚本 agent 本轮复制的无关资源，或写明需人工清理。

#### 6.0.x Prefab 静态验证缓存（第 7 步加速必做）

在实际复制 / 改绑 Prefab 和资源后，`migration-applier` 必须尽量写入：

```text
<target_migration_dir>/prefab-static-check-cache.json
```

该文件记录第 6 步已经完成的 Prefab UUID 闭合预检、公共资源改绑审计和关键 prefab hash，用于第 7 步避免重复执行完整 `asset deps` / `asset refs`。若无法生成，必须在 `06-迁移动作记录.md`、`迁移状态摘要.compact.md` 和 `agent_result` 中写明 `prefab_static_check_cache_status: unavailable` 与原因。

最低内容：

- target branch / commit；
- `migration-dry-run.json` 与资源计划的 hash 或可追溯版本；
- 每个关键 prefab 的路径、prefab hash、meta hash；
- 每个关键 prefab 的 expected script、目标脚本 `.meta` uuid、prefab 文本中完整 uuid / 短 uuid / Cocos 序列化字段命中情况；
- `script_binding_evidence: direct | secondary | missing | unknown`，以及 Missing Script 特征扫描结果；
- `script_uuid_resolvable`、`asset_uuid_resolvable`；
- missing / unresolved 计数和分类；
- fonts / materials / spriteframes / coin_icons / default_avatars / child_prefabs / builtin_like 的公共 UUID 改绑审计结果；
- 每个关键 Prefab 的 `__uuid__` 全量闭合检查结果：`raw_uuid`、剥离 `@subid` 后的 `base_uuid`、目标 `.meta` 命中资产、分类、处理策略、missing 计数；
- 证据路径。


脚本绑定证据必须按 `expected_scripts` 结构化记录，供第 7 步 cache-first 判定：

```json
{
  "prefab": "assets/GameBundle/roulette/prefab/panel/PanelGeneralRank.prefab",
  "prefab_hash": "sha256:...",
  "meta_hash": "sha256:...",
  "expected_scripts": [
    {
      "script": "assets/GameBundle/roulette/script/panel/PanelRankComponent.ts",
      "script_meta": "assets/GameBundle/roulette/script/panel/PanelRankComponent.ts.meta",
      "meta_uuid": "...",
      "full_uuid_hit": true,
      "short_uuid_hit": true,
      "compressed_uuid_hit": false,
      "serialized_script_field_hit": true,
      "missing_script_signature_hit": false,
      "binding_evidence": "direct | secondary | unknown | missing",
      "evidence_snippets_path": "logs/prefab-script-binding-PanelGeneralRank.json"
    }
  ]
}
```

判定口径：

- `direct`：结构化索引、`asset refs` 或等价证据直接证明 prefab 绑定目标脚本。
- `secondary`：prefab 文本命中 `.meta` 完整 uuid / 短 uuid / Cocos 脚本序列化字段，可支撑 L1 通过但仍建议编辑器 spot check。
- `unknown`：只能证明脚本 `.meta` 存在，不能证明 prefab 绑定；第 7 步最高 `partial-pass-static`。
- `missing`：脚本 `.meta` 缺失或 prefab 绑定明显缺失；第 7 步应 fail 或回派修复。

第 6 步不需要为了生成该缓存而运行完整第 7 步验证，但凡已经做过的 CLI / 文本解析 / uuid 检查结果必须结构化写入缓存，供第 7 步 cache-first 使用。

#### 6.0.y 关键 Prefab `__uuid__` 目标侧闭合预检（P0 必做）

`prefab-static-check-cache.json` 不能只回答脚本是否绑定，还必须回答关键 Prefab 内所有序列化资源 UUID 是否能在目标项目解析。此检查用于捕获 `@property(Prefab)`、字体、材质、SpriteFrame、默认头像、coin 图标等被 Prefab 字段直接引用但未在文件名清单中出现的资源。

执行时机：迁移 Prefab/资源和局部刷新目标 reverse index 后、返回第 6 步结果前。

范围：confirmed core boundary 内的入口 Prefab、主面板 Prefab、列表项 Prefab，以及 `critical_prefab_uuid_refs` 或资源计划中列出的所有关键 Prefab。

检查规则：

1. 读取目标 Prefab 文本，提取全部 `__uuid__`；对 `<uuid>@<subid>` 必须剥离为 `base_uuid` 后再查目标 `.meta`。
2. 用目标 `uuid-reverse-index.json` 或 `.meta` 文本索引反查 `base_uuid`；命中 `.meta` 即认为目标侧有可解析资产，再按 raw/subid 记录子资源证据。
3. 未命中项必须继续与源侧 `critical_prefab_uuid_refs`、05c 资源计划、builtin-like allowlist 对照，分类为 `missing-business-resource | public-resource-unrebound | builtin-like | unknown`。
4. 对 `missing-business-resource` 或确定可复制的独立资源，必须在第 6 步补迁资源和 `.meta`，保持或改绑 UUID 后重扫；典型对象包括独立子 Prefab、字体、材质、SpriteFrame/Texture、默认头像、coin 图标。
5. 对目标已有同职责公共资源，优先改绑到目标资源 UUID；若无法安全改绑，必须写 `public-resource-unrebound` 和 `editor_prefab_binding_review_recommendation.must_not_run_automatically: true`，最终最高 `partial-pass-static`。
6. builtin-like/editor-only 项可不阻塞，但必须记录映射来源、uuid 和人工编辑器复核建议。

缓存最低字段：

```json
{
  "prefab_uuid_closure": {
    "status": "pass | partial | fail | unavailable",
    "checked_prefab_count": 0,
    "total_uuid_count": 0,
    "unique_base_uuid_count": 0,
    "resolved_count": 0,
    "missing_count": 0,
    "builtin_like_count": 0,
    "unknown_count": 0,
    "target_uuid_index_status": "fresh | partial | stale | missing | unavailable",
    "prefabs": [
      {
        "prefab_path": "",
        "prefab_hash": "sha256:...",
        "uuid_refs": [
          {
            "raw_uuid": "",
            "base_uuid": "",
            "target_asset_path": "",
            "target_meta_path": "",
            "asset_type": "prefab | script | font | material | spriteframe | texture | atlas | audio | json | builtin-like | unknown",
            "resolution": "target-meta-hit | copied-with-meta | rebound-to-target | builtin-like | missing | unknown",
            "classification": "business-resource | public-resource | builtin-like | editor-only | unknown",
            "blocks_static_pass": false,
            "evidence_path": ""
          }
        ]
      }
    ]
  }
}
```

若关键 Prefab 的 `prefab_uuid_closure.missing_count > 0` 且不是 builtin-like/editor-only，必须先修复；无法修复时返回 `execution_status: blocked | partial`，并在 `phase_gate.reasons` 使用 `category: resource_static` 或 `public_uuid_rebind`。

#### 6.1 代码迁移

- 新建目标项目缺失的业务 TS 文件
- 调整 import 路径到目标项目实际目录
- 替换源项目特有的：
  - 事件枚举
  - UI 注册 ID
  - 网络接口入口
  - bundle 名
  - 资源根路径
  - App/子游戏标识
- 若目标项目已有同类能力，只补功能增量，不复制底层通用实现


#### 6.1.x 业务语义改写保护（必做）

执行代码迁移时，必须遵守“源行为保真优先”，并在落地时禁止 AI 自行发挥。默认策略是：**业务语义和 feature 私有实现照源保真；只做必要目标适配**。

允许不额外确认的必要适配仅限：

- import 路径；
- bundle 名、UI 注册路径、资源根路径；
- 目标项目已有公共能力接入，例如通用头像、远程图片、列表组件、语言系统、资源加载工具；
- 用户已明确确认的目标业务常量。

除上述必要适配外，不得无证据改写源 feature 相关：

- 字符串常量、接口地址、deeplink path；
- 枚举值、静态字段结构、默认值；
- request 参数、query 参数、DTO 字段；
- appName / platform / old-new-interface 分支逻辑；
- native / KV / remote config / gating 链；
- event 定义、派发、监听关系；
- 关键方法结构、getter/setter 结构、条件判断。

任何“看起来应该适配目标项目”的改动，必须先有 `user-specified`、`target-existing` 或 `backend-doc` 证据；没有证据时保持源值 / 源结构，并把建议适配写入待确认项。该规则在迁移动作时生效，不要求新增迁移后全量 diff 流程。

对第 5 步标记为 `inferred`、`高风险可疑`、`需确认` 的以下改动，更不得静默落地：

- API / deeplink path 改写；
- `activityType` / `businessType` / `taskType` / `taskData` 改写；
- appName / platform / old-new-interface 分支删除或硬编码；
- native / KV / remote config / gating 链删除、直通或默认值替代；
- request 参数从动态值改为空值、`0`、`null`、默认值或固定值；
- event 定义、派发、监听任一环节被删除；
- 源项目关键职责层被裁剪为“只打开 UI”或“只保留主面板”。

处理方式：

1. 若没有用户确认或明确证据，保留源项目语义；
2. 若目标项目确实已有等价实现，记录 `target-existing` 证据路径；
3. 若需要用户确认，停止该项改写，把问题写入 `06-迁移动作记录.md` 和 `迁移状态摘要.compact.md` 的 `needs_user_confirmation`；
4. 不得为了让代码“看起来适配目标项目”而自行替换成另一个接口、默认配置或硬编码分支。

`06-迁移动作记录.md` 必须包含“关键语义字段来源表”：

| 字段 | 最终落地值 | 来源 | 证据 | 是否用户确认 |
|---|---|---|---|---|



- 复制缺失资源文件
- 检查 `.meta` 是否需要保留或重新生成
- 若跨项目复制 `.meta` 可能引发 UUID/引用问题，优先遵循目标项目资源管理方式
- 修复 Prefab / Atlas / SpriteFrame 的路径引用问题
- 跨项目复制 Prefab 后，如果为了保持 Prefab 内部静态 UUID 引用可解析而临时引入了隔离依赖目录（例如 `rank_deps/`、`migrated_deps/`），必须在 `06-迁移动作记录.md` 记录原因、包含哪些资源、后续如何在编辑器中切回目标项目原生资源，以及何时可以清理该目录
- 对目标项目已有的 coin / head / font / material / common texture 等资源，必须优先判断是否可直接复用，不得因为源 Prefab 的静态 uuid 引用方便，就默认复制一份到 `rank_deps/`、`migrated_deps/` 等隔离目录。
- 若为了让跨项目复制的 Prefab 先保持静态依赖可解析而临时复制到隔离依赖目录，必须把它标记为**过渡方案**，不得默认视为最终落地结果。
- 对隔离依赖目录中的资源，必须尽早判断其是否与目标项目原生资源“同名且同职责”；若目标原生资源已经存在且足以复用，应优先规划回切，不要把重复资源长期保留在隔离目录中。

#### 6.2.x 过渡方案生命周期与回切决策检查（必做）

若本轮迁移引入了 `rank_deps/`、`migrated_deps/` 或其他隔离依赖目录，除了记录“这是过渡方案”之外，还必须进一步记录其**生命周期**和**逐资源回切决策**，避免过渡目录长期常驻。

至少要明确：

- 引入原因：为什么当前必须保留该过渡目录；
- 依赖对象：哪些 Prefab / 资源 / 功能链仍依赖它；
- 退出条件：达到什么条件后应切回目标项目原生资源或正式目录；
- 最晚清理时机：应在本轮验收前、编辑器修复后，还是下一轮资源回切任务前完成清理；
- 目录内资源清单：列出过渡目录下每个资源或资源组；
- 目标等价资源检查：对每个资源判断目标项目是否已有同名 / 同职责 / 设计系统等价资源；
- 稳定目录决策：每个资源必须落入 `rebind-target-existing` / `move-to-stable-feature-dir` / `keep-transitional-with-review` / `remove-after-rebind` 之一，并写明原因。

建议输出：

| 过渡目录 | 引入原因 | 当前依赖对象 | 退出条件 | 最晚清理时机 |
|---|---|---|---|---|
| `rank_deps/` | 说明原因 | `assets/...` | 说明条件 | 说明时机 |

逐资源回切决策表：

| 过渡资源 | 当前依赖 Prefab / 节点 | 目标等价资源 | 决策 | 决策原因 | 第 7 步复核要求 |
|---|---|---|---|---|---|
| `texture/rank_deps/xxx.png` | `PanelRank.prefab` | `texture/common/xxx.png` / 无 | rebind-target-existing / move-to-stable-feature-dir / keep-transitional-with-review / remove-after-rebind | 说明 | 说明 |

要求：

- 若没有明确退出条件和逐资源决策，不得把该过渡方案视为已闭环。
- 若迁移结束时仍保留过渡目录，必须在 `07-迁移验证.md`、`迁移总结.md`、`使用效果监控.md` 中继续跟踪，不得只在 `06-迁移动作记录.md` 提一次就结束。
- 若过渡目录内存在目标已有同职责公共资源且未改绑，最终状态不得写 `static-pass`；应至少降级为 `partial-pass-static` 并输出 `prefab-binding-review` / `resource-governance-review` 建议。

#### 6.x 关键文件强制自检（必做）

第 6 步修改关键接入文件后，`migration-applier` 必须读取目标项目中的**实际文件**并记录自检证据，避免出现“报告已修但未落地”的情况。

至少按功能形态自检以下类别：

| 文件类别 | 必查内容 | 记录方式 |
|---|---|---|
| 协议 / DTO 文件 | 迁入代码引用的 interface / enum / class / type 名称是否实际存在 | 记录文件路径、行数或符号存在列表，例如 `ReqRankData: true` |
| 主入口 / SubGame / Controller | 关键字段、初始化方法、请求方法、入口打开方法是否实际存在 | 记录字段名/方法名存在列表 |
| UIConfig / PanelConfig | 新增 UI ID、prefab 路径、bundle 名是否实际存在 | 记录 UI ID 与 prefab 映射 |
| Event enum / Message key | 新增事件名是否实际存在且与迁入代码引用一致 | 记录事件名列表 |
| 工具适配文件 | 新增 helper 方法是否实际存在 | 记录方法名列表 |
| Prefab / 资源 | 关键 prefab、资源、`.meta` 是否存在 | 记录存在性摘要；完整 deps 留到第 7 步 |
| Prefab UUID 闭合预检 | 跨项目复制 prefab 后，新增 TS 是否有 `.meta`、prefab 内脚本 uuid 是否能映射到目标脚本 `.meta`、字体/材质/Sprite/子 prefab uuid 是否能映射到目标资源 `.meta` | 记录 `script_meta_present`、`script_uuid_resolvable`、`asset_uuid_resolvable`；能自动改绑/同步的应在第 6 步先修复 |
| Prefab `__uuid__` 全量闭合 | 关键 Prefab 文本中的所有 `__uuid__` 是否剥离 `@subid` 后能在目标 `.meta` 反查闭合 | 记录 `prefab_uuid_closure.missing_count`、缺失 uuid 分类、补迁/复用/改绑动作；非 builtin-like 缺失不得留到第 7 步首次发现 |
| 新增入口资源 | 若迁移新增独立入口，入口注册位置、文案 key、icon 来源、点击行为、是否替换原入口、是否存在 placeholder / TODO / 空 iconUrl 是否明确 | 记录入口资源自检表；icon 仍为占位时必须写入 `remaining_risks` 并提示第 7 步降级 |

新增入口资源自检建议格式：

| 项目 | 内容 | 是否完成 | 证据 |
|---|---|---|---|
| 入口注册位置 |  | 是 / 否 |  |
| 入口文案 key |  | 是 / 否 |  |
| 入口 icon 来源 |  | 是 / 否 |  |
| 点击行为 |  | 是 / 否 |  |
| 是否替换目标原入口 |  | 是 / 否 |  |
| 是否存在 placeholder / TODO / 空 iconUrl |  | 是 / 否 |  |

若 iconUrl 仍为占位：

- 不得声称入口视觉完成；
- 必须写入 `06-迁移动作记录.md` / `迁移状态摘要.compact.md` 的 `remaining_risks`；
- 必须提示 `static-verifier` 按入口视觉风险降级处理；
- 若入口替换原语义且未获用户确认，必须返回待确认项。

自检要求：

- 自检结果必须写入 `06-迁移动作记录.md` 或 `迁移状态摘要.compact.md`。
- 若自检失败，不能报告“已完成迁移”；应继续修复或标记 `blocked-static` 风险。
- 不允许只根据编辑动作或复制命令推断成功，必须以 Read / 搜索目标实物结果为准。

在生成或刷新 `prefab-static-check-cache.json` 前，第 6 步应优先读取/局部刷新目标侧 Cocos reverse indexes：

```text
<target_migration_dir>/logs/cocos/uuid-reverse-index.json
<target_migration_dir>/logs/cocos/prefab-reverse-index.json
<target_migration_dir>/logs/cocos/prefab-script-binding-index.json
```

允许在 `<target_migration_dir>/logs/tools/` 下生成只读临时脚本 `build-cocos-reverse-index.mjs` 或 `.py`，用于解析 `.meta`、Prefab 文本和 Cocos 3.8/3.7 脚本序列化字段。该脚本不得修改业务文件。若第 6 步修改了 prefab/meta/script/resource，只刷新 `migration-dry-run.json` 或 `migration-progress.json` 中记录的 changed_prefabs / changed_meta_files / changed_scripts / changed_resources 对应索引项。

若本轮业务写入修改了 prefab/meta/script/resource，第 6 步必须把 changed files 写入 `migration-progress.json`，并在生成 `prefab-static-check-cache.json` 前按 reverse index tool protocol 执行 partial refresh：

```yaml
reverse_index_partial_refresh_after_step6:
  required_when_any_changed:
    - changed_prefabs nonempty
    - changed_meta_files nonempty
    - changed_scripts nonempty
    - changed_resources nonempty
  input_sources:
    - migration-dry-run.json.copy_files / prefab_rebind / asset_mapping
    - migration-progress.json.business_files_modified / resources_copied
  tool_mode: partial
  output_summary: logs/cocos/cocos-reverse-index.summary.json
  must_record_in:
    - migration-progress.json.reverse_index_refresh
    - 迁移状态摘要.compact.md
    - phase-summary JSON
  on_partial_or_failed:
    - continue with targeted fallback for changed critical prefabs/scripts
    - record execution_gap.cocos_reverse_index_partial_refresh_failed
    - do not mark index failure itself as business risk
```



1. `prefab-script-binding-index.json` 的 direct 证据；
2. `uuid-reverse-index.json` + prefab 文本 full/short/compressed uuid 命中；
3. Cocos 3.8/3.7 serialized script field 命中；
4. targeted `cli-anything-cocoscreator asset uuid + asset refs`；
5. 仍无法证明时才标记 unknown/missing。

reverse index missing 本身不是业务风险；但如果关键 Prefab / expected script 因缺索引和 fallback 均无法证明绑定，必须按现有 prefab binding gate 降级或阻塞。



##### 6.y.1 prefab binding repair fast path（性能优化 P0）

##### 6.y.2 meta_uuid_null_policy（P0）

`prefab-static-check-cache.json` 中 `expected_scripts[*].meta_uuid == null` 不得直接判定为脚本绑定 missing。必须先执行：

1. 直接读取目标脚本 `.meta` 文件；
2. 按 JSON 解析 `uuid`；
3. 若 `.meta` 中存在 uuid，先更新 cache 的 `meta_uuid`，再继续检查 prefab binding；
4. 只有 `.meta` 文件缺失、JSON 解析失败或 uuid 字段缺失时，才判定 `script_meta_missing`；
5. 若 meta uuid 存在但 prefab 无绑定证据，则按 `missing` / `unknown` 调和规则继续判断。

该策略用于避免 cache 解析 bug 把“meta uuid 存在但未写入 cache”误判为脚本缺失。


一旦 `prefab_script_binding_preflight` 发现关键 Prefab expected script 为 `missing`，不得等完成全部迁移动作文档或第 7 步才处理；必须立即进入 fast path：

```yaml
prefab_binding_repair_fast_path:
  trigger:
    - critical expected script binding_evidence == missing
    - script_uuid_resolvable == false
  steps:
    - collect source script uuid and target script meta uuid
    - locate source prefab script component slots
    - build unique old_uuid -> target_uuid map
    - if deterministic: rewrite target prefab script uuid immediately
    - rescan target prefab and update prefab-static-check-cache.json
    - if still missing: stop business writes and return blocked/partial
  timing_step: prefab binding repair fast path
```

该 fast path 必须早于 `self-check/docs writeback`，并在 `migration-progress.json.completed_steps` 中记录。若 fast path 成功，后续第 7 步应 cache-first 复验；若失败且是确定 missing，阻塞 06 -> 07。


> missing/unknown 调和：`missing` 与 `unknown` 必须区分。关键 Prefab 脚本绑定确定 `missing`、目标脚本 `.meta` 缺失、或可确定断绑且 deterministic repair 失败时，必须阻塞 06 -> 07。若只是 `unknown`（脚本/meta 存在，但静态文本/CLI 无法证明绑定），且已执行 repair attempt、无唯一可安全改写位置、无 Missing Script 特征，则允许进入第 7 步 cache-first 复验，但必须设置 `final_status_max: partial-pass-static` 与 `status_cap: partial-pass-static`、`editor_prefab_binding_review_recommendation.must_not_run_automatically: true`，并不得声称支持 `static-pass`。

06 -> 07 流程图若出现 missing / broken 分支，必须显式标注：`missing / script_uuid_resolvable=false / deterministic broken -> prefab binding repair fast path`；若出现 unknown 分支，必须显式标注：`Allow 07 with final_status_max=partial-pass-static; editor review required`，不得只写模糊的 `partial cap`。


第 6 步不得把关键 Prefab 的脚本绑定问题留给第 7 步首次发现。`migration-applier` 在写入或刷新 `prefab-static-check-cache.json` 后，必须立即计算：

```yaml
prefab_script_binding_gate:
  critical_prefab_scope:
    - entry prefab
    - main panel prefab
    - list item prefab
    - confirmed core boundary 中 expected_scripts 非空的 prefab
  fail_signals:
    - expected_scripts[*].binding_evidence in [missing, unknown]
    - expected_scripts[*].meta_uuid is null
    - script_uuid_resolvable == false
    - serialized_script_field_hit == false AND full_uuid_hit == false AND short_uuid_hit == false AND compressed_uuid_hit == false
  pass_signals:
    - every critical expected script has binding_evidence in [direct, secondary]
    - unknown_or_missing_count == 0 for critical_prefab_scope
````

若出现 `fail_signals` 且属于关键 Prefab，本 agent 必须进入 `prefab_binding_repair_mode`，不得直接结束并让 controller 进入第 7 步。

`prefab_binding_repair_mode` 必须执行：

1. 读取源 Prefab、目标 Prefab、源脚本 `.meta`、目标脚本 `.meta`；
2. 建立 `old_script_uuid -> target_script_uuid` 映射；
3. 只有映射一一对应且 Prefab 与 expected script 关系唯一时，才允许文本级改绑；
4. 改绑后重扫目标 Prefab，更新 `prefab-static-check-cache.json`、`migration-progress.json`、`迁移状态摘要.compact.md` 和 phase-summary JSON；
5. 若重扫后关键 expected script 仍为 `missing/unknown`，必须返回 `execution_status: blocked | partial`、`blocks_next_phase: true`。

允许确定性自动修复的条件：

- 源 Prefab 中能定位旧脚本 uuid 或等价 serialized script 字段；
- 目标 TS 文件存在；
- 目标 TS `.meta` uuid 存在；
- old uuid -> target uuid 映射唯一；
- Prefab path 与 expected script 的职责关系唯一；
- 修复只影响本次迁移新增/复制的目标 Prefab。

禁止自动修复的条件：

- 同一旧 uuid 对应多个候选目标脚本；
- Prefab 内无可定位脚本组件槽位；
- 目标 Prefab 结构与源 Prefab 差异导致挂载位置不确定；
- 需要打开 Cocos 编辑器才能判断节点/组件语义；
- 修复会覆盖目标项目已有非本次迁移的手工 Prefab 结构。

禁止自动修复时，必须写：

```yaml
prefab_script_binding_preflight:
  status: fail | partial
  blocks_next_phase: true
  unknown_or_missing_count: <n>
repair_recommendations:
  - ...
editor_prefab_binding_review_recommendation:
  must_not_run_automatically: true
````

只有当关键 Prefab 的 expected scripts 全部达到 `direct` 或 `secondary`，或能证明 remaining unknown/missing 全部不属于 confirmed core boundary，才允许返回 `execution_status: completed` 并建议进入第 7 步。


跨项目迁移 Prefab 时，第 6 步不能只复制 `.prefab` / `.meta` 后等待第 7 步发现问题；`migration-applier` 必须在迁移动作阶段先做一次 Prefab UUID 闭合预检，尤其是 **prefab script binding preflight**，并尽量自动修复可确定的 L1 静态问题。

预检范围至少包括：

| 检查项 | 处理要求 |
|---|---|
| 脚本 `.meta` | 新增 TS 脚本必须有 `.meta`；若复制源 prefab 依赖源脚本 uuid，优先同步同名脚本 `.meta` 以保持 prefab 脚本 uuid 稳定。 |
| 脚本 uuid 映射 | 检查关键 prefab 内脚本 uuid 是否能映射到目标脚本 `.meta`；不能映射时优先补 `.meta` 或记录脚本绑定风险。 |
| 资源 uuid 映射 | 检查 prefab 内字体、材质、SpriteFrame、Atlas、子 prefab uuid 是否能映射到目标资源 `.meta`。 |
| 目标已有同职责资源 | 若目标已有同名/同职责资源（coin、head、公共字体、公共材质等），优先改绑 prefab 到目标资源 uuid。 |
| 目标缺失同职责资源 | 若目标没有等价资源，复制源资源及 `.meta`，保持源 uuid，使 prefab 静态引用闭合。 |
| 隐藏 unresolved | 修复显式 unresolved 后应再次回扫，避免遗漏 prefab 中的默认头像、coin、字体、材质等次级 uuid。 |

资源 UUID 策略必须写入 `06-迁移动作记录.md`：

| uuid / 资源 | 处理策略 | 目标落点 | 原因 |
|---|---|---|---|
| `<uuid>` | 改绑目标同职责资源 / 同步源资源并保持 uuid / 保留风险 | `assets/...` | 说明 |

若第 6 步已能确定并修复的 `.meta` 缺失、资源 uuid 不可解析、同职责资源改绑问题，不应留到最终验证才处理；第 7 步主要负责复验和发现遗漏。

脚本绑定预检必须对每个关键 Prefab 建立 `expected_scripts` 清单，来源包括源资源闭包、UIConfig/route、Prefab component index、代码闭包中的 Panel/Item/Component 职责层。每个 expected script 至少检查：

1. 目标 TS 文件是否存在；
2. 目标 TS `.meta` 是否存在且包含 uuid；
3. 目标 Prefab 文本中是否命中完整 uuid、短 uuid、compressed/短 id 或 Cocos 脚本序列化字段；
4. 是否出现 Missing Script / 空脚本引用 / 源项目旧 uuid 残留等特征；
5. 若使用 `cli-anything-cocoscreator asset uuid + asset refs`，是否直接证明脚本被目标 Prefab 引用。

处理策略：

- `direct` / `secondary` 证据充分：写入 `prefab-static-check-cache.json.expected_scripts[*].binding_evidence`，第 7 步可 cache-first 复验；
- `unknown`：只证明脚本 `.meta` 存在但不能证明 Prefab 绑定，必须写入 `repair_recommendations` 和 editor spot check 建议，最终最高 `partial-pass-static`；
- `missing`：关键脚本 `.meta` 缺失、Prefab 内无可证明绑定或命中 Missing Script 特征时，必须在第 6 步优先修复；若无法确定修复，不得声称迁移动作完成可进入 `static-pass`，应标记 `blocked-static` 风险或请求主控回派/确认。

确定性修复边界：

- 只有当旧 uuid、目标脚本、目标 `.meta` uuid、目标 Prefab 位置存在一一对应关系时，才允许文本级修复 Prefab 脚本 uuid；
- 若同一旧 uuid 可能对应多个目标脚本、或 Prefab 结构无法确认，禁止静默改写 Prefab，必须输出候选映射和 `must_not_run_automatically: true` 的人工编辑器复核建议；
- 不得自动打开 Cocos 编辑器；编辑器 spot check 只作为后续人工复核建议。

第 6 步结束前，`prefab-static-check-cache.json` 必须能回答“关键 Prefab 是否绑定到期望脚本”。若无法生成完整缓存，必须在 `06-迁移动作记录.md`、`迁移状态摘要.compact.md` 和 `agent_result` 中写明 `prefab_script_binding_preflight_status: partial | unavailable`、缺失 Prefab、缺失脚本和下一步修复建议。
若发现 Cocos 内置 / builtin-like unresolved 线索，第 6 步只记录为预检风险或缓存分类线索，不直接给最终通过结论。第 6 步只产出迁移动作事实和 `prefab-static-check-cache.json`，不直接合成 `static_status_breakdown` / `final_status_synthesis.downgrade_reasons`；但必须把入口视觉（第 7 步字段名为 `entry_visual_integration`）、公共 UUID、过渡资源和 builtin-like 相关风险结构化写入 compact，供第 7 步合成最终矩阵。


#### 6.z 返回 compact 必须包含脚本绑定预检摘要

`迁移状态摘要.compact.md` 和 `agent_result.key_outputs` 必须包含：

```yaml
prefab_script_binding_preflight:
  status: pass | partial | fail | unavailable
  checked_prefab_count:
  direct_or_secondary_count:
  unknown_or_missing_count:
  repair_recommendations_count:
  cache_path: prefab-static-check-cache.json
```

若 `unknown_or_missing_count > 0`，必须同步写 `repair_recommendations` 和 `editor_prefab_binding_review_recommendation.must_not_run_automatically: true`。

#### 6.z Timing 精确记录补充（硬规则）

##### 6.z.0 step timing split hard schema（性能优化 P0）

第 6 步必须真实拆分以下 timing step，不能只写总耗时或用 0/1 秒占位：

```yaml
required_timing_steps:
  - dry-run
  - code/import rewrite
  - resource/meta copy
  - config/event/protocol/SubGame integration
  - prefab uuid precheck/rebind
  - prefab binding repair fast path
  - self-check/docs writeback
```

每个 step 必须有 `step_start`、`step_end.duration_seconds`、`status`、`output_or_evidence`。若某 step 本轮无需执行，写 `status: skipped` 和原因。若总耗时 >=120 秒而上述 step 缺失或 duration 明显不覆盖 wall time，必须在 `迁移状态摘要.compact.md` 和 phase-summary JSON 写：

```yaml
timing_observability:
  step_granularity_insufficient: true
  missing_required_timing_steps: []
```

`self-check/docs writeback` 超过 180 秒时，必须 minimal-first 写 phase-summary/state compact 后返回，允许 controller helper 补长文档。


第 6 步是高成本写入阶段，必须遵守 Timing Bootstrap / Step / Close 协议。每个 `step_end.duration_seconds` 必须由该 step 的 start/end 时间计算；除非真实小于 1 秒，不得写 0。若无法取得精确 step 耗时，必须写 `timing_observability.unavailable_reason`，不得用 0 伪装成功记录。

即使 `timing_mode: standard`，migration-applier 也必须至少记录以下步骤边界：`dry-run`、`code/import rewrite`、`resource/meta copy`、`config/event/protocol/SubGame integration`、`prefab uuid precheck/rebind`、`self-check/docs writeback`。若总耗时超过 120 秒但这些步骤缺失或都记录为 0/1 秒，必须标记 `step_granularity_insufficient`。
