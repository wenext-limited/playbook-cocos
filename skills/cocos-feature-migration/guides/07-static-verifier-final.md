# 第 7 步：L1 静态验证、最终状态与最终输出

### 第 7 步：修复迁移后的路径与缺失问题

开始本步骤前：先读取 `迁移清单.md`、`06-迁移动作记录.md`、`migration-dry-run.json`、`migration-static-check.json` 和 `07-迁移验证.md`（如果存在）。若存在 `migration-static-check.json` 且状态 fresh，应优先读取其结构化 issue，再由 `static-verifier` 做语义层复核；若可用 ts-graph，应基于第 6 步 changed files 计算 blast radius，避免全量重验。

完成本步骤后：写回 `07-迁移验证.md`，并更新 `迁移清单.md` 中第 7 步状态。流程结束时，额外生成或更新 `迁移总结.md` 作为跨对话恢复入口；随后必须读取 `USAGE_MONITORING.md` 并生成或更新 `使用效果监控.md`，记录本次 skill 使用效果、评分、证据路径、问题与优化建议。

#### 7.0 cache-first 加速门禁（硬规则）

`static-verifier` 在执行任何资源 / Prefab CLI 验证前，必须先读取以下结构化产物（若存在）：

```text
migration-dry-run.json
prefab-static-check-cache.json
migration-static-check.json
logs/asset-deps-summary.json
logs/script-uuid-refs-summary.json
.cocos-migration-cache/uuid-reverse-index.json 或 logs/cache/uuid-reverse-index.json
builtin-like-unresolved-allowlist.json
```

判定规则：

1. 若 `prefab-static-check-cache.json` fresh，且 target commit、关键 prefab hash、meta hash、resource rebind plan、`migration-dry-run.json` hash 均未变化，必须复用该缓存，不得重复执行完整 `asset deps` / `asset refs`。
2. 若只有部分 prefab stale / missing / unknown，只允许对这些 prefab 调用 CLI；fresh prefab 直接复用缓存。
3. 若缓存缺失、stale 或字段不足，才降级为常规 CLI 验证，并在 `migration-static-check.json` 与 `使用效果监控.md` 中记录 `execution_gap.prefab_static_cache_miss` 或 `execution_gap.prefab_static_cache_stale`。
4. 对 `file=None` unresolved，必须先查 builtin-like 映射和 allowlist；命中后直接标为 `review-required`，不重复深挖已知项，但仍输出人工编辑器复核建议。
5. 若能够通过 prefab 文本 UUID 扫描 + `.meta` uuid reverse index 证明业务资源和脚本绑定闭合，优先使用该 fast path；只有 fast path 不能分类时才调用 CLI。
6. CLI 调用必须按需、限量；同一 prefab 在同一轮不得重复跑 deps/refs。若工具和缓存并发安全已知，可对 stale prefab 并行执行；否则最多小并发或串行，并记录原因。

该规则只优化验证速度，不降低验证口径：缓存不能跳过待确认项回扫、职责级验证、保真验证或最终状态矩阵。

迁移完成后默认只做 **L1 静态结构验证 + `cli-anything-cocoscreator` 资源依赖验证**，重点检查：

1. import 路径对应的文件是否存在、符号名是否明显闭合（TS/JS 优先用 ts-graph review context / blast radius 缩小范围）
2. Prefab 绑定脚本是否存在丢失或 uuid 无法解析（优先用 `cli-anything-cocoscreator asset uuid + asset refs` 或资源索引）
3. 动态加载路径是否能在目标项目找到对应资源或有明确 fallback
4. 枚举 / 常量 / UI ID 是否已注册
5. 本地化 key 是否缺失或需人工补齐
6. 协议字段 / DTO / request class 是否存在
7. 目标项目是否存在同名类/资源冲突
8. 关键 prefab 的 `asset deps` 是否 `missing=0` 或 unresolved_count=0

默认**不运行也不探测**：

```bash
# 默认禁止
tsc / npx tsc / node_modules/.bin/tsc
cocos
npm run build / npm run typecheck / lint
```

验证命令与阶段边界要求：

