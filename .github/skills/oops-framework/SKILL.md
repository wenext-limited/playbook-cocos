---
name: oops-framework
description: 初始化 OOPS 框架或了解其核心 API 时使用，包括 Root 基类、oops 全局对象和框架启动流程。不适用于不使用 OOPS 框架的 Cocos Creator 项目。
tags: [oops, framework, core, init, root]
inputs: [项目类型, 框架版本]
outputs: [入口类, 框架初始化代码, 全局API说明]
---

# OOPS 框架核心

## 概述

OOPS Plugin Framework 是一个面向 Cocos Creator 3.x 的轻量级游戏框架，提供 ECS 架构、UI 管理、资源管理、网络通信、事件系统等核心能力。框架以 Cocos Creator 插件形式存在于 `extensions/oops-plugin-framework/` 目录。

## 框架结构

```
extensions/oops-plugin-framework/
└── assets/
    ├── core/
    │   ├── Oops.ts            # 全局入口对象
    │   ├── Root.ts            # 游戏入口基类
    │   ├── gui/
    │   │   └── layer/
    │   │       └── LayerManager.ts   # UI 层级管理
    │   └── common/
    │       └── event/
    │           └── EventMessage.ts   # 内置事件
    └── libs/
        ├── ecs/
        │   └── ECS.ts         # ECS 核心
        └── network/
            └── HttpRequest.ts # HTTP 请求
```

## 入口基类 Root

游戏的 `Main.ts` 必须继承 `Root`：

```typescript
import { Root } from 'path/to/oops-framework/core/Root';

@ccclass('Main')
export class Main extends Root {
    start() {
        profiler.hideStats();
    }

    // 初始化 ECS 系统
    protected initEcsSystem() {
        oops.ecs.add(new EcsInitializeSystem());
    }

    // 初始化 GUI 层级
    protected initGui() {
        oops.gui.init(UIConfigData);
    }

    // 游戏运行入口
    protected run() {
        smc.initialize = ecs.getEntity<Initialize>(Initialize);
    }
}
```

### Root 生命周期

```
Root 执行顺序:
1. constructor()
2. start()
3. initEcsSystem()    → 注册 ECS 系统
4. initGui()          → 初始化 UI 管理器
5. run()              → 游戏业务启动
```

## oops 全局对象

`oops` 是框架的全局入口，提供以下子模块：

### oops.gui — UI 管理

```typescript
// 初始化
oops.gui.init(UIConfigData);

// 打开 UI
oops.gui.open(UIID);
oops.gui.open(UIID, data);
await oops.gui.openAsync(UIID);

// 关闭 UI
oops.gui.remove(UIID);
oops.gui.remove(UIID, false);  // 关闭但不销毁

// 获取配置
oops.gui.getConfig(UIID);
```

### oops.res — 资源管理

```typescript
// 加载资源
oops.res.load(path, callback);
oops.res.load(path, type, callback);

// 异步加载
await oops.res.loadAsync(bundleName, path, type);

// 加载远程资源
oops.res.loadRemote(url, callback);

// 默认 Bundle 名
oops.res.defaultBundleName;
```

### oops.message — 事件系统

```typescript
// 注册
oops.message.on(event, handler, target);

// 注销
oops.message.off(event, handler, target);

// 派发
oops.message.dispatchEvent(event);
oops.message.dispatchEvent(event, arg1, arg2);
```

### oops.ecs — ECS 管理

```typescript
// 初始化
oops.ecs.init();

// 添加系统
oops.ecs.add(system);
```

### oops.language — 语言管理

```typescript
// 设置语言
oops.language.setLanguage(langCode, callback);

// 获取文本
oops.language.getLangByID(key);

// 获取百分比格式
oops.language.getlangPercent(value);

// 当前语言
oops.language.current;

// 是否需要 RTL 反转（阿拉伯语等）
oops.language.needReverse;
```

### oops.timer — 定时器

框架级定时器，**不依赖组件生命周期**，适用于全局延时任务。

```typescript
// 单次延时执行
oops.timer.scheduleOnce(() => {
    this.showResult();
}, 1.5);

// 取消已注册的定时器
oops.timer.unschedule(this.scheduledCallback);
```

> **与 Component.schedule 的区别**：`oops.timer` 由框架全局管理，即使组件被销毁也不会自动取消。如果需要在组件销毁时取消，必须手动调用 `unschedule()`。

### oops.storage — 本地持久化

基于 `sys.localStorage` 的简单键值存储，适合轻量级偏好设置。

```typescript
// 存储
oops.storage.set("language", "en");

// 读取
const lang = oops.storage.get("language");

// 布尔值
const played = oops.storage.getBoolean("tokenAnimPlayed");
```

> **注意**：`oops.storage` 适合存简单键值（语言、开关）。复杂数据应使用 `SysStorageUtil`（带前缀隔离）或直接通过 `sys.localStorage` 管理。

### oops.tcp — WebSocket 网络

长连接通信管理器，封装 WebSocket 协议。

```typescript
import { NetChannelType } from '../common/net/NetChannelManager';

// 配置网络节点
oops.tcp.setNetNode(this.game, NetChannelType.Game);

// 建立连接
oops.tcp.connect({
    url: `ws://${host}:${port}`,
    autoReconnect: 0          // 0 = 不自动重连
}, NetChannelType.Game);

