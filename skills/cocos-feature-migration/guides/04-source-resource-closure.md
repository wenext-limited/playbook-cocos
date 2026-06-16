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

在开始资源分析前，**如果候选入口不止一个，必须先向用户确认精确功能入口**。精确入口可以是：

- 某个 TS（如 `PanelGeneralRankPool.ts`）
- 某个入口 prefab（如 `panelGeneralRankPool.prefab`）
- 某个完整业务面板 prefab（如 `PanelGeneralRank.prefab`）

**未经确认，不得默认把“入口点击后打开的下一级 panel”纳入同一功能范围。**

采用**双轨分析**：**AI 负责判断动态依赖**，`cli-anything-cocoscreator` **负责展开静态依赖**。

资源闭包开始前，优先读取或生成技术加速索引：`asset-index.json`、`prefab-component-index.json`、`uuid-reverse-index.json`、`bundle-index.json`、`resource-path-index.json`。若索引 fresh，先用索引回答 Prefab / UUID / Bundle / refs 问题，再只对 stale 或证据不足的资源局部调用 CLI；若索引缺失或 stale，使用 `cli-anything-cocoscreator` 重建或局部刷新。

在执行本节前，默认复用第 1 步 precheck 记录的 `cli-anything-cocoscreator` capability；若 precheck 已确认可用，不重复做可用性探测。只有未记录 capability、capability stale 或实际 CLI 命令失败时，才重新按当前运行环境检查 CLI，并在失败时停止资源闭包分析，引导用户参考部署指南完成安装：`https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/DEPLOY.md`。

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