- **默认静态迁移交付流程（第 1~7 步）**只执行到 L1：import 路径、Prefab 依赖 `asset deps`、脚本 uuid / refs、动态资源路径、UIConfig、i18n key、协议字段、同名冲突、职责级静态等价和保真静态检查。
- 默认不要执行 TypeScript / lint / Cocos build / npm build，也不要检查这些命令是否存在；这不是默认静态迁移交付流程的一部分。
- 默认不要打开 Cocos 编辑器，也不要把编辑器脚本绑定确认、真实点击入口、接口回包或语言加载验证混入第 1~7 步；这些只可作为人工复核风险说明，不属于本 skill 阶段。
- 当第 7 步完成 L1 静态验证，并写回 `07-迁移验证.md`、`最终状态摘要.compact.md`、`迁移总结.md`、`使用效果监控.md` 后，默认静态迁移交付流程即收敛结束，应输出最终状态。
- 编译、编辑器装配和运行态功能复核不作为本 skill 的阶段。
- 若用户明确要求编译、编辑器或运行态人工复核，应作为单独人工复核需求记录；命令不可用时不得擅自安装依赖，必须如实记录失败原因。
- 对 `asset refs` 查不到脚本反向引用但代码运行时依赖该脚本的情况，仍需先按“脚本绑定次级静态证据”规则补证；补证仍失败时，应在 L1 结论中标为“需人工编辑器复核确认的风险”，而不是把默认流程继续悬挂到打开编辑器。

##### Prefab deps unresolved 判定规则（必做）

第 7 步使用 `cli-anything-cocoscreator asset deps` 后，不能只按 unresolved 数量机械判定通过或阻塞，必须分类记录：

| unresolved 类型 | 判定 | 处理 |
|---|---|---|
| 关键业务资源缺失，能映射到源功能 prefab / texture / font / material / config / child prefab | L1 阻塞 | 标记 `blocked-static` 或回派修复 |
| 脚本组件 uuid 无法解析，且无法用次级静态证据证明绑定 | L1 阻塞或高风险 | 回派修复或标记需人工编辑器复核 |
| `file=None`，关键业务资源均已解析，形态疑似 Cocos 引擎内建资源 / built-in material / internal asset | 非阻塞 note | 记录 unresolved 数量和日志路径；最终状态最多谨慎为 `static-pass` / `partial-pass-static`，并要求人工编辑器复核 |
| 命中已知 Cocos builtin-like UUID 内置映射 | 非阻塞 note | 写入映射来源、uuid、builtin 路径；仍纳入 editor review 摘要 |
| 无法判断来源的 unresolved | 风险 | 继续追 uuid；追不到时标记 `partial-pass-static`，不得宣称 completed |

内置 builtin-like UUID 映射缓存（可直接用于分类，但必须记录证据）：

| UUID | builtin-like 资源 |
|---|---|
| `20835ba4-6145-4fbc-a58a-051ce700aa3e` | `db://internal/default_ui/default_btn_normal.png` |
| `544e49d6-3f05-4fa8-9a9e-091f98fc2ce8` | `db://internal/default_ui/default_btn_pressed.png` |
| `951249e0-9f16-456d-8b85-a6ca954da16b` | `db://internal/default_ui/default_btn_disabled.png` |

命中 builtin-like 映射时仍需满足：关键业务资源 `missing=0`，脚本绑定有直接或次级静态证据，且 unresolved 不包含可映射到源功能资源路径的业务文件名。

`file=None` unresolved 只有同时满足以下条件时，才可作为非阻塞 note：

1. 关键业务 prefab、贴图、字体、材质、子 prefab、脚本组件都已解析或有次级静态证据；
2. unresolved 输出没有可映射到源功能资源路径的业务文件名；
3. 同类 unresolved 更像 Cocos 内建资源、默认材质、builtin texture 或内部占位引用；
4. 已在 `07-迁移验证.md`、`迁移总结.md` 和 `使用效果监控.md` 中记录，并提示人工编辑器复核。

##### 入口视觉接入检查（必做）

第 7 步必须把“入口逻辑闭合”和“入口视觉正式接入”分开验证，避免只证明 route / click handler 存在却遗漏用户可见入口资源。

建议输出：

| 检查项 | 结果 | 证据 | 风险 |
|---|---|---|---|
| 是否存在目标侧可见入口 | 是 / 否 |  |  |
| 是否符合用户确认的入口语义 | 是 / 否 |  |  |
| 是否未替换目标原有入口语义 | 是 / 否 |  |  |
| 入口文案 key 是否完整 | 是 / 否 |  |  |
| 入口 icon 是否为正式资源 | 是 / 否 |  |  |
| click handler / localOpenUI / route 是否闭合 | 是 / 否 |  |  |
| 是否仍存在 placeholder / TODO / 空 iconUrl | 是 / 否 |  |  |

