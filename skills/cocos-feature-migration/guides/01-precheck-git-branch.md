# 第 1 步：前置检查、Git 基线与目标分支门禁

## 参数预检门禁

第 1 步开始前必须先完成参数预检，且该门禁优先于工具探测、Git 预检、TeamCreate 和 Agent 调度：

- 必须明确 `source_project`、`target_project`、`feature_name`；缺任一项时暂停询问用户。
- 源项目和目标项目路径必须存在，并应转换为绝对路径记录；不得把当前空目录、skill 目录、memory 目录、`.gitignore`、`ignore` 或其他非项目路径猜作源/目标项目。
- 若当前工作目录为空或不是源/目标项目，只要用户提供了明确绝对路径即可继续；不得依赖当前目录作为隐式项目根。
- 参数预检失败时，不得调用 `TeamCreate`、不得启动任何 `Agent`、不得创建 TaskList、不得执行目标侧 Git 或业务修改。
- 参数预检失败时只输出缺失项和示例格式：`/cocos-feature-migration <源项目路径> <目标项目路径> <功能名>`。

## 工具可用性与 degraded mode

### step6_degraded_gate（P1 硬门禁）

最低替代证据标准：

```yaml
minimum_alternative_evidence:
  code_closure: import/text scan + key symbol/file existence + dynamic references risk list
  resource_closure: prefab text scan + .meta uuid reverse index or equivalent cache + dynamic resource hints
  target_fidelity: 05x shared search + target key config/API/event/i18n/prefab targeted search
  prefab_uuid: prefab-static-check-cache or targeted uuid map
```

只有低于上述最低替代证据时才 `blocks_step6: true`；达到最低替代证据但工具 degraded 时，应允许带 constraints 继续，并设置 `status_cap`。


进入 degraded mode 不等于允许无条件写目标业务。第 5 步合并后、第 6 步启动前，controller 必须检查：

```yaml
step6_degraded_gate:
  execution_mode: normal | degraded
  degraded_reasons: []
  alternative_evidence_available: true | false
  affected_dimensions: [code_closure, resource_closure, prefab_uuid, target_fidelity]
  allow_step6_with_constraints: true | false
  blocks_step6: true | false
  status_cap: static-pass | partial-pass-static | blocked-static
````

若 ts-graph / cli-anything-cocoscreator 缺失导致关键代码闭包、资源闭包、Prefab/UUID 或目标保真无替代证据，必须 `blocks_step6: true`。若允许继续，必须写明 constraints 和最终状态上限。


开始迁移分析前，主控仍必须探测 ts-graph MCP 与 `cli-anything-cocoscreator`，但探测失败不再默认完全卡住整个流程。处理分层如下：

```yaml
tool_gate_policy:
  ts_graph:
    available: normal mode; TS/JS 代码闭包优先使用 ts-graph
    unavailable: degraded mode; 使用 rg/Read/import 文本扫描降级分析，记录 code_closure_confidence=partial
  cli_anything_cocoscreator:
    available: normal mode; Cocos 资源/Prefab/UUID 优先使用 CLI 或缓存索引
    unavailable: degraded mode; 使用 prefab/meta 文本扫描、uuid reverse index、已有缓存降级分析，记录 resource_closure_confidence=partial
  hard_stop_only_when:
    - 用户要求必须使用该工具且不可用
    - 没有任何可替代证据，且该缺口会导致继续写目标业务代码存在 overwrite/destructive 风险
    - 第 6 步写入前关键 Prefab/资源无法形成最低安全计划
```

degraded mode 必须写入 `01-前置检查.md`、`迁移清单.md` 和后续 compact：

```yaml
execution_mode:
  mode: normal | degraded
  degraded_reasons: []
  allowed_to_continue: true | false
  confidence_caps:
    code_closure:
    resource_closure:
    final_status_max:
```

若进入 degraded mode，主控仍可继续源侧只读分析和目标侧只读分析；但进入 `migration-applier` 前必须确认第 5 步合并产物已明确列出降级带来的写入风险与验证上限。

## 必须先检查 ts-graph MCP 与 cli-anything-cocoscreator

开始迁移分析前，先通过 MCP 调用 `ts_graph_stats()` 探测 ts-graph MCP 是否可用。

- 调用成功：继续下一项检查。该检查与操作系统无关，不需要区分 macOS / Linux / Windows 命令。
- 工具不存在、未安装、未启动或调用失败：进入 `execution_mode: degraded`，记录 `degraded_reasons: [ts_graph_unavailable]`，使用 `rg` / Read / import 文本扫描降级分析；除非用户明确要求必须使用 ts-graph 或无替代证据会导致写入风险，否则不得因此完全卡住源侧只读分析。

安装指南：`https://github.com/wenext-limited/cocos-ts-graph-mcp/blob/main/%E5%AE%89%E8%A3%85%E6%8C%87%E5%BC%95.md`

不要复制安装步骤；安装指南内容可能变化，以链接内容为准。

接着必须检查 `cli-anything-cocoscreator` 是否可用。

按当前运行环境选择对应命令：

