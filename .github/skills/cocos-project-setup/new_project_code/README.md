# 新项目基础代码模板

基于 Cocos Creator 3.8.x + OOPS Framework + ECS 架构的游戏基础代码。  
详细技术文档请参阅 [TECHNICAL_DOC.md](./TECHNICAL_DOC.md)。

## 项目结构

```
new_project_code/
├── script/                              # 放入 assets/script/
│   ├── Main.ts                          # 游戏入口
│   ├── extension/
│   │   └── LayerManagerExtension.ts     # UI层级管理扩展
│   └── game/
│       ├── common/
│       │   ├── bundle/                  # 资源包管理
│       │   │   ├── BundleConfig.ts      # Bundle 配置（需按项目修改）
│       │   │   └── BundleManager.ts     # Bundle 资源加载工具
│       │   ├── components/              # 通用UI组件
│       │   │   ├── CirclePageView.ts    # 循环翻页组件
│       │   │   ├── CirculatePageViewIndicator.ts  # 翻页指示器
│       │   │   ├── DynamicNodeComp.ts   # 动态Prefab加载组件
│       │   │   ├── NumberScroller.ts    # 数字滚动动画组件
│       │   │   └── listview/
│       │   │       └── LazyListView.ts  # 虚拟列表组件
│       │   ├── config/                  # 游戏配置
│       │   │   ├── GameEvent.ts         # 全局事件定义
│       │   │   ├── GameResPath.ts       # 资源路径工具
│       │   │   ├── GameUIConfig.ts      # UI界面配置
│       │   │   └── WGameConfig.ts       # 游戏启动配置
│       │   ├── ecs/
│       │   │   └── SingletonModuleComp.ts  # 全局ECS单例
│       │   ├── mgrs/
│       │   │   └── SoundManager.ts      # 音效管理器
│       │   ├── net/                     # 网络层
│       │   │   ├── NetChannelManager.ts # 网络通道管理
│       │   │   ├── NetConfig.ts         # 网络配置
│       │   │   ├── NetGameTips.ts       # 网络提示
│       │   │   └── NetNodeGame.ts       # 网络节点扩展
│       │   ├── prompt/
│       │   │   └── TipsManager.ts       # 弹窗/提示管理
│       │   ├── table/                   # 配置表数据结构
│       │   │   ├── TableLanguage.ts     # 多语言表结构
│       │   │   └── TablePromptWindow.ts # 弹窗配置表结构(示例)
│       │   └── utils/
│       │       └── TimeUtil.ts          # 时间工具
│       ├── const/
│       │   └── WGameConst.ts            # 游戏常量（需按项目修改）
│       ├── initialize/                  # 初始化流程
│       │   ├── Initialize.ts            # 初始化实体
│       │   ├── bll/
│       │   │   ├── InitGame.ts          # 游戏参数初始化
│       │   │   └── InitRes.ts           # 资源加载流程
│       │   └── view/
│       │       └── LoadingViewComp.ts   # 加载界面
│       └── WsdkHandler/
│           └── WsdkHandler.ts           # SDK集成处理
│
└── GameBundle/                          # 放入 assets/GameBundle/
    └── template_game/                   # 子游戏模板（重命名为你的游戏名）
        └── script/
            ├── SubGameEntry.ts          # 子游戏入口
            ├── config/
            │   ├── SubGameConfig.ts     # 子游戏配置
            │   ├── SubGameEvent.ts      # 子游戏事件
            │   └── SubGameUIConfig.ts   # 子游戏UI配置
            ├── ecs/
            │   └── SubSingletonModuleComp.ts  # 子游戏ECS单例
            ├── http/
            │   └── GameHttp.ts          # HTTP请求封装
            ├── subgame/
            │   └── SubGame.ts           # 子游戏ECS实体模板
            └── util/
                ├── AppUtil.ts           # App工具类
                ├── ArabicAdapter.ts     # 阿拉伯语/RTL适配
                ├── SpineUtil.ts         # Spine动画工具
                ├── SubGameUtil.ts       # 子游戏通用工具
                └── SysStorageUtil.ts    # 本地存储工具
```

## 快速开始

1. 将 `script/` 目录内容放入项目的 `assets/script/`
2. 将 `GameBundle/template_game/` 复制并重命名为你的游戏名，放入 `assets/GameBundle/`
3. 全局搜索 `// TODO:` 标记，按项目需求修改
4. 修改 `BundleConfig.ts` 中的游戏名→Bundle名映射
5. 修改 `WGameConst.ts` 中的开发环境常量
6. 修改 `InitGame.ts` 中的 Web 开发模式默认参数
7. 在子游戏的 `SubGame.ts` 中添加你的 Model 和 BLL 组件

详细说明见 [TECHNICAL_DOC.md](./TECHNICAL_DOC.md)。
