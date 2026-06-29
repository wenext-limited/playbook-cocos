# 第 2 步：源入口定位、功能边界与完成定义

### 第 2 步：在源项目构建代码图谱

开始本步骤前：先读取源项目 `源分析清单.md` 和 `02-源入口候选.md`（如果存在）。若候选入口分析仍可复用，则直接基于已有结果继续；不要无条件重跑搜索。

完成本步骤后：写回源项目 `02-源入口候选.md`，并更新源项目 `源分析清单.md` 中第 2 步状态。若候选入口超过 1 个，必须在 `源分析清单.md` 中写入 `needs_user_confirmation: true`、`confirmation_topic: exact-entry` 与候选列表摘要。

确认 ts-graph MCP 可用后，在源项目根目录构建或增量更新 TypeScript 图谱；若已有有效 `source-code-graph.json` / `source-entry-closures/<entry-hash>.json`，先判断是否 fresh，fresh 时复用缓存并只做最小一致性检查。

```bash
# 在源项目目录执行
```

优先使用 `ts_graph_build`；入口或 symbol 明确后，继续优先使用 `ts_get_file_context`、`ts_search_symbols`、`ts_query_symbol`、`ts_get_review_context` 和 `ts_get_blast_radius` 缩小范围，再按需读取具体文件。不得在 ts-graph 可用且 graph 有效时先大范围 grep / Read 追 import。

目标：

- 获得功能入口文件
- 理清入口到核心模块的调用关系
- 找到功能涉及的主要 TS 文件

如果功能名明确（例如“排行榜”），按以下顺序定位：

1. 搜索功能关键词（中英文、缩写、UI 名、枚举名、路由名）
2. 定位入口类：Panel / View / Controller / Entry / Model / API
3. 结合 ts-graph 追踪入口的直接依赖和调用链
4. 输出**功能代码清单**，不要只报一个入口文件

建议输出格式：

| 类型 | 文件 | 作用 |
|------|------|------|
| 入口 UI | `assets/.../PanelRank.ts` | 排行榜界面入口 |
| 数据层 | `assets/.../RankModel.ts` | 排行榜数据存储 |
| 网络层 | `assets/.../RankApi.ts` | 排行榜请求 |
| 渲染项 | `assets/.../RankItem.ts` | 列表项渲染 |
| 配置层 | `assets/.../RankConfig.ts` | 文案/类型配置 |

#### 2.0 confirmed-entries cache-first（硬规则）

在执行关键词搜索、ts-graph 查询或候选入口扩展前，必须优先读取：

```text
<source_analysis_dir>/.cocos-migration-cache/confirmed-entries.json
<source_analysis_dir>/logs/cache/confirmed-entries.json
```

若缓存 fresh，且 source branch / commit、feature_slug、feature_name aliases、confirmed boundary hash 与当前 manifest / compact 一致，并且没有 open confirmation，则本阶段应复用 confirmed_entry / confirmed_boundary / Minimum Done / Full Done，只做最小一致性检查和写回；不得重复全量搜索。

若缓存 missing / stale / partial，按常规流程分析，并在结束时写入或更新 `confirmed-entries.json`。若候选入口超过 1 个但用户尚未确认，缓存只能写 `partial` 或 `stale`，不得写 `fresh`。

#### 2.x 功能边界确认（必做）

在得到候选入口后，必须继续确认**本次迁移的功能边界**。精确入口确认不等于功能边界确认；即使入口文件已经明确，也不能默认把与之相邻的所有面板、弹窗、子链路都并入本次迁移范围。

必须回答：

- 哪些模块构成该功能的**核心闭环能力**；
- 哪些模块属于**可选子功能**，只有在用户明确要求或源功能闭环依赖时才纳入；
- 哪些模块应作为**明确排除项**，即使名称相关或入口相邻，也不纳入本次迁移。

常见需要单独判断边界的对象包括但不限于：

- 入口浮层与详情页
- 详情页与二级规则弹窗 / 历史记录 / 奖励说明
- 主功能与活动外壳 / 宿主页面 / 其他业务共用模块
- 主链路与只在特定渠道 / 地区 / feature flag 下启用的分支能力

建议输出一张边界确认表：

| 模块 | 是否纳入本次迁移 | 分类 | 说明 |
|---|---|---|---|
| `assets/...` | 是/否 | 核心闭环 / 可选子功能 / 明确排除 | 说明原因 |

若功能边界存在多种合理解释，`entry-boundary-analyzer` 必须在 `02-源入口候选.md` 中整理 **2~4 个边界选项**，每个选项都要明确：

- `include`：本选项纳入哪些入口、面板、脚本、资源或职责层；
- `exclude`：本选项明确排除哪些相邻模块、二级链路或可选子功能；
- `impact`：对后续代码闭包、资源闭包、目标差异分析和最终状态的影响；
- `recommended`：是否推荐，以及推荐理由。

建议选项格式：

| 选项 | include | exclude | 影响 | 是否推荐 |
|---|---|---|---|---|
| A | 只迁入口浮层 | 完整榜单页 / jackpot pool 本体 | 范围最小，但功能闭环可能不足 | 否/是 |
| B | 入口浮层 + 总榜单页面 | jackpot pool 本体链路 / 中奖弹窗 | 保留榜单主闭环，避免扩大到主 jackpot 链路 | 是 |