```bash
# macOS / Linux / WSL / Git Bash
command -v cli-anything-cocoscreator

# PowerShell
Get-Command cli-anything-cocoscreator

# cmd
where cli-anything-cocoscreator
```

- 任一对应环境下的检查命令能找到该命令：继续执行迁移流程。
- 对应环境下检查失败、命令不存在、未安装或无法执行：进入 `execution_mode: degraded`，记录 `degraded_reasons: [cli_anything_cocoscreator_unavailable]`，使用 Prefab / `.meta` 文本扫描、uuid reverse index、已有缓存索引降级分析；除非用户明确要求必须使用 CLI、或无法形成第 6 步最低安全资源/Prefab 计划，否则不得因此完全卡住只读分析。

部署指南：`https://github.com/OscargwStudio/cli-anything-cocoscreator/blob/main/DEPLOY.md`

不要复制部署步骤；部署指南内容可能变化，以链接内容为准。

---

## 执行前提

迁移分析默认应基于**已从远程更新后的源项目和目标项目**进行，不应把“是否更新代码”视为可省略步骤。

Git 相关操作在本 skill 中仅视为**第 1 步前置初始化动作**，默认只执行一次。

**目标 feature 分支确认是第 1 步前置动作中的目标侧门禁**：在启动目标侧 agent、以及对目标项目执行 `stash` / `pull` / `checkout` / 创建分支 / 业务修改前，主控必须先只读确认目标当前分支与候选迁移分支；若触发确认条件，必须先向用户提问并等待答复。源侧只读 agent 可在目标分支未确认时先行，但不得读取或修改目标项目业务文件。

- `git status --short` 用于记录初始化前工作区状态；
- 若用户提供或目标项目存在需要承接本次迁移的远程 `feature/xxx` 功能分支，必须在目标项目 Git 初始化前向用户做**一次合并确认**：是否需要拉取并切换到该 `feature/xxx` 分支处理本次迁移；
- 用户确认“需要拉取目标 feature 分支”即代表同时授权：拉取远程 `feature/xxx` 分支、切换到该分支、并在该分支执行后续迁移动作；不得再拆成“是否拉取 / 是否切换 / 是否在该分支处理”三个问题重复确认；
- 若工作区不干净，可在**第 1 步**执行一次 `git stash push -u` 暂存本地变更；
- 随后在**第 1 步**执行一次 `git pull --rebase` 获取远程最新代码；
- 若分析或迁移需要切换分支，可直接执行并在步骤文档中记录原因与结果；
- 完成迁移后，如需恢复第 1 步产生的 stash，可根据任务需要决定是否执行 `git stash pop`，并同样记录到步骤文档。

强约束：

- 第 1 步完成后，后续第 2~7 步默认继承这次初始化后的工作区基线，不再重复要求 clean、不得再次自动 stash、不得再次自动 pull。
- 若后续步骤发现工作区与第 1 步基线不一致，应优先记录风险、标记 `stale` 或上报主控，而不是再次做 Git 现场清理。
- 只有用户明确要求，或发生新的外部变更 / 高风险冲突、且主控已在步骤文档中说明原因时，才允许把额外 Git 动作作为**例外**处理；该例外不得视为默认流程。

标准要求：

- 若工作区干净：应先在第 1 步执行远程更新，再进入后续迁移分析。
- 若工作区不干净：应先把风险写入步骤文档，再在第 1 步自动 `stash` 后更新，并记录 stash 名称、更新前状态与更新后 commit。
- 若尚未完成远程更新就先做了探索性分析：后续产出的步骤文档必须明确标记为 `stale` / 待刷新，不能当作最终分析基线。

推荐顺序（仅第 1 步使用一次）：

```bash
git status --short
git stash push -u -m "claude-feature-migration-<feature>-<date>"
git pull --rebase
```

### Git 远程协议与执行环境预检（分层执行）

Git 预检分为两层，避免为了生成分支菜单提前执行所有远程探测。

#### 第一层：本地快速预检（第 1 步前置，只读，默认执行）

在对源项目或目标项目执行任何 `fetch` / `pull` / `checkout` / `switch` / `stash` / 创建分支前，先对对应项目做本地快速预检：

1. **Git 可执行文件探测**
   - 优先使用 `command -v git`。
   - 若失败且当前环境存在 `/usr/bin/git`，可回退使用 `/usr/bin/git`。
   - 若两者都不可用，停止第 1 步 Git 初始化，写入 open confirmation：`confirmation_topic: git-environment`。
   - 后续第 1 步内所有 Git 命令必须使用已确认的 `git_bin`，不要在同一轮中混用未确认的 `git`。

2. **本地状态与分支识别**
   - 读取当前分支、当前 commit、工作区状态。
   - 对目标项目生成默认迁移分支：`feature/migration_<feature-slug>`。

3. **远程地址形态识别**
   - 使用已确认的 `git_bin` 执行：`git remote get-url origin`。
   - 只做 URL 形态分类和脱敏记录，不默认执行 `ls-remote`。

