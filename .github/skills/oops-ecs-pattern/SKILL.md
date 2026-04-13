---
name: oops-ecs-pattern
description: 实现 ECS 三层架构（Model/BLL/View）时使用，包括实体定义、组件注册、系统编写、ViewModel 绑定和数据流设计。不适用于不使用 OOPS 框架的项目。
tags: [oops, ecs, model, bll, view, mvvm]
inputs: [业务模块名, 数据结构, API端点]
outputs: [Model组件, BLL系统, Entity定义, 数据流]
---

# ECS 三层架构

## 概述

OOPS 框架的 ECS（Entity-Component-System）实现了三层分离架构：

| 层 | 职责 | 基类 | 命名规范 |
|----|------|------|----------|
| **Model** | 数据存储和访问 | `ecs.Comp` | `XxxModelComp` |
| **BLL** | 业务逻辑和网络请求 | `ecs.ComblockSystem` | `XxxDataComp` + `XxxDataSystem` |
| **View** | UI 展示和交互 | `cc.Component` | `XxxComponent` |

## 数据流

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│   View   │ ──> │  Entity  │ ──> │   BLL    │ ──> │  Model   │
│ (触发)   │     │ .add()   │     │ (请求)   │     │ (存储)   │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     ^                                                    │
     │              oops.message.dispatchEvent()          │
     └────────────────────────────────────────────────────┘
```

### 完整流程示例：下注

```
1. View: 用户点击下注按钮
2. View → Entity: sub_smc.subGame.reqBetting(coins, option)
3. Entity: this.add(ReqBettingDataComp)  // 添加 BLL 组件触发系统
4. BLL System: entityEnter() → httpPost() 发起网络请求
5. BLL → Model: e.BettingModel.dealMyBetSuccess(data)
6. BLL → Event: oops.message.dispatchEvent(OnMyBettingSuccess)
7. Event → View: 更新 UI 显示
```

## Model 层（数据组件）

```typescript
@ecs.register('UserGameModel')
export class UserGameModelComp extends ecs.Comp {
    // ViewModel 绑定对象
    private vm: any = {};
    
    // 私有数据
    private _roundNum: number = 0;
    private _coins: number = 0;
    private _gameStage: EMGameStage = EMGameStage.Betting;
    private _curRoundLeftTime: number = 0;

    // ViewModel 注册（用于 MVVM 数据绑定）
    vmAdd() {
        VM.add(this.vm, "UserGameModel");
    }

    vmRemove() {
        VM.remove("UserGameModel");
    }

    // 数据处理方法（deal 前缀）
    dealGetGameInfo(data: any) {
        this._roundNum = data.roundNum;
        this._coins = data.coins;
        this._curRoundLeftTime = data.currentRoundLeftTime;
        
        // 计算当前阶段
        this._gameStage = SubGameUtil.calcCurStage(this._curRoundLeftTime).stage;
    }

    // Getter 方法
    getRoundNum(): number { return this._roundNum; }
    getCoins(): number { return this._coins; }
    getCurRoundLeftTime(): number { return this._curRoundLeftTime; }
    getCurStageResult(): StageResult {
        return SubGameUtil.calcCurStage(this._curRoundLeftTime);
    }

    // 重置方法（ECS 回收时调用）
    reset() {
        this._roundNum = 0;
        this._coins = 0;
    }
}
```

### Model 编写规则

- 使用 `deal` 前缀的方法处理外部传入的数据
- 使用 `get` 前缀的方法暴露数据
- 私有字段使用 `_` 前缀
- `reset()` 方法重置所有状态
- 如需 MVVM 绑定，实现 `vmAdd()` 和 `vmRemove()`

## BLL 层（业务逻辑）

BLL 由两部分组成：**触发组件** + **逻辑系统**。

### 触发组件（BLL Comp）

```typescript
@ecs.register('SubGame')
export class ReqBettingDataComp extends ecs.Comp {
    // 请求参数
    coinsNum: number = 0;
    option: number = 0;
    roomId: string = '';
    roundNum: number = 0;
    hasLuckyCoins: boolean = false;

