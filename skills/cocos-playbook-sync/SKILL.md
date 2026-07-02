---
name: cocos-playbook-sync
description: 同步用户级安装目录中的 playbook-cocos 仓库与 GitHub 远程。用于用户要求更新本地知识库、上传本地修改、或把本地 playbook-cocos 变更提交为 PR 时。流程包含固定安装目录检查、工作区变更判断、无本地修改时仅快进更新、有本地修改时列出变更并让用户选择丢弃或进入 PR 提交流程。
tags: [cocos, git, github, pull-request, sync, playbook]
inputs: [本地 playbook-cocos 仓库状态, 用户对本地修改的处理选择, 分支名, PR 标题和描述]
outputs: [更新后的用户级本地 main, 或 feat 分支和 GitHub Pull Request]
---

# Playbook Cocos 同步与上传

## 使用场景

当用户要求同步、更新或上传本地 `playbook-cocos` 仓库时使用，包括：

- 更新本地 `playbook-cocos` 到远程 `origin/main` 最新版本
- 检查本地是否有未提交修改
- 本地无修改时，只执行安全快进更新
- 本地有修改时，列出修改内容，让用户选择丢弃本地修改或执行 PR 提交流程
- 将本地修改提交到 `feat/xxx` 分支并创建合并到 `origin/main` 的 Pull Request

不用于通用业务游戏仓库同步，也不用于未确认目标仓库的 Git 自动化。

## 目标仓库

- GitHub 仓库：`https://github.com/wenext-limited/playbook-cocos`
- 目标 base：`origin/main`
- 本地同步目录固定为用户级安装目录，不使用当前业务项目目录作为默认目标：
  - macOS/Linux：`~/.playbook-cocos`
  - Windows：`%USERPROFILE%\.playbook-cocos`
- 该目录约定来自仓库根目录的 `AI本机安装.md`。
- 如果当前工作目录不是上述用户级安装目录，也必须先切换到该目录后再执行同步或上传流程。
- 本技能不负责首次安装；如果用户级安装目录不存在，提示用户先按 `AI本机安装.md` 完成安装。

## 必须先检查环境

执行同步或上传流程前，先检查并向用户简要汇报。所有 Git 命令都必须在用户级安装目录中执行。

### macOS/Linux

先确认目标目录存在且是 Git 仓库：

```bash
test -d ~/.playbook-cocos
test -d ~/.playbook-cocos/.git
cd ~/.playbook-cocos
```

### Windows PowerShell

先确认目标目录存在且是 Git 仓库：

```powershell
Test-Path "$env:USERPROFILE\.playbook-cocos"
Test-Path "$env:USERPROFILE\.playbook-cocos\.git"
Set-Location "$env:USERPROFILE\.playbook-cocos"
```

如果目标目录不存在，或存在但不包含 `.git`，停止流程并提示用户先按 `AI本机安装.md` 处理；不要自动 clone、覆盖、删除或改用当前目录。

进入用户级安装目录后，继续检查：

1. 当前目录是否在 Git 仓库内：

   ```bash
   git rev-parse --show-toplevel
   ```

2. 当前仓库 remote 是否指向 `wenext-limited/playbook-cocos`：

   ```bash
   git remote -v
   ```

   允许 SSH 或 HTTPS：
   - `git@github.com:wenext-limited/playbook-cocos.git`
   - `https://github.com/wenext-limited/playbook-cocos.git`

3. 当前分支和工作区状态：

   ```bash
   git branch --show-current
   git status --short
   ```

4. 当前是否能获取远程 main：

   ```bash
   git fetch origin main
   ```

如果 `git rev-parse --show-toplevel` 输出不是用户级安装目录，停止并报告实际仓库路径，不要继续同步。

如果 remote 不是 `wenext-limited/playbook-cocos`，停止并要求用户确认目标仓库。

如果 `git fetch origin main` 失败，停止并报告原因，不要继续更新、丢弃或提交。

## 异常状态预检

`git fetch origin main` 成功后、判断本地修改前，必须先检查用户级安装仓库是否处于异常 Git 状态：

```bash
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse --verify HEAD
git show-ref --verify --quiet refs/heads/main
git rev-parse --verify origin/main
git merge-base --is-ancestor main origin/main
git merge-base --is-ancestor origin/main main
git stash list --date=local --max-count=5
```