| URL 形态 | remote_protocol | 示例 |
|---|---|---|
| `git@host:org/repo.git` | `ssh` | `git@github.com:org/repo.git` |
| `ssh://git@host/org/repo.git` | `ssh` | `ssh://git@example.com/org/repo.git` |
| `https://...` | `https` | `https://github.com/org/repo.git` |
| `http://...` | `http` | `http://git.example.com/org/repo.git` |
| 本地路径或 `file://...` | `local` | `/path/repo.git` / `file:///path/repo.git` |
| 其他无法识别形态 | `unknown` | 记录原始形态摘要 |

#### 第二层：按需远程探测（仅当用户选择远程策略或即将远程更新时执行）

只有在以下情况才执行 SSH / HTTPS 认证探测、`ls-remote`、远程分支存在性校验：

- 用户选择需要远程基线的策略（例如 `从 origin/main 创建`、`base=origin/xxx`、`branch=feature/xxx`、`切换已有迁移分支`）；
- 即将执行 `fetch` / `pull` / 远程 checkout。

按 remote_protocol 处理：

1. **SSH remote**
   - 需要远程探测或更新时再检查 SSH 可执行文件：优先 `command -v ssh`，必要时回退 `/usr/bin/ssh`。
   - 后续远程命令复用同一 `git_remote_env`，例如 `GIT_SSH=/usr/bin/ssh`。
   - 若 SSH 不可用，停止远程动作，写入 open confirmation：`confirmation_topic: git-ssh-environment`。

2. **HTTP(S) remote**
   - 需要远程探测或更新时使用非交互方式，例如：`GIT_TERMINAL_PROMPT=0 git ls-remote --heads origin <ref>`。
   - 若认证失败、凭据缺失或命令需要交互，停止远程动作，写入 open confirmation：`confirmation_topic: git-http-auth`。
   - 不得让 `git pull` 进入交互式账号、密码或 token 输入状态。

3. **本地 remote**
   - 需要使用本地 remote 时再确认路径可解析；若路径不存在或不可读，写入 open confirmation：`confirmation_topic: git-remote-local`。

目标分支确认菜单默认不必为了展示所有可用项而预热全部远程引用；菜单应展示本地可直接执行策略、固定自定义输入格式、暂停项，以及明确标注“选择后校验”的常用远程策略。远程相关选项（如 `从 origin/main 创建`、`切换已有远程迁移分支`、`base=origin/xxx`、`branch=feature/xxx`）允许在未提前远程探测时进入菜单，但必须写明“选择后先做只读校验”；若用户选择后校验失败，阻塞并说明原因。

`01-前置检查.md` 和 `迁移清单.md` 必须记录以下字段：

| 字段 | 含义 |
|---|---|
| `git_bin` | 本轮确认使用的 Git 可执行文件 |
| `origin_url_masked` | 脱敏后的 `origin` 地址；不得记录 token / 密码 |
| `remote_protocol` | `ssh` / `https` / `http` / `local` / `unknown` |
| `ssh_bin` | SSH remote 使用的 ssh 路径；非 SSH 可为 `null` |
| `git_remote_env` | 后续 Git 远程命令必须携带的环境，例如 `GIT_SSH=/usr/bin/ssh` / `GIT_TERMINAL_PROMPT=0` |
| `remote_probe_result` | 只读远程探测结果：success / failed / skipped，并记录失败摘要 |

脱敏要求：

- `origin_url_masked` 不得写入用户名密码、token、credential helper 输出。
- 对 `https://user:token@host/org/repo.git` 应记录为 `https://***@host/org/repo.git`。
- 对 SSH 地址可保留 host、org、repo，但不要输出本机私钥路径或 ssh config 详细内容。

### 阶段 Agent 工作目录与 worktree 限制

本 skill 的阶段 agent 默认**不使用 Claude Code 的 `isolation: worktree` 启动方式**。主会话根目录可以不是 Git 仓库，也可以不是源项目或目标项目；这不应阻塞阶段 agent 启动。阶段 agent 必须通过 prompt 中的 `source_project` / `target_project` 绝对路径开展工作，而不是依赖主会话当前目录的 Git 上下文。

硬规则：

- 主控启动 `entry-boundary-analyzer` / `source-code-closure-analyzer` / `source-resource-closure-analyzer` / `target-capability-analyzer` / `fidelity-risk-analyzer` / `resource-migration-planner` / `migration-applier` / `static-verifier` / `final-report-writer` 时，默认 `isolation` 必须使用非 worktree 方式，或直接省略 `isolation`；不得因为“需要隔离”而从主会话根目录创建 Git worktree。
- **Agent 工具调用硬规则**：启动上述阶段 agent 时，禁止传 `isolation: "worktree"`。若当前 Agent 工具 schema 要求必须填写 `isolation`，必须填写 `isolation: "remote"`；若工具允许省略，则直接省略 `isolation`。不得因为“需要隔离/后台执行/并行分析”而选择 worktree。
- 主会话当前目录不是 Git 仓库、或不是源/目标项目仓库时，仍然允许启动阶段 agent；agent 必须在命令中使用绝对路径或 `git -C <source_project|target_project>`。
- 阶段 agent 不得把主会话当前目录当作源/目标项目的 worktree 基线；不得基于无关仓库的 `HEAD` 创建迁移 worktree。
- `entry-boundary-analyzer`、`source-code-closure-analyzer`、`source-resource-closure-analyzer`：只写源项目分析目录，不需要 worktree 隔离。
- `target-capability-analyzer`、`fidelity-risk-analyzer`、`resource-migration-planner`：只写目标迁移文档，不需要 worktree 隔离。
- `migration-applier`：是唯一允许写业务代码/资源的 agent；默认直接在主控已确认并切换好的目标项目分支上串行执行，不使用 Claude Code worktree 隔离。
- `static-verifier`、`final-report-writer`：默认只读验证/汇总和写文档，不需要 worktree 隔离。

