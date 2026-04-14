---
name: cocos-project-setup
description: 新建 Cocos Creator 游戏项目时使用。推荐从 skills/cocos-project-setup/new_project_code 模板拷贝基础代码来快速搭建，也可手动从零创建。包括脚手架搭建、OOPS 框架集成、入口类编写和初始化配置。不适用于已有项目的功能扩展。
tags: [cocos, setup, scaffold, template]
inputs: [游戏名称, 子游戏名称, 目标平台]
outputs: [初始化项目结构, 入口类, 全局配置, 子游戏模板]
---

# 新建 Cocos Creator 项目

## 概述

使用本技能初始化一个基于 Cocos Creator 3.x + OOPS 框架的 2D 游戏项目。

**推荐方式**：从 `skills/cocos-project-setup/new_project_code/` 模板目录拷贝基础代码，快速获得完整的项目骨架以及通用组件库，再按实际需求定制。

## 前置条件

- Cocos Creator 3.8+ 已安装
- Node.js 环境
- OOPS Plugin Framework 插件 (`oops-plugin-framework`)
- WeNext SDK 插件 (`wsdk`，可选)
- Excel 转 JSON 插件 (`oops-plugin-excel-to-json`，可选)

---

## 方式一：从模板创建（推荐）

### 步骤 1：创建 Cocos 项目

使用 Cocos Dashboard 创建空的 2D 项目。

### 步骤 2：安装框架插件

将以下插件放入项目的 `extensions/` 目录：

```
extensions/
├── oops-plugin-framework/     # 核心框架（必需）
├── wsdk/                      # WeNext SDK（可选）
└── oops-plugin-excel-to-json/ # 配置表工具（可选）
```

### 步骤 3：拷贝模板代码

从本知识库的 `skills/cocos-project-setup/new_project_code/` 目录拷贝文件到项目中：

```
skills/cocos-project-setup/new_project_code/script/        →  项目/assets/script/
skills/cocos-project-setup/new_project_code/GameBundle/    →  项目/assets/GameBundle/
```

将 `GameBundle/template_game/` 重命名为你的子游戏名称（如 `lucky_wheel`）。

拷贝后的项目结构：

```
assets/
├── script/
│   ├── Main.ts                          # 游戏入口
│   ├── extension/
│   │   └── LayerManagerExtension.ts     # UI层级管理扩展
│   └── game/
│       ├── common/
│       │   ├── bundle/                  # 资源包管理
│       │   ├── components/              # 通用UI组件（循环翻页、虚拟列表、数字滚动等）
│       │   ├── config/                  # 全局配置（事件、UI、资源路径）
│       │   ├── ecs/                     # 全局ECS单例
│       │   ├── mgrs/                    # 音效管理
│       │   ├── net/                     # 网络层
│       │   ├── prompt/                  # 弹窗管理
│       │   ├── table/                   # 配置表
│       │   └── utils/                   # 工具类
│       ├── const/                       # 游戏常量
│       ├── initialize/                  # 初始化流程
│       └── WsdkHandler/                 # SDK集成
├── GameBundle/
│   └── your_game/                       # 子游戏（从 template_game 重命名）
│       └── script/
│           ├── SubGameEntry.ts          # 子游戏入口
│           ├── config/                  # 子游戏配置
│           ├── ecs/                     # 子游戏ECS单例
│           ├── http/                    # HTTP请求层
│           ├── subgame/                 # 子游戏ECS实体
│           └── util/                    # 工具类
└── main.scene                           # 主场景
```

### 步骤 4：定制项目配置

全局搜索 `// TODO:` 标记，按项目需求修改以下核心文件：

| 文件 | 修改内容 |
|------|---------|
| `WGameConst.ts` | 开发环境常量、WebDevMode 开关 |
| `InitGame.ts` | WebDevMode 下的默认 baseUrl、token、appName |
| `BundleConfig.ts` | 游戏名 → Bundle 名映射、Bundle 内资源路径 |
| `GameUIConfig.ts` | 主框架层 UI Prefab 路径 |
| `GameEvent.ts` | 添加项目级全局事件 |
| `WsdkHandler.ts` | `Const.GameType` 修改为项目对应的游戏类型 |

子游戏模板中需修改的文件：

| 文件 | 修改内容 |
|------|---------|
| `SubGameUIConfig.ts` | Bundle 名、SubUIID 枚举、Prefab 路径 |
| `SubGameConfig.ts` | API 路径、HTTP 超时、游戏阶段配置 |
| `SubGameEvent.ts` | 添加子游戏业务事件 |
| `SubGameEntry.ts` | 背景音乐、常驻 UI 配置 |
| `SubGame.ts` | 注册 Model/BLL 组件 |

### 步骤 5：创建业务组件

在子游戏目录下按三层架构创建业务代码：

```
GameBundle/your_game/script/
├── subgame/
│   ├── model/
│   │   └── YourModelComp.ts      ← 继承 ecs.Comp（纯数据）
│   └── bll/
│       └── YourDataComp.ts       ← 继承 ecs.Comp + 编写对应 ComblockSystem
└── view/
    └── YourViewComp.ts           ← 继承 CCVMParentComp / Component
```

在 `SubGame.ts` 中注册组件：