判定要求：

- 若入口 icon / 视觉资源仍为占位，不得判定为 `static-pass`，最终状态最高只能为 `partial-pass-static`。
- 若入口逻辑存在但文案 key、icon、点击链任一项缺证，必须在 `07-迁移验证.md`、`迁移总结.md`、`使用效果监控.md` 中记录为剩余风险。
- 若新增入口会替换目标原有入口语义，但没有用户确认或 `target-existing` 证据，应作为入口语义待确认项回扫，最终状态不得为 `static-pass`。

##### 公共资源 UUID 改绑审计（必做）

第 7 步必须对 Prefab 中涉及的公共资源 UUID 进行独立审计，不能只依赖 deps 未报 missing 作为完整闭合证据。

建议输出：

| 类型 | 源资源 | 源 UUID | 目标资源 | 目标 UUID | 处理策略 | 证据 | 风险 |
|---|---|---|---|---|---|---|---|
| 字体 |  |  |  |  | copy / reuse / rebind |  |  |
| 材质 |  |  |  |  | copy / reuse / rebind |  |  |
| SpriteFrame |  |  |  |  | copy / reuse / rebind |  |  |
| coin 图标 |  |  |  |  | copy / reuse / rebind |  |  |
| 默认头像 |  |  |  |  | copy / reuse / rebind |  |  |
| 子 prefab |  |  |  |  | copy / reuse / rebind |  |  |
| builtin-like 资源 |  |  |  |  | ignore / editor-review |  |  |

Prefab deps 中存在 unresolved `file=None` 时，必须分类为：

1. `builtin-like`：疑似 Cocos 内置资源，可进入 `partial-pass-static` 或谨慎 `static-pass`，但必须建议人工编辑器复核；
2. `missing-business-resource`：业务资源缺失，必须判定为 `blocked-static`；
3. `unknown`：无法确认来源，最高只能为 `partial-pass-static`，并列入人工编辑器复核项。

若公共资源 UUID 改绑未完成全量审计：

- 不得判定为 `static-pass`。
- 必须在最终报告中说明“未发现业务资源缺失，但 UUID 改绑完整性仍需人工编辑器复核”。

##### L1 静态状态分解矩阵（必做）

第 7 步除了输出总状态 `static-pass` / `partial-pass-static` / `blocked-static`，还必须输出维度级状态，说明 partial 或 blocked 具体来自哪里：

```yaml
static_status_breakdown:
  code_import_symbol: pass | partial | fail | not_checked
  ui_config_event_protocol: pass | partial | fail | not_checked
  asset_deps_business_missing: pass | partial | fail | not_checked
  prefab_script_binding: pass | partial | fail | not_checked
  public_uuid_rebind: pass | partial | fail | not_checked
  builtin_like_unresolved: pass | review-required | fail | not_present
  dynamic_resource_paths: pass | partial | fail | not_checked
  responsibility_equivalence: pass | partial-pass-static | fail | not_checked
  fidelity: pass | partial | fail | not_checked
final_status_synthesis:
  final_status: static-pass | partial-pass-static | blocked-static
  downgrade_reasons:
    - prefab_script_binding_partial
    - public_uuid_rebind_partial
    - builtin_like_unresolved_review_required
```

`迁移总结.md` 和 `使用效果监控.md` 必须引用该矩阵；不得只写一个笼统的 `partial-pass-static`。

第 7 步之后默认最终状态只允许 `static-pass`、`partial-pass-static`、`blocked-static`。`completed`、`partial`、`blocked`、`abandoned` 仅用于用户另行要求的编译/编辑器/运行态人工复核扩展阶段或非默认流程。

##### 最终状态判定矩阵（必做）

第 7 步推荐最终状态时，必须按当前已执行验证等级和以下矩阵降级，不能因 L1 大部分通过就直接给 `static-pass`。