如果用户明确要求额外隔离，也不得使用主会话根目录隐式创建 worktree；必须先向用户确认隔离方案，并优先采用目标项目内显式、可记录的 Git 分支/目录策略。该例外必须写入 `01-前置检查.md` 和 `迁移清单.md`，包括隔离路径、基线分支、创建命令和清理策略。

如果错误地从非源/目标项目的主会话目录创建 worktree，必须停止并修正 agent 启动方式；不得把该错误视为源/目标项目 Git 状态问题。

### 目标项目 feature 分支确认（第 1 步前置，按需）

如果用户在参数中提供目标功能分支（例如 `feature/xxx`），或迁移语境明确要求先在目标项目新功能分支处理，则必须在启动目标侧 agent、以及对目标项目执行 stash / pull / 切换分支 / 业务修改前，由主控向用户提出**一个合并问题**：

默认建议的目标迁移分支名为：

```text
feature/migration_<feature-slug>
```

其中 `<feature-slug>` 必须按本文开头的 **feature_slug 生成规则**生成：优先表达“业务对象 + 功能类型”，使用小写英文、数字和下划线 `_`。例如 `jackpot榜单` 的 slug 必须是 `jackpot_rank`，默认候选分支为 `feature/migration_jackpot_rank`。若用户明确给出其他分支名，以用户指定为准。

```text
是否需要拉取并切换到目标项目的 `<feature-branch>` 分支处理本次迁移？
```

选项语义（交互深度硬规则）：

1. **所有可见选项都必须是一层内可直接执行的策略**：用户选择后，主控即可执行对应分支动作、进入对应只读校验动作后执行、或明确暂停；不得再追问“从哪个基线创建 / 是否切换 / 是否拉取”。
2. **目标非默认分支确认时，菜单必须同时展示本地可直接执行策略和选择后校验策略**，并在菜单前用极简摘要说明当前分支、默认迁移分支和关键校验结果。当前本地分支总是可作为“从当前本地分支创建”的本地基线；`origin/main`、指定远程基线和指定目标分支可作为“选择后校验”策略展示，不得因为尚未提前执行远程探测而隐藏。只有已知一定不可执行的具体策略（例如已确认不存在且不可访问的分支）才不要进入编号列表；最多在“不可用摘要”中一行说明。
3. **目标非默认分支确认时，优先按以下策略直接询问用户**：
   - `从 origin/main 创建`：选择后先只读校验 `origin/main`；校验有效时创建并切换到 `feature/migration_<feature-slug>`。若已提前校验有效，可标记为推荐项；若未提前校验，仍应作为“选择后校验”的常用策略展示。
   - `从当前本地分支创建`：从当前本地分支 `<current-branch>` 的当前 commit 创建并切换到 `feature/migration_<feature-slug>`；该策略不依赖当前分支是否存在远程上游，目标当前分支与 feature_slug 不一致时应作为常规可执行选项展示。
   - `继续当前本地分支`：不创建迁移分支，直接在当前本地分支 `<current-branch>` 执行迁移。
   - `切换已有迁移分支`：本地已检测到时可直接展示；远程未提前探测时可展示为“选择后校验远程 `feature/migration_<feature-slug>`”；已确认本地和远程均不存在时不要在编号菜单中展示该项。
   - `从指定远程基线创建`：用户直接提供 `base=origin/xxx`，主控只读校验该远程基线；校验唯一有效时，创建并切换到默认迁移分支 `feature/migration_<feature-slug>`；校验失败时阻塞并说明原因，不再层层追问。
   - `改用指定目标分支`：用户直接提供 `branch=feature/xxx`，主控只读校验该目标分支；校验唯一有效时，拉取/切换并在该分支执行迁移；校验失败时阻塞并说明原因，不再层层追问。
   - `暂停，不做分支动作`：本轮停止迁移流程，不执行 stash / pull / checkout / 业务修改。