```typescript
@ecs.register('SubGame')
export class SubGame extends ecs.Entity {
    YourModel!: YourModelComp;
    YourData!: YourDataComp;

    protected init() {
        this.addComponents<ecs.Comp>(YourModelComp);
    }

    getYourData() {
        this.add(YourDataComp); // 触发对应 ComblockSystem
    }
}
```

### 步骤 6：挂载入口组件

1. 在主场景的 Canvas 节点上挂载 `Main` 组件
2. 创建子游戏 Prefab，根节点挂载 `SubGameEntry` 组件
3. 在 `GameUIConfig.ts` 中注册子游戏 UIID 对应的 Prefab 路径

---

## 方式二：手动创建

适用于不使用模板的场景，手动逐步构建项目骨架。

### 步骤 1：创建项目

使用 Cocos Dashboard 创建空的 2D 项目。

### 步骤 2：安装 OOPS 框架

将 `oops-plugin-framework` 放入 `extensions/` 目录：

```
extensions/
└── oops-plugin-framework/
    └── assets/
        ├── core/
        │   └── Oops.ts
        └── libs/
            ├── ecs/ECS.ts
            └── network/HttpRequest.ts
```

### 步骤 3：创建入口类

`assets/script/Main.ts`：

```typescript
import { profiler, _decorator } from 'cc';
import { oops } from '../../extensions/oops-plugin-framework/assets/core/Oops';
import { Root } from '../../extensions/oops-plugin-framework/assets/core/Root';
import { ecs } from '../../extensions/oops-plugin-framework/assets/libs/ecs/ECS';
import { UIConfigData } from './game/common/config/GameUIConfig';
import { smc } from './game/common/ecs/SingletonModuleComp';
import { Initialize } from './game/initialize/Initialize';

const { ccclass } = _decorator;

@ccclass('Main')
export class Main extends Root {
    start() {
        profiler.hideStats();
    }

    protected run() {
        smc.initialize = ecs.getEntity<Initialize>(Initialize);
    }

    protected initGui() {
        oops.gui.init(UIConfigData);
    }

    protected initEcsSystem() {
        // 注册 ECS 系统
    }
}
```

### 步骤 4：创建全局单例

`assets/script/game/common/ecs/SingletonModuleComp.ts`：

```typescript
import { ecs } from 'path/to/oops-framework/libs/ecs/ECS';
import { Initialize } from '../../initialize/Initialize';

@ecs.register('SingletonModule')
export class SingletonModuleComp extends ecs.Comp {
    initialize: Initialize = null!;
    reset() { }
}

export var smc: SingletonModuleComp = ecs.getSingleton(SingletonModuleComp);
```

### 步骤 5：创建 UI 配置

`assets/script/game/common/config/GameUIConfig.ts`：

```typescript
import { LayerType, UIConfig } from 'path/to/oops-framework/core/gui/layer/LayerManager';

export enum UIID {
    Loading = 1,
    Window,
    Netinstable,
}

export var UIConfigData: { [key: number]: UIConfig } = {
    [UIID.Loading]: { layer: LayerType.UI, prefab: "gui/loading/loading" },
    [UIID.Netinstable]: { layer: LayerType.PopUp, prefab: "common/prefab/netinstable" },
};
```

### 步骤 6：创建全局事件

`assets/script/game/common/config/GameEvent.ts`：

```typescript
export enum GameEvent {
    GameServerConnected = "Game.GameServerConnected",
    LoginSuccess = "Game.LoginSuccess",
}
```

### 步骤 7：配置 tsconfig.json

```json
{
    "compilerOptions": {
        "target": "ES2015",
        "module": "ES2015",
        "strict": false,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true
    }
}
```

---

## 模板提供的通用组件

从模板创建的项目自带以下通用组件，可直接使用：

| 组件 | 说明 |
|------|------|
| `CirclePageView` | 循环翻页，支持无限滑动和自动播放 |
| `LazyListView` | 高性能虚拟列表，支持等高/变高/动态模式 |
| `NumberScroller` | 数字滚动动画，支持千分位格式化 |
| `DynamicNodeComp` | 动态 Prefab 加载 |
| `SoundManager` | 音效/背景音乐管理 |
| `TipsManager` | 弹窗/Toast 管理 |
| `BundleManager` | 类型安全的 Bundle 资源加载 |
| `ArabicAdapter` | 阿拉伯语/RTL 文本适配 |

## 项目初始化清单

- [ ] Cocos Creator 项目已创建
- [ ] OOPS 框架已安装到 extensions/
- [ ] 模板代码已拷贝（或手动创建骨架代码）
- [ ] Main.ts 入口类就绪
- [ ] 全局单例 (smc) 已定义
- [ ] UI 配置表已创建并注册 Prefab
- [ ] 全局事件枚举已定义
- [ ] 子游戏模板已重命名并配置 Bundle
- [ ] 所有 `// TODO:` 标记已按项目需求修改
- [ ] 主场景中 Canvas 节点已挂载 Main 组件
- [ ] 子游戏 Prefab 已创建并挂载 SubGameEntry

## 相关技能

- `oops-framework` — OOPS 框架核心 API 详解
- `cocos-scene-management` — 场景与 Bundle 管理
- `oops-ecs-pattern` — ECS 三层架构指导

## 参考资料

- `skills/cocos-project-setup/new_project_code/README.md` — 模板快速开始指南
- `skills/cocos-project-setup/new_project_code/TECHNICAL_DOC.md` — 模板详细技术文档
