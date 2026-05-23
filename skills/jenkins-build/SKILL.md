---
name: jenkins-build
description: 触发 Jenkins 打包游戏项目。当用户说“打包”、“构建游戏”、“触发构建”、“远程构建”、“Jenkins 打包”、“Jenkins 构建”、“Cocos 构建”、“build”、“build game”、“trigger build”时使用此 skill。
argument-hint: [可选：自由组合 游戏 / 分支 / 模式 / app，例如 "龙虎 dev release fungo"]
allowed-tools: Bash, AskUserQuestion
---

## 执行流程

Claude 采用**意图识别 + 缺失填空**模式：先从用户首句话里尽可能提取参数，**已知的跳过，未知的逐一追问**。

**通用导航**：每个 AskUserQuestion 题目都包含 `← 返回上一步` 选项；文本对话步骤支持输入 `back`/`b` 回退、`quit`/`q` 退出。

---

### 阶段 0：一次性加载静态元数据（必做，仅调一次）

在做任何其他事之前，先调用：

```bash
bash scripts/jenkins_build.sh meta-all
```

输出为 JSON，包含 `games`（编号/Job 名/分类/app_param/resource_param）和 `apps` 列表。后续所有参数推断、显示都基于这份数据，**不再重复调用** `list-games` / `list-apps` / `check-resource-param`。

游戏列表和 APP 列表**权威定义在 `scripts/jenkins_build.sh`**，SKILL.md 不再重复维护。

---

### 阶段 A：参数预解析

收到用户输入后，基于 meta-all 数据从原文中提取参数，构建参数状态表：

| 参数 | 识别线索 |
|------|----------|
| **游戏** | 数字编号（1-20）、`all`、Job 关键词、中文别名、英文别名 |
| **分支** | `dev`/`develop`/`main`/`master`/`release` 等典型分支名、`v1.2.3` 版本号、形如 `feature/xxx` 的路径 |
| **DEBUG 模式** | `debug`/`调试`/`d`/`测试`/`测试包`/`test`/`dev包`/`开发包` → true；`release`/`生产`/`正式`/`r` → false |
| **APP_NAME** | meta-all 返回的 apps 列表中的任意关键词；未提及时默认 `null`，表示不指定具体 App 目标 |
| **资源模式** | `normal`/`普通` → normal；`dynamic`/`动态` → dynamic |

**游戏别名识别规则**：优先使用 meta-all 中的编号和 Job 名；自然语言中出现以下别名时映射到对应 Job。

| 用户说法 | Job |
|----------|-----|
| 龙虎斗 / 龙虎 / dragontiger | `cocos-dragontiger` |
| 飞行棋 / ludo | `cocos-game-ludo` |
| 多米诺 / 骨牌 / domino | `cocos-game-domino` |
| 卡罗姆 / carrom | `cocos-game-carrom` |
| UNO / uno | `cocos-game-uno` |
| 轮盘 / 轮盘赌 / roulette | `cocos-roulette` |
| 贪吃蛇 / 贪婪盒子 / greedybox | `cocos-greedybox` |
| 火箭 / rocket | `cocos-rocketcrush` |
| 德州 / 德扑 / texas | `cocos-texasbull` |
| 三张牌 / teen patti | `cocos-teen-patti` |
| 幸运足球 / lucky soccer | `cocos-lucky-soccer` |
| okey | `cocos-game-okey101` |
| baloot | `cocos-game-baloot` |
| jackaroo | `cocos-game-jackaroo` |
| match3 | `cocos-match3-grid-slots` |
| 水果 / fruit | `cocos-fruit-lucky77-lite` |
| golden luck / 金运 | `unity-golden-luck` |

**歧义处理规则**：老虎机 / slots 等说法可能命中 `cocos-mini-slots`、`cocos-pyramid-slots`、`cocos-jackpot-slot`、`cocos-match3-grid-slots`，必须展示候选让用户选择。