4. **自定义远程基线和自定义目标分支必须作为固定可执行输入格式保留**，不得只藏在“Other”说明里。目标分支策略确认默认使用**纯文本菜单**，不要使用 `AskUserQuestion` 按钮式组件。纯文本菜单应只列出推荐策略、当前可执行策略、自定义输入格式和暂停策略；当前不可执行策略不要占用编号列表。
5. **提示文本必须短**：从 skill 启动到目标分支策略确认之间，除非前置工具不可用，否则不要输出阶段性说明。最终询问应控制为“门禁通过摘要 + 分支摘要 + 可选策略菜单”，避免先汇报一大段再继续提问。
6. **创建默认迁移分支的选项必须直接写清楚创建基线**，例如：
   - `从 origin/main 创建 feature/migration_<feature-slug>`
   - `从当前本地分支 <current-branch> 创建 feature/migration_<feature-slug>`
   - `base=origin/release/1.1.3` 表示从该远程基线创建 `feature/migration_<feature-slug>`
7. **选项文案必须简单明了**：优先使用短标签，如“从 origin/main 创建”“继续当前本地分支”“从当前本地分支创建”“从指定远程基线创建”“改用指定目标分支”“暂停”。详细含义放在 description 或正文说明中，不在 label 中堆叠长句。

#### 目标分支菜单推荐排序（硬规则）

目标分支策略菜单必须有“推荐项”，并说明推荐原因。默认排序和推荐规则：

1. **用户显式指定目标分支时优先推荐用户指定分支**：例如用户参数或回复中给出 `branch=feature/xxx`，主控只读校验后优先使用该分支。
2. **默认推荐 `从 origin/main 创建`**：适合希望迁移分支干净、不继承当前 feature 分支改动；未提前远程探测时标题写“推荐，选择后校验”。
3. **远程不可用、`origin/main` 校验失败或用户不希望依赖远程时，推荐 `从当前本地分支创建`**：适合承接当前分支已有改动，但仍保持本次迁移在独立分支上。
4. **只有用户明确表示本次迁移属于当前分支时，才推荐 `继续当前本地分支`**：该选项风险更高，因为迁移会叠加到当前分支。

每个菜单项必须包含一行“适合/适用”说明，不能只写动作。例如：

```text
1. 从 origin/main 创建（推荐，选择后校验）
   - 先只读校验 origin/main，校验通过后创建并切换到 feature/migration_<feature-slug>
   - 适合希望迁移分支干净、不继承当前 feature 分支改动
```

若远程 `<feature-branch>` 不存在，但用户仍希望创建该目标功能分支，必须在一次确认里完成“创建默认迁移分支 + 创建基线 + 切换到新分支”的授权；不得拆成两轮确认。合并确认应优先展示可执行策略，自定义基线、自定义目标分支和暂停策略固定保留；当前不可执行策略只在不可用摘要中说明，不进入编号列表。合并确认示例：

```text
✅ 前置门禁通过：ts-graph MCP 可用；cli-anything-cocoscreator 可用。

目标分支确认：
- 当前门禁：`target-feature-branch`
- 当前分支：`<current-branch>`
- 默认迁移分支：`feature/migration_<feature-slug>`
- 默认创建基线：`<base-ref>`（例如 `origin/main`、当前本地分支 `<current-branch>`、或用户输入的 `base=origin/xxx`）
- 可用基线：当前本地分支 `<current-branch>`；`origin/main`（选择后校验，若未提前校验）
- 不可用：已有迁移分支未检测到（如适用）

请选择目标分支策略，直接回复编号或文本即可：
1. 从 `origin/main` 创建（推荐，选择后校验）
   - 先只读校验 `origin/main`，校验通过后创建并切换到 `feature/migration_<feature-slug>`
   - 适合希望迁移分支干净、不继承当前 feature 分支改动
2. 继续当前本地分支
   - 直接在 `<current-branch>` 执行迁移
   - 适合本次迁移明确属于当前分支
3. 从当前本地分支创建
   - 从当前本地分支 `<current-branch>` 的当前 commit 创建并切换到 `feature/migration_<feature-slug>`
   - 适合要承接当前分支已有改动，但希望迁移有独立分支
4. 切换已有迁移分支
   - 本地已存在则直接切换；未提前远程探测时先校验远程 `feature/migration_<feature-slug>`
   - 适合团队已创建过同名迁移分支
5. `base=origin/xxx`
   - 从指定远程基线创建默认迁移分支，例如 `base=origin/release/1.1.3`
   - 适合迁移必须基于某个 release / hotfix / dev 远程分支
6. `branch=feature/xxx`
   - 改用指定目标分支，例如 `branch=feature/foo`
   - 适合用户已明确指定承接迁移的目标分支
7. 暂停
```

目标分支策略确认必须使用纯文本菜单，不使用 `AskUserQuestion`。菜单必须允许用户直接回复编号或完整策略文本。当前不可执行的策略不得进入编号列表；如有必要，只在菜单前的“不可用”摘要中简短说明原因。不得因交互组件选项数量限制而裁剪自定义输入格式和暂停策略。

纯文本菜单规则：

