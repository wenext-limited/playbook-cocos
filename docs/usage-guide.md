# Playbook Cocos 使用说明书

本文档说明如何使用 `playbook-cocos` 知识库来指导 Cocos Creator 2D 游戏开发。

---

## 1. 这个项目是什么

`playbook-cocos` 是一个**面向 AI 代理的文档优先知识库**。它不包含可运行的游戏代码，而是提供结构化的开发指导（技能、规则、架构文档和项目模板），帮助 AI 代理（或人类开发者）以一致的方式进行 Cocos Creator 项目的开发和维护。

### 适用技术栈

| 项目 | 说明 |
|------|------|
| 引擎 | Cocos Creator 3.8.x |
| 语言 | TypeScript |
| 核心框架 | OOPS Plugin Framework (ECS 架构) |
| 架构模式 | ECS + 三层架构 (Model/BLL/View) + MVVM 绑定 |
| 项目类型 | 2D 游戏（休闲、博弈类） |
| 构建目标 | Web Mobile |

---

## 2. 仓库结构一览

```
playbook-cocos/
├── AGENTS.md              # 仓库元规则：结构说明、编辑规则、命名规范
├── CLAUDE.md              # Claude AI 引导入口
├── README.md              # 项目概述与技能索引
├── skills/                # 可复用的领域技能包（核心）
│   ├── README.md          # 技能索引
│   ├── cocos-*/           # Cocos Creator 引擎相关技能
│   ├── oops-*/            # OOPS 框架相关技能
│   └── ts-*/              # TypeScript 通用技能
├── rules/                 # 跨技能共享的编码规则
│   ├── common/            # 通用编码风格、Git 工作流
│   ├── typescript/        # TypeScript 编码风格与设计模式
│   └── cocos/             # Cocos 项目结构、组件模式
├── agents/                # AI 代理角色定义
│   └── cocos-developer.md # Cocos 开发者代理
├── docs/                  # 架构设计文档
│   ├── architecture-overview.md  # 架构全景
│   └── usage-guide.md     # 本文件
└── new_project_code/      # 新项目基础代码模板
    ├── README.md           # 模板快速开始
    ├── TECHNICAL_DOC.md    # 模板详细技术文档
    ├── script/             # 主框架代码 → 放入 assets/script/
    └── GameBundle/         # 子游戏模板 → 放入 assets/GameBundle/
```

---

## 3. 快速开始

### 3.1 了解全局规则

首次使用时，先阅读以下文件建立整体认知：

1. **`README.md`** — 了解项目定位和技能全景
2. **`AGENTS.md`** — 了解仓库结构、编辑规则和命名规范
3. **`docs/architecture-overview.md`** — 了解项目架构设计

### 3.2 按任务查找技能

根据你要完成的开发任务，在 `skills/` 目录下找到对应的技能文件：

| 我要做什么 | 使用技能 |
|-----------|---------|
| 创建新项目 | `skills/cocos-project-setup/SKILL.md` |
| 管理场景和 Bundle | `skills/cocos-scene-management/SKILL.md` |
| 构建 UI 界面 | `skills/cocos-ui-system/SKILL.md` |
| 实现动画效果 | `skills/cocos-animation/SKILL.md` |
| 管理音频 | `skills/cocos-audio/SKILL.md` |
| 对接网络 API | `skills/cocos-network/SKILL.md` |
| 动态加载资源 | `skills/cocos-asset-management/SKILL.md` |
| 实现游戏主循环 | `skills/cocos-2d-game-loop/SKILL.md` |
| 实现多语言 | `skills/cocos-localization/SKILL.md` |
| 做飞币动画 | `skills/cocos-coin-animation/SKILL.md` |
| 数据存储 | `skills/cocos-data-persistence/SKILL.md` |
| 了解 OOPS 框架 | `skills/oops-framework/SKILL.md` |
| 设计 ECS 架构 | `skills/oops-ecs-pattern/SKILL.md` |
| 使用事件系统 | `skills/oops-event-system/SKILL.md` |
| 实现 MVVM 绑定 | `skills/oops-mvvm-binding/SKILL.md` |
| TypeScript 通用模式 | `skills/ts-common-patterns/SKILL.md` |

### 3.3 遵循编码规则

编写代码时参考 `rules/` 下的共享规则：

- **`rules/common/coding-style.md`** — 不可变优先、命名约定、日志分层
- **`rules/common/git-workflow.md`** — 提交消息格式、PR 流程、分支命名
- **`rules/typescript/coding-style.md`** — TypeScript 专属命名和装饰器使用
- **`rules/typescript/patterns.md`** — 单例模式、ECS 注册、事件驱动数据流
- **`rules/cocos/project-structure.md`** — 项目文件布局规范
- **`rules/cocos/component-patterns.md`** — 组件生命周期、事件注册模式

---

## 4. 创建新项目

当你需要创建一个新的 Cocos Creator 游戏项目时，推荐从 `new_project_code/` 模板拷贝代码：

### 步骤概览