| 条件 | static-pass | partial-pass-static | blocked-static |
|---|---|---|---|
| TS import / symbol 静态闭合 | 必须通过 | 必须通过 | 失败 |
| UIConfig / UIID 注册 | 必须通过 | 必须通过 | 失败 |
| 关键 DTO / enum / event | 必须通过 | 必须通过 | 失败 |
| Prefab 业务资源 deps | unresolved=0 或仅有充分分类的非阻塞 note | 无业务资源缺失，但存在 builtin-like / unknown / 未全量审计 | 存在业务资源缺失 |
| 公共资源 UUID 改绑 | 有完整审计证据 | 有部分证据，但需 编辑器复核 复核 | 缺失导致 prefab 引用不可用 |
| 入口可见性 | 正式入口完整 | 有入口但 icon / 视觉 / 文案存在收尾风险 | 无入口或点击链缺失 |
| 配置 / KV / native 链 | 静态链完整且 fallback 明确 | 静态链存在，但缺运行态证明 | 静态链缺失 |
| 用户确认项 | 0 open | 0 open | 存在 open blocker |
| 编译、编辑器、运行态人工复核 | 不要求 | 不要求 | 不因未执行而 blocked |

##### 脚本绑定次级静态证据规则（必做）

当 `asset refs <script_uuid>` 未直接命中 prefab，但代码运行时依赖该脚本或源闭包显示该脚本应绑定在 prefab 上时，必须按以下顺序补证：

1. 读取脚本 `.meta`，记录完整 uuid；
2. 在目标 prefab 文本中搜索完整 uuid、短 uuid 前缀或 Cocos 序列化中的压缩/短 id；
3. 检查 prefab component 片段中是否存在脚本引用字段（如 `__type__`、`script`、`_script` 或同版本 Cocos 的脚本组件序列化字段）；
4. 若命中，可在 L1 中判定为“脚本挂载存在次级静态证据”，但必须注明仍需人工编辑器复核 Inspector 绑定；
5. 若完全未命中，标记为脚本绑定风险；关键脚本缺绑定时不得给 `static-pass`。

如果没有标准命令，也应通过静态检查给出未完成项。

##### Prefab Binding Review（人工复核建议模板）

当 L1 只能给出 `partial-pass-static`，且降级原因包含脚本绑定、Inspector 引用、节点拖拽引用或公共 UUID 改绑无法静态证明时，skill 应把后续建议标准化为 `prefab-binding-review`，而不是笼统写“打开编辑器看看”。

触发条件：

- `script_uuid_refs_result: partial`；
- 关键 prefab 的脚本 `.meta` uuid 存在，但 prefab 文本中缺少直接或次级静态绑定证据；
- `asset deps` 无业务资源缺失，但存在 builtin-like / unknown unresolved 需要编辑器导入态确认；
- public UUID rebind 为 `partial-pass` 或 `review-required`；
- 用户明确要求 人工编辑器装配复核。

验证范围模板：

```yaml
prefab_binding_review:
  target_prefabs:
    - prefab_path:
      expected_script:
      expected_script_meta_uuid:
      l1_evidence:
      editor_check_items:
        - Cocos 编辑器中组件脚本是否正常显示而非 Missing Script
        - Inspector 上节点拖拽引用是否完整
        - Prefab 子节点 / SpriteFrame / Font / Material 引用是否正常
        - builtin-like unresolved 是否为正常内建资源
  public_uuid_rebind_review:
    fonts: pass | partial-pass | failed | not_checked
    materials: pass | partial-pass | failed | not_checked
    default_avatars: pass | partial-pass | failed | not_checked
  result:
    editor_review_status: review-pass | review-partial | review-blocked | not_run
    blocking_issues:
    repair_recommendations:
```

执行边界：

- `prefab-binding-review` 是默认第 1~7 步之后的人工复核，不得在用户未要求时自动运行 Cocos 编辑器或构建命令。
- 人工编辑器复核发现需要修改目标业务代码 / prefab / meta 时，仍必须回派 `migration-applier` 或由用户明确授权的写入流程处理；验证 agent 自身不得直接修改目标业务资源。
- 人工编辑器复核结果必须追加写入 `07-迁移验证.md`、`迁移总结.md` 和 `使用效果监控.md`，并将最终状态从 `partial-pass-static` 细化为 `editor-pass` / `editor-partial` / `editor-blocked`，但不得回写为“运行态通过”。

#### 7.w 待确认项回扫（必做）

生成最终状态、`迁移总结.md` 和 `使用效果监控.md` 前，必须回扫以下文件：

- 源侧 `源分析清单.md`
- 源侧 `02-源入口候选.md`
- 源侧 `源侧摘要.compact.md`
- 目标侧 `迁移清单.md`
- `05-目标差异分析.md`
- `06-迁移动作记录.md`
- `07-迁移验证.md`（如已有旧稿）

