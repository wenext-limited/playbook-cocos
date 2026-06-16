# 第 3 步：源代码闭包与保真闭包

### 第 3 步：汇总源功能的代码闭包

开始本步骤前：先读取源项目 `源分析清单.md`、`02-源入口候选.md` 和 `03-源代码闭包.md`（如果存在）。若用户已确认入口，必须把该入口作为唯一分析边界；不要把未确认的下一级 panel 默认并入范围。

完成本步骤后：写回源项目 `03-源代码闭包.md`，并更新源项目 `源分析清单.md` 中第 3 步状态与 `confirmed_entry`。

从入口 TS 出发，优先基于 ts-graph 查询结果和源代码闭包缓存汇总以下内容。若缓存 fresh，复用 `source-entry-closures/<entry-hash>.json`；若缓存 stale / partial / unavailable，先用 ts-graph 重算静态闭包，再由 AI 补动态语义。

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