// 关闭连接
oops.tcp.close(undefined, undefined, NetChannelType.Game);
```

**配套类**：
- `WebSock` — WebSocket 底层封装
- `NetProtocolPako` — 协议编解码（Pako 压缩）
- `NetGameTips` — 网络状态 UI 提示

### oops.config — 全局配置

读取框架级配置（通常在编辑器中设置），包括游戏 Bundle 名称等。

```typescript
// 获取游戏 Bundle 名称
const bundleName = oops.config.game.bundleName;

// 常见用法：初始化时设置默认 Bundle
oops.res.defaultBundleName = oops.config.game.bundleName;
await oops.res.loadBundle(oops.config.game.bundleName);
```

### oops.random — 随机工具

提供可复现的随机数生成（种子控制）。

```typescript
// 获取随机浮点数
const interval = oops.random.getRandomFloat(1.5, 2.0);

// 用于飞行路径随机位置
const x = oops.random.getRandomFloat(-halfWidth, halfWidth);
const y = oops.random.getRandomFloat(-halfHeight, halfHeight);
```

### oops.mvvm — 视图模型绑定

框架级 MVVM 管理器，详见 `oops-mvvm-binding` 技能。

```typescript
// 注册 ViewModel
oops.mvvm.add(
    { [VMKey.Path_MyChipsGear]: 0, [VMKey.Path_MyChipsNum]: 0 },
    VMKey.Tag_MyChips
);

// 获取 ViewModel 并操作
const vm = oops.mvvm.get(VMKey.Tag_MyChips);
vm.setValue(VMKey.Path_MyChipsGear, newGear);
const gear = vm.getValue(VMKey.Path_MyChipsGear);
```

### oops.log — 分层日志

按 MVC 分层的日志系统，便于按层过滤调试信息。

```typescript
// 业务层日志（BLL System 中使用）
oops.log.logBusiness("ReqBettingData → 下注成功");

// 视图层日志（Component 中使用）
oops.log.logView("onClickBetArea → 点击下注区");

// 模型层日志（Model/初始化中使用）
oops.log.logModel("InitRes → 资源加载完成");
```

**分层约定**：

| 日志方法 | 使用场景 | 典型文件 |
|----------|----------|----------|
| `logBusiness` | BLL 系统、工具类、通用逻辑 | `bll/*.ts`、`util/*.ts` |
| `logView` | UI 组件交互 | `component/*.ts`、`panel/*.ts` |
| `logModel` | 初始化流程、数据模型 | `InitRes.ts`、`InitGame.ts` |

## ECS 核心 API

```typescript
import { ecs } from 'path/to/oops-framework/libs/ecs/ECS';

// 获取/创建实体
const entity = ecs.getEntity<SubGame>(SubGame);

// 获取单例
const singleton = ecs.getSingleton(SingletonModuleComp);

// 注册装饰器
@ecs.register('EntityName')
```

## 框架初始化清单

- [ ] `extensions/oops-plugin-framework/` 已安装
- [ ] `Main.ts` 继承 `Root`
- [ ] `initEcsSystem()` 中注册了 ECS 系统
- [ ] `initGui()` 中初始化了 UI 配置
- [ ] `run()` 中创建了全局单例
- [ ] 主场景 Canvas 节点挂载了 Main 组件

## oops 子模块速查表

| 子模块 | 功能 | 使用频率 | 详细技能 |
|--------|------|----------|----------|
| `oops.gui` | UI 层级管理（open/remove/config） | 极高（30+处） | `cocos-ui-system` |
| `oops.message` | 事件系统（on/off/dispatchEvent） | 极高（60+处） | `oops-event-system` |
| `oops.res` | 资源加载（load/loadAsync/loadRemote） | 高（15+处） | `cocos-asset-management` |
| `oops.language` | 多语言（getLangByID/setLanguage） | 高（20+处） | `cocos-localization` |
| `oops.ecs` | ECS 系统（init/add） | 中（入口处） | `oops-ecs-pattern` |
| `oops.log` | 分层日志（logBusiness/logView/logModel） | 高（42+处） | 本文件 |
| `oops.timer` | 全局定时器（scheduleOnce/unschedule） | 中（7处） | `cocos-animation` |
| `oops.storage` | 本地键值存储（set/get/getBoolean） | 低（3处） | `cocos-data-persistence` |
| `oops.tcp` | WebSocket 通信（connect/close） | 低（3处） | `cocos-network` |
| `oops.config` | 框架配置读取（config.game.bundleName） | 低（3处） | 本文件 |
| `oops.random` | 随机数（getRandomFloat） | 低（3处） | 本文件 |
| `oops.mvvm` | 视图模型绑定（add/get/setValue） | 中（4处） | `oops-mvvm-binding` |
| `oops.audio` | 音频管理 | 未用（项目用自建 SoundManager） | — |
| `oops.pool` | 对象池 | 未用（项目用自建池） | — |
| `oops.game` | 游戏生命周期 | 未用 | — |

## 相关技能

- `oops-ecs-pattern` — ECS 三层架构详解
- `oops-event-system` — 事件系统深入
- `oops-mvvm-binding` — MVVM 响应式数据绑定
- `cocos-project-setup` — 项目初始化
- `cocos-data-persistence` — 数据持久化（含 oops.storage）
- `cocos-network` — 网络通信（含 oops.tcp）
