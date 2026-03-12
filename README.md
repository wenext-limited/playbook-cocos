# Playbook Cocos

`playbook-cocos` 是一个面向 AI 代理的文档优先知识库，提供 Cocos Creator 2D 游戏开发的可复用指导。包含技能、共享规则和架构文档，帮助人类和 AI 代理更一致地进行 Cocos Creator 项目的开发与维护。

## 适用范围

- **引擎版本**：Cocos Creator 3.x（主要面向 3.8+）
- **项目类型**：2D 游戏（休闲游戏、博弈类游戏）
- **核心框架**：OOPS Plugin Framework（ECS 架构）
- **开发语言**：TypeScript
- **构建目标**：Web Mobile

## 目录结构

```
playbook-cocos/
├── AGENTS.md                              # 仓库结构说明、编辑规则、技能命名规范
├── CLAUDE.md                              # Claude 引导文件
├── README.md                              # 本文件
├── rules/
│   ├── common/
│   │   ├── coding-style.md                # 通用编码风格（命名、日志、安全）
│   │   └── git-workflow.md                # Git 提交、PR、分支规范
│   ├── typescript/
│   │   ├── coding-style.md                # TypeScript 编码风格
│   │   └── patterns.md                    # TypeScript 设计模式
│   └── cocos/
│       ├── project-structure.md           # 项目结构规范
│       └── component-patterns.md          # 组件编写模式
├── skills/
│   ├── README.md                          # 技能目录索引
│   ├── cocos-project-setup/SKILL.md       # 新建项目脚手架
│   ├── cocos-scene-management/SKILL.md    # 场景与 Bundle 管理
│   ├── cocos-ui-system/SKILL.md           # UI 层级与 Panel 系统
│   ├── cocos-animation/SKILL.md           # 动画系统（Tween/Spine/状态机/预回调）
│   ├── cocos-audio/SKILL.md               # 音频管理
│   ├── cocos-network/SKILL.md             # HTTP + WebSocket 网络通信
│   ├── cocos-asset-management/SKILL.md    # 资源加载、缓存与对象池
│   ├── cocos-2d-game-loop/SKILL.md        # 2D 游戏循环与状态机
│   ├── cocos-localization/SKILL.md        # 多语言本地化
│   ├── cocos-coin-animation/SKILL.md      # 贝塞尔曲线飞币动画
│   ├── cocos-data-persistence/SKILL.md    # 数据持久化与缓存策略
│   ├── oops-framework/SKILL.md            # OOPS 框架核心（12 子模块）
│   ├── oops-ecs-pattern/SKILL.md          # ECS 三层架构
│   ├── oops-event-system/SKILL.md         # 事件系统与消息分发
│   ├── oops-mvvm-binding/SKILL.md         # MVVM 响应式数据绑定
│   └── ts-common-patterns/SKILL.md        # TypeScript 通用工具模式
├── agents/
│   └── cocos-developer.md                 # Cocos 开发代理角色定义
├── docs/
│   ├── architecture-overview.md           # 项目架构全景（含 MVVM/动画链/频率分布）
│   └── usage-guide.md                     # 项目使用说明书
└── new_project_code/                      # 新项目基础代码模板
    ├── README.md                          # 模板快速开始
    ├── TECHNICAL_DOC.md                   # 模板详细技术文档
    ├── script/                            # 主框架代码 → 放入 assets/script/
    └── GameBundle/                        # 子游戏模板 → 放入 assets/GameBundle/
```

## 技能目录

完整技能列表见 [skills/README.md](skills/README.md)。

### Cocos Creator 引擎技能（`cocos-` 前缀）

| 技能 | 用途 |
|------|------|
| `cocos-project-setup` | 新建项目脚手架，支持从 `new_project_code/` 模板快速创建 |
| `cocos-scene-management` | 场景管理、Asset Bundle 懒加载、子游戏入口 |
| `cocos-ui-system` | UI 层级系统、Panel/弹窗管理、UI 配置表 |
| `cocos-animation` | Tween/Spine/状态机动画、变速曲线、预回调模式 |
| `cocos-audio` | 音频管理器、背景音乐/音效控制 |
| `cocos-network` | HTTP 请求、WebSocket 长连接、协议定义、错误处理 |
| `cocos-asset-management` | 资源动态加载、UUID 缓存、对象池、资源释放 |
| `cocos-2d-game-loop` | 2D 游戏主循环、阶段状态机、倒计时系统 |
| `cocos-localization` | 多语言本地化工作流 |
| `cocos-coin-animation` | 贝塞尔曲线飞币动画、多方向路径、对象池 |
| `cocos-data-persistence` | 三层存储架构、前缀隔离、内存缓存 |

### OOPS 框架技能（`oops-` 前缀）

| 技能 | 用途 |
|------|------|
| `oops-framework` | OOPS 框架 12 个子模块 API、Root 基类、初始化流程 |
| `oops-ecs-pattern` | ECS 三层架构（Model/BLL/View）模式与实战 |
| `oops-event-system` | 事件系统注册、分发、生命周期管理 |
| `oops-mvvm-binding` | MVVM 响应式绑定、VMKey、VM.add/remove、vm.setValue |

### TypeScript 通用技能（`ts-` 前缀）

| 技能 | 用途 |
|------|------|
| `ts-common-patterns` | Toast 系统、Easing 枚举、数字滚动、RTL 适配、工具模式 |

## 共享规则

| 规则文件 | 内容 |
|----------|------|
| `rules/common/coding-style.md` | 不可变优先、命名约定、日志分层、资源回调安全、定时器清理 |
| `rules/common/git-workflow.md` | 提交消息格式（含 scope）、PR 模板、代码评审关注点、分支命名 |
| `rules/typescript/coding-style.md` | TypeScript 命名约定、装饰器用法、导入路径 |
| `rules/typescript/patterns.md` | 单例模式、ECS 组件注册、事件驱动数据流 |
| `rules/cocos/project-structure.md` | 项目目录布局、Bundle 划分、资源组织 |
| `rules/cocos/component-patterns.md` | 组件生命周期、节点缓存、事件注册模式 |

## 使用说明

详细的使用方法请参阅 [使用说明书](docs/usage-guide.md)，涵盖快速开始、创建新项目、AI 代理配置和知识库扩展等内容。

## 贡献指南

添加或更新技能时：

1. 在 `skills/<skill-name>/SKILL.md` 创建或更新主入口文件。
2. 遵循 `AGENTS.md` 中的命名前缀规范。
3. 优先更新 `rules/` 中的共享规则，避免在多个技能中重复。
4. 保持 `skills/README.md` 中的技能索引与实际目录一致。
5. 代码示例应来自实际项目，不要编造不存在的 API。

## 编写准则

- 为下一个缺少上下文的贡献者而写。
- 保持文档范围精准，不混合无关的工作流。
- 引用仓库中真实存在的文件。
- 倾向于小而可组合的文档，而不是大而全的文档。
