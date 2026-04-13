# GitHub Copilot 知识库与工作指南

本仓库用于指导 Cocos Creator 2D 游戏项目的开发。包含对于 Copilot 适用的技能（skills）、规则（instructions）和代理（agents）定义，不含可运行的应用代码。

## 结构说明

- .github/skills/ — 可复用的领域指导包。每个技能目录包含：
  - SKILL.md 作为主入口文件
- .github/instructions/ — 多个技能共享的仓库级约定。
- .github/agents/ — 仓库级代理资产（角色定义与技能路由）。

## 阅读顺序

1. 先读 README.md 了解整体概述。
2. 根据任务查看 .github/skills/<name>/SKILL.md 对应的专属技能。
3. 仅在任务涉及共享约定时，遵循 .github/instructions/ 下的具体规范文档。
4. 扩展技能时，请同步更新其目录下的 SKILL.md 文档。

## 技能命名规范

每项新加的技能或文档都应遵从以下前缀约定：
- cocos-：Cocos Creator 引擎通用，包括场景管理、UI 系统、动画等。
- oops-：OOPS 框架（oops-plugin-framework）相关。
- 	s-：TypeScript 语言级别的可复用指导，不绑定特定框架或引擎。