```
1. 在 Cocos Dashboard 中创建空的 2D 项目
2. 安装 OOPS 框架到 extensions/
3. 将 new_project_code/script/      拷贝到  项目/assets/script/
4. 将 new_project_code/GameBundle/   拷贝到  项目/assets/GameBundle/
5. 将 GameBundle/template_game/ 重命名为你的游戏名
6. 全局搜索 // TODO: 标记，按需修改配置
7. 在主场景 Canvas 节点挂载 Main 组件
```

详细流程请阅读 `skills/cocos-project-setup/SKILL.md`。

### 模板提供什么

模板包含完整的项目骨架：

- **入口与初始化** — Main.ts、Initialize 实体、资源加载流水线
- **ECS 单例系统** — 全局 smc、子游戏 sub_smc
- **网络层** — HTTP 请求（自动注入鉴权）、WebSocket 管理
- **UI 系统** — LayerManager 扩展、弹窗管理器
- **音效管理** — 背景音乐/音效控制、前后台自动暂停恢复
- **多语言支持** — 语言表、阿拉伯语 RTL 适配
- **通用组件** — 循环翻页、虚拟列表、数字滚动、动态 Prefab 加载
- **子游戏模板** — 独立的 ECS 实体、事件、UI 配置、HTTP 层
- **SDK 集成** — WeNext SDK 桥接层

模板的详细技术文档见 `new_project_code/TECHNICAL_DOC.md`。

---

## 5. AI 代理使用方式

### 5.1 代理角色

`agents/cocos-developer.md` 定义了 Cocos 开发者代理角色，包含：

- 技术栈声明
- 需要遵循的核心规则列表
- 可用技能的路由表
- 新增功能 / 代码审查 / Bug 修复的标准工作流
- 常见陷阱与解决方案

配置 AI 代理时，将此文件作为系统提示或人设引用。

### 5.2 技能调用

每个技能文件 (`SKILL.md`) 包含以下结构：

```yaml
---
name: 技能名称
description: 使用场景说明
tags: [标签列表]
inputs: [输入参数]
outputs: [输出产物]
---
```

AI 代理可以根据任务描述匹配技能，读取对应的 SKILL.md 获取详细指导来执行任务。

### 5.3 VS Code 集成

在 VS Code 中使用 GitHub Copilot 时：

1. 本仓库的 `AGENTS.md` 会自动被识别为仓库级指令
2. 技能文件可被 Copilot 作为上下文引用
3. 开发者可在对话中指定要使用的技能（如"使用 cocos-project-setup 技能创建新项目"）

---

## 6. 扩展知识库

### 6.1 添加新技能

1. 在 `skills/` 下创建目录，命名格式：`<prefix>-<topic>/`
   - `cocos-` — Cocos Creator 引擎相关
   - `oops-` — OOPS 框架相关
   - `ts-` — TypeScript 通用
2. 在目录中创建 `SKILL.md` 作为主入口
3. 添加 YAML frontmatter（name、description、tags、inputs、outputs）
4. 编写技能内容：概述 → 步骤 → 代码示例 → 清单
5. 更新 `skills/README.md` 索引
6. 如需参考资料，放在技能目录的 `references/` 子目录

### 6.2 修改共享规则

- 编辑 `rules/` 下对应的规则文件
- 注意：共享规则可能影响多个技能，修改时需谨慎
- 适合放入规则的内容：多个技能都需要遵循的通用约定

### 6.3 更新架构文档

- 架构级的设计说明放在 `docs/` 目录
- 大型结构变更前，先在 `docs/` 下添加设计说明

### 6.4 文档变更验证清单

完成文档编辑后检查：

- [ ] 重新阅读每个编辑过的文件
- [ ] 确认引用路径存在
- [ ] 确认描述与仓库实际内容一致
- [ ] 同步更新关联文件（如 `skills/README.md`、`README.md`）
- [ ] 不要声称支持仓库中不存在的文件或工具

---

## 7. 常见问题

### Q: 这个仓库可以直接运行吗？

不可以。`playbook-cocos` 是文档优先的知识库，不包含可运行的游戏应用。`new_project_code/` 中的代码是模板，需要拷贝到实际的 Cocos Creator 项目中才能使用。

### Q: 技能和规则有什么区别？

- **技能 (Skills)**: 面向特定任务的完整指导，包含步骤、代码示例和清单。用于"做什么"。
- **规则 (Rules)**: 跨技能共享的编码约定和规范。用于"怎么做"。

### Q: 如何选择技能前缀？

1. 如果主要关于 OOPS 框架的用法、ECS 模式 → `oops-`
2. 如果主要关于 Cocos Creator 引擎能力 → `cocos-`
3. 如果是纯 TypeScript 语言级指导 → `ts-`

### Q: new_project_code 模板和技能文档中的代码哪个优先？

`new_project_code/` 中的代码是实际可用的模板，是最新的参考实现。技能文档中的代码示例用于解释概念，可能经过简化。创建新项目时以模板代码为准。

### Q: 如何为 AI 代理配置此知识库？

将仓库克隆到本地后，在 AI 代理的工作空间中打开。代理会自动读取 `AGENTS.md` 和相关文件。也可以将 `agents/cocos-developer.md` 的内容作为代理的角色定义使用。
