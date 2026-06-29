# 第 4 步：源资源闭包与 Prefab/UUID 依赖

### 第 4 步：盘点源功能引用的资源

开始本步骤前：先读取源项目 `源分析清单.md`、`03-源代码闭包.md` 和 `04-源资源闭包.md`（如果存在）。资源分析必须基于已确认入口和第 3 步代码闭包结果。

完成本步骤后：写回源项目 `04-源资源闭包.md`，并更新源项目 `源分析清单.md` 中第 4 步状态。

必须分析该功能引用的所有资源，而不只是 TS 文件。

资源类型至少包括：

- Prefab
- Sprite / PNG / JPG
- SpriteAtlas
- Spine SkeletonData
- Font
- Audio（若该功能会用到）
- Json / 配置表
- language / i18n 文案
- 粒子、材质、Shader（如有）

#### 4.0.x 资源预取 / 最终闭包拆分（速度优化硬规则）

第 4 步可以拆成 `04a source-resource-prefetch` 与 `04b source-resource-closure`，目标是让资源索引预热与第 3 步代码闭包并行，减少总等待时间，同时不让 Main 读取大输出。

```text
02 entry-boundary confirmed
  ├─ 03 source-code-closure-analyzer
  └─ 04a source-resource-prefetch
        - 只基于 confirmed entry / UIConfig / route / key prefab / existing cache
        - 生成 prefab-component-index / uuid-reverse-index / asset deps cache / resource path index
        - 不做最终动态资源结论
03 completed + 04a completed-or-skipped
  -> 04b source-resource-closure final merge
        - 合并第 3 步语义闭包
        - 补 runtime 拼接、language/region/appName/feature flag/fallback
        - 写最终 04-源资源闭包.md / state / evidence compact
```

04a 允许写：

- `04a-源资源预取.state.compact.md`（可选但推荐）；
- `.cocos-migration-cache/asset-deps-cache.json`；
- `.cocos-migration-cache/uuid-reverse-index.json`；
- `.cocos-migration-cache/prefab-component-index.json`；
- `.cocos-migration-cache/resource-path-index.json`；
- `logs/cocos/uuid-reverse-index.json`；
- `logs/cocos/prefab-reverse-index.json`；
- `logs/cocos/prefab-script-binding-index.json`；
- `logs/cocos/cocos-reverse-index.summary.json`；
- `logs/tools/build-cocos-reverse-index.mjs` 或 `.py`（允许的临时只读索引脚本）；
- `logs/asset-*` / `logs/cache/*`。

04a reverse index tool protocol：

```yaml
source_reverse_index_prefetch:
  tool_mode: full | validate
  summary_path: <source_analysis_dir>/logs/cocos/cocos-reverse-index.summary.json
  outputs:
    - logs/cocos/uuid-reverse-index.json
    - logs/cocos/prefab-reverse-index.json
    - logs/cocos/prefab-script-binding-index.json
    - logs/cocos/cocos-reverse-index.summary.json
  default_max_seconds: 180
  if_summary_fresh:
    - reuse summary stats and only read concrete index entries needed by confirmed boundary
  if_missing_or_failed:
    - write 04a partial state
    - 04b may continue with targeted fallback after 03 code closure
    - do not block solely because reverse index tool failed
```



- 修改源/目标业务代码或资源；
- 读取目标业务文件；
- 产出最终资源闭包结论；
- 在第 3 步未完成时断言动态资源完整。

04b 必须读取 04a 缓存或说明未复用原因。若 04a 失败但第 3 步已完成，04b 可降级继续常规资源闭包；不得因预取失败完全卡住，除非关键 Prefab/资源毫无替代证据。


#### 4.0.y 04a 专用轻量 prompt（P1 硬规则）

04a 资源预取必须优先使用专用轻量 agent prompt：

```text
agent-prompts/source-resource-prefetch-analyzer.md
```

04a 不再默认加载完整 `source-resource-closure-analyzer` 大 prompt；若因兼容仍使用完整 prompt，phase packet 必须明确 `scope: prefetch_only_no_final_resource_closure`、`max_search_time_seconds: 180` 和 `artifact_write_deadline_seconds: 60`。