若任一文件中存在未关闭的以下信号，最终 `迁移清单.md` 不得写 `needs_user_confirmation: false`：

- `needs_user_confirmation: true`
- `confirmation_topic`
- `待确认`
- `等待用户确认`
- `产品确认`
- `边界不清`
- `入口语义风险`
- `pending_product_confirmation`
- `entry-semantics`
- `feature-boundary`
- `target-feature-branch`

必须将这些项合并写入最终 manifest：

```text
needs_user_confirmation: true
confirmation_topic: <topic-list>
pending_confirmations:
- <具体待确认项、来源文件、影响>
```

只有当每个待确认项都有用户明确答复，或有 `target-existing` / `user-specified` / `backend-doc` 等证据关闭，才能置为 `false`。存在未关闭待确认项时，最终状态最多为 `partial-pass-static` / `blocked-static` / `partial`，不得给 `completed`；若待确认项影响入口边界或目标分支归属，不得给 `static-pass`。

#### 7.0.x `migration-static-check.json` 标准 schema（推荐且第 7 步默认写入）

第 7 步在写入 `07-迁移验证.md` 与 `最终状态摘要.compact.md` 的同时，应尽量写入机器可读的静态检查结果：

```text
<target_migration_dir>/migration-static-check.json
```

该文件用于支持第 7 步重跑、回派修复后的局部复核，以及 final-report-writer 聚合 L1 矩阵。若因工具不可用或时间不足未生成，`07-迁移验证.md` 与 `使用效果监控.md` 必须记录 `execution_gap.migration_static_check_missing`，但不得因此自动阻塞默认 L1 流程。

最低 schema：

```json
{
  "version": 1,
  "feature_slug": "jackpot_rank",
  "generated_at": "YYYY-MM-DD HH:mm:ss",
  "highest_verification_level": "L1",
  "final_status_recommendation": "static-pass | partial-pass-static | blocked-static",
  "import_symbol": {
    "status": "pass | partial | fail | not_checked",
    "missing_symbols": [],
    "evidence_paths": []
  },
  "ui_config_event_protocol": {
    "status": "pass | partial | fail | not_checked",
    "missing": [],
    "evidence_paths": []
  },
  "prefab_static_cache": {
    "status": "fresh | partial | stale | missing | unavailable",
    "path": "prefab-static-check-cache.json",
    "reused_prefab_count": 0,
    "cli_rerun_prefab_count": 0,
    "invalidation_reasons": []
  },
  "asset_deps": {
    "status": "pass | partial | fail | not_checked",
    "business_missing_count": 0,
    "unresolved": [
      {
        "uuid": "",
        "occurrences": 0,
        "classification": "builtin-like | target-public-resource | source-private-resource | missing-business-resource | unknown",
        "blocks_static_pass": false,
        "editor_review_required": true,
        "evidence": ""
      }
    ],
    "evidence_paths": []
  },
  "prefab_script_binding": {
    "status": "pass | partial | fail | not_checked",
    "target_prefabs": [],
    "evidence_paths": []
  },
  "public_uuid_rebind": {
    "status": "pass | partial | fail | not_checked",
    "review_required": [],
    "evidence_paths": []
  },
  "entrance_visual": {
    "status": "pass | partial | fail | not_checked",
    "visible_entry": true,
    "original_entry_not_replaced": true,
    "placeholder_or_empty_icon": false,
    "evidence_paths": []
  },
  "responsibility_equivalence": {
    "status": "pass | partial-pass-static | fail | not_checked",
    "missing_layers": [],
    "partial_layers": [],
    "evidence_paths": []
  },
  "fidelity": {
    "status": "pass | partial | fail | not_checked",
    "runtime_review_required": [],
    "open_confirmations": [],
    "evidence_paths": []
  },
  "repair_recommendations": []
}
```

final-report-writer 应优先读取该 JSON 生成 L1 静态状态分解矩阵；若 JSON 与 `最终状态摘要.compact.md` 冲突，以更保守状态为准，并在 `使用效果监控.md` 的 Compact / static-check 质量中记录冲突。


建议按以下分级记录：

