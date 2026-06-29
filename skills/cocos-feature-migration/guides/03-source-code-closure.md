# 第 3 步：源代码闭包与保真闭包

### 第 3 步：汇总源功能的代码闭包

开始本步骤前：先读取源项目 `源分析清单.md`、`02-源入口候选.md` 和 `03-源代码闭包.md`（如果存在）。若用户已确认入口，必须把该入口作为唯一分析边界；不要把未确认的下一级 panel 默认并入范围。

完成本步骤后：写回源项目 `03-源代码闭包.md`，并更新源项目 `源分析清单.md` 中第 3 步状态与 `confirmed_entry`。

从入口 TS 出发，优先基于 ts-graph 查询结果和源代码闭包缓存汇总以下内容。若缓存 fresh，复用 `source-entry-closures/<entry-hash>.json`；若缓存 stale / partial / unavailable，优先用 ts-graph 重算静态闭包，再由 AI 补动态语义。若 ts-graph MCP 不可用或 graph build/query 失败，进入 `execution_mode: degraded`：使用 `rg` / Read / import 文本扫描 / 明确调用点搜索降级形成代码闭包，必须记录 `code_closure_confidence: partial`、`degraded_reasons: [ts_graph_unavailable]` 或具体失败原因、未覆盖风险和最终验证上限；不得因 ts-graph 不可用完全卡住源侧只读代码闭包，除非入口/边界未确认或文本扫描也无法形成最低闭包。

1. **功能代码文件列表**
   - 直接调用的 TS 文件
   - 功能私有工具类
   - 相关枚举 / 常量 / 配置
2. **共享依赖识别**
   - OOPS / framework / common util / net / event 等通用能力
   - 判断这些依赖在目标项目是否已有同等实现
3. **迁移策略分类**
   - 直接迁移
   - 目标项目复用
   - 需要适配后迁移
   - 不应迁移（源项目特有逻辑）

建议把每个 TS 文件打上动作标签：

| 文件 | 分类 | 动作 | 说明 |
|------|------|------|------|
| `RankPanel.ts` | 业务 UI | 迁移 | 目标项目缺失 |
| `HttpRequest.ts` | 框架公共层 | 复用目标项目 | 目标已有网络封装 |
| `GameConst.ts` | 公共常量 | 局部摘取 | 仅迁排行榜相关字段 |

**禁止整包复制 framework/common 目录。**

#### 3.0 source-entry-closure cache-first（硬规则）

在执行 ts-graph 重算、搜索或批量读取源码前，必须优先读取：

```text
<source_analysis_dir>/.cocos-migration-cache/source-entry-closure-cache.json
<source_analysis_dir>/.cocos-migration-cache/source-entry-closures/<entry-hash>.json
<source_analysis_dir>/logs/cache/source-entry-closure-cache.json
```

若缓存 fresh，且 confirmed entry / boundary hash、第 2 步 compact hash、runtime dependency 文件 hash、API / KV / event 相关文件 hash 均未变化，则直接复用代码闭包、职责层和保真闭包，只做最小一致性检查和写回。

若 source commit 变化但 runtime dependency hash 未变，可标记 `reuse-with-commit-change` 并做轻量复核；若只有 type-only dependency 变化，只刷新类型影响。若 runtime dependency、API path、request 参数、KV/config/gating 或 event 文件变化，必须局部或完整重算。

缓存复用不得省略 `semantic_fields`、`gating_dependencies`、`event_closures`、`interface_branches`、`request_parameter_semantics`。这些字段缺失时缓存最多 `partial`，不得作为完整闭包。

#### 3.x 职责层拆解（必做）

在完成代码文件清单后，必须继续识别该功能在源项目中的**关键职责层**，不能只停留在“有哪些文件”。

职责层的数量不固定，应按功能实际结构拆解。常见职责层包括但不限于：

- 触发层：按钮、入口、路由、显隐开关、注册点
- 展示层：常驻 UI、节点组件、角标、浮层、列表项
- 详情层：二级面板、弹窗、完整功能页
- 数据层：request / api / model / store / ecs component / runtime state
- 事件层：event enum、message dispatch、listener、订阅关系
- 配置层：UIConfig、常量、feature switch、多语言、JSON 配置
- 资源层：prefab、sprite、atlas、font、material、spine、audio
- 接入层：bundle preload、初始化、宿主参数、native bridge、app 适配

注意：

- 不要求每个功能都具备上述所有职责层。
- 不要机械套模板；应根据功能形态选择实际存在的职责层。
- 若某职责层不存在，应明确写“该功能无此层”，而不是省略不写。

建议输出一张职责层表：