同时检查 `.git` 内是否存在未完成操作或锁文件。macOS/Linux：

```bash
test -f .git/MERGE_HEAD
test -d .git/rebase-merge
test -d .git/rebase-apply
test -f .git/CHERRY_PICK_HEAD
test -f .git/REVERT_HEAD
test -f .git/index.lock
```

Windows PowerShell：

```powershell
Test-Path ".git\MERGE_HEAD"
Test-Path ".git\rebase-merge"
Test-Path ".git\rebase-apply"
Test-Path ".git\CHERRY_PICK_HEAD"
Test-Path ".git\REVERT_HEAD"
Test-Path ".git\index.lock"
```

### 必须停止并等待用户选择的异常

如果检测到以下任一情况，必须先列出检测结果并暂停，不要继续 `switch`、`pull`、`stash`、`reset`、`clean`、`commit` 或 `push`：

- 处于 merge、rebase、cherry-pick 或 revert 过程中。
- 存在 `.git/index.lock`，或 Git 报告权限/锁文件错误。
- 当前是 detached HEAD，即 `git rev-parse --abbrev-ref HEAD` 输出 `HEAD`。
- 本地 `main` 不存在。
- `origin/main` 不存在或不可解析。
- 本地 `main` 比 `origin/main` 超前。
- 本地 `main` 与 `origin/main` 分叉。
- `git stash list` 非空，且后续流程需要创建或弹出 stash。

向用户说明：

```text
检测到 ~/.playbook-cocos 存在异常 Git 状态。请选择处理方式：
A. 提交为 PR：保留本地状态，进入 PR 提交流程（仅适用于有本地修改或本地 main 超前的情况）
B. 查看可选处理方案：由 AI 按异常类型列出可执行方案、风险和推荐项，等待用户继续选择
C. 重新检查：维护者或 AI 已处理后，重新执行环境检查和异常状态预检
```

选择规则：

- 只能在用户明确回复 A、B 或 C 后继续。
- 选择 A 前，必须展示异常状态、`git status --short --branch`、`git diff --stat`、`git diff --cached --stat` 和本地领先提交摘要。
- 如果没有本地修改且 `main` 没有超前提交，不能进入 A，要求用户选择 B 或 C。
- 选择 B 时先不做任何 Git 写操作；AI 必须汇总异常状态、当前分支、remote、`git status --short --branch`，并按下方“异常处理方案菜单”列出可选项，让用户再次选择具体处理方案后才继续。
- 选择 C 时只允许重新执行环境检查和异常状态预检。
- 对 merge、rebase、cherry-pick、revert、detached HEAD、锁文件、权限错误、`main` 缺失、`origin/main` 缺失和分叉状态，不自动修复；默认建议选择 B，并由 AI 继续协助判断下一步。
- 如果 stash 列表非空且进入 PR 流程，后续创建 stash 后必须记录新 stash 的引用或名称，不要直接假设 `git stash pop` 一定弹出本次创建的 stash。

### 异常处理方案菜单

用户选择 B 后，AI 必须按实际异常类型列出菜单；只展示适用项，不展示无关项。每个选项都要说明是否会改动文件、是否可能丢失修改、是否需要二次确认。

通用选项：

```text
1. 只查看详情：展示异常详情和建议，不做任何改动
2. 重新检查：重新执行环境检查和异常状态预检
3. 生成维护者摘要：输出可复制给维护者的信息，不做任何改动
```

按异常类型追加选项：

- **本地 main 超前且无工作区修改**：可选“提交为 PR”，AI 协助创建 `feat/xxx` 分支、推送并创建 PR；不可直接 `pull` 覆盖。
- **本地有工作区修改**：可选“提交为 PR”或“丢弃后更新”；丢弃必须再次明确确认。
- **已有 stash**：可选“查看 stash 列表”；未经用户选择具体 stash，不执行 `stash pop` 或 `stash drop`。
- **detached HEAD**：可选“查看当前提交”和“尝试切回 main”；切回前必须确认工作区干净，且不得丢弃提交。
- **merge/rebase/cherry-pick/revert 未完成**：可选“查看冲突状态”和“生成维护者摘要”；不自动 `--abort`、`--continue` 或解决冲突。
- **本地 main 与 origin/main 分叉**：可选“生成维护者摘要”或“提交为 PR”；不自动 merge、rebase 或 reset。
- **锁文件或权限错误**：可选“查看锁文件和进程提示”；不自动删除 `.git/index.lock`。
- **main 或 origin/main 缺失**：可选“生成维护者摘要”和“重新检查”；不自动创建本地 `main` 或改 remote。

