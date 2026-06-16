# 示例、推荐命令与检查清单

## 排行榜迁移示例

用户输入：

- 源项目：`/Users/Work/wenext/cocos-game-greedybox`
- 目标项目：`/Users/Work/wenext/cocos-game-roulette`
- 功能：`排行榜`
- 默认动作：两个项目先检查状态；若第 1 步发现本地未提交内容则自动 stash，再拉取远程更新；后续步骤沿用该基线，不再重复 stash / pull

执行要点：

### 源项目 A

1. 切到 `/Users/Work/wenext/cocos-game-greedybox`
2. 查看状态；若第 1 步工作区不干净则自动 stash，随后 pull 最新代码；后续第 2~7 步不再重复做 Git 清理
3. 构建 TS 图谱
4. 搜索“排行榜 / rank / ranking / leaderboard / panel 名 / UI ID”
5. 列出候选入口 TS / prefab
6. **如果候选入口超过 1 个，先向用户确认精确功能入口**（例如：`PanelGeneralRankPool.ts`、`panelGeneralRankPool.prefab`、`PanelGeneralRank.prefab` 三选一）
7. 从确认后的入口 TS / prefab 汇总完整功能代码清单
8. 从 TS + Prefab + UIConfig + `cli-anything-cocoscreator` 盘点资源列表
9. 对关键 prefab 跑 `asset deps`，对关键 TS 跑 `asset uuid` + `asset refs` 反查 prefab 引用

### 目标项目 B

1. 切到 `/Users/Work/wenext/cocos-game-roulette`
2. 查看状态；若第 1 步工作区不干净则自动 stash，随后 pull 最新代码；后续第 2~7 步不再重复做 Git 清理
3. 构建 TS 图谱
4. 对照源项目资源清单检查缺失
5. 迁移缺失资源与代码
6. 修复 import 路径、UI 注册、动态加载路径、资源缺失
7. 若目标项目已有排行榜公共层，仅新增缺少的业务 TS 功能

---

## 推荐命令模式

以下是执行思路，不要假设所有项目命令完全一致；如果命令不存在，需要按项目实际情况调整。

```bash
# 第 1 步的 Git 状态初始化（只执行一次）
git status --short

# 若第 1 步工作区不干净，则先自动暂存，再拉最新
# 后续第 2~7 步沿用该基线，不再重复 stash / pull
git stash push -u -m "claude-feature-migration-rank-$(date +%Y%m%d-%H%M%S)"
git pull --rebase

# 关键词搜索
rg -n "排行榜|rank|ranking|leaderboard" assets

# 资源搜索
find assets -iname "*rank*" -o -iname "*leaderboard*"
```

如需 `cli-anything-cocoscreator`，先按当前运行环境检查本机命令是否存在；若不存在，先停止分析并引导用户参考部署指南完成安装：`https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/DEPLOY.md`。

可用检查命令：

- macOS / Linux / WSL / Git Bash：`command -v cli-anything-cocoscreator`
- PowerShell：`Get-Command cli-anything-cocoscreator`
- cmd：`where cli-anything-cocoscreator`

确认可用后，再优先组合使用以下命令：

- `asset deps <project> <asset>`：展开 prefab / asset 的静态依赖
- `asset uuid <project> <asset>`：获取 TS / prefab / 资源的 uuid
- `asset refs <project> <uuid>`：反查哪些项目文件引用了该 uuid

推荐组合：先对入口 TS 相关 prefab 做 `deps`，再对关键 TS 脚本做 `uuid + refs`，最后对 refs 找到的 prefab 再做 `deps`。

---

## 检查清单

- [ ] 已确认目标项目 feature 分支处理方式（必须在创建阶段 agent team、启动任何子 agent、以及目标项目 stash / pull / checkout / 业务修改之前完成）：默认建议分支为 `feature/migration_<feature-slug>`；若用户提供 `feature/xxx` 则按用户指定；若当前非默认分支与本次 feature_slug 不一致，已用一层、简单明了的策略确认：从 `origin/main` 创建 / 继续当前本地分支 / 从当前本地分支对应的有效远程上游创建（仅有效时展示）/ 切换已存在迁移分支（仅检测到时展示）/ `base=origin/xxx` 从指定远程基线创建 / `branch=feature/xxx` 改用指定目标分支 / 暂停；当前不可执行策略不得进入编号列表，但自定义基线、自定义分支和暂停策略必须保留。
- [ ] 已完成第 1 步 Git 状态检查，并记录是否执行 stash / pull
- [ ] 已明确后续子步骤不再重复执行 stash / clean / pull
- [ ] 已按当前平台确认 `cli-anything-cocoscreator` 可用，或已提示用户按部署指南安装
- [ ] 已与用户确认精确功能入口（如存在多个候选）
- [ ] 已确认功能边界（不只精确入口）
- [ ] 已定义最小完成标准 / 完整完成标准
- [ ] 源项目已整理功能代码闭包
- [ ] 源项目已整理完整资源清单
- [ ] 已完成业务语义字段保真检查：API path、activity/task、request 参数、event、model/DTO 关键字段未被无证据静默改写
- [ ] 已完成条件性 native / KV / config / gating 隐性依赖扫描；源项目有则已迁移或记录不迁移原因，源项目无则未凭空新增
- [ ] 已完成事件 producer-consumer 闭环检查：定义、派发、监听、UI/model 更新均已核对
- [ ] 已完成接口分支与请求参数语义检查：old/new interface、appName/platform、动态参数未被无证据硬编码或空心化
- [ ] 目标项目已完成代码差异分析

- [ ] 已检查目标项目同职责异名替代能力
- [ ] 目标项目已完成资源差异分析
- [ ] 已迁移缺失代码
- [ ] 已迁移缺失资源
- [ ] 已修复 import / UI / bundle / 动态路径问题
- [ ] 已标注过渡资源目录的退出条件与最晚清理时机
- [ ] 已声明本次验证等级；默认只做 L1 静态结构验证，除非用户明确要求，不检测/不运行 tsc/cocos/npm build
- [ ] 已用 `cli-anything-cocoscreator` 对关键 prefab 执行 deps，并记录 missing/unresolved 结论
- [ ] 已用 `cli-anything-cocoscreator asset uuid + refs` 检查关键脚本/资源引用
- [ ] `migration-applier` 已对关键文件做实物自检（协议/DTO、SubGame/Controller、UIConfig、Event、工具方法、关键资源），并记录符号/方法/资源存在性证据
- [ ] 若第 7 步发现 L1 静态问题，已最多执行 2 轮修复-复验证循环，或明确标记 `blocked-static`
- [ ] 已列出风险项和人工确认项

---

## 相关技能

- `cocos-asset-management` — 动态资源路径、预加载、缓存、释放
- `cocos-ui-system` — UIConfig、Panel 注册、弹窗入口
- `cocos-network` — 接口封装与协议适配
- `cocos-localization` — 文案 key 与语言资源迁移
- `cocos-node-binding` — Prefab 节点绑定修复
- `cocos-code-review` — 迁移后做语义级代码审查
