---
name: cocos-animation
description: 实现动画效果时使用，包括 Tween 补间动画、Spine 骨骼动画、定时器动画和帧循环动画控制。不适用于粒子系统或 3D 动画。
tags: [cocos, animation, tween, spine, timer]
inputs: [动画类型, 目标节点, 动画参数]
outputs: [动画控制代码, 回调处理]
---

# 动画系统

## 概述

Cocos Creator 2D 项目常用四种动画方式：Tween 补间、Spine 骨骼、定时器和 update 循环。本技能指导它们的使用场景和编写模式。

## Tween 补间动画

适用于简单的属性插值动画（位移、缩放、旋转、透明度）。

### 基础用法

```typescript
import { tween, v3, Vec3 } from 'cc';

// 缩放弹跳效果
tween(this.node)
    .to(0.3, { scale: v3(1.2, 1.2, 1) })
    .to(0.15, { scale: v3(1, 1, 1) })
    .start();

// 位移动画
tween(this.node)
    .to(0.5, { position: v3(100, 200, 0) })
    .start();

// 淡入
tween(this.node.getComponent(UIOpacity))
    .to(0.3, { opacity: 255 })
    .start();
```

### 链式动画

```typescript
tween(this.node)
    .to(0.2, { scale: v3(1.1, 1.1, 1) })
    .to(0.1, { scale: v3(1, 1, 1) })
    .delay(0.5)
    .to(0.3, { position: v3(0, 100, 0) })
    .call(() => {
        // 动画完成回调
        this.onAnimComplete();
    })
    .start();
```

### 循环动画

```typescript
// 无限循环
tween(this.node)
    .by(1, { angle: 360 })
    .repeatForever()
    .start();

// 有限次数循环
tween(this.node)
    .to(0.5, { scale: v3(1.2, 1.2, 1) })
    .to(0.5, { scale: v3(1, 1, 1) })
    .repeat(3)
    .start();
```

### 停止 Tween

```typescript
import { Tween } from 'cc';

// 停止节点上所有 tween
Tween.stopAllByTarget(this.node);
```

## Spine 骨骼动画

适用于复杂的角色和特效动画（需要美术提供 Spine 文件）。

### 基础播放

```typescript
import { sp } from 'cc';

// 获取 Spine 组件
this._skeleton = this.node.getComponent(sp.Skeleton);

// 播放一次（非循环）
this._skeleton.setAnimation(0, 'open', false);

// 循环播放
this._skeleton.setAnimation(0, 'idle', true);
```

### 动画完成监听

```typescript
// 设置完成回调
this._skeleton.setCompleteListener((entry) => {
    const animName = entry.animation.name;
    if (animName === 'open') {
        this.onOpenComplete();
    }
});
```

### 队列播放

```typescript
// 先播放 open，完成后自动播放 idle
this._skeleton.setAnimation(0, 'open', false);
this._skeleton.addAnimation(0, 'idle', true, 0);
```

### Spine 资源管理

```typescript
// 动态设置 Spine 数据
SubGameUtil.setSkeletonData(this._skeleton, 'spine/box_1');
```

## 定时器动画

适用于延时执行和重复执行的逻辑。

### OOPS 定时器

```typescript
// 单次延时
oops.timer.scheduleOnce(() => {
    this.showResult();
}, 1.5);

// 取消定时器
this.unscheduleAllCallbacks();
```

### JavaScript 原生定时器

```typescript
// 重复执行（需手动清理）
this.timerGetResult = setInterval(() => {
    this.getCurrentResultData();
}, 500);

// 清理
clearInterval(this.timerGetResult);

// 单次延时
this.timerReady = setTimeout(() => {
    this.onReady();
}, 2000);

// 清理
clearTimeout(this.timerReady);
```

**注意**：优先使用 OOPS 定时器，它会随组件生命周期自动管理。原生定时器必须在 `onDestroy()` 中手动清理。

## update 循环动画

适用于需要每帧更新的连续动画（闪烁、旋转灯效果、老虎机滚动）。

### 状态机驱动动画

使用枚举控制动画阶段，在 `update()` 中按状态分支执行不同逻辑：

```typescript
export const enum RunAnimationType {
    Idle = 0,        // 静止
    Run,             // 匀速运行
    SinglePrize,     // 单奖减速
    BigPrize,        // 大奖特殊效果
    MorePrize,       // 多奖连续开启
    Stop,            // 停止
}

@ccclass('NodeGameMainComponent')
export class NodeGameMainComponent extends Component {
    _runType: RunAnimationType = RunAnimationType.Idle;
    _runTwinkleTime: number = 0;
    _twinkleTime: number = 0.5;
    isPause: boolean = false;

    protected update(dt: number) {
        if (this.isPause) return;
        if (this._runType === RunAnimationType.Idle) return;

        this._runTwinkleTime += dt;

        if (this._runTwinkleTime >= this._twinkleTime) {
            this._runTwinkleTime = 0;
            this.nextStep();
        }
    }
}
```

### 变速曲线控制

通过预定义速度表实现加速→匀速→减速的自然动画节奏：