| 职责层 | 源实现文件/资源 | 作用 | 是否关键 |
|---|---|---|---|
| 触发层 | `assets/...` | 用户或系统如何进入该功能 | 是/否 |
| 展示层 | `assets/...` | 功能对外表现载体 | 是/否 |
| 数据层 | `assets/...` | 功能运行依赖的数据来源与状态存储 | 是/否 |
| 事件层 | `assets/...` | 功能联动与刷新机制 | 是/否 |
| 配置层 | `assets/...` | 功能依赖的配置、枚举、多语言 | 是/否 |

若某个职责层被标记为“关键”，则后续第 5 步和第 7 步必须继续核对该职责层是否在目标项目中被完整保留。

#### 3.y 迁移保真闭包（必做）

#### 3.z source_semantic_closure_gate（P0 硬门禁）

> 防卡死调和：`blocks_step5_target_diff` 不应阻止 05x/05a/05b/05c 进行只读补证；它只阻塞第 5 步最终保真裁决或第 6 步写入。若目标侧只读搜索可能补齐证据，controller 应以 constrained fan-out 继续收集证据，并把缺口传播为 `blocks_step6_migration`，而不是直接卡死在第 3 步。


源代码闭包阶段不得只用 `code_closure_confidence: partial` 或 `risks` 承载核心语义缺口。若核心职责层依赖的业务语义仍为 `unknown` / `missing` / `partial-without-evidence`，必须结构化阻断后续目标差异或第 6 步写入。

```yaml
source_semantic_closure_gate:
  owner: source-code-closure-analyzer
  applies_to_sections:
    - semantic_fields
    - gating_dependencies
    - event_closures
    - interface_branches
    - request_parameter_semantics
  critical_when:
    - affects API path or request parameters
    - affects native/KV/config/gating
    - affects event producer-consumer closure
    - affects route/UIID/entry initialization
    - affects confirmed core boundary responsibility layer
  must_output:
    missing_semantic_sections: []
    critical_unknown_count: 0
    blocks_step5_target_diff: false
    blocks_step6_migration: false
    status_cap_if_continue: static-pass | partial-pass-static | blocked-static
  block_rules:
    - if critical_unknown_count > 0 and missing section is needed for target fidelity comparison: blocks_step5_target_diff = true
    - if critical_unknown_count > 0 but target diff can still inspect target alternatives: blocks_step6_migration = true
    - if only noncritical/editor-only semantics are unknown: allow_step5_with_constraints and status_cap_if_continue = partial-pass-static
````

若缓存复用导致上述任一核心表缺失，不能把缓存作为完整闭包。必须写 `missing_semantic_sections`，并把 `blocks_target_fidelity_analysis` / `blocks_step6_migration` 写入 `03-源代码闭包.state.compact.md`、`03-源代码闭包.evidence.compact.md`、phase-summary JSON 和 `agent_result`。

`execution_status: completed` 只允许在以下情况使用：核心语义表均存在且无 critical unknown，或所有 critical unknown 已被明确标为 `blocks_step6_migration: true` 并由 controller 在第 5 步合并前处理。


在代码文件清单和职责层表之外，必须额外形成**迁移保真闭包**，用于识别容易被文件迁移遗漏的业务语义和隐性依赖。

至少输出以下表格；若源项目没有对应依赖，也要明确写“未发现”，不能省略。

1. **业务语义字段表**

| 字段类型 | 源项目位置 | 源值 / 源行为 | 是否关键 | 说明 |
|---|---|---|---|---|
| API path | `assets/...` | `xxx` | 是/否 |  |
| request 参数 | `assets/...` | `gameType = ...` | 是/否 |  |
| activity/task 字段 | `assets/...` | `activityType = ...` | 是/否 |  |

2. **native / KV / config / gating 依赖表**

| 依赖类型 | 源项目位置 | 源项目行为 | 影响 | 是否必须迁移 |
|---|---|---|---|---|
| native KV | `assets/...` | 读取 rankType / timezone | 请求参数 / 展示开关 | 是/否 |

若未发现，写：`No source-side native/KV/config/gating dependencies found for this feature.`

3. **事件 producer-consumer 闭环表**

| 事件 | 定义位置 | 派发方 | 监听方 | 更新内容 | 是否核心闭环 |
|---|---|---|---|---|---|

4. **接口分支与请求参数语义表**

| 分支 / 参数 | 源项目行为 | 影响 | 是否允许目标适配 | 说明 |
|---|---|---|---|---|

这些表必须进入 `03-源代码闭包.md`，并在 `源侧摘要.compact.md` 中压缩记录关键项：

- `semantic_fields`
- `gating_dependencies`
- `event_closures`
- `interface_branches`
- `request_parameter_semantics`

如果发现 API、native/KV、接口分支、事件闭环或请求参数影响功能完整性，必须把对应职责层标记为关键职责层，供第 5 步和第 7 步继续核对。

---
