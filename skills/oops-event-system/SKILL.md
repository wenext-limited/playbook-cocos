---
name: oops-event-system
description: 使用 OOPS 事件系统进行模块间通信时使用，包括事件定义规范、注册/注销生命周期和事件派发模式。不适用于 Cocos 原生的 Node 事件或 EventTarget。
tags: [oops, event, message, dispatch, lifecycle]
inputs: [事件名称, 事件参数, 监听目标]
outputs: [事件枚举, 注册代码, 派发代码]
---

# 事件系统与消息分发

## 概述

OOPS 框架通过 `oops.message` 提供全局事件系统，用于模块间解耦通信。事件系统是 Model/BLL/View 三层之间的桥梁。

## 事件定义规范

### 枚举定义

```typescript
export enum SubGameEvent {
    // 数据获取成功
    OnGetUserGameData = 'SubGameEvent.OnGetUserGameData',
    OnGetDashBoardData = 'SubGameEvent.OnGetDashBoardData',
    OnGetCurrentResult = 'SubGameEvent.OnGetCurrentResult',
    OnGetGameRecordData = 'SubGameEvent.OnGetGameRecordData',

    // 用户操作结果
    OnMyBettingSuccess = 'SubGameEvent.OnMyBettingSuccess',
    MyCoinChange = 'SubGameEvent.MyCoinChange',
    SelectChips = 'SubGameEvent.SelectChips',

    // 游戏流程
    GameStageChange = 'SubGameEvent.GameStageChange',
    GameSettlementStart = 'SubGameEvent.GameSettlementStart',
    GameResetDesk = 'SubGameEvent.GameResetDesk',
    OnStartTheGame = 'SubGameEvent.OnStartTheGame',

    // UI 动画
    CoinBankStartFly = 'SubGameEvent.CoinBankStartFly',
    MyWinNumberFlyAnim = 'SubGameEvent.MyWinNumberFlyAnim',
}
```

### 命名规则

| 前缀/模式 | 含义 | 示例 |
|-----------|------|------|
| `OnGet...` | 数据获取成功 | `OnGetUserGameData` |
| `OnMy...` | 当前用户的操作结果 | `OnMyBettingSuccess` |
| `Game...` | 游戏流程状态 | `GameStageChange`、`GameResetDesk` |
| `...Change` | 状态变更 | `MyCoinChange`、`OnJackpotModeChange` |
| `...Start` | 流程开始 | `GameSettlementStart`、`CoinBankStartFly` |
| `...Fail` | 失败通知 | `OnGetCurrentResultFail` |

### 值格式

事件值必须使用 `枚举名.事件名` 格式，确保全局唯一：

```typescript
// 正确
OnGetUserGameData = 'SubGameEvent.OnGetUserGameData'

// 错误 — 可能冲突
OnGetUserGameData = 'OnGetUserGameData'
```

## 事件注册

### 在 Component 中注册

```typescript
@ccclass('NodeGameMainComponent')
export class NodeGameMainComponent extends Component {
    
    protected start() {
        this.addEvent();
    }

    addEvent() {
        oops.message.on(SubGameEvent.OnGetUserGameData, this.onGetUserGameData, this);
        oops.message.on(SubGameEvent.OnGetCurrentResult, this.onGetCurrentResultData, this);
        oops.message.on(SubGameEvent.GameResetDesk, this.onGameReset, this);
    }

    removeEvent() {
        oops.message.off(SubGameEvent.OnGetUserGameData, this.onGetUserGameData, this);
        oops.message.off(SubGameEvent.OnGetCurrentResult, this.onGetCurrentResultData, this);
        oops.message.off(SubGameEvent.GameResetDesk, this.onGameReset, this);
    }

    protected onDestroy() {
        this.removeEvent();
    }

    // 事件处理器
    onGetUserGameData() {
        this.updateUI();
    }
}
```

### 在 Entity 中注册

```typescript
@ecs.register('SubGame')
export class SubGame extends ecs.Entity {
    
    addEvent() {
        oops.message.on(SubGameEvent.GameStageChange, this.onGameStageChange, this);
        oops.message.on(SubGameEvent.OnGetCurrentResult, this.onGetCurrentResult, this);
        oops.message.on(EventMessage.GAME_SHOW, this.onGameShow, this);
    }
}
```

## 事件派发

### 无参数派发

```typescript
// 在 BLL 或 Model 中
oops.message.dispatchEvent(SubGameEvent.OnGetCurrentResult);
```

### 带参数派发

```typescript
// 传单个参数
oops.message.dispatchEvent(SubGameEvent.OnMyBettingSuccess, reqData);

// 传多个参数
oops.message.dispatchEvent(SubGameEvent.GameStageChange, stageResult, bByServer);
```

### 接收参数

```typescript
// 无参数
onGetCurrentResult() {
    const data = sub_smc.subGame.CurrentResultModel.getCurrentResultData();
    // ...
}

// 带参数（从第二个参数开始）
onGameStageChange(event: string, stageResult: StageResult, bByServer: boolean) {
    switch (stageResult.stage) {
        case EMGameStage.Betting: break;
        case EMGameStage.Settlement: break;
    }
}
```

**注意**：事件处理器的第一个参数是事件名（string），实际业务参数从第二个开始。

## 事件生命周期管理

### View 层（Component）

```
onLoad()  → （不注册事件）
start()   → addEvent()     # 注册事件
onEnable  → addEvent()     # Panel 组件的注册时机
onDisable → removeEvent()  # Panel 组件的注销时机
onDestroy → removeEvent()  # 必须注销所有事件
```

### Entity 层

```
init()    → addEvent()     # Entity 创建时注册
destroy() → （自动清理）   # Entity 销毁时清理
```

### 红线

| 违规 | 后果 | 正确做法 |
|------|------|----------|
| 未在 onDestroy 中 off 事件 | 内存泄漏，回调错误 | 配对 on/off |
| on 时忘记传 this | 回调中 this 指向错误 | `on(event, handler, this)` |
| 多次注册同一事件 | 回调重复执行 | 在固定时机注册，或先 off 再 on |
| 在 update 中 dispatchEvent | 每帧派发，性能问题 | 仅在状态变更时派发 |

## 内置事件

OOPS 框架提供的内置事件：

```typescript
import { EventMessage } from 'path/to/oops-framework/core/common/event/EventMessage';

// 游戏切到前台
EventMessage.GAME_SHOW

// 游戏切到后台
EventMessage.GAME_HIDE
```

## 事件 vs 直接调用

| 场景 | 选择 | 原因 |
|------|------|------|
| BLL 完成后通知多个 View | 事件 | 一对多，解耦 |
| View 触发 Entity 方法 | 直接调用 | 一对一，简单 |
| 跨 Bundle 通信 | 事件 | 无法直接引用 |
| 同一 Entity 内 Model 和 BLL 通信 | 直接引用 | 同一实体内，高效 |

## 新增事件清单

- [ ] 在 `SubGameEvent.ts` 中定义新事件（遵循命名规则）
- [ ] 确认事件值格式：`枚举名.事件名`
- [ ] 在派发方（BLL/Model）中添加 `dispatchEvent`
- [ ] 在接收方（View）的 `addEvent()` 中注册
- [ ] 在接收方的 `removeEvent()` 中注销
- [ ] 确认 `onDestroy()` 调用了 `removeEvent()`

## 相关技能

- `oops-ecs-pattern` — ECS 三层架构中的事件桥梁
- `rules/typescript/patterns.md` — 事件驱动数据流模式