- **L1：静态结构验证（默认最高验证等级）**
  - import 路径与符号存在性
  - 资源路径
  - UIConfig / 常量 / i18n / 协议字段
  - Prefab 依赖 `asset deps`，必须记录 missing / unresolved 结论
  - 脚本 `uuid + refs`
  - 关键文件自检结果（如 DTO/enum/方法名实际存在）

要求：

- `07-迁移验证.md`、`迁移总结.md` 和最终回复中都应声明本次达到的最高验证等级。
- 默认静态迁移交付流程的最高验证等级为 L1；若未执行编译、编辑器或运行态人工复核，不得把结果表述为“编译通过”“编辑器可用”或“运行可用”。
- **最终状态应对应当前已执行流程的交付边界。** 第 7 步完成后，如果 L1 静态结构已闭合，应输出 `static-pass` 或 `partial-pass-static` 等静态状态，并明确“默认静态迁移交付流程已结束”；如果 L1 仍有阻塞，应输出 `blocked-static`，同样说明默认流程已在阻塞状态收敛。
- **后续人工复核建议应单独成段。** 编辑器/运行态复核风险要写成“后续人工复核建议”，不得写成“下一步继续打开编辑器/继续运行态验证”导致用户误以为第 1~7 步尚未完成。
- 若用户在默认交付结束后明确要求编译、编辑器或运行态人工复核，应作为单独需求记录范围和结果。
- 若仅做到 L1 或编译检查，则凡是需要 编辑器复核 / 运行态复核 才能确认的结论，必须降级表述，不得直接宣称“已完整可用”。
- 若关键完成项只完成了低等级验证，应优先标记为 `static-pass`、`partial-pass-static`、`blocked-static` 或传统 `partial`，并在风险项中明确说明。

建议输出：

| 验证等级 | 是否完成 | 证据 | 说明 |
|---|---|---|---|
| L1 | 是/否 | `07-迁移验证.md` 相关段落 |  |

#### 7.x 重复资源审计与过渡目录清理（必做）

若迁移过程中引入了 `rank_deps/`、`migrated_deps/` 或其他隔离依赖目录，验证阶段必须额外执行**重复资源审计**。

审计目标：

1. 检查隔离目录中的资源，是否与目标项目原生目录存在同名资源；
2. 判断这些资源是否属于同职责资源（例如 coin、head、font、material、common texture 等目标项目本已存在的公共资源）；
3. 若目标项目原生资源已存在且可复用，应优先将 Prefab / 资源引用切回目标原生资源；
4. 对仍保留在隔离目录中的重复资源，必须在 `07-迁移验证.md`、`迁移总结.md` 中列为待清理项，不得默认为最终方案。

建议输出：

| 隔离目录资源 | 目标原生资源 | 是否同名 | 是否同职责 | 当前处理 | 后续动作 |
|---|---|---|---|---|---|
| `rank_deps/...` | `assets/...` | 是/否 | 是/否 | 保留 / 回切 / 待确认 | 清理 / 保留 / 人工确认 |

判定要求：

- 若只是为了保住 Prefab 静态 uuid 引用而复制了目标项目本已存在的等价资源，该情况应视为**过渡性重复资源**。
- 过渡性重复资源不应在最终结论中被当作“正式新增资源”。
- 如果存在大量同名同职责重复资源，但未在验证与总结中标出，应视为迁移收尾不完整。

#### 7.y 职责级验证与完成判定（必做）

除静态检查（import、Prefab、资源路径、UIConfig、i18n、协议等）外，还必须执行**职责级验证**。

职责级验证不是检查“文件是否存在”，而是检查：

- 源项目中的关键职责层，目标项目是否逐项保留；
- 是否存在职责被削减、初始化链路断裂、事件链缺失、配置链未接回、入口只剩跳转但不再承担原有展示职责等情况。

建议输出：

| 验证项 | 检查方式 | 结果 | 说明 |
|---|---|---|---|
| 关键职责层是否全部存在 | 对照第 3 步职责层表 | 通过 / 不通过 / 部分通过 |  |
| 关键职责层是否职责等价 | 对照第 5 步职责差异表 | 通过 / 不通过 / 部分通过 |  |
| 是否存在初始化链路断点 | 检查 init / preload / register / event bind | 是/否 |  |
| 是否存在事件链缺失 | 检查 event enum、dispatch、listener | 是/否 |  |
| 是否存在配置链缺失 | 检查 UIConfig / 常量 / i18n / feature switch | 是/否 |  |
| 是否存在“主资源已迁、关键职责未迁” | 结合代码和资源综合判断 | 是/否 |  |

