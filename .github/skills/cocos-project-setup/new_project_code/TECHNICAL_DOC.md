# 基础框架技术文档

> **适用引擎**: Cocos Creator 3.8.x  
> **核心框架**: OOPS Framework (oops-plugin-framework)  
> **编程语言**: TypeScript  
> **架构模式**: ECS (Entity-Component-System) + 三层架构 (Model/BLL/View)

---

## 目录

- [1. 架构概览](#1-架构概览)
- [2. 启动流程](#2-启动流程)
- [3. 核心模块详解](#3-核心模块详解)
  - [3.1 ECS 单例系统](#31-ecs-单例系统)
  - [3.2 初始化体系](#32-初始化体系)
  - [3.3 事件系统](#33-事件系统)
  - [3.4 网络层](#34-网络层)
  - [3.5 资源管理](#35-资源管理)
  - [3.6 UI 管理](#36-ui-管理)
  - [3.7 音效管理](#37-音效管理)
  - [3.8 多语言支持](#38-多语言支持)
  - [3.9 SDK集成 (WsdkHandler)](#39-sdk集成-wsdkhandler)
- [4. 通用组件库](#4-通用组件库)
- [5. 子游戏模板](#5-子游戏模板)
  - [5.1 子游戏结构](#51-子游戏结构)
  - [5.2 子游戏入口](#52-子游戏入口)
  - [5.3 子游戏 ECS 实体](#53-子游戏-ecs-实体)
  - [5.4 HTTP 请求](#54-http-请求)
  - [5.5 子游戏工具类](#55-子游戏工具类)
- [6. 新项目接入指南](#6-新项目接入指南)
- [7. 关键设计模式](#7-关键设计模式)
- [8. 文件清单与 TODO 索引](#8-文件清单与-todo-索引)

---

## 1. 架构概览

本框架采用 **大厅 + 子游戏** 的模块化架构。主框架负责启动、SDK、网络、公共资源管理；每个子游戏封装在独立的 **AssetBundle** 中，拥有独立的 ECS 实体、HTTP、UI 配置和事件体系。

```
┌──────────────────────────────────────────────────────┐
│                       Main.ts                        │
│              (游戏入口 / 引擎初始化)                   │
├──────────────────────────────────────────────────────┤
│  smc (全局单例)                                       │
│  ├── initialize   → Initialize Entity                │
│  │   ├── InitGameComp  (SDK参数: token/baseUrl/lang) │
│  │   └── InitResComp   (资源加载流水线)               │
│  └── wsdkHandler  → WsdkHandler Entity (SDK桥接)     │
├──────────────────────────────────────────────────────┤
│  公共服务层                                           │
│  ├── SoundManager      (音效/背景音乐)                │
│  ├── TipsManager       (弹窗/Toast)                   │
│  ├── NetChannelManager (WebSocket通道)                │
│  ├── BundleManager     (类型安全的资源加载)            │
│  └── TimeUtil          (日期/时区工具)                 │
├──────────────────────────────────────────────────────┤
│  子游戏 Bundle (GameBundle/xxx/)                      │
│  ├── SubGameEntry      (onLoad → 初始化子游戏)        │
│  ├── sub_smc (子游戏单例)                             │
│  │   ├── subGame  → SubGame Entity (Model+BLL)       │
│  │   └── gameHttp → GameHttp Entity (带鉴权HTTP)     │
│  └── SubGameUIConfig   (子游戏UI注册)                 │
└──────────────────────────────────────────────────────┘
```

### 三层架构 (Model / BLL / View)

| 层次 | 基类 | 职责 | 示例 |
|------|------|------|------|
| **Model** | `ecs.Comp` | 纯数据存储，无业务逻辑 | `UserGameModelComp` |
| **BLL** | `ecs.ComblockSystem` | 业务逻辑处理、数据请求 | `InitResSystem` |
| **View** | `CCVMParentComp` / `Component` | UI展示、用户交互 | `LoadingViewComp` |

数据流：**View → (事件) → BLL → (HTTP/逻辑) → Model → (VM绑定/事件) → View**

---

## 2. 启动流程

```
游戏启动
  │
  ▼
Main.ts.onLoad()
  ├── 初始化 oops.gui (UI层级管理)
  ├── 注册 UIID → Prefab 映射 (GameUIConfig)
  ├── 创建 ECS World
  │   ├── smc.initialize = new Initialize()
  │   │   ├── add(InitGameComp)  ← 读取SDK参数或使用WebDevMode默认值
  │   │   └── add(InitResComp)   ← 触发资源加载流水线
  │   └── smc.wsdkHandler = new WsdkHandler()
  │       └── 监听 OnEnterInitResSystem / onGetGameViewRet / opGame
  │
  ▼
InitResSystem.entityEnter()
  ├── dispatch(OnEnterInitResSystem)  → WsdkHandler 初始化 WSDK
  ├── [WebDevMode] dispatch(OnGetGameViewRet)
  ├── 加载主 Bundle
  ├── 加载公共资源 (common/)
  │
  ▼
等待 SDK 回调 onGetGameViewRet
  ├── InitGameComp.setDetailData(data) ← 填充token/baseUrl/langCode等
  ├── checkInitCondition()
  │   └── (公共资源已加载 && SDK参数已获取) ?
  │
  ▼
afterLoad()
  ├── 设置语言
  ├── 加载子游戏 Bundle
  ├── 加载语言包 & 字体
  ├── 打开子游戏 (oops.gui.open(UIID.SubGame))
  │
  ▼
SubGameEntry.onLoad()
  ├── 注册子游戏UI配置到全局 LayerManager
  ├── 初始化子游戏 ECS
  ├── 设置语言、播放BGM
  │
SubGameEntry.start()
  ├── sub_smc.init() → 初始化子游戏单例
  └── appCross.g2pp.onGameStart()  → 通知App游戏已启动
```

---

## 3. 核心模块详解

### 3.1 ECS 单例系统

**文件**: `script/game/common/ecs/SingletonModuleComp.ts`

```typescript
// 全局唯一的游戏单例，随ECS世界存在
export var smc: SingletonModuleComp = ecs.getSingleton(SingletonModuleComp);

// 使用方式
smc.initialize.getToken();       // 获取用户Token
smc.initialize.getLangCode();    // 获取语言代码
smc.initialize.getBaseUrl();     // 获取API基础地址
```

**设计要点**：
- `smc` 是全局单例，在 `Main.ts` 中通过 `smc.init()` 初始化
- 持有 `initialize` (Initialize Entity) 和 `wsdkHandler` (WsdkHandler Entity)
- 子游戏通过 `smc` 访问全局状态（如Token、语言、API地址）

### 3.2 初始化体系

#### Initialize (ECS Entity)

**文件**: `script/game/initialize/Initialize.ts`

作为初始化的顶层 ECS 实体，提供统一的参数访问接口：

```typescript
const entity = smc.initialize;
entity.getBaseUrl()      // API基础地址
entity.getToken()        // 用户认证Token
entity.getLangCode()     // 语言代码 (默认 "en")
entity.getRegion()       // 大区 (如 "EG")
entity.getAppName()      // App名称
entity.getVersionCode()  // 版本号
entity.getPackageName()  // 包名
entity.getChannel()      // 渠道
entity.getPlatform()     // 平台
```

#### InitGameComp (ECS Component)

**文件**: `script/game/initialize/bll/InitGame.ts`

存储所有从 SDK 获取的初始化参数：

- **WebDevMode**: 当 `DEBUG && WGameConst.WebDevMode` 时使用本地硬编码参数，方便浏览器调试
- **getBrowserUrlParam()**: 支持从 URL 参数覆盖 Token（`?token=xxx`）
- **setDetailData(detail)**: 接收 SDK 回调的 JSON 数据并解析到各字段

#### InitResSystem (ComblockSystem)

**文件**: `script/game/initialize/bll/InitRes.ts`

资源加载流水线，使用 **AsyncQueue** 实现有序异步加载：

| 步骤 | 方法 | 说明 |
|------|------|------|
| 1 | `loadBundle()` | 加载主 AssetBundle |
| 2 | `loadCommon()` | 加载 `common/` 目录公共资源 |
| 3 | 等待 `OnGetGameViewRet` | SDK 参数就绪 |
| 4 | `loadSubGame()` | 加载子游戏 Bundle |
| 5 | `loadCustom()` | 加载语言字体 |
| 6 | `loadLanguage()` | 加载语言包 |
| 7 | `onComplete()` | 打开子游戏 UI |

**两阶段检查机制**: `bCommonResLoaded` + `bInitGamePramGetted`，两者都 `true` 时才进入 `afterLoad()`。

### 3.3 事件系统

**文件**: `script/game/common/config/GameEvent.ts`

基于 OOPS Framework 的发布-订阅事件系统。

```typescript
// 全局事件
export enum WGameEvent {
    GameServerConnected = 'WGameEvent.GameServerConnected',
    LoginSuccess        = 'WGameEvent.LoginSuccess',
    OnGetGameViewRet    = 'WGameEvent.OnGetGameViewRet',
    OnEnterInitResSystem = 'WGameEvent.OnEnterInitResSystem',
    OnAsyncSound        = 'WGameEvent.OnAsyncSound',
}

// 使用方式
// 监听
oops.message.on(WGameEvent.OnGetGameViewRet, this.onHandler, this);
// 发送
oops.message.dispatchEvent(WGameEvent.OnGetGameViewRet, data);
```

子游戏使用独立的 `SubGameEvent` 枚举，避免事件名冲突。

### 3.4 网络层

#### NetConfig

**文件**: `script/game/common/net/NetConfig.ts`

全局网络配置单例，存储 WebSocket 连接参数。

#### NetChannelManager

**文件**: `script/game/common/net/NetChannelManager.ts`

WebSocket 通道管理器：
- `createGameNode()` → 创建 NetNodeGame 实例
- `gameConnect()` → 连接 WebSocket 服务器
- `gameClose()` → 关闭连接

#### NetNodeGame

**文件**: `script/game/common/net/NetNodeGame.ts`

扩展 OOPS 的 NetNode，增加 JSON 协议封装：
- `req(cmd, data, rsp, cb)` → 发送请求并等待指定响应
- `reqUnique(cmd, data, rsp, cb)` → 唯一请求（重复发送会覆盖前一个回调）

#### NetGameTips

**文件**: `script/game/common/net/NetGameTips.ts`

实现 `INetworkTips` 接口，在网络连接/断开/重连时显示对应 UI 提示。

### 3.5 资源管理

#### BundleConfig

**文件**: `script/game/common/bundle/BundleConfig.ts`

游戏名到 Bundle 名的映射注册：

```typescript
private initGameBundleName() {
    this._gameBundleNameMap.set("your_game", "your_bundle");
}
```

同时定义 Bundle 内的资源路径字典，供 `BundleManager` 做类型推导。

#### BundleManager

**文件**: `script/game/common/bundle/BundleManager.ts`

类型安全的 Bundle 资源加载：

```typescript
// 加载预制体
const prefab = await BundleManager.loadPrefab("game", "prefab_name");
// 加载音频
const clip = await BundleManager.loadAudio("game", "bgm_name");
// 加载图片
const sprite = await BundleManager.loadTexture("game", "icon_name");
// 释放资源
BundleManager.release("game", "prefab_name", Prefab);
```

### 3.6 UI 管理

#### GameUIConfig

**文件**: `script/game/common/config/GameUIConfig.ts`

全局 UIID 枚举 + Prefab 路径映射：

```typescript
export enum UIID {
    Loading = 1,
    Window,
    Netinstable,
    Demo,
    SubGame = 1000,  // 子游戏入口（由子游戏Bundle动态设置）
}

export var UIConfigData: { [key: number]: UIConfig } = {
    [UIID.Loading]:     { layer: LayerType.UI, prefab: "prefab/loading" },
    [UIID.Window]:      { layer: LayerType.Dialog, prefab: "prefab/common/tipPromptWindow" },
    [UIID.Netinstable]: { layer: LayerType.PopUp, prefab: "prefab/common/netInstable" },
};
```

#### LayerManagerExtension

**文件**: `script/extension/LayerManagerExtension.ts`

允许子游戏动态注册自己的 UI 配置到全局 LayerManager：

```typescript
// 子游戏入口调用
LayerManagerExtension.ExpandGuiConfig(SubUIConfigData);
```

#### TipsManager

**文件**: `script/game/common/prompt/TipsManager.ts`

弹窗管理器，支持警告弹窗和确认弹窗，内置缩放动画效果：

```typescript
tips.alert("提示内容", () => { /* 确认回调 */ });
tips.confirm("确认内容", () => { /* 确认回调 */ });
```

### 3.7 音效管理

**文件**: `script/game/common/mgrs/SoundManager.ts`

通过 `appCross` SDK 接口管理音效：

```typescript
soundManager.PlayBackgroundMusic("bgm");     // 播放背景音乐
soundManager.PlaySound("click");             // 播放音效
soundManager.StopAllSoundAndMusic();          // 停止所有音效
soundManager.SetSoundsOn(true/false);         // 总开关
soundManager.ResumeBackGroundMusic();         // 恢复背景音乐
```

**自动状态管理**: 子游戏入口监听 `Game.EVENT_SHOW/HIDE` 自动暂停/恢复音效。

### 3.8 多语言支持

#### 语言表 (TableLanguage)

**文件**: `script/game/common/table/TableLanguage.ts`

配合 `oops-plugin-excel-to-json` 插件生成的 JSON 配置表。

#### 语言切换

```typescript
// 设置语言
oops.language.setLanguage("en", callback);
// 获取翻译
oops.language.getLangByID("loading_load_game");
```

#### 阿拉伯语/RTL 适配 (ArabicAdapter)

**文件**: `GameBundle/template_game/script/util/ArabicAdapter.ts`

自动处理阿拉伯语等 RTL 语言的文本布局反转、行拆分、括号翻转。  
挂载到 Label 节点后调用 `startApater(childNode, dataID)` 即可。

### 3.9 SDK集成 (WsdkHandler)

**文件**: `script/game/WsdkHandler/WsdkHandler.ts`

SDK桥接层，监听三个核心事件：

| 事件 | 处理逻辑 |
|------|----------|
| `OnEnterInitResSystem` | 设置消息代理 → 初始化 WSDK |
| `onGetGameViewRet` | 解析SDK参数 → 填充 InitGameComp → 初始化上报 |
| `opGame` | 处理 App→游戏 操作（如音效同步） |

---

## 4. 通用组件库

### CirclePageView

**文件**: `script/game/common/components/CirclePageView.ts`

循环翻页组件，支持无限左右滑动和自动播放：
- 继承 Cocos `PageView`
- 支持配置自动翻页间隔
- 自动循环：到最后一页时无缝跳回第一页

### CirculatePageViewIndicator

**文件**: `script/game/common/components/CirculatePageViewIndicator.ts`

配合 `CirclePageView` 使用的循环模式翻页指示器。

### LazyListView (虚拟列表)

**文件**: `script/game/common/components/listview/LazyListView.ts`

高性能虚拟列表组件，支持三种尺寸模式：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `Indetermined` | 运行时动态计算每项高度 | 不确定尺寸的列表 |
| `Different` | 预设不同固定高度 | 混合尺寸列表 |
| `Identical` | 所有项目等高 | 标准列表（性能最佳） |

支持：垂直/水平/网格布局、分页加载、间距设定、动态数据更新。

### NumberScroller

**文件**: `script/game/common/components/NumberScroller.ts`

数字滚动动画组件：
- 千分位格式化 (`1234567` → `1,234,567`)
- 缓动动画从当前值过渡到目标值
- 可选跳动缩放效果

```typescript
numberScroller.setValue(1000);              // 直接设值
numberScroller.animateNumber(5000, 0.5);   // 动画过渡
numberScroller.animateNumber(9999, 1, true); // 带跳动效果
```

### DynamicNodeComp

**文件**: `script/game/common/components/DynamicNodeComp.ts`

动态 Prefab 加载组件，拖入 Prefab 引用后自动在 `onLoad` 实例化并挂载到当前节点。

---

## 5. 子游戏模板

### 5.1 子游戏结构

```
GameBundle/template_game/
└── script/
    ├── SubGameEntry.ts              # 入口 (挂载在子游戏Prefab根节点)
    ├── config/
    │   ├── SubGameConfig.ts         # 游戏配置 (HTTP超时、API路径、阶段等)
    │   ├── SubGameEvent.ts          # 游戏内事件
    │   └── SubGameUIConfig.ts       # UI配置 (SubUIID枚举 + Prefab映射)
    ├── ecs/
    │   └── SubSingletonModuleComp.ts # 子游戏单例 (sub_smc)
    ├── http/
    │   └── GameHttp.ts              # 带鉴权的HTTP实体
    ├── subgame/
    │   └── SubGame.ts               # 子游戏主实体 (注册Model+BLL组件)
    └── util/
        ├── AppUtil.ts               # App配置 (名称/时区/榜单)
        ├── ArabicAdapter.ts         # RTL文本适配
        ├── SpineUtil.ts             # Spine动画播放/停止
        ├── SubGameUtil.ts           # 网络请求/精灵帧加载/Skeleton加载
        └── SysStorageUtil.ts        # 带前缀的本地存储
```

### 5.2 子游戏入口

**文件**: `GameBundle/template_game/script/SubGameEntry.ts`

子游戏的 Prefab 根节点挂载此组件，`onLoad` 中完成：
1. 调用 `LayerManagerExtension.ExpandGuiConfig()` 注册子游戏 UI
2. 初始化 ECS 系统
3. 设置语言
4. 监听 App 前后台切换（暂停/恢复音效）

`start` 中：
1. `sub_smc.init()` 初始化子游戏单例
2. 通知 App 游戏已启动

### 5.3 子游戏 ECS 实体

**文件**: `GameBundle/template_game/script/subgame/SubGame.ts`

模板 Entity，开发时按三层模式添加组件：

```typescript
@ecs.register('SubGame')
export class SubGame extends ecs.Entity {
    // 1. 在此声明 Model 和 BLL 组件
    UserGameModel!: UserGameModelComp;
    UserGameData!: UserGameDataComp;

    protected init() {
        // 2. 注册常驻组件
        this.addComponents<ecs.Comp>(
            UserGameModelComp,
        );
    }

    // 3. 添加业务触发方法
    getUserGameInfo() {
        this.add(UserGameDataComp); // 触发 ComblockSystem
    }
}
```

### 5.4 HTTP 请求

**文件**: `GameBundle/template_game/script/http/GameHttp.ts`

每次请求自动创建新的 `HttpRequest` 并注入鉴权 Headers：

| Header | 来源 |
|--------|------|
| `token` | `smc.initialize.getToken()` |
| `language_code` | `smc.initialize.getLangCode()` |
| `Region` | `smc.initialize.getRegion()` |
| `version_code` | `smc.initialize.getVersionCode()` |
| `platform` | `smc.initialize.getPlatform()` |
| `package_name` | `smc.initialize.getPackageName()` |
| `channel` | `smc.initialize.getChannel()` |

使用方式：

```typescript
// 通过 SubGameUtil 快捷调用
SubGameUtil.HttpGet("api/path", (data) => { /* 处理响应 */ });
SubGameUtil.HttpPost("api/path", (data) => { /* 处理响应 */ });

// 或直接使用 gameHttp
sub_smc.gameHttp.httpGet("api/path", callback);
```

### 5.5 子游戏工具类

#### SubGameUtil

精灵帧加载（带缓存池）、Skeleton 加载、HTTP 快捷方法。

#### SpineUtil

Spine 动画播放/停止的静态封装。

#### SysStorageUtil

带游戏名前缀的 `localStorage` 封装，避免多子游戏之间的存储 Key 冲突。

#### AppUtil

App 级别配置：应用名称、榜单类型、时区、货币类型等。

---

## 6. 新项目接入指南

### Step 1: 复制文件

```
new_project_code/script/        →  项目/assets/script/
new_project_code/GameBundle/    →  项目/assets/GameBundle/
```

将 `template_game` 重命名为你的游戏名（如 `lucky_wheel`）。

### Step 2: 修改必要配置

全局搜索 `// TODO:` 查看所有需要修改的位置。核心修改项：

| 文件 | 需要修改的内容 |
|------|---------------|
| `WGameConst.ts` | 添加项目特定常量 |
| `InitGame.ts` | WebDevMode 下的默认 baseUrl、token、appName 等 |
| `BundleConfig.ts` | 游戏名→Bundle名映射、Bundle内资源路径 |
| `GameUIConfig.ts` | 主框架层 UI Prefab 路径 |
| `SubGameUIConfig.ts` | 子游戏 UI Prefab 路径、Bundle名 |
| `SubGameConfig.ts` | API 路径、HTTP 超时、游戏阶段配置 |
| `SubGameEvent.ts` | 子游戏业务事件 |
| `WsdkHandler.ts` | `Const.GameType` 修改为项目对应的游戏类型 |

### Step 3: 创建子游戏 Model/BLL

```
GameBundle/your_game/script/
├── subgame/
│   ├── model/
│   │   └── YourModelComp.ts      ← 继承 ecs.Comp
│   └── bll/
│       └── YourDataComp.ts       ← 继承 ecs.Comp + 创建对应 ComblockSystem
└── ...
```

在 `SubGame.ts` 中注册组件：

```typescript
protected init() {
    this.addComponents<ecs.Comp>(YourModelComp);
}
```

### Step 4: 创建 UI 界面

1. 在 Cocos Editor 中创建 Prefab
2. 在 `SubGameUIConfig.ts` 中注册 UIID 和 Prefab 路径
3. 使用 `oops.gui.open(SubUIID.YourUI)` 打开

### Step 5: 对接 API

1. 在 `SubGameConfig.ts` 的 `DeeplinkUrls` 中定义 API 路径
2. 在 BLL 组件 (ComblockSystem) 中发起请求：

```typescript
SubGameUtil.HttpGet(DeeplinkUrls.yourApi, (data: HttpReturn) => {
    if (data.isSucc) {
        // 更新 Model
        // 分发事件通知 View
        oops.message.dispatchEvent(SubGameEvent.YourEvent, data.res);
    }
});
```

---

## 7. 关键设计模式

### 7.1 ComblockSystem 触发模式

通过 `add/remove` Component 来触发/停止 System：

```typescript
// 触发请求
entity.add(SomeDataComp);  // → SomeDataSystem.entityEnter() 被调用

// 系统处理完毕后自行移除
entityEnter(e: SomeEntity): void {
    // ... 业务逻辑
    e.remove(SomeDataComp); // 单次执行
}
```

### 7.2 AsyncQueue 有序异步

```typescript
var queue: AsyncQueue = new AsyncQueue();
queue.push(async (next) => {
    await someAsyncWork();
    next(); // 必须调用，否则队列阻塞
});
queue.push((next) => {
    anotherAsyncWork(next);
});
queue.complete = () => { /* 全部完成 */ };
queue.play();
```

### 7.3 VM数据绑定

View 组件继承 `CCVMParentComp`，通过 `data` 属性与 Prefab 中的 VM 组件自动绑定：

```typescript
@ccclass('MyView')
export class MyView extends CCVMParentComp {
    data: any = {
        score: 0,
        name: ""
    };

    updateScore(val: number) {
        this.data.score = val; // 自动更新绑定的UI
    }
}
```

### 7.4 单例 ECS 访问

```typescript
// 全局单例
import { smc } from "路径/SingletonModuleComp";
smc.initialize.getToken();

// 子游戏单例
import { sub_smc } from "路径/SubSingletonModuleComp";
sub_smc.subGame.getUserGameInfo();
sub_smc.gameHttp.httpGet(...);
```

---

## 8. 文件清单与 TODO 索引

### 主框架文件 (script/) — 31 个文件

| 路径 | 说明 | TODO |
|------|------|------|
| `Main.ts` | 游戏入口 | — |
| `extension/LayerManagerExtension.ts` | UI层级扩展 | — |
| `game/common/bundle/BundleConfig.ts` | Bundle配置 | ✅ 注册游戏映射、资源路径 |
| `game/common/bundle/BundleManager.ts` | 资源加载工具 | — |
| `game/common/components/CirclePageView.ts` | 循环翻页 | — |
| `game/common/components/CirculatePageViewIndicator.ts` | 翻页指示器 | — |
| `game/common/components/DynamicNodeComp.ts` | 动态Prefab加载 | — |
| `game/common/components/NumberScroller.ts` | 数字滚动动画 | — |
| `game/common/components/listview/LazyListView.ts` | 虚拟列表 | — |
| `game/common/config/GameEvent.ts` | 全局事件 | ✅ 添加项目事件 |
| `game/common/config/GameResPath.ts` | 资源路径 | ✅ 添加路径方法 |
| `game/common/config/GameUIConfig.ts` | UI配置 | ✅ 注册UI Prefab |
| `game/common/config/WGameConfig.ts` | 启动配置 | — |
| `game/common/ecs/SingletonModuleComp.ts` | 全局单例 | — |
| `game/common/mgrs/SoundManager.ts` | 音效管理 | — |
| `game/common/net/NetChannelManager.ts` | 网络通道 | — |
| `game/common/net/NetConfig.ts` | 网络配置 | ✅ 设置 IP/端口 |
| `game/common/net/NetGameTips.ts` | 网络提示 | ✅ 添加重启逻辑 |
| `game/common/net/NetNodeGame.ts` | 网络节点 | — |
| `game/common/prompt/TipsManager.ts` | 弹窗管理 | — |
| `game/common/table/TableLanguage.ts` | 多语言表 | ✅ 添加语言getter |
| `game/common/table/TablePromptWindow.ts` | 弹窗配置表 | — |
| `game/common/utils/TimeUtil.ts` | 时间工具 | — |
| `game/const/WGameConst.ts` | 常量 | ✅ 添加项目常量 |
| `game/initialize/Initialize.ts` | 初始化实体 | — |
| `game/initialize/bll/InitGame.ts` | 游戏参数 | ✅ WebDevMode默认值 |
| `game/initialize/bll/InitRes.ts` | 资源加载 | — |
| `game/initialize/view/LoadingViewComp.ts` | 加载界面 | — |
| `game/WsdkHandler/WsdkHandler.ts` | SDK处理 | ✅ 修改GameType |

### 子游戏模板文件 (GameBundle/template_game/) — 11 个文件

| 路径 | 说明 | TODO |
|------|------|------|
| `script/SubGameEntry.ts` | 子游戏入口 | ✅ 播放BGM、打开常驻UI |
| `script/config/SubGameConfig.ts` | 游戏配置 | ✅ API路径、阶段配置 |
| `script/config/SubGameEvent.ts` | 游戏事件 | ✅ 添加业务事件 |
| `script/config/SubGameUIConfig.ts` | UI配置 | ✅ Bundle名、UIID、Prefab路径 |
| `script/ecs/SubSingletonModuleComp.ts` | 子游戏单例 | — |
| `script/http/GameHttp.ts` | HTTP请求 | — |
| `script/subgame/SubGame.ts` | 子游戏实体 | ✅ 注册Model/BLL组件 |
| `script/util/AppUtil.ts` | App工具 | — |
| `script/util/ArabicAdapter.ts` | RTL适配 | — |
| `script/util/SpineUtil.ts` | Spine工具 | — |
| `script/util/SubGameUtil.ts` | 通用工具 | — |
| `script/util/SysStorageUtil.ts` | 本地存储 | — |

---

## 依赖说明

| 依赖 | 说明 | 安装方式 |
|------|------|---------|
| `oops-plugin-framework` | OOPS核心框架 (ECS/GUI/Res/Log/Timer) | Cocos Store 或 extensions/ |
| `wsdk` | WeNext SDK (App↔Game桥接, 音效, 上报) | extensions/wsdk/ |
| `oops-plugin-excel-to-json` | Excel配置表转JSON | Cocos Store 或 extensions/ |

---

> 本文档基于 Cocos Creator 3.8.x + OOPS Framework 实际项目提炼，所有代码均已移除游戏特定业务逻辑，保留完整的架构模式和通用能力。
