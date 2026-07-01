---
name: cocos-playbook-adapter
description: 为本地 playbook-cocos 知识库生成或更新不同 AI 工具的轻量适配入口。用于用户要求把 playbook-cocos 接入 Claude CLI、Claude Code、Codex、Codex CLI、Cursor、Windsurf、Cline、Roo Code 等 AI 编程工具，或要求在 macOS/Windows 项目中通过快捷方式、软链接、junction、shim 文件引用 ~/.playbook-cocos / %USERPROFILE%\.playbook-cocos，而不是复制整份知识库。
---

# Playbook Cocos AI 工具适配

## 目标

将用户级 `playbook-cocos` 安装目录作为唯一知识源，为不同 AI 编程工具生成轻量入口文件或快捷方式引用。

- macOS/Linux 知识源：`~/.playbook-cocos`
- Windows 知识源：`%USERPROFILE%\.playbook-cocos`
- 首选策略：目标项目只放工具识别的入口文件，入口文件指向知识源。
- 可选策略：使用软链接、Windows junction 或快捷方式引用知识源。
- 禁止策略：不要默认复制整个 `playbook-cocos` 到业务项目内。

## 先确认用户选择

在写入任何目标项目文件前，先让用户选择：

1. 目标 AI 工具：
   - Claude CLI / Claude Code
   - Codex / Codex CLI
   - Cursor
   - Windsurf
   - Cline / Roo Code
   - 多工具同时适配
   - 其他工具（要求用户提供入口文件规则）
2. 目标项目根目录。
3. 适配方式：
   - 推荐：轻量入口文件（跨平台最稳）
   - 可选：符号链接 / junction（更像快捷方式，但兼容性依赖工具和系统）
4. 是否允许覆盖已存在的入口文件。

如果目标项目已有 `AGENTS.md`、`CLAUDE.md`、`.cursorrules`、`.windsurfrules` 等入口文件，不要直接覆盖；先读取内容，判断是否已有项目级规则，再建议追加 playbook 引导段。

## 环境检查

### macOS/Linux

```bash
test -d "$HOME/.playbook-cocos" && test -f "$HOME/.playbook-cocos/README.md"
```

不存在时，提示用户先按 `AI本机安装.md` 安装，不要在本技能中自动克隆。

### Windows PowerShell

```powershell
Test-Path "$env:USERPROFILE\.playbook-cocos\README.md"
```

不存在时，提示用户先按 `AI本机安装.md` 安装，不要在本技能中自动克隆。

## 推荐适配方式：轻量入口文件

入口文件只负责告诉 AI 到用户级知识源读取规则和技能。优点是跨平台、可提交到项目仓库、不会受 symlink 权限影响。

### 通用入口内容模板

按目标工具调整文件名，但正文保持一致：

```md
# Playbook Cocos 引导

本项目使用用户级 Cocos Creator 2D 游戏开发知识库：

- macOS/Linux: `~/.playbook-cocos`
- Windows: `%USERPROFILE%\.playbook-cocos`

处理 Cocos Creator 2D、OOPS Framework、TypeScript 游戏开发相关任务前，请优先读取：

1. `~/.playbook-cocos/README.md` 或 `%USERPROFILE%\.playbook-cocos\README.md`
2. `~/.playbook-cocos/AGENTS.md` 或 `%USERPROFILE%\.playbook-cocos\AGENTS.md`
3. `~/.playbook-cocos/docs/使用说明.md` 或 `%USERPROFILE%\.playbook-cocos\docs\使用说明.md`
4. 与任务匹配的 `skills/<skill-name>/SKILL.md`
5. 必要时读取 `rules/` 下的共享规则

不要复制整份知识库到当前项目；只引用用户级安装目录作为单一知识源。
```

如果目标项目已有自己的规则，在通用模板前保留项目规则，并追加一句：

```md
除本项目规则外，Cocos Creator 2D 相关任务还需参考用户级 `playbook-cocos` 知识库。
```

## 工具入口映射

### Claude CLI / Claude Code

- 首选文件：`CLAUDE.md`
- 推荐方式：在项目根目录创建或追加 `CLAUDE.md`
- 内容重点：要求 Claude 先读项目规则，再读用户级 `playbook-cocos`。

### Codex / Codex CLI

- 首选文件：`AGENTS.md`
- 推荐方式：在项目根目录创建或追加 `AGENTS.md`
- 内容重点：保留项目级 Codex 规则；追加 `playbook-cocos` 引导段。
- 注意：Codex 会按目录层级读取 `AGENTS.md`，所以通常不需要 symlink 整个知识库。

### Cursor

- 常见入口：`.cursorrules` 或 `.cursor/rules/*.mdc`
- 推荐方式：如果项目已有 `.cursor/rules/`，新增 `.cursor/rules/playbook-cocos.mdc`；否则使用 `.cursorrules`。
- 内容重点：说明 Cocos/OOPS/TypeScript 游戏任务读取用户级知识源。

### Windsurf

- 常见入口：`.windsurfrules`
- 推荐方式：创建或追加 `.windsurfrules`
- 内容重点：同通用入口模板。

### Cline / Roo Code

- 常见入口：`.clinerules`、`.roo/rules/*.md` 或工具配置中的 custom instructions。
- 推荐方式：优先使用项目内规则文件；若工具只支持 UI 配置，则输出可复制的 custom instructions 文本，不写文件。

### 其他 AI 工具

先确认该工具支持的项目级规则文件名或配置路径。无法确认时，不要猜测；输出通用入口文本，让用户粘贴到该工具的 custom instructions。

## 可选适配方式：快捷方式 / 链接

仅当用户明确选择链接方式时使用。执行前说明兼容性风险：部分 AI 工具不会跟随 symlink 或会忽略系统快捷方式。

### macOS/Linux 符号链接

将知识库链接到业务项目内的 `.playbook-cocos`：

```bash
ln -s "$HOME/.playbook-cocos" .playbook-cocos
```

如果 `.playbook-cocos` 已存在，不要覆盖。先询问用户如何处理。

### Windows junction

在 PowerShell 或 CMD 中使用 junction 更稳：

```cmd
mklink /J .playbook-cocos "%USERPROFILE%\.playbook-cocos"
```

注意：`mklink` 可能需要管理员权限或开发者模式。失败时改用轻量入口文件。

### Windows 符号链接

```cmd
mklink /D .playbook-cocos "%USERPROFILE%\.playbook-cocos"
```

只有在用户明确需要 symlink 且环境支持时使用。

## 生成流程

1. 检查用户级知识源是否存在。
2. 根据用户选择确定目标工具和入口文件。
3. 检查目标项目是否已有入口文件。
4. 已有文件时读取并保留原内容，只追加 `playbook-cocos` 引导段。
5. 新建文件时使用通用入口模板。
6. 如果用户选择链接方式，再创建 `.playbook-cocos` 链接，并保留入口文件作为兜底说明。
7. 完成后输出：目标工具、写入文件、知识源路径、是否创建链接。

## 安全规则

- 不要自动删除、覆盖或重命名已有入口文件。
- 不要把 `~/.playbook-cocos` 的全部内容复制进业务项目。
- 不要在业务项目中执行 Git 操作，除非用户明确要求。
- Windows 路径示例使用反斜杠，Markdown 中需要写成 `\\` 或放入代码块。
- 如果目标项目不是 Cocos Creator / OOPS / TypeScript 游戏项目，仍可生成入口，但需说明该 playbook 只覆盖相关任务。