完成判定要求：

- **默认不得标记为 `completed`；只有用户另行定义完成标准且人工复核证据满足该标准时，才能标记为 `completed`。**
- 默认快速静态策略下，若 L1 静态结构闭合且关键职责层静态等价，可标记为 `static-pass`，不得标记为 `completed`。
- 若主要代码和资源已迁入，但存在一个或多个关键职责层缺失、削减、fallback、运行配置链未验证或需业务确认，应标记为 `partial-pass-static` 或 `partial`，不得标记为 `completed`。
- 若 L1 静态验证仍有阻塞（如关键类型缺失、Prefab missing > 0、关键资源缺失），应标记为 `blocked-static` 或 `blocked`。
- 若 L1 asset deps、import、DTO、UIConfig、Event、动态资源路径已闭合，但脚本绑定只能证明 `.meta` 存在、缺少 prefab 文本直证或编辑器导入态铁证，且需要人工编辑器复核确认，应标记为 `partial-pass-static`；同时明确默认静态迁移交付流程已结束，不得把状态写成“等待打开编辑器后才结束”。
- 若 L1 静态结构闭合、关键职责层静态等价、脚本绑定有 `uuid + refs` 或次级静态证据支持，且无未关闭业务确认项，可标记为 `static-pass`；未执行编辑器/运行态复核 只作为人工复核建议，不自动降级。
- 在 `迁移总结.md` 和 `使用效果监控.md` 中，必须显式报告职责级验证结论，不能只报告静态验证结果。

#### 7.z 保真验证与问题分类（必做）

最终验证必须额外执行迁移保真验证，不能只检查 import、Prefab 和资源是否闭合。

必须复核：

1. API path 是否与源项目一致；若不一致，是否有 `target-existing` / `user-specified` / `backend-doc` 证据；
2. native / KV / config / gating 链是否按源项目迁入，或目标等价链是否有证据；
3. appName / platform / old-new-interface 等分支是否保留，或是否有明确业务裁剪依据；
4. request 参数是否从动态值变为空值、`0`、默认值或固定值；
5. event producer-consumer 闭环是否完整；
6. `activityType` / `businessType` / `taskType` / `taskData` 是否被改写；
7. 源项目关键职责层是否被简化为无条件打开、默认值、空参数或只保留主 UI。

`07-迁移验证.md` 和 `迁移总结.md` 必须按以下分类输出问题：

| 分类 | 定义 |
|---|---|
| 确定问题 | 源项目存在，目标项目缺失或错迁，且无业务适配证据 |
| 高风险可疑 | 源项目与目标项目不同，但可能有业务适配，需要用户或后端确认 |
| 合理业务适配 | 目标项目已有明确上下文、用户要求或文档支持该差异 |
| 参考项目差异 | 参考项目有但源项目没有，不能作为本次迁移错误 |

若存在未经确认的 API path 改写、接口分支硬编码、native/KV/gating 缺失、请求参数空心化或事件闭环缺失，最终状态不得为 `static-pass` / `completed`；应标记为 `partial-pass-static`、`blocked-static` 或 `partial`，并明确待确认项。

---



以下输出要求只适用于“最终输出触发条件”已经满足的情况。不得因为完成了第 1 步、第 2 步或其他中间步骤，就提前套用最终输出格式并停止流程。

执行此 skill 后，最终输出必须包含：

### 0. 使用效果监控输出

每次真实执行迁移流程后，最终回复必须报告：

- 是否已生成 `使用效果监控.md`
- 监控记录路径
- 本次 skill 使用总评分
- 本次流程状态：`static-pass` / `partial-pass-static` / `blocked-static` / `completed` / `blocked` / `partial` / `abandoned`
- 主要扣分项或风险项
- 是否建议更新 `SKILL.md`，并区分 `rule_gap` / `execution_gap` / `tooling_gap`
- **流程收敛状态**：当前是否还有后台 agent、是否还有等待用户确认项、默认静态迁移交付流程是否已经结束、是否已执行 commit/PR。

示例：

```text
监控记录已输出：<target-project>/.claude/cocos-feature-migration/migrations/<feature-slug>/使用效果监控.md
本次 skill 使用评分：82/100
流程状态：blocked
主要扣分项：资源闭包尚未执行，原因是等待用户确认精确入口。
是否建议更新 SKILL.md：partial
- rule_gap: []
- execution_gap: ["agent 未按要求返回 compact"]
- tooling_gap: ["需要 prefab/uuid reverse index"]
```