执行规则：

- 只能在用户明确选择具体菜单项后继续。
- 涉及丢弃、切分支、stash、commit、push、PR 的操作，必须沿用对应章节的确认和安全规则。
- 如果用户选择“生成维护者摘要”，输出当前目录、remote、当前分支、异常类型、`git status --short --branch`、最近提交和建议处理方向。

## 总体决策流程

环境检查完成后，必须先判断本地是否有修改：

```bash
git status --short
git diff --stat
git diff --cached --stat
```

### 情况一：本地没有修改

如果 `git status --short` 没有输出，说明工作区和暂存区都干净。此时先确认本地 `main` 存在，再做更新：

```bash
git show-ref --verify --quiet refs/heads/main
git switch main
git pull --ff-only origin main
```

如果 `git show-ref --verify --quiet refs/heads/main` 失败，停止并说明本地用户级安装仓库状态异常；不要自动从远程创建 `main`。

更新成功后输出当前分支、最新提交和验证结果：

```bash
git branch --show-current
git log -1 --oneline
```

本地没有修改时，不创建分支、不提交、不推送、不创建 PR。

### 情况二：本地有修改

如果 `git status --short` 有输出，必须先列出修改内容，并暂停让用户选择：

```bash
git status --short
git diff --stat
git diff --cached --stat
```

然后向用户说明：

```text
检测到本地存在未提交修改。请选择处理方式：
A. 丢弃本地修改后更新：放弃当前工作区和暂存区修改，再执行快进更新
B. 提交为 PR：保留本地修改，进入 PR 提交流程
C. 查看可选处理方案：由 AI 列出提交 PR、丢弃更新、仅查看详情、生成维护者摘要等方案，等待用户继续选择
```

选择规则：

- 只能在用户明确回复 A、B 或 C 后继续。
- 用户选择 A 前，必须再次提醒“会丢弃本地修改”，并等待明确确认。
- 用户选择 B 后，进入下方“PR 提交流程”。
- 用户选择 C 时，先不做任何 Git 写操作；AI 必须列出可选方案、风险和推荐项，并等待用户再次选择具体处理方案。
- 不允许在用户未选择前自动 stash、reset、checkout、pull、commit 或 push。

## 丢弃本地修改后更新流程

仅当用户选择 A，并再次明确确认丢弃本地修改后，才可执行。

先再次展示将被丢弃的修改：

```bash
git status --short
git diff --stat
git diff --cached --stat
```

然后执行丢弃与更新：

```bash
git reset --hard
git clean -fd
git show-ref --verify --quiet refs/heads/main
git switch main
git pull --ff-only origin main
```

如果 `git show-ref --verify --quiet refs/heads/main` 失败，停止并说明本地用户级安装仓库状态异常；不要自动从远程创建 `main`。

注意：

- `git reset --hard` 和 `git clean -fd` 是破坏性操作，必须在用户明确确认后执行。
- 不要使用 `git clean -fdx`，除非用户明确要求并理解会删除被忽略文件。
- 如果 `pull --ff-only` 失败，停止并说明原因，不自动 merge/rebase。

## PR 提交流程

仅当用户选择 B 后执行。该流程负责上传本地修改到 `feat/xxx` 分支，并创建合并到 `origin/main` 的 PR。

### 1. 检查 GitHub CLI

进入 PR 提交流程前，检查 GitHub CLI 是否可用且已登录：

```bash
gh --version
gh auth status
```

如果 `gh` 不存在或未登录，停止并提示用户安装/登录 GitHub CLI；不要尝试用网页或手工 API 替代。

### 2. 让用户选择提交范围

Stage 任何文件之前，必须先展示当前变更摘要并让用户选择提交范围：