```text
✅ 前置门禁通过：ts-graph MCP 可用；cli-anything-cocoscreator 可用。

目标分支确认：
- 当前门禁：`target-feature-branch`
- 当前分支：`<current-branch>`
- 默认迁移分支：`feature/migration_<feature-slug>`
- 默认创建基线：`<base-ref>`（例如 `origin/main`、当前本地分支 `<current-branch>`、或用户输入的 `base=origin/xxx`）
- 可用基线：当前本地分支 `<current-branch>`；`origin/main`（选择后校验，若未提前校验）
- 不可用：<仅列必要摘要；没有则省略本行>

请选择目标分支策略，直接回复编号或文本即可：
1. 从 origin/main 创建（推荐，选择后校验）
   - 先只读校验 origin/main，校验通过后创建并切换到 feature/migration_<feature-slug>
   - 适合希望迁移分支干净、不继承当前 feature 分支改动

2. 继续当前本地分支
   - 直接在 <current-branch> 执行本次迁移
   - 适合本次迁移明确属于当前分支

3. 从当前本地分支创建
   - 从当前本地分支 <current-branch> 的当前 commit 创建并切换到 feature/migration_<feature-slug>
   - 适合要承接当前分支已有改动，但希望迁移有独立分支

4. 切换已有迁移分支
   - 本地已存在则直接切换；未提前远程探测时先校验远程 feature/migration_<feature-slug>
   - 适合团队已创建过同名迁移分支

5. base=origin/xxx
   - 从指定远程基线创建默认迁移分支，例如 base=origin/release/1.1.3
   - 适合迁移必须基于某个 release / hotfix / dev 远程分支

6. branch=feature/xxx
   - 改用指定目标分支，例如 branch=feature/foo
   - 适合用户已明确指定承接迁移的目标分支

7. 暂停
```

要求：

- 菜单前必须说明目标当前分支、默认迁移分支、已校验到的可用基线；不可执行候选只在必要时用一行“不可用”摘要说明。
- 用户回复 `1` / `2` / `7`、完整中文策略、`base=origin/xxx` 或 `branch=feature/xxx` 都应被视为有效输入。
- 当前不可执行的策略不要展示在编号列表里；用户若手动输入了不可执行策略，应阻塞并说明需换策略或补充有效基线/分支。
- 不得再提示用户点击 `Other`、`Type something` 或依赖 AskUserQuestion 的自定义输入能力。

当前本地分支创建策略不依赖上游或 `origin/<current-branch>` 是否存在；若上游无效，仅在不可用摘要中说明“当前远程基线不可用”，不得因此隐藏“从当前本地分支创建”。

确认创建基线后，才允许创建并切换到目标功能分支；不得在远程 `<feature-branch>` 不存在时自行推断基线分支。

| 字段 | 含义 |
|---|---|
| `target_feature_branch_suggested` | 主控按 `feature/migration_<feature-slug>` 生成的默认建议迁移分支 |
| `target_feature_branch_requested` | 用户是否要求拉取/切换/创建目标 feature 分支 |
| `target_feature_branch_final` | 实际使用的目标分支；沿用当前分支时也必须记录 |
| `target_current_branch_explicitly_confirmed` | 若沿用当前非默认分支，用户是否已显式确认 |

要求：

- 这是一个合并确认，不得拆成“是否拉取远程分支 / 是否切换分支 / 是否在该分支处理”三个问题。
- 若用户确认需要目标 feature 分支，应在 `01-前置检查.md` 和 `迁移清单.md` 记录：`target_feature_branch_requested: true`、分支名、确认结果、切换前分支、切换后分支、切换后 commit。
- 若远程目标 feature 分支不存在且用户确认创建，应额外记录：`target_feature_branch_existed: false`、`target_feature_branch_create_base`、创建基线的选择来源（当前本地分支 / `origin/main` / 用户输入远程分支名）、创建命令结果、创建后分支与 commit。
- 若用户拒绝或未提供分支，应记录 `target_feature_branch_requested: false` 或 `target_feature_branch: null`，并说明沿用当前目标分支。
- 若拉取或切换分支失败，应停止进入迁移动作，在 `迁移清单.md` 写入 `needs_user_confirmation: true` 与 `confirmation_topic: target-feature-branch`。

---

## 标准工作流

### 第 1 步：更新源项目与目标项目

开始本步骤前：先读取目标项目 `迁移清单.md` 和 `01-前置检查.md`（如果存在）。若前置结论仍有效则复用，否则重写。

完成本步骤后：写回目标项目 `01-前置检查.md`，并更新目标项目 `迁移清单.md` 中第 1 步状态。

这是正式迁移分析的默认前置步骤，不应因为用户没有单独提到 pull/stash 就跳过。工作区存在未提交修改时，也不应停在这一步等待确认；应直接记录风险、执行 stash，再继续更新基线。

如果用户提供了目标项目 `feature/xxx` 分支，或明确希望本次迁移在新的目标功能分支处理，则在目标项目 Git 初始化前先执行“目标项目 feature 分支确认”：只问一次是否拉取并切换到该分支处理。用户选择需要时，即视为同时同意拉取、切换、并在该分支处理；不要再分别询问这三个动作。