04a required artifacts 固定为：

```text
04a-源资源预取.state.compact.md
logs/asset-prefetch-index.json
logs/phase-summary/04a-source-resource-prefetch.summary.json
```

04a 失败、partial 或 tool-unavailable 不得卡住流程；只要入口/边界已确认，第 3 步完成后 04b 可读取已有 04a partial index 或降级常规资源闭包继续。

#### 4.0 资源闭包 cache-first 加速（硬规则）

在执行任何大范围资源搜索或 `cli-anything-cocoscreator asset deps / uuid / refs` 前，必须优先读取源侧资源缓存：

```text
<source_analysis_dir>/.cocos-migration-cache/source-resource-closure-cache.json
<source_analysis_dir>/.cocos-migration-cache/asset-deps-cache.json
<source_analysis_dir>/.cocos-migration-cache/uuid-reverse-index.json
<source_analysis_dir>/.cocos-migration-cache/prefab-component-index.json
<source_analysis_dir>/.cocos-migration-cache/resource-path-index.json
```

或 fallback：

```text
<source_analysis_dir>/logs/cache/*.json
```

若 source branch / commit、confirmed entry、confirmed boundary、代码闭包 hash、关键 prefab hash / meta hash 均未变化，且缓存字段完整，则第 4 步只做最小一致性检查并复用缓存；不得重复对所有关键 prefab 执行完整 CLI。若仅部分 prefab stale，只局部刷新这些 prefab。缓存缺失或 stale 时才常规执行 CLI，并在本轮结束写回缓存。

缓存复用不能跳过动态资源判断：appName / language / region / feature flag / runtime 拼接路径仍需根据第 3 步语义闭包做轻量复核。

#### 资源定位方法

#### 4.z resource_closure_gate（P0 硬门禁）

> 防卡死调和：`blocks_step5_resource_plan` 默认表示阻塞第 5 步最终资源决策或第 6 步资源写入，不默认阻止 05c 做只读目标资源规划。05c 可在 `source_resource_unknown` 约束下继续查目标等价资源、复制/复用候选和风险；最终未裁决前不得进入第 6 步。


源资源闭包不得只用 `unresolved_static_count`、`resource_cache_status: partial` 或 `risks` 表达核心资源缺口。04b 结束前必须输出资源闭包门禁：