```typescript
// 加速阶段：间隔依次缩短
const SpeedUpTimeList = [0.15, 0.12, 0.1, 0.08, 0.06];

// 减速阶段：间隔依次增长
const SpeedDownTimeList = [0.08, 0.1, 0.12, 0.15, 0.2];

// 使用方式：在步进回调中切换速度
onSpeedUp(stepIndex: number) {
    if (stepIndex < SpeedUpTimeList.length) {
        this._twinkleTime = SpeedUpTimeList[stepIndex];
    } else {
        // 进入匀速阶段
        this._twinkleTime = 0.06;
    }
}

onSpeedDown(stepIndex: number) {
    if (stepIndex < SpeedDownTimeList.length) {
        this._twinkleTime = SpeedDownTimeList[stepIndex];
    }
}
```

### 步进计算

精确控制从当前位置到目标位置的步数，处理循环和多圈情况：

```typescript
fixSingleStepNumber(curIndex: number, targetIndex: number, totalBoxes: number) {
    let steps = targetIndex - curIndex;
    if (steps <= 0) {
        steps += totalBoxes;
    }
    // 确保至少跑一圈（totalBoxes 步）+ 偏移
    const minSteps = totalBoxes + steps;
    return minSteps;
}
```

## 预回调（Pre-Callback）模式

先设置好回调函数 → 播放动画 → 动画完成时自动触发回调。这是本项目最核心的异步动画协调模式。

### 基本用法

```typescript
// 1. 设定回调（回调中包含下一步逻辑）
this._jackpotWinCallback = () => {
    this.showJackpotResult();
};

// 2. 播放 Spine 动画
this._skeleton.setAnimation(0, 'open', false);

// 3. Spine 完成时触发预设回调
this._skeleton.setCompleteListener((entry) => {
    if (entry.animation.name === 'open') {
        this._jackpotWinCallback?.();
        this._jackpotWinCallback = null;  // 清理防重复
    }
});
```

### 链式预回调

多段动画依次衔接，每段设定下一段的回调：

```typescript
// 第一段：开箱动画
playGreedyboxEffect(boxIndex: number) {
    const skeleton = this.getBoxSkeleton(boxIndex);
    skeleton.setCompleteListener((entry) => {
        if (entry.animation.name === 'open') {
            // 第二段：奖品展示
            this.showPrizeEffect(() => {
                // 第三段：飞币动画
                oops.message.dispatchEvent(SubGameEvent.CoinBankStartFly);
            });
        }
    });
    skeleton.setAnimation(0, 'open', false);
}
```

### 预回调 vs 直接回调

| 场景 | 推荐方式 | 原因 |
|------|----------|------|
| 动画完成后执行固定逻辑 | 直接回调 | 简单直接 |
| 动画完成后行为不确定（依赖游戏状态） | 预回调 | 回调可在动画播放前按条件设定 |
| 多种结果共用同一动画 | 预回调 | 同一动画根据不同回调走不同分支 |

## Easing 缓动函数

项目封装了 43 种缓动函数枚举，映射到 Cocos 原生 easing：

```typescript
export enum EasingMethod {
    LINEAR = 0,
    SMOOTH = 1,
    FADE_IN = 2,        // → 'quadIn'
    FADE_OUT = 3,       // → 'quadOut'
    FADE_IN_OUT = 4,    // → 'quadInOut'
    SINE_IN = 6,        // → 'sineIn'
    SINE_OUT = 7,       // → 'sineOut'
    BOUNCE_OUT = 22,    // → 'bounceOut'
    ELASTIC_OUT = 28,   // → 'elasticOut'
    // ... 共 43 种
}

// 使用
import { getEasingFn } from './easing-method';
tween(node).to(0.5, { scale: v3(1.2, 1.2, 1) }, { easing: getEasingFn(EasingMethod.BOUNCE_OUT) }).start();
```

## 飞币动画模式

金币/代币的贝塞尔曲线飞行特效。详见 `cocos-coin-animation` 技能。

```typescript
// 通过事件触发
oops.message.dispatchEvent(SubGameEvent.CoinBankStartFly);

// FlyChips 实体管理多方向飞行路径
// PanelCoinBankFly 执行贝塞尔曲线计算和 Tween 动画
```

## 动画类型选择指南

| 需求 | 推荐方式 | 原因 |
|------|----------|------|
| 简单位移/缩放/旋转 | Tween | API 简洁，链式表达 |
| 复杂角色动画 | Spine | 美术制作，代码只控制播放 |
| 延时执行 | oops.timer | 框架级管理 |
| 每帧变化的连续效果 | update + 状态机 | 精确控制每帧行为 |
| 贝塞尔曲线路径 | Tween + onUpdate | 自定义插值函数 |
| 动画衔接 | 预回调模式 | 解耦动画与后续逻辑 |

## 清单

- [ ] 选择合适的动画类型（Tween/Spine/定时器/update）
- [ ] Tween 在不需要时调用 `Tween.stopAllByTarget()` 停止
- [ ] Spine 有完成回调处理
- [ ] setInterval/setTimeout 在 onDestroy 中清理
- [ ] update 循环有暂停控制和 Idle 状态检查
- [ ] 预回调使用后置 null 防止重复触发
- [ ] 动画完成后有状态重置
- [ ] 变速动画使用预设速度表而非硬编码

## 相关技能

- `cocos-coin-animation` — 贝塞尔曲线飞币动画详解
- `ts-common-patterns` — EasingMethod 枚举完整映射
- `rules/cocos/component-patterns.md` — 组件编写模式中的动画章节