如果用户没有显式提供目标 feature 分支，主控仍必须在启动目标侧 agent、目标项目 stash / pull / checkout / 业务修改前，只读获取目标项目当前分支，并生成默认建议迁移分支：`feature/migration_<feature-slug>`。源侧只读 agent 可以先行执行，但不得修改或依赖目标项目业务文件。

若目标项目当前分支已经等于默认建议迁移分支，或分支名与本次 `feature_slug` 明显一致，可记录 `target_feature_branch_final` 后继续。

如果目标项目当前分支匹配 `feature/*`、`feat/*`、`release/*`、`hotfix/*` 等非默认开发分支，且分支名与本次 `feature_slug` 不明显一致，主控必须在目标项目 stash / pull / checkout / 业务修改以及目标侧阶段 agent 启动前执行一次合并确认。源侧只读 agent 可先行，但不得读取或修改目标项目业务文件。确认提示必须短，不要在工具检查后先输出额外阶段性说明；直接给出“门禁通过 + 分支摘要 + 可选菜单”：

```text
✅ 前置门禁通过：ts-graph MCP 可用；cli-anything-cocoscreator 可用。

目标分支确认：
- 当前门禁：`target-feature-branch`
- 当前分支：`<current-branch>`
- 默认迁移分支：`feature/migration_<feature-slug>`
- 默认创建基线：`<base-ref>`（例如 `origin/main`、当前本地分支 `<current-branch>`、或用户输入的 `base=origin/xxx`）
- 可用基线：当前本地分支 `<current-branch>`；`origin/main`（选择后校验，若未提前校验）
- 不可用：<仅列必要摘要；没有则省略本行>

请选择目标分支策略，直接回复编号或文本即可：
1. 从 `origin/main` 创建
   - 先只读校验 `origin/main`，校验通过后创建并切换到 `feature/migration_<feature-slug>`
2. 继续当前本地分支
   - 直接在 `<current-branch>` 执行迁移
3. 从当前本地分支创建
   - 从当前本地分支 `<current-branch>` 的当前 commit 创建并切换到 `feature/migration_<feature-slug>`
4. 切换已有迁移分支
   - 本地已存在则直接切换；未提前远程探测时先校验远程 `feature/migration_<feature-slug>`
5. `base=origin/xxx`
   - 从指定远程基线创建默认迁移分支，例如 `base=origin/release/1.1.3`
6. `branch=feature/xxx`
   - 改用指定目标分支，例如 `branch=feature/foo`
7. 暂停
```

编号菜单只展示当前可执行的具体策略、固定自定义输入格式和暂停；当前不可执行的具体策略不得进入编号列表。

1. **从 origin/main 创建**：选择后先只读校验 `origin/main`；校验有效时创建并切换到 `feature/migration_<feature-slug>`。若已提前校验有效可作为推荐项；若未提前校验，仍应作为“选择后校验”策略展示。
2. **继续当前本地分支**：不创建迁移分支，用户明确授权在当前本地分支 `<current-branch>` 执行本次迁移，记录 `target_current_branch_explicitly_confirmed: true`。
3. **从当前本地分支创建**：从当前本地分支 `<current-branch>` 的当前 commit 创建并切换到 `feature/migration_<feature-slug>`；该策略不依赖当前分支是否存在远程上游，目标当前分支与 feature_slug 不一致时应作为常规可执行选项展示。
4. **切换已有迁移分支**：本地已检测到时可直接展示；未提前远程探测时可展示为“选择后校验远程 `feature/migration_<feature-slug>`”；用户选择即授权只读校验，校验有效后拉取/切换并在该分支执行迁移。
5. **从指定远程基线创建**：用户直接回复 `base=origin/xxx`，主控只读校验该远程基线；校验唯一有效时，从该基线创建并切换到默认迁移分支 `feature/migration_<feature-slug>`；校验失败时阻塞并说明原因。
6. **改用指定目标分支**：用户直接回复 `branch=feature/xxx`，主控只读校验该目标分支；校验唯一有效时，拉取/切换并在该分支执行迁移；校验失败时阻塞并说明原因。
7. **暂停**：本轮停止迁移流程，不执行 stash / pull / checkout / 业务修改。

交互深度硬规则：

- 目标分支策略确认必须使用**纯文本菜单**，不要使用 `AskUserQuestion`；菜单允许用户直接回复编号、完整策略文本、`base=origin/xxx` 或 `branch=feature/xxx`。
- 不得只展示“从 origin/main 创建 / 继续当前本地分支”两个选项，也不得只展示“继续当前本地分支 / 从当前本地分支创建”两个选项；必须固定保留 `从当前本地分支创建`、`base=origin/xxx`、`branch=feature/xxx` 和 `暂停`。`从 origin/main 创建`应在未提前探测时作为“选择后校验”策略展示；已有迁移分支本地存在或允许选择后远程校验时也可展示。
- 不得展示“检查并切换默认迁移分支”“换一个分支”“其他远程基线”等选择后还需要继续追问的普通可见选项。
- 如需非默认基线或非默认目标分支，必须让用户直接输入完整意图，例如 `base=origin/release/1.1.3` 或 `branch=feature/foo`；主控收到后只读校验，能唯一确定时直接执行，不能唯一确定时阻塞并说明原因，而不是继续层层追问。
- 创建类选项必须在菜单条目中写明创建基线；不可执行项不得进入编号列表，必要时只在菜单前的不可用摘要中说明。