```yaml
resource_closure_gate:
  critical_prefab_scope:
    - confirmed entry prefab
    - main panel prefab
    - list item prefab
    - prefabs referenced by confirmed core boundary UIConfig / route / code closure
  checks:
    prefab_deps_known: true | false
    script_refs_known: true | false
    dynamic_resource_paths_known: true | false
    language_keys_known: true | false
    uuid_reverse_index_available_or_rebuilt: true | false
  prefetch_partial_impact: none | recovered | unrecovered
  critical_index_recovered: true | false
  critical_unknown_count: 0
  blocks_step5_resource_plan: false
  blocks_step6_migration: false
  status_cap_if_continue: static-pass | partial-pass-static | blocked-static
````

阻断规则：

- 核心入口 / 主面板 / 列表项 Prefab 的 deps、script refs、UUID 反查或动态资源路径为 missing/unknown 时，必须 `blocks_step5_resource_plan: true`，除非 04b 已通过其他证据恢复并记录 `critical_index_recovered: true`。
- 若 05c 可在目标侧继续做资源计划，但第 6 步写入仍缺最低安全资源清单，则必须 `blocks_step6_migration: true`。
- 04a 为 partial/tool-unavailable 时，04b 必须写 `prefetch_partial_impact`；若关键索引未恢复，不得把资源闭包标为完整。

这些字段必须写入 `04-源资源闭包.state.compact.md`、`04-源资源闭包.evidence.compact.md`、phase-summary JSON 和 `agent_result`。


在开始资源分析前，**如果候选入口不止一个，必须先向用户确认精确功能入口**。精确入口可以是：

- 某个 TS（如 `PanelGeneralRankPool.ts`）
- 某个入口 prefab（如 `panelGeneralRankPool.prefab`）
- 某个完整业务面板 prefab（如 `PanelGeneralRank.prefab`）

**未经确认，不得默认把“入口点击后打开的下一级 panel”纳入同一功能范围。**

采用**双轨分析**：**AI 负责判断动态依赖**，`cli-anything-cocoscreator` **负责展开静态依赖**。

资源闭包开始前，优先读取或生成技术加速索引：`asset-index.json`、`prefab-component-index.json`、`uuid-reverse-index.json`、`bundle-index.json`、`resource-path-index.json`，以及 `logs/cocos/uuid-reverse-index.json`、`logs/cocos/prefab-reverse-index.json`、`logs/cocos/prefab-script-binding-index.json`。若 reverse index fresh，先用索引回答 Prefab / UUID / Bundle / refs / script binding 问题，再只对 stale、unknown 或证据不足的资源局部调用 CLI；若索引缺失或 stale，优先用 `rg --files` + `.meta` parser + prefab 文本扫描生成，必要时再用 `cli-anything-cocoscreator` targeted deps/refs 补强。

在执行本节前，默认复用第 1 步 precheck 记录的 `cli-anything-cocoscreator` capability；若 precheck 已确认可用，不重复做可用性探测。只有未记录 capability、capability stale 或实际 CLI 命令失败时，才重新按当前运行环境检查 CLI。若 CLI 不可用，进入 degraded mode：使用 Prefab / `.meta` 文本扫描、uuid reverse index、已有缓存索引降级分析，并在 compact 写明 `resource_closure_confidence: partial`、`degraded_reasons` 和最终验证上限；不得因 CLI 不可用完全卡住只读资源闭包，除非关键 Prefab/资源没有任何替代证据，继续会导致第 6 步写入风险。

1. 从 TS 中找显式资源路径字符串
2. 读取 UI 配置表（如 `UIConfig`、`SubUIID`、`prefab` 注册表）
3. 由 AI 沿“入口 TS → 打开 UI / 事件 / 配置 / util”链路，判断动态加载路径、运行时拼接资源名、按 appName / language / region / feature flag 选择的资源
4. 检查 Prefab 的脚本组件、子节点图片、图集引用
5. 检查 Atlas / Spine / Config 是否由工具类动态拼接路径
6. 使用 `cli-anything-cocoscreator asset deps` 展开 prefab / asset 的**静态 outgoing 依赖**（贴图、子 prefab、字体、材质等）
7. 使用 `cli-anything-cocoscreator asset uuid` + `asset refs` 反查“某个 TS / prefab / 资源被哪些 prefab / 场景 / 资源引用”，尤其适合：
   - 先拿某个 TS 脚本的 uuid
   - 再查哪些 prefab 引用了这个脚本
   - 再对这些 prefab 运行 `asset deps`，补齐脚本绑定带来的资源依赖
8. 将 AI 推断出的**动态依赖**与 CLI 找到的**静态依赖**合并去重，形成最终资源清单
9. 如用户提供并允许，可借助 `cli-anything-cocoscreator`（参考：`https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/README.md`）做批量核对

**不要只依赖 UIConfig。** UIConfig 只能帮助定位入口 prefab，不能覆盖：

- 运行时字符串拼接路径
- prefab 内部静态挂载的字体 / 材质 / 子 prefab / SpriteFrame
- TS 脚本被 prefab 反向引用后带出的资源
- 按 appName / 区域 / 语言切换的资源分支

当使用 `cli-anything-cocoscreator` 时，先让结果服务于“列全资源清单”，不要直接把它的输出当最终结论；最终结论必须由 AI 合并动态链路后给出。

建议输出格式：

| 资源类型 | 路径 | 来源 | 是否必须 |
|---------|------|------|---------|
| Prefab | `assets/resources/prefab/rank/RankPanel.prefab` | UIConfig | 是 |
| Sprite | `assets/resources/ui/rank/icon_top1.png` | Prefab 引用 | 是 |
| Atlas | `assets/resources/ui/rank/rank.plist` | 动态加载 | 是 |
| Json | `assets/resources/config/rankReward.json` | TS 读取 | 视功能而定 |

---