```text
请选择本次 PR 的提交范围：
A. 只提交 Skill 内容：仅包含 skills/ 下与本次 Skill 相关的新增/修改文件
B. 提交所有变更：包含当前工作区全部新增、修改、删除文件
C. 其他/自定义：由用户明确指定要提交或排除的文件路径
```

选择规则：

- 只能在用户明确回复 A、B 或 C 后继续。
- 如果用户选择 A，必须列出将被纳入的 `skills/` 路径；若无法判断“本次 Skill 相关”文件，改为要求用户明确路径，不要猜测。
- 如果用户选择 B，使用当前工作区全部变更。
- 如果用户选择 C，要求用户给出精确文件或目录路径；stage 前回显最终路径清单让用户确认。
- 用户选择完成后，后续 stash、恢复、commit、push 和 PR 都只围绕该范围操作。

分支名规则：

- 必须以 `feat/` 开头。
- 后缀使用英文小写、数字和短横线，例如 `feat/update-playbook-sync-skill`。
- 不要复用已存在且用途不明的远程分支。

### 3. 按用户选择 Stage 本地修改

先展示本地变更摘要：

```bash
git status --short
git diff --stat
git diff --cached --stat
```

然后按用户选择执行 stage。

#### A. 只提交 Skill 内容

仅 stage 用户确认的 Skill 相关路径，例如：

```bash
git add skills/cocos-playbook-sync/SKILL.md skills/README.md
```

如果本次还同步更新了入口索引，可以在用户确认后纳入，例如：

```bash
git add README.md docs/使用说明.md
```

#### B. 提交所有变更

stage 当前工作区全部变更：

```bash
git add -A
```

#### C. 其他/自定义

只 stage 用户明确指定并确认的路径，例如：

```bash
git add <path-1> <path-2>
```

不要用 `git add -A` 代替用户自定义范围。

确认暂存区非空：

```bash
git diff --cached --stat
```

继续前必须向用户回显暂存区统计，确认这就是用户选择的 A/B/C 范围。

如果没有可提交变更，停止流程。

### 4. 临时保存选择的改动

根据用户选择的 A/B/C 范围保存改动，确保后续更新远程 `main` 时不会混入未选择文件。

#### A/C：只保存已 stage 的指定范围

优先使用 `git stash --staged` 只保存暂存区内容：

```bash
git stash push --staged -m "playbook-sync: selected staged changes"
```

如果当前 Git 不支持 `--staged`，停止并提示用户升级 Git，或让用户查看可选处理方案；不要退回到全量 stash。

保存后检查是否仍有未选择的本地改动：

```bash
git status --short
```

如果仍有未选择的本地改动，停止流程并让用户先处理这些改动；不要为了继续流程而自动 stash、删除或覆盖它们。

#### B：保存全部工作区改动

用户选择 B 时，保存当前工作区全部变更：

```bash
git stash push --include-untracked -m "playbook-sync: local changes"
```

保存后确认工作区干净：

```bash
git status --short
```

如果工作区不干净，停止并说明原因，不要继续切分支或拉取。

### 5. 更新本地 main

切到本地 `main` 并快进到 `origin/main`：

```bash
git show-ref --verify --quiet refs/heads/main
git switch main
git pull --ff-only origin main
```

如果 `git show-ref --verify --quiet refs/heads/main` 失败，停止并说明本地用户级安装仓库状态异常；不要自动从远程创建 `main`。

如果 `pull --ff-only` 失败，停止并向用户说明需要先处理本地 main 分歧。

### 6. 创建本地 `feat/xxx` 分支

从最新 `main` 创建本地功能分支：

```bash
git switch -c feat/xxx
```

如果本地分支已存在：

- 先确认该分支是否就是本次任务分支。
- 未确认前不要删除、覆盖或强制重置。

### 7. 把选择的改动取出来到当前分支

恢复 stash 到当前 `feat/xxx` 分支：

```bash
git stash pop
```

如发生冲突：

- 停止自动流程。
- 向用户说明冲突文件。
- 不要强制解决、不要丢弃改动。

恢复后按用户选择的 A/B/C 范围重新 stage。

