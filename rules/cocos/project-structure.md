---
paths:
  - "assets/**"
  - "extensions/**"
---
# Cocos Creator 项目结构规范

## 顶层目录

```
项目根目录/
├── assets/                     # 所有游戏资源和脚本
├── extensions/                 # Cocos Creator 插件
├── build/                      # 构建输出
├── build-templates/            # 构建模板
├── library/                    # 编辑器缓存（勿提交）
├── temp/                       # 临时文件（勿提交）
├── settings/                   # 项目设置
├── profiles/                   # 编辑器配置
├── package.json                # 项目依赖
├── tsconfig.json               # TypeScript 配置
└── playbook-cocos/             # AI 知识库（本目录）
```

## assets/ 目录布局

```
assets/
├── script/                     # 全局脚本（非 Bundle）
│   ├── Main.ts                # 游戏入口（继承 Root）
│   ├── game/
│   │   ├── initialize/        # 初始化逻辑
│   │   │   ├── Initialize.ts  # 初始化实体
│   │   │   └── bll/           # 初始化业务逻辑
│   │   ├── common/
│   │   │   ├── ecs/           # 全局单例模块
│   │   │   ├── config/        # 全局 UI 配置、事件、常量
│   │   │   ├── mgrs/          # 管理器（音频等）
│   │   │   ├── utils/         # 全局工具类
│   │   │   ├── net/           # 网络接口
│   │   │   └── components/    # 共享 UI 组件
│   │   └── WsdkHandler/       # SDK 集成
│   └── extension/             # GUI 层级扩展
│
├── GameBundle/                # 子游戏 Bundle 容器
│   └── <game-name>/          # 具体子游戏（如 greedybox）
│       ├── script/            # 子游戏脚本
│       ├── prefab/            # UI 预制体
│       ├── texture/           # 图片资源
│       ├── spine/             # Spine 骨骼动画
│       ├── config/            # 配置文件
│       ├── language/          # 本地化文件
│       └── material/          # 自定义材质
│
├── resources/                 # 动态加载资源
├── libs/                      # 第三方库
├── ui/                        # 全局 UI 资源
└── main.scene                 # 主场景
```

## 子游戏脚本目录（GameBundle/<game>/script/）

```
script/
├── SubGameEntry.ts            # 子游戏入口组件
├── subgame/
│   ├── SubGame.ts             # ECS 根实体
│   ├── model/                 # 数据层（Model）
│   │   ├── UserGameModelComp.ts
│   │   ├── BettingModelComp.ts
│   │   └── ...
│   └── bll/                   # 业务逻辑层（BLL）
│       ├── ReqBettingData.ts
│       ├── CurrentResultData.ts
│       └── ...
├── component/                 # 视图组件层（View）
│   ├── NodeGameMainComponent.ts
│   ├── ItemGameBoxComponent.ts
│   └── ...
├── panel/                     # 弹窗面板
│   ├── panelSettlementComponent.ts
│   ├── PanelMyRecordComponent.ts
│   └── ...
├── config/
│   ├── SubGameConfig.ts       # 游戏常量与阶段配置
│   ├── SubGameEvent.ts        # 事件枚举
│   └── SubGameUIConfig.ts     # UI ID 与配置映射
├── http/
│   └── GameHttp.ts            # HTTP 请求封装
├── net/
│   └── Protocal.ts            # 请求/响应类型定义
├── ecs/
│   └── SubSingletonModuleComp.ts  # 子游戏单例
├── util/                      # 工具类
│   ├── SubGameUtil.ts
│   ├── GreedyBoxUtil.ts
│   ├── AppUtil.ts
│   └── SysStorageUtil.ts
├── data/
│   └── AudioClips.ts          # 音频资源路径常量
├── tips/                      # Toast 提示组件
├── coinToken/                 # 代币系统
└── winningTicker/             # 中奖播报
```

## 文件命名规范

| 文件类型 | 命名格式 | 示例 |
|----------|----------|------|
| 组件类 | PascalCase + Component 后缀 | `NodeGameMainComponent.ts` |
| 面板类 | panel 前缀 + PascalCase | `panelSettlementComponent.ts` |
| ECS 实体 | PascalCase | `SubGame.ts` |
| Model 组件 | PascalCase + ModelComp 后缀 | `UserGameModelComp.ts` |
| BLL 组件 | PascalCase + DataComp 后缀 | `ReqBettingDataComp` |
| 配置文件 | PascalCase + Config 后缀 | `SubGameConfig.ts` |
| 事件文件 | PascalCase + Event 后缀 | `SubGameEvent.ts` |
| 工具类 | PascalCase + Util 后缀 | `SubGameUtil.ts` |
| 预制体 | camelCase | `panelSettlement.prefab` |

## Bundle 划分原则

- 每个独立子游戏是一个 Bundle
- Bundle 内包含该子游戏的所有脚本、预制体和资源
- 全局共享的代码放在 `assets/script/` 下（不属于任何 Bundle）
- 全局共享的资源放在 `assets/resources/` 下
- Bundle 间通过事件系统或全局单例通信，不直接引用

## .gitignore 建议

```
library/
temp/
local/
build/
profiles/
settings/
*.meta          # 可选：团队协商是否提交
```
