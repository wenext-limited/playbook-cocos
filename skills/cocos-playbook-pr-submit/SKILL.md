---
name: cocos-playbook-pr-submit
description: 将本地 playbook-cocos 仓库变更安全提交到 GitHub PR。用于用户要求把本地修改提交到 wenext-limited/playbook-cocos、创建 feat 分支、推送分支、发起合并到 origin/main 的 PR 时。流程包含环境检查、让用户选择提交范围 A/B/C、stage 指定修改、拉取远程更新、创建 feat/xxx 分支、恢复已 stage 改动、推送并创建 PR。
tags: [cocos, git, github, pull-request, playbook]
inputs: [本地 playbook-cocos 仓库变更, 分支名, PR 标题和描述]
outputs: [feat 分支, GitHub Pull Request]
---

# Playbook Cocos 变更提交 PR

## 使用场景

当用户要求把本地 `playbook-cocos` 仓库变更提交到 GitHub 并创建 PR 时使用，包括：

- 提交当前本地修改到 `wenext-limited/playbook-cocos`
- 创建 `feat/xxx` 分支并推送
- 将当前改动发起合并到 `origin/main` 的 Pull Request
- 需要按安全流程处理已有本地改动、远程更新和 PR 创建

不用于通用业务游戏仓库提交，也不用于未确认目标仓库的 Git 自动化。

## 目标仓库

- GitHub 仓库：`https://github.com/wenext-limited/playbook-cocos`
- 目标 base：`origin/main`
- 本地工作目录应是 `playbook-cocos` 仓库根目录，或其子目录。

## 必须先检查环境

执行提交流程前，先检查并向用户简要汇报：

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

4. GitHub CLI 是否可用且已登录：

   ```bash
   gh --version
   gh auth status
   ```

5. 当前是否能获取远程 main：

   ```bash
   git fetch origin main
   ```

如果 `gh` 不存在或未登录，停止并提示用户安装/登录 GitHub CLI；不要尝试用网页或手工 API 替代。

如果 remote 不是 `wenext-limited/playbook-cocos`，停止并要求用户确认目标仓库。

## 用户输入要求

在执行会改变 Git 状态的步骤前，必须确认：

- 提交范围，必须让用户在 A/B/C 中选择，不能替用户默认选择。
- `feat/xxx` 分支名；若用户未给出，基于修改内容建议一个简短 kebab-case 名称，并让用户确认。
- PR 标题；若用户未给出，基于修改内容生成并让用户确认。
- PR 描述；若用户未给出，基于 diff 生成简洁描述并让用户确认。

### 提交范围选择（必问）

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
- 后缀使用英文小写、数字和短横线，例如 `feat/add-ai-install-doc`。
- 不要复用已存在且用途不明的远程分支。

## 标准工作流

### 1. 按用户选择 Stage 本地修改

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
git add skills/cocos-playbook-pr-submit/SKILL.md skills/README.md
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

### 2. 临时保存第一步 stage 的改动

根据用户选择的 A/B/C 范围保存改动，确保后续拉取远程更新时不会混入未选择文件。

#### A/C：只保存已 stage 的指定范围

优先使用 `git stash --staged` 只保存暂存区内容：

```bash
git stash push --staged -m "playbook-pr-submit: selected staged changes"
```

如果当前 Git 不支持 `--staged`，停止并提示用户升级 Git，或让用户改选 B/手动处理；不要退回到全量 stash。

保存后检查是否仍有未选择的本地改动：

```bash
git status --short
```

如果仍有未选择的本地改动，停止流程并让用户先处理这些改动；不要为了继续流程而自动 stash、删除或覆盖它们。

#### B：保存全部工作区改动

用户选择 B 时，保存当前工作区全部变更：

```bash
git stash push --include-untracked -m "playbook-pr-submit: staged local changes"
```

保存后确认工作区干净：

```bash
git status --short
```

如果工作区不干净，停止并说明原因，不要继续切分支或拉取。

### 3. 拉取远程更新

切到本地 `main` 并快进到 `origin/main`：

```bash
git fetch origin main
git switch main
git pull --ff-only origin main
```

如果本地没有 `main`，从远程创建：

```bash
git switch -c main --track origin/main
```

如果 `pull --ff-only` 失败，停止并向用户说明需要先处理本地 main 分歧。

### 4. 创建本地 `feat/xxx` 分支

从最新 `main` 创建本地功能分支：

```bash
git switch -c feat/xxx
```

如果本地分支已存在：

- 先确认该分支是否就是本次任务分支。
- 未确认前不要删除、覆盖或强制重置。

### 5. 把第一步 stage 的改动取出来到当前分支

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

### 6. 提交到本地分支

根据变更生成简洁 commit message，优先使用：

```text
feat: <summary>
```

执行提交：

```bash
git commit -m "feat: <summary>"
```

如果 commit 失败，停止并报告原因。

### 7. 推送本地 `feat/xxx` 分支

```bash
git push -u origin feat/xxx
```

不要使用 `--force` 或 `--force-with-lease`，除非用户明确要求且已说明风险。

### 8. 创建合并到 `origin/main` 的 PR

使用 GitHub CLI 创建 PR：

```bash
gh pr create --base main --head feat/xxx --title "<PR 标题>" --body "<PR 描述>"
```

创建完成后，输出 PR URL、分支名和提交摘要。

## 失败处理

- **GitHub CLI 不可用**：停止，提示安装并登录 `gh`。
- **remote 不匹配**：停止，要求用户确认目标仓库。
- **没有本地变更**：停止，不创建空 PR。
- **用户未选择 A/B/C**：停止，不 stage、不 stash、不切分支。
- **stash pop 冲突**：停止并列出冲突文件，等待用户指示。
- **远程 main 无法快进**：停止，不自动 merge/rebase。
- **推送失败**：报告错误；不要自动改远程分支或 force push。
- **PR 创建失败**：报告 `gh pr create` 错误，并保留已推送分支信息。

## 安全原则

- 不要擅自删除分支、删除 stash、执行 `git reset --hard` 或强推。
- 不要在目标仓库不明确时执行提交和推送。
- 不要在用户未选择 A/B/C 提交范围时 stage 任何文件。
- 不要把 unrelated 本地改动混入 PR；提交前必须展示 `git diff --cached --stat`。
- 若用户要求跳过确认，也必须完成环境检查和 remote 校验。