- A：只 stage 用户确认的 Skill 相关路径。
- B：可以使用 `git add -A` stage 全部恢复内容。
- C：只 stage 用户明确指定的路径。

示例：

```bash
git add <confirmed-paths>
git status --short
git diff --cached --stat
```

不要在 A/C 场景下使用 `git add -A`。

### 8. 提交到本地分支

根据变更生成简洁 commit message，优先使用：

```text
feat: <summary>
```

执行提交：

```bash
git commit -m "feat: <summary>"
```

如果 commit 失败，停止并报告原因。

### 9. 推送本地 `feat/xxx` 分支

```bash
git push -u origin feat/xxx
```

不要使用 `--force` 或 `--force-with-lease`，除非用户明确要求且已说明风险。

### 10. 创建合并到 `origin/main` 的 PR

使用 GitHub CLI 创建 PR：

```bash
gh pr create --base main --head feat/xxx --title "<PR 标题>" --body "<PR 描述>"
```

创建完成后，输出 PR URL、分支名和提交摘要。

## 失败处理

- **remote 不匹配**：停止，要求用户确认目标仓库。
- **用户级安装目录不存在**：停止，提示用户先按 `AI本机安装.md` 完成安装。
- **用户级安装目录不是 Git 仓库**：停止，不自动 clone、覆盖、删除或改用当前目录。
- **仓库根目录不是用户级安装目录**：停止，报告实际路径，不继续同步。
- **fetch 失败**：停止，不更新、不丢弃、不提交。
- **未完成 Git 操作**：检测到 merge/rebase/cherry-pick/revert 状态时停止，列出查看冲突状态、生成维护者摘要等可选方案。
- **锁文件或权限错误**：检测到 `.git/index.lock` 或权限错误时停止，不自动删除锁文件。
- **本地 main 不存在**：停止，说明用户级安装仓库状态异常，不自动创建 `main`。
- **detached HEAD**：停止并说明当前不在分支上，不自动切换或修复。
- **origin/main 不存在**：停止并报告远程引用异常，不继续同步。
- **本地 main 超前或分叉**：停止并列出领先/分叉摘要，让用户选择提交 PR、查看详情或生成维护者摘要。
- **已有 stash 且需进入 PR 流程**：必须记录本次新建 stash，避免误弹已有 stash。
- **本地无修改**：只做快进更新，不创建空 PR。
- **本地有修改但用户未选择处理方式**：停止，不做 Git 写操作。
- **用户选择丢弃但未二次确认**：停止，不执行 `reset --hard` 或 `clean`。
- **GitHub CLI 不可用**：停止，提示安装并登录 `gh`。
- **用户未选择提交范围 A/B/C**：停止，不 stage、不 stash、不切分支。
- **stash pop 冲突**：停止并列出冲突文件，等待用户指示。
- **远程 main 无法快进**：停止，不自动 merge/rebase。
- **推送失败**：报告错误；不要自动改远程分支或 force push。
- **PR 创建失败**：报告 `gh pr create` 错误，并保留已推送分支信息。

## 安全原则

- 同步前必须先判断本地是否有修改。
- 同步目标必须是用户级安装目录：macOS/Linux 为 `~/.playbook-cocos`，Windows 为 `%USERPROFILE%\.playbook-cocos`。
- 不要默认同步当前业务项目目录、临时目录或系统目录。
- 判断本地修改前必须先完成异常状态预检。
- 对 merge/rebase/cherry-pick/revert、detached HEAD、锁文件、权限错误、`main` 缺失、`origin/main` 缺失和分叉状态，不自动修复。
- 本地没有修改时，只允许执行安全快进更新。
- 本地有修改时，必须先列出修改内容并等待用户选择。
- 不要在用户未明确选择前自动 stash、reset、checkout、pull、commit 或 push。
- 不要擅自删除分支、删除 stash、执行 `git reset --hard`、`git clean -fd` 或强推。
- 只有用户选择丢弃并二次确认后，才允许执行破坏性清理命令。
- 不要在目标仓库不明确时执行更新、提交或推送。
- 不要把 unrelated 本地改动混入 PR；提交前必须展示 `git diff --cached --stat`。
- 若用户要求跳过确认，也必须完成环境检查、remote 校验和本地修改判断。