**动态 fallback 规则**：
- 游戏无法匹配或用户认为列表不完整时，调用 `bash scripts/jenkins_build.sh discover-cocos-jobs` 拉取 Jenkins 当前 `cocos-*` Job 辅助选择。
- APP 无法匹配或用户认为列表不完整时，调用 `bash scripts/jenkins_build.sh fetch-apps-remote` 拉取远程 APP 列表辅助选择。
- fallback 只用于辅助选择；正式触发仍优先走 `trigger-batch` 和脚本内权威编号元数据。

构建参数状态后，向用户**回显已识别项**（用 ✅ 标已知、❓ 标未知），例如：

```
已识别参数：
  ✅ 游戏: cocos-dragontiger
  ✅ 分支: dev
  ❓ DEBUG 模式: 待定
  ❓ APP_NAME: 待定
  ❓ 资源模式: 待定（需先确认游戏是否带资源动态参数）

接下来补齐缺失项 ↓
```

**并行预拉分支**：如果游戏已知，在展示回显的同时，后台调用 `list-branches` 预热缓存（无需等待结果），第 2 步到来时直接命中缓存。

然后进入阶段 B，**只追问 ❓ 的步骤**，已知的步骤直接跳过。

---

### 阶段 B：缺失参数填空

按 1→6 顺序检查每个参数，**已知则跳过、未知则交互**：

#### 第 1 步：游戏（缺失时）

- 基于 meta-all 数据展示游戏列表（按分类分组）。
- 文本输入：编号/名称/`all`，多个空格分隔。

#### 第 2 步：分支（缺失或预解析未匹配到 Jenkins 列表时）

1. 调用 `bash scripts/jenkins_build.sh list-branches <job_name>` 获取分支列表（5 分钟缓存，命中则零等待）。
2. **智能匹配优先 → 需要选择时展示编号列表，由用户文本回复编号或分支名**。

**分支匹配 → 行为规则**：

| 匹配情况 | 处理策略 |
|----------|----------|
| **精确等值匹配 1 条**（如 `dev` == `dev`） | ✅ 直接采用，无需打扰 |
| **唯一包含匹配 1 条**（如 `dev` 唯一对应 `develop`） | ✅ 直接采用，无需打扰 |
| **其他所有情况**（模糊多匹配 / 无匹配 / 用户未给分支） | 📋 展示编号列表，等用户文本回复 |

**展示编号列表的格式**（Claude 拿 list-branches 输出后自行渲染，按 `dev > develop > main > master > release/* > feature/* > 字典序` 排序）：

```
请选择分支：
   1) dev
   2) develop
   3) main
   4) master
   5) release/v1.2.3
   6) feature/login
   ...

请回复编号或分支名（back / b 返回上一步，quit / q 退出）
```

**用户回复解析**：
- 纯数字 → 取对应编号分支
- 分支名 → 在 list-branches 输出中精确校验，存在则采用；不存在则二次确认（可能是新分支）
- `back`/`b` → 回退到第 1 步
- `quit`/`q` → 终止流程

**关键原则**：
- 精确/唯一包含匹配**不打扰用户**，直接采用。
- 其他情况一律展示**完整带编号列表**（无 4 个选项限制），让用户一次看全所有候选。

**批量打包分支预校验**：选定多个游戏时，在第 6 步确认前调用：

```bash
bash scripts/jenkins_build.sh check-branches-batch <branch> <num1,num2,...>
```

输出 TSV（`num<TAB>job<TAB>OK|MISSING`）。如有 MISSING，告知用户哪些 Job 不存在该分支，让用户决定是否继续或换分支。退出码 = MISSING 数量。

#### 第 3 步：DEBUG 模式（缺失时）

用 AskUserQuestion：

| 选项 | 值 |
|------|----|
| Release 生产包（默认） | DEBUG=false |
| Debug 调试包 | DEBUG=true |
| ← 返回上一步 | 回退到第 2 步 |

