---
name: cocos-2d-game-loop
description: 实现 2D 游戏核心循环时使用，包括阶段状态机、倒计时系统、回合管理和游戏流程控制。不适用于单纯的 UI 展示或非循环类游戏。
tags: [cocos, game-loop, state-machine, countdown, round]
inputs: [游戏阶段定义, 阶段时长, 回合逻辑]
outputs: [状态机代码, 倒计时组件, 流程控制]
---

# 2D 游戏循环与状态机

## 概述

2D 游戏（尤其是回合制/阶段制游戏）的核心是游戏循环和阶段状态机。本技能指导如何设计游戏阶段、倒计时系统和回合管理。

## 阶段状态机

### 阶段定义

```typescript
export enum EMGameStage {
    Betting = 1,       // 下注阶段
    Settlement = 2,    // 结算阶段
    ShowResult = 3,    // 展示结果
    Ready = 4,         // 准备下一轮
}

// 每个阶段的时长配置（秒）
export const StageTimeCfg = {
    [EMGameStage.Betting]: 32,
    [EMGameStage.Settlement]: 5,
    [EMGameStage.ShowResult]: 10,
    [EMGameStage.Ready]: 2,
};
```

### 阶段计算

```typescript
export class SubGameUtil {
    // 根据剩余时间计算当前阶段
    static calcCurStage(leftTime: number): StageResult {
        let stage = EMGameStage.Betting;

        for (let i = 0; i < reverseKeysStageTimeCfg.length; i++) {
            let stageKey = parseInt(reverseKeysStageTimeCfg[i]);
            let stageTime = this.getStageTime(stageKey);

            if (leftTime < stageTime) {
                stage = stageKey;
                break;
            }
            leftTime -= stageTime;
        }

        return { stage: stage, timeLeft: leftTime };
    }

    // 获取阶段时长（可根据条件动态调整）
    static getStageTime(stageKey: number) {
        if (stageKey === EMGameStage.ShowResult) {
            const isBig = sub_smc.subGame.UserGameModel.getIsBigPrize();
            if (isBig) {
                return StageTimeCfg[stageKey] + 4;  // 大奖延长展示
            }
        }
        return StageTimeCfg[stageKey];
    }
}
```

### 阶段结果类型

```typescript
export class StageResult {
    stage: EMGameStage;
    timeLeft: number;

    constructor(stage: EMGameStage, timeLeft: number) {
        this.stage = stage;
        this.timeLeft = timeLeft;
    }
}
```

## 阶段切换处理

在 ECS 根实体中统一处理阶段切换逻辑：

```typescript
@ecs.register('SubGame')
export class SubGame extends ecs.Entity {

    addEvent() {
        oops.message.on(SubGameEvent.GameStageChange, this.onGameStageChange, this);
    }

    onGameStageChange(event: string, stageResult: StageResult) {
        switch (stageResult.stage) {
            case EMGameStage.Betting:
                // 新回合开始
                this.onBettingStart();
                break;
            case EMGameStage.Settlement:
                // 结算开始
                this.onSettlementStart();
                break;
            case EMGameStage.ShowResult:
                // 展示结果
                this.onShowResult();
                break;
            case EMGameStage.Ready:
                // 准备下一轮
                this.onReady();
                break;
        }
    }

    onBettingStart() {
        this.hasOpenBox = false;
        this.getGameRecordsData();
        this.CurrentResultModel.resetResultData();
    }

    onSettlementStart() {
        oops.message.dispatchEvent(SubGameEvent.GameSettlementStart);
    }

    onShowResult() {
        oops.message.dispatchEvent(SubGameEvent.OnImmediatelyOpenBox);
    }

    onReady() {
        oops.message.dispatchEvent(SubGameEvent.GameResetDesk);
        oops.gui.remove(SubUIID.Settlement, false);
        oops.gui.openAsync(SubUIID.TipPause);
    }
}
```

## 倒计时系统

通过 ECS 组件实现倒计时：

```typescript
@ecs.register('GameCountDown')
export class GameCountDownComp extends ecs.Comp {
    private _totalTime: number = 0;
    private _leftTime: number = 0;
    private _isRunning: boolean = false;

    start(totalTime: number) {
        this._totalTime = totalTime;
        this._leftTime = totalTime;
        this._isRunning = true;
    }

    // 由 ECS 系统每帧调用
    update(dt: number) {
        if (!this._isRunning) return;

        this._leftTime -= dt;
        if (this._leftTime <= 0) {
            this._leftTime = 0;
            this._isRunning = false;
            // 阶段结束，通知切换
            const stageResult = SubGameUtil.calcCurStage(this._leftTime);
            oops.message.dispatchEvent(SubGameEvent.GameStageChange, stageResult);
        }
    }

    getLeftTime(): number { return this._leftTime; }
    reset() { this._isRunning = false; }
}
```

## 回合管理

### 回合数据在 Model 中维护

```typescript
@ecs.register('UserGameModel')
export class UserGameModelComp extends ecs.Comp {
    private _roundNum: number = 0;
    private _curRoundLeftTime: number = 0;

    getRoundNum(): number { return this._roundNum; }
    getCurRoundLeftTime(): number { return this._curRoundLeftTime; }

    setGameInfo(data: any) {
        this._roundNum = data.roundNum;
        this._curRoundLeftTime = data.currentRoundLeftTime;
    }

    getCurStageResult(): StageResult {
        return SubGameUtil.calcCurStage(this._curRoundLeftTime);
    }
}
```

### View 层展示回合信息

```typescript
onGetUserGameData() {
    this.onUpdateRound();
    this.initGameBox();
    oops.message.dispatchEvent(SubGameEvent.OnStartTheGame);
}

onUpdateRound() {
    this._labRound.string = GreedyBoxUtil.getLangByID('round')
        + sub_smc.subGame.UserGameModel.getRoundNum();
}
```

## 游戏流程图

```
┌─────────┐     ┌───────────┐     ┌────────────┐     ┌───────┐
│ Betting │ ──> │Settlement │ ──> │ ShowResult │ ──> │ Ready │
│  (32s)  │     │   (5s)    │     │   (10s)    │     │  (2s) │
└─────────┘     └───────────┘     └────────────┘     └───────┘
     ^                                                    │
     └────────────────────────────────────────────────────┘
                        新回合开始
```

## 设计要点

1. **阶段时长可配置**：通过 `StageTimeCfg` 集中管理，可按条件动态调整
2. **服务器时间同步**：剩余时间从服务器获取，客户端只做倒计时展示
3. **状态恢复**：进入游戏时通过 `calcCurStage(leftTime)` 恢复到正确阶段
4. **事件驱动**：阶段切换通过事件通知所有关注者，而非直接调用

## 清单

- [ ] 游戏阶段枚举已定义
- [ ] 阶段时长配置表已创建
- [ ] 阶段切换逻辑在 Entity 中集中处理
- [ ] 倒计时组件已实现
- [ ] 各阶段有对应的 UI 状态切换
- [ ] 异常恢复逻辑（断线重连后恢复正确阶段）

## 相关技能

- `oops-ecs-pattern` — ECS 架构中的状态管理
- `oops-event-system` — 阶段切换的事件派发
- `cocos-animation` — 各阶段的动画控制
