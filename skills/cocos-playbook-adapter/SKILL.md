---
name: cocos-playbook-adapter
description: 为本地 playbook-cocos 知识库在不同 AI 工具的本地规则目录下建立软链接适配。用于用户要求让 Claude CLI、Claude Code、Codex、Codex CLI、Cursor、Windsurf、Cline、Roo Code 等 AI 编程工具读取 ~/.playbook-cocos / %USERPROFILE%\.playbook-cocos 的内容，而不是复制整份知识库或修改业务项目规则。
---

# Playbook Cocos AI 工具适配

## 目标

将用户级 `playbook-cocos` 安装目录作为唯一知识源，在不同 AI 编程工具的本地规则 / 技能目录下建立软链接，让工具直接读取同一份 playbook 内容。

- macOS/Linux 知识源：`~/.playbook-cocos`
- Windows 知识源：`%USERPROFILE%\.playbook-cocos`
- 首选策略：在对应 AI 工具的本地配置目录下建立指向知识源的软链接 / junction。
- 禁止策略：不要默认复制整个 `playbook-cocos`，不要修改业务项目入口文件或项目规则。

## 先确认用户选择

在创建任何链接前，先让用户选择：

1. 目标 AI 工具：
   - Claude CLI / Claude Code
   - Codex / Codex CLI
   - Cursor
   - Windsurf
   - Cline / Roo Code
   - 多工具同时适配
   - 其他工具（要求用户提供本地规则 / 技能目录）
2. 是否只检查并输出建议命令，还是允许实际创建链接。
3. 如果目标工具目录下同名链接或目录已存在，是否跳过、改名，或由用户手动处理。

不需要询问目标项目根目录；本技能不向业务项目写入文件。

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

## 兜底说明文本

本技能不推荐向业务项目写入轻量入口文件。保留本节仅作为工具不支持本地目录链接、需要用户手动复制到工具 custom instructions 时的兜底文本；默认不要写入 `AGENTS.md`、`CLAUDE.md`、`.cursorrules`、`.windsurfrules` 等业务项目入口文件。

### 通用 custom instructions 模板

按目标工具要求粘贴到用户级 custom instructions，正文保持一致：

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

- 推荐目标：Claude 用户级配置 / 技能目录中的 `playbook-cocos` 链接。
- 如果工具没有明确本地目录，输出建议命令和兜底 custom instructions，不猜测业务项目路径。

### Codex / Codex CLI

- 推荐目标：Codex 用户级 skills / references 目录中的 `playbook-cocos` 链接。
- 目标是让 Codex 能从本地工具目录读取知识库，不修改业务项目 `AGENTS.md`。

### Cursor

- 推荐目标：Cursor 用户级 rules / context 目录中的 `playbook-cocos` 链接。
- 如果 Cursor 当前只通过项目 `.cursor/rules/` 生效，先说明该限制，不自动改业务项目。

### Windsurf

- 推荐目标：Windsurf 用户级 rules / memories / context 目录中的 `playbook-cocos` 链接。
- 不自动创建或追加业务项目 `.windsurfrules`。

### Cline / Roo Code

- 推荐目标：Cline / Roo Code 用户级规则目录中的 `playbook-cocos` 链接。
- 若工具只支持 UI 配置，则输出可复制的 custom instructions 文本，不写文件。

### 其他 AI 工具

先确认该工具支持的用户级本地规则 / 技能目录。无法确认时，不要猜测；输出兜底说明文本，让用户粘贴到该工具的 custom instructions。

## 链接适配方式

默认使用链接方式。执行前说明兼容性风险：部分 AI 工具不会跟随 symlink、不会递归读取目录，或只读取特定文件名。

### macOS/Linux 符号链接

将知识库链接到目标工具本地目录内的 `playbook-cocos`：

```bash
ln -s "$HOME/.playbook-cocos" "<tool-local-dir>/playbook-cocos"
```

如果 `playbook-cocos` 已存在，不要覆盖。先询问用户如何处理。

### Windows junction

在 PowerShell 或 CMD 中使用 junction 更稳：

```cmd
mklink /J "<tool-local-dir>\playbook-cocos" "%USERPROFILE%\.playbook-cocos"
```

注意：`mklink` 可能需要管理员权限或开发者模式。失败时改用 custom instructions 兜底文本。

### Windows 符号链接

```cmd
mklink /D "<tool-local-dir>\playbook-cocos" "%USERPROFILE%\.playbook-cocos"
```

只有在用户明确需要 symlink 且环境支持时使用。

## 生成流程

1. 检查用户级知识源是否存在。
2. 根据用户选择确定目标工具的本地规则 / 技能目录。
3. 检查目标目录是否存在；不存在时询问是否创建。
4. 检查目标链接名 `playbook-cocos` 是否已存在；存在时不要覆盖。
5. 用户允许后创建软链接 / junction。
6. 如工具不支持目录链接，输出 custom instructions 兜底文本。
7. 完成后输出：目标工具、目标本地目录、知识源路径、链接路径、是否创建成功。

## 安全规则

- 不要自动删除、覆盖或重命名已有入口文件。
- 不要把 `~/.playbook-cocos` 的全部内容复制进业务项目。
- 不要修改业务项目规则文件，除非用户明确改为项目级接入需求。
- 不要在业务项目中执行 Git 操作，除非用户明确要求。
- Windows 路径示例使用反斜杠，Markdown 中需要写成 `\\` 或放入代码块。
- 如果目标工具无法读取目录链接，说明限制并输出 custom instructions 兜底文本。