#### 第 4 步：APP_NAME（缺失时）

- 基于 meta-all 数据展示 apps 列表。
- 文本输入：编号或直接输入 APP_NAME。

#### 第 5 步：资源模式（条件 + 缺失时）

- 从 meta-all 数据（`resource_param` 字段）本地查表，**零网络**。
- 没有任何游戏带该参数 → **跳过**。
- 有 + 预解析已识别 → 直接采用。
- 有 + 未识别 → AskUserQuestion：

| 选项 | 值 |
|------|----|
| normal | RESOURCE_DYNAMIC=normal |
| dynamic | RESOURCE_DYNAMIC=dynamic |
| ← 返回上一步 | 回退到第 4 步 |

#### 第 6 步：确认构建（必做）

远程 Jenkins 构建会影响共享系统，默认必须在触发前向用户展示最终参数并确认；只有用户首句明确包含“直接触发 / 不用确认 / 直接打包”等授权表达，且全部参数都来自阶段 A 预解析、批量分支预校验全部 OK 时，才可以跳过确认直接触发。

- **全部参数都来自阶段 A 预解析**，用户明确授权直接触发，且批量分支预校验全部 OK → ✅ **直接触发，跳过确认**。仅向用户**回显**最终参数 + 执行结果。
- **任何参数是阶段 B 交互补齐的**（包括分支编号选择、DEBUG 模式选择、APP 选择、资源模式选择、分支预校验有 MISSING 等）→ ❓ AskUserQuestion 汇总所有参数让用户最后确认：

| 选项 | 行为 |
|------|------|
| 确认触发 | 调用脚本**并行**触发构建 |
| ← 返回修改 | 回退到上一步 |

无论哪条路径，最终都调用：

```bash
bash scripts/jenkins_build.sh trigger-batch <branch> <debug> <app_value> <resource_value> <num1,num2,...>
```

输出包含：每个 Job 的成功/失败状态、汇总统计（`✅ 成功 N / ❌ 失败 N`）、以及失败时的**重试命令**。退出码 = 失败 Job 数量。

---

### 脚本调用次数对比

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| 全量交互（全未知） | 6+ 次 | 3 次（meta-all + list-branches + trigger-batch）|
| 全参数已知 | 3 次 | 2 次（meta-all + trigger-batch）|
| 重复打包同一项目 | 每次联网拉分支 | 缓存命中，0 网络等待 |

---

### 示例

| 用户输入 | Claude 行为 |
|----------|-------------|
| `打包` | meta-all → 全部未知，从第 1 步开始逐项询问，第 6 步弹确认 |
| `打包 龙虎` | meta-all + 并行预拉分支 → 从第 2 步开始（缓存命中则即时展示），第 6 步弹确认 |
| `打包 龙虎 dev` | meta-all + 缓存命中分支 → 跳到第 3 步 DEBUG，第 6 步弹确认 |
| `打包 7 dev release fungo dynamic` | meta-all → 全部已识别 → 默认弹确认；若用户明确说“直接触发”，则直接触发 |
| `打包 all dev debug lama` | meta-all → 游戏+分支+模式+APP 已知，check-branches-batch 校验：全 OK 后默认弹确认；询问资源模式（若有）则走确认路径 |

---

## Jenkins 配置

- Jenkins 地址：`http://10.86.20.10`
- token：`game123`
- APP_NAME / 游戏列表的**权威定义**在 `scripts/jenkins_build.sh`，通过 `meta-all` 子命令读取
- `discover-cocos-jobs` 和 `fetch-apps-remote` 只作为找不到游戏或 APP 时的动态 fallback，不改变编号打包的权威静态元数据
- 触发构建时按 Job 实际参数名传值：`app_param` 字段为 `APP_NAME` 的传 `APP_NAME`，其余传 `BUCKET_NAME`
