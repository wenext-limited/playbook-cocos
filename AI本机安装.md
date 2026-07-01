# Playbook Cocos 本机安装说明（给 AI 投喂）

本文档用于投喂给 AI 代理，指导其将 `playbook-cocos` 知识库安装到用户本机的用户级目录下，便于后续在 Cocos Creator 2D 游戏开发任务中引用这些技能、规则和模板。

---

## 安装目标

- **仓库用途**：Cocos Creator 2D 游戏开发知识库，包含 AI 技能、开发规则、架构文档和项目模板。
- **推荐安装位置**：用户级目录下的隐藏目录 `.playbook-cocos`。
- **macOS 目标路径**：`~/.playbook-cocos`
- **Windows 目标路径**：`%USERPROFILE%\.playbook-cocos`
- **首选 Git 地址**：`git@github.com:wenext-limited/playbook-cocos.git`
- **备用 Git 地址**：`https://github.com/wenext-limited/playbook-cocos.git`

> AI 执行时应优先使用 SSH 地址；只有当本机未配置 GitHub SSH Key、SSH 拉取失败，或用户明确要求 HTTPS 时，才使用 HTTPS 地址。

---

## macOS 安装

### 1. 检查 Git

```bash
git --version
```

如果 Git 不存在，先提示用户安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

### 2. 克隆到用户级目录

优先使用 SSH：

```bash
cd ~
git clone git@github.com:wenext-limited/playbook-cocos.git .playbook-cocos
```

如果 SSH 不可用，再使用 HTTPS：

```bash
cd ~
git clone https://github.com/wenext-limited/playbook-cocos.git .playbook-cocos
```

### 3. 验证安装

```bash
test -f ~/.playbook-cocos/README.md && echo "playbook-cocos installed"
```

---

## Windows 安装

### 1. 检查 Git

在 PowerShell 中执行：

```powershell
git --version
```

如果 Git 不存在，提示用户先安装 Git for Windows：

```text
https://git-scm.com/download/win
```

### 2. 克隆到用户级目录

优先使用 SSH：

```powershell
cd $env:USERPROFILE
git clone git@github.com:wenext-limited/playbook-cocos.git .playbook-cocos
```

如果 SSH 不可用，再使用 HTTPS：

```powershell
cd $env:USERPROFILE
git clone https://github.com/wenext-limited/playbook-cocos.git .playbook-cocos
```

### 3. 验证安装

```powershell
Test-Path "$env:USERPROFILE\.playbook-cocos\README.md"
```

返回 `True` 表示安装成功。

---

## 已存在目录时的处理

如果目标目录已经存在，**不要直接覆盖或删除**。AI 必须先检查该目录是否已经是一个 Git 仓库：

```bash
test -d ~/.playbook-cocos/.git
```

Windows PowerShell：

```powershell
Test-Path "$env:USERPROFILE\.playbook-cocos\.git"
```

### 情况一：目录已存在且包含 `.git`

**立即暂停同步，不要执行任何 pull / fetch / reset / 删除操作。** 向用户说明原因并等待指示：

> 检测到 `~/.playbook-cocos` 已存在，且目录下已有 `.git`。该目录可能已经是一个 Git 仓库（可能是之前克隆的本知识库、用户的本地 fork，或完全无关的仓库）。为避免覆盖用户的本地修改或破坏现有仓库状态，已暂停同步。请确认后手动处理，或告知 AI 如何继续。

### 情况二：目录已存在但不包含 `.git`

该目录不是 Git 仓库。停止操作并询问用户如何处理，不要擅自删除或覆盖。

---

## AI 使用方式

安装完成后，AI 在处理 Cocos Creator 2D 游戏相关任务时，应优先读取：

1. `~/.playbook-cocos/README.md`
2. `~/.playbook-cocos/AGENTS.md`
3. `~/.playbook-cocos/docs/使用说明.md`
4. 与任务匹配的 `~/.playbook-cocos/skills/<skill-name>/SKILL.md`
5. 必要时读取 `~/.playbook-cocos/rules/` 下的共享规则

Windows 路径对应为：

```text
%USERPROFILE%\.playbook-cocos
```

## 接入不同 AI 工具

安装完成后，不建议把整份 `playbook-cocos` 复制到业务项目中。推荐在业务项目根目录为不同 AI 工具创建轻量入口文件，让入口文件引用用户级安装目录。

常见入口文件：

- Claude CLI / Claude Code：`CLAUDE.md`
- Codex / Codex CLI：`AGENTS.md`
- Cursor：`.cursorrules` 或 `.cursor/rules/*.mdc`
- Windsurf：`.windsurfrules`
- Cline / Roo Code：`.clinerules`、`.roo/rules/*.md` 或 custom instructions

如需自动生成或更新这些入口文件，请使用 `skills/cocos-playbook-adapter/SKILL.md`。该技能会先让用户选择目标 AI 工具、目标项目目录和适配方式，并支持 macOS / Windows 的轻量入口文件、符号链接或 Windows junction。

---

## AI 执行原则

- 优先使用 `git@github.com:wenext-limited/playbook-cocos.git`。
- SSH 拉取失败时，才退回 `https://github.com/wenext-limited/playbook-cocos.git`。
- 安装位置固定为用户级目录下的隐藏目录 `.playbook-cocos`，不要默认安装到项目目录、系统目录或临时目录。
- 已存在目录时只允许安全检查，**不要自动 pull、fetch、删除、覆盖或强制重置**。
- 如果检测到 `~/.playbook-cocos` 已存在且包含 `.git`，必须暂停同步并向用户说明原因，等待用户指示。
- 本文档只负责**首次安装**，不负责后续的同步/更新；目标目录已存在时一律暂停，不自动 pull。
- 安装完成后，向用户返回实际安装路径和验证结果。
