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
- `script_uuid_resolvable`、`asset_uuid_resolvable`；
- missing / unresolved 计数和分类；
- fonts / materials / spriteframes / coin_icons / default_avatars / child_prefabs / builtin_like 的公共 UUID 改绑审计结果；
- 证据路径。

第 6 步不需要为了生成该缓存而运行完整第 7 步验证，但凡已经做过的 CLI / 文本解析 / uuid 检查结果必须结构化写入缓存，供第 7 步 cache-first 使用。

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

执行代码迁移时，必须遵守“源行为保真优先”。对第 5 步标记为 `inferred`、`高风险可疑`、`需确认` 的以下改动，不得静默落地：

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

#### 6.y Prefab UUID 闭合预检与修复策略（必做）

跨项目迁移 Prefab 时，第 6 步不能只复制 `.prefab` / `.meta` 后等待第 7 步发现问题；`migration-applier` 必须在迁移动作阶段先做一次 Prefab UUID 闭合预检，并尽量自动修复可确定的 L1 静态问题。

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


#### 6.z Timing 精确记录补充（硬规则）

第 6 步是高成本写入阶段，必须遵守 Timing Bootstrap / Step / Close 协议。每个 `step_end.duration_seconds` 必须由该 step 的 start/end 时间计算；除非真实小于 1 秒，不得写 0。若无法取得精确 step 耗时，必须写 `timing_observability.unavailable_reason`，不得用 0 伪装成功记录。