主控必须把这些选项整理给用户确认；用户确认前不得进入第 3~7 步。用户确认后，必须把 `confirmed_entry`、`confirmed_boundary`、`included_modules`、`excluded_modules` 写入 `源分析清单.md` 和 `源侧摘要.compact.md`，后续第 3~7 步只能以这个确认边界为准。

#### 2.x.1 authoritative closure hard gate（P0）

第 2 步的确认结果是第 3/4 步 authoritative source closure 的硬前置。若入口或边界未确认，后续分析只能作为候选收集，不能作为正式迁移闭包。

```yaml
entry_boundary_authoritative_gate:
  owner: controller
  required_before:
    - 03-source-code-closure
    - 04a-source-resource-prefetch
    - 04b-source-resource-closure
  pass_when:
    - confirmed_entry exists
    - confirmed_boundary exists
    - included_modules/excluded_modules recorded
    - needs_user_confirmation == false
    - no open confirmation_topic in [exact-entry, feature-boundary]
    - boundary_confidence: high-evidence | user-confirmed | fresh-confirmed-cache
    - if boundary_confidence == high-evidence: evidence_paths are explicit and there is only one plausible boundary
  block_when:
    - multiple plausible entries and no user selection
    - multiple plausible boundaries and no user selection
    - any unclosed signal: 待确认 / 可选子功能 / 边界不清 / 相邻功能 / 不默认纳入
  allowed_while_blocked:
    - readonly candidate collection
    - cache freshness check
    - write 02 candidate artifacts
  forbidden_while_blocked:
    - start authoritative 03/04 closure
    - mark source summary as confirmed
    - treat a recommended option as user-confirmed
```

主控若发现 02 只给出推荐项但用户尚未选择，不得用推荐项自动推进 03/04。必须先向用户展示 2~4 个选项并等待确认；用户确认后才允许写入 `confirmed_entry`、`confirmed_boundary`、`included_modules`、`excluded_modules`，并清除 exact-entry / feature-boundary open confirmation。

流程图和 phase gate 文案应使用 `Feature boundary confirmed or evidence-high?`，不得使用容易被误读为主观判断的 `confident?`。其中 `evidence-high` 只允许用于 `single plausible boundary + explicit evidence paths + no open signals`：即唯一合理入口/边界、存在显式证据路径、且没有 `待确认` / `可选子功能` / `边界不清` / `相邻功能` / `不默认纳入` 等未关闭信号；agent recommendation / recommended option 不等于 user confirmation。

要求：

- 若边界不清，必须暂停并向用户确认，不得自行扩大范围。
- 若 `02-源入口候选.md` 中任何候选项的“是否建议纳入”或“说明”包含 `待确认`、`可选子功能`、`边界不清`、`旧榜单`、`相邻功能` 等未关闭信号，源侧最终状态不得写 `confirmed`，compact 不得写 `needs_user_confirmation=false`。
- 若后续发现某模块实际属于核心闭环能力，应回写 `02-源入口候选.md` / `源分析清单.md`，并将此前基于错误边界的分析标记为 `stale`。

#### 2.z 源侧确认门禁复核（主控必做）

`entry-boundary-analyzer`、`source-code-closure-analyzer`、`source-resource-closure-analyzer` 完成源侧第 2~4 步后，主控进入第 5 步前必须读取并复核：

- `源分析清单.md`
- `02-源入口候选.md`
- `源侧摘要.compact.md`

若任一文件出现以下信号，必须暂停并向用户确认，不得继续第 5 步：

- `needs_user_confirmation: true`
- `confirmation_topic: exact-entry` / `feature-boundary`
- `候选入口超过 1 个`
- `待确认`
- `等待用户确认`
- `边界不清`
- `不默认纳入`
- `可选子功能`
- `旧榜单`
- `相邻功能需要确认`

若 compact 摘要与步骤 md / manifest 矛盾，以更保守的待确认状态为准。主控必须把确认问题整理给用户，而不是让子 agent 自行继续。

#### 2.y 完成定义（必做）

在进入代码闭包分析前，必须先定义本次任务的**完成标准**，避免到最终总结时才临时判断“算不算迁完”。

至少要明确两层标准：

1. **最小完成标准（Minimum Done）**：本轮至少做到什么，才能算有可交付结果；
2. **完整完成标准（Full Done）**：达到什么条件，才能标记为 `completed`。

并且必须提前说明：

- 哪些缺口出现时，任务最多只能标记为 `partial`；
- 哪些缺口出现时，任务应标记为 `blocked`；
- “主面板可打开”或“主要资源已拷入”本身不等于完成，若关键职责层、关键数据链、关键配置链、关键验证仍缺失，不得视为 `completed`。

建议输出一张完成定义表：

| 完成项 | 级别 | 缺失时状态 | 说明 |
|---|---|---|---|
| `xxx` | 最小完成 / 完整完成 | partial / blocked | 说明原因 |

该完成定义应在 `03-源代码闭包.md`、`07-迁移验证.md`、`迁移总结.md` 中保持一致；若中途调整，必须明确记录调整原因。

---