只读探测远程候选分支允许使用 `git ls-remote --heads origin <pattern>`；但拉取、切换、创建分支都必须在用户确认后执行。第 1 步必须在 `01-前置检查.md` 和 `迁移清单.md` 记录：`target_current_branch`、`target_feature_branch_suggested`、`target_feature_branch_final`、`target_current_branch_explicitly_confirmed`、`target_feature_branch_confirmation_reason`、候选远程分支探测结果和用户选择。

**但该类 Git 现场处理只允许发生在第 1 步一次。** 第 1 步完成后，后续第 2~7 步必须沿用这次初始化后的工作区基线持续推进，不得再次以“为了保持干净”或“继续分析/迁移更方便”为由重复执行 stash / clean / pull。

对源项目和目标项目分别执行：

1. 查看工作区状态
2. 若工作区不干净，则在第 1 步自动 stash 本地变更，并记录 stash 名称
3. 拉取远程最新代码
4. 记录当前分支名与 commit

建议记录表：

| 项目 | 路径 | 初始分支 | 目标 feature 分支确认 | feature 创建基线 | 更新前状态 | 更新动作 | 更新后分支 | 更新后 commit |
|------|------|----------|------------------------|------------------|-----------|----------|------------|----------------|
| 源项目 | /path/A | xxx | 不适用 | 不适用 | clean / dirty | pulled / stashed+pulled | xxx | abc123 |
| 目标项目 | /path/B | xxx | 默认建议 `feature/migration_<feature-slug>`；需要并已切换 / 继续当前分支 / 创建默认迁移分支 | 已存在 / origin/main / origin/dev / 用户输入 origin/release/xxx | clean / dirty | checkout+pulled / create-branch+checkout / pulled / stashed+checkout+pulled | feature/migration_xxx | def456 |

#### 1.x 门禁交互去歧义规则（硬规则）

第 1 步可能同时触发多个需要用户选择的门禁，例如：

- 源分析缓存处理：复用 / 增量复核 / 重新完整分析；
- 目标分支策略：继续当前分支 / 从当前本地分支或某个远程基线创建默认迁移分支 / 改用指定分支 / 暂停。

这些门禁不得在同一轮输出中同时使用独立的 `1/2/3/...` 编号菜单。主控必须保证**一个用户回复只能对应一个门禁问题**。

处理规则：

1. 若多个门禁都需要用户选择，必须串行提问：先问当前最阻塞的一个门禁，用户答复并关闭后，再问下一个门禁。
2. 若确实需要合并提问，必须把组合策略编码成唯一选项，例如 `A. 源分析=重新完整分析；目标分支=从 origin/main 创建 feature/migration_<feature-slug>`，不得让两个菜单都使用数字编号。
3. 每个菜单前必须写明 `当前门禁：<gate-name>`，例如 `当前门禁：source-analysis-cache` 或 `当前门禁：target-feature-branch`。
4. 用户只回复数字时，主控只能解释为当前门禁菜单中的编号；不得跨菜单猜测。
5. 若上一轮已经输出过多个编号菜单并造成歧义，必须暂停澄清，不得自行选择。

推荐提问顺序：

1. 参数预检 / 工具可用性阻塞；
2. 目标分支策略门禁（目标侧写入和目标侧 agent 启动前必须关闭）；
3. 源分析缓存处理门禁（进入第 2~4 步前必须关闭）；
4. 入口 / 边界 / 保真风险等业务门禁。

#### 1.x 源分析缓存检查（必做）

在进入第 2 步前，必须先检查源项目内是否已存在可复用的源分析目录：

`<source-project>/.claude/cocos-feature-migration/source-features/<feature-slug>/`

重点检查：

- `源分析清单.md` 是否存在
- `02-源入口候选.md` 是否存在
- `03-源代码闭包.md` 是否存在
- `04-源资源闭包.md` 是否存在
- 上次分析记录的 branch / commit 是否与当前一致

若存在历史源分析，必须先判断其是否可复用。若可复用，不得直接重跑，而应向用户说明当前已有源分析基线，并提供选择：

1. 复用已有源分析，直接跳过第 2~4 步
2. 基于已有结果做增量复核
3. 忽略旧结果，重新完整分析

处理要求：

- 若用户选择复用：后续第 2~4 步可直接引用源项目已有分析结果；
- 若用户选择增量复核：必须先读取旧分析，再只核对关键入口、关键代码闭包、关键资源闭包；
- 若用户选择重新完整分析：应把旧源分析视为历史基线，本轮按当前 commit 完整重建；
- 若源项目不存在历史分析：正常进入第 2 步，并在本轮生成新的源分析产物。

目标项目 `迁移清单.md` 必须同步记录：

- `source_analysis_path`
- `source_analysis_mode`
- `source_analysis_branch`
- `source_analysis_commit`
- `source_analysis_status`

---