如果本次只是咨询、测试或缺少目标项目路径导致无法生成项目级监控文件，必须说明：

```text
本次未生成 使用效果监控.md：原因是未进入真实迁移流程 / 缺少目标项目路径。
```

### 1. 迁移摘要

- 源项目路径
- 目标项目路径
- 功能名
- 入口文件
- 迁移文件数
- 新增资源数
- 复用目标项目能力列表

### 2. 代码迁移清单

逐项列出：新增 / 复用 / 适配 / 未迁移。

### 3. 资源迁移清单

逐项列出：已存在 / 新增 / 改路径 / 待人工确认。

### 4. 职责等价性摘要

必须总结：

- 源功能识别出了哪些关键职责层
- 目标项目已完整保留了哪些职责层
- 哪些职责层仅部分保留
- 哪些职责层缺失
- 最终状态为什么是 `static-pass` / `partial-pass-static` / `blocked-static` / `completed` / `partial` / `blocked`

建议格式：

| 职责层 | 结果 | 说明 |
|---|---|---|
| 触发层 | 完整 / 部分 / 缺失 |  |
| 展示层 | 完整 / 部分 / 缺失 |  |
| 数据层 | 完整 / 部分 / 缺失 |  |
| 事件层 | 完整 / 部分 / 缺失 |  |
| 配置层 | 完整 / 部分 / 缺失 |  |

### 5. Agent 回传、团队 shutdown 与历史确认去噪（最终收口必做）

- final-report-writer 必须检查是否存在 `agent_result_missing` / `completed_with_agent_output_missing`，并写入 `使用效果监控.md` 的 Agent 协作风险。
- 若本轮创建了 team，最终报告完成后主控应向所有仍活跃 agent 发送 shutdown request；等待一轮 shutdown_response。未响应者写入 `pending_agent_shutdowns`，但不得阻塞默认静态交付流程。
- 若工具允许且所有成员已关闭，可执行 TeamDelete 清理团队；若仍有 idle 通知，最终只记录一次，不反复向用户解释。
- 关闭后的确认项必须进入 `closed_confirmations` / `confirmation_history`，并标注 `historical_only: true`。最终回扫只把结构化 `status: open` 或无关闭证据的疑似项视为 open。
- final-report-writer 必须二次更新自身 timing，避免 `使用效果监控.md` 中 final-report-writer 长期显示 running；失败时记录 `execution_gap.final_report_self_timing_not_finalized`。

### 6. 流程收敛与人工复核说明

最终回复必须把“默认静态迁移交付流程”和“后续人工复核建议”分开说明：

- 若第 7 步 L1 静态验证、`迁移总结.md`、`最终状态摘要.compact.md`、`使用效果监控.md` 已完成，应明确写：`本轮 cocos-feature-migration 默认静态迁移交付流程已结束。`
- 若最终状态是 `static-pass` / `partial-pass-static` / `blocked-static`，应说明这是第 1~7 步默认交付流程的最终状态，不需要等待 编辑器/运行态复核 后才算本轮结束。
- 人工编辑器装配复核、人工运行态复核、打开 Cocos 编辑器、真实点击入口、接口回包验证、语言加载验证，应放在“后续人工复核建议”中，不要写成第 1~7 步默认流程的下一步或未完成步骤。
- 最终报告应单独列出默认流程内结论和人工复核项，建议格式：

```md
## 默认流程内结论

- 默认第 1~7 步是否完成：是 / 否
- 最高验证等级：L1
- L1 静态结构验证结果：
- open confirmation 数量：
- 最终状态：

## 后续人工复核建议

| 项目 | 建议 |
|---|---|
```

- 最终回复必须明确列出：
  - 后台 agent：无 / 仍在运行（列名称）；
  - 等待用户确认项：无 / 有（列主题）；
  - 默认静态迁移交付流程：已结束 / 阻塞收敛 / 未完成；
  - 提交状态：未提交 / 已提交 commit / 已创建 PR。
- 若后台 agent 为无、等待确认项为无、`迁移总结.md` 和 `使用效果监控.md` 已写回，应直说“当前工作已结束”，避免只给验证等级导致用户无法判断工作是否收尾。

---
