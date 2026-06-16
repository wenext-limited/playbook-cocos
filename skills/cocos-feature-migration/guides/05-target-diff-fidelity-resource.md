# 第 5 步：目标差异、保真风险与资源计划

### 第 5 步：在目标项目构建图谱并做差异分析

开始本步骤前：先读取 `迁移清单.md`、`源侧摘要.compact.md`、`03-源代码闭包.md`、`04-源资源闭包.md` 以及第 5 步私有产物（如果存在）。

第 5 步采用**私有产物 + 单点合并 + 默认两段式 DAG**模式，避免多个 agent 并发覆盖同一最终文件，也避免 05b/05c 等待尚未生成的 `05-目标差异分析.md`。

默认 DAG：

```text
05a target-capability-analyzer
  -> 05b fidelity-risk-analyzer
  -> 05c resource-migration-planner
05b 与 05c 在 05a 完成后并行
主控最后合并 05a/05b/05c -> 05-目标差异分析.md / 目标差异摘要.compact.md
```

硬规则：

- `05a` 是目标侧第一步，产出目标能力私有产物。
- `05b` / `05c` 默认必须等 `05a-目标能力分析.md` 或 `目标能力摘要.compact.md` 生成后再启动。
- `05b` / `05c` 可以互相并行，但不得互相等待。
- `05b` / `05c` 不得等待、读取为必需项、或要求预先存在 `05-目标差异分析.md` / `目标差异摘要.compact.md`；这两个最终文件由主控在三份私有产物之后合并生成。
- 只有当主控已经生成 fresh `05x-target-shared-search.compact.json`，并在 phase packet 明确写入 `allow_05b_05c_without_05a: true` 时，才允许 05b/05c 与 05a 并行；此时 05b/05c 也只能读取 shared-search 包和源侧产物，不得等待 05a 或最终 05 文件。


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
  "common_capability_hits": []
}
```

该文件只记录高价值命中：request / native / event / KV / i18n / prefab / resource dirs / UI common / activity gating 等路径、行号、少量摘要和证据路径。三个第 5 步 agent 必须优先读取该共享包，避免重复全局搜索；但它不能替代各 agent 的私有深查和风险判断。若未生成，主控必须在 `controller-event-log.jsonl` 和最终 `使用效果监控.md` 记录原因与影响；agent 只能按需补充缺口搜索，不得重复展开全量目标搜索。


加速要求：主控生成 shared search 时，应同步写入或刷新 `target-capability-index.json`（优先 `<target_migration_dir>/.cocos-migration-cache/target-capability-index.json`，fallback `<target_migration_dir>/logs/cache/target-capability-index.json`）。05a/05b/05c 必须在 compact 中记录：

```yaml
shared_search_bundle_status: fresh | stale | missing | unavailable
target_capability_index_status: fresh | stale | missing | unavailable
duplicate_search_avoided: number
fallback_search_reason: null | string
```

05b/05c 若发现需要搜索 05a 已覆盖的 API / event / i18n / prefab / resource / common capability，必须先说明 shared/index 证据不足原因；不得为了“更放心”重复全量搜索。

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