    reset() {
        this.coinsNum = 0;
        this.option = 0;
    }
}
```

### 逻辑系统（BLL System）

```typescript
@ecs.register('SubGame')
export class ReqBettingDataSystem extends ecs.ComblockSystem
    implements ecs.IEntityEnterSystem {

    // 过滤器：当实体拥有 ReqBettingDataComp 时触发
    filter(): ecs.IMatcher {
        return ecs.allOf(ReqBettingDataComp);
    }

    // 组件添加时自动调用
    entityEnter(e: SubGame) {
        const comp = e.get(ReqBettingDataComp);
        
        // 构造请求
        const reqData = {
            coinsNum: comp.coinsNum,
            option: comp.option,
            roomId: comp.roomId,
            roundNum: comp.roundNum,
        };
        const strReq = JSON.stringify(reqData);

        // 发起 HTTP 请求
        sub_smc.gameHttp.httpPost(DeeplinkUrls.betting, (data: HttpReturn) => {
            if (data.isSucc && data.res.sucessed) {
                // 更新 Model
                e.UserGameModel.dealMyBetSuccess(reqData);
                // 派发事件
                oops.message.dispatchEvent(SubGameEvent.OnMyBettingSuccess, reqData);
            } else {
                // 错误处理
                oops.gui.open(SubUIID.TipToast, data.res?.message);
            }
            // 移除触发组件（标记请求完成）
            e.remove(ReqBettingDataComp);
        }, strReq);
    }
}
```

### BLL 核心机制

1. **添加 BLL 组件 → 触发系统执行**：`entity.add(ReqBettingDataComp)` 会自动触发 `ReqBettingDataSystem.entityEnter()`
2. **系统执行完毕 → 移除 BLL 组件**：`entity.remove(ReqBettingDataComp)` 标记完成
3. **过滤器匹配**：`filter()` 返回 `ecs.allOf(Comp)` 表示需要该组件

## Entity 层（实体定义）

```typescript
@ecs.register('SubGame')
export class SubGame extends ecs.Entity {
    // 声明 Model 组件（常驻）
    BettingModel!: BettingModelComp;
    CurrentResultModel!: CurrentResultModelComp;
    UserGameModel!: UserGameModelComp;
    GameRecordsModel!: GameRecordsModelComp;

    // 声明 BLL 组件（按需添加/移除）
    ReqBettingData!: ReqBettingDataComp;
    CurrentResultData!: CurrentResultDataComp;
    UserGameData!: UserGameDataComp;

    protected init() {
        // 添加常驻 Model 组件
        this.addComponents<ecs.Comp>(
            BettingModelComp,
            CurrentResultModelComp,
            UserGameModelComp,
            GameRecordsModelComp,
        );

        // 初始化 MVVM
        this.initMvvm();
        // 注册事件
        this.addEvent();
        // 首次请求
        this.getUserGameInfo();
    }

    initMvvm() {
        this.BettingModel.vmAdd();
        this.CurrentResultModel.vmAdd();
        this.UserGameModel.vmAdd();
    }

    // 业务方法：封装 BLL 触发
    reqBetting(coinsNum: number, option: number) {
        var data = this.add(ReqBettingDataComp, true);
        data.coinsNum = coinsNum;
        data.option = option;
        data.roomId = smc.initialize.get<InitGameComp>(InitGameComp).roomId;
        data.roundNum = this.UserGameModel.getRoundNum();
        return data;
    }

    getUserGameInfo() {
        var data = this.add(UserGameDataComp);
        return data;
    }

    getCurrentResultData() {
        if (this.has(CurrentResultDataComp)) {
            return; // 防止重复请求
        }
        var data = this.add(CurrentResultDataComp);
        return data;
    }
}
```

### Entity 编写规则

- 用 `!` 后缀声明组件字段（非空断言）
- Model 组件在 `init()` 中通过 `addComponents` 批量添加（常驻）
- BLL 组件在业务方法中按需 `add()`（用完即移除）
- 提供封装方法简化 BLL 触发（如 `reqBetting()`）
- 使用 `has()` 防止重复添加同一 BLL 组件

## 新增模块清单

新增一个业务模块（如"签到"）需要创建以下文件：

1. **Model**: `model/SignInModelComp.ts`
   - [ ] 继承 `ecs.Comp`
   - [ ] 定义数据字段和 getter/deal 方法
   - [ ] 实现 `reset()`

2. **BLL Comp**: `bll/SignInData.ts`（组件部分）
   - [ ] 继承 `ecs.Comp`
   - [ ] 定义请求参数字段
   - [ ] 实现 `reset()`

3. **BLL System**: `bll/SignInData.ts`（系统部分）
   - [ ] 继承 `ecs.ComblockSystem`
   - [ ] 实现 `filter()` 和 `entityEnter()`
   - [ ] 请求完成后移除 BLL 组件

4. **Entity 注册**:
   - [ ] 在 `SubGame.ts` 中声明新组件字段
   - [ ] 在 `init()` 中添加 Model 组件
   - [ ] 添加封装的业务方法

5. **Event**:
   - [ ] 在 `SubGameEvent.ts` 中添加新事件

6. **View**:
   - [ ] 创建 UI 组件，监听新事件

## 红线

| 违规 | 正确做法 |
|------|----------|
| View 直接修改 Model 数据 | 通过 Entity 方法触发 BLL |
| BLL 直接操作 UI 节点 | BLL 通过事件通知 View |
| Model 中发起 HTTP 请求 | HTTP 请求只在 BLL System 中发起 |
| 忘记移除 BLL 组件 | `entityEnter()` 完成后调用 `e.remove(Comp)` |
| 重复添加 BLL 组件 | 添加前用 `this.has(Comp)` 检查 |

## 相关技能

- `oops-framework` — 框架核心 API
- `oops-event-system` — 事件系统配合
- `cocos-network` — HTTP 请求封装
