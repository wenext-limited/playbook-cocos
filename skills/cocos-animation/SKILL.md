---
name: cocos-animation
description: 实现 Cocos Creator 2D 动画效果时使用，包括 Tween 补间动画、Spine 骨骼动画、定时器动画、帧循环动画控制、动画完成点编排和生命周期清理。不适用于粒子系统、3D 动画或美术资源制作。
tags: [cocos, animation, tween, spine, timer, lifecycle]
inputs: [动画类型, 目标节点, 动画参数, 完成后业务动作, 清理时机]
outputs: [动画方案, 动画控制代码, 常量配置, 完成回调, 清理点]
---

# 动画系统

## 概述

Cocos Creator 2D 项目常用四种动画方式：Tween 补间、Spine 骨骼、定时器和 `update` 循环。本技能指导它们的使用场景、完成点编排、生命周期清理和项目编码约束。

核心经验：动画代码不是只让节点“动起来”，还必须保证**业务逻辑只在真实完成点执行**、**重复播放不会互相覆盖**、**销毁后回调不会继续写 UI**、**动画参数可统一调节**。

## 适用边界

适用：

- UI、手牌、骨牌、金币、结算、提示等 2D 节点动画。
- Tween 属性动画、Spine 播放控制、延时/节奏控制、逐帧状态机动画。
- 动画完成后触发业务逻辑、事件、音效或下一段动画。
- 调整动画节奏、拆分动画状态、修复动画时序问题。

不适用：

- 粒子系统参数设计。
- 3D 模型、相机、材质动画。
- Spine 美术资源制作或导出配置。
- Cocos 构建发布流程。

## 动画类型选择指南

| 需求 | 推荐方式 | 不推荐方式 | 原因 |
|------|----------|------------|------|
| 简单位移/缩放/旋转/透明度 | Tween | `update` 手写插值 | Tween 表达清晰，完成点明确 |
| 多段固定顺序 UI 动画 | Tween 链 + `.call()` | 多个无关联 `setTimeout` | 真实完成点不依赖猜测延迟 |
| Spine 角色/特效动画 | `sp.Skeleton.setAnimation` + complete listener | 用 Tween 模拟骨骼帧 | 美术动画应交给 Spine 轨道 |
| 延时执行一次 | Cocos/OOPS schedule | 原生 `setTimeout` | 生命周期更容易管理 |
| 高频连续状态变化 | `update` + 状态机 | 多个循环 Tween 叠加 | 状态机更适合暂停、恢复、变速 |
| 贝塞尔/飞币路径 | Tween + `onUpdate` 或专用飞币组件 | 每帧散落在业务组件 | 路径计算和业务状态解耦 |
| 动画结束后发协议/切状态/归分 | 挂在真实完成回调 | 根据动画时长另起 timer | 避免改动画时长后业务提前执行 |
| 同一节点可能并行动画 | 拆子节点或按通道管理 Tween | 对根节点粗暴 `stopAll` | 避免停止不相关动画 |

## 项目硬性规范

### 动画参数必须常量化

动画时长、延迟、偏移、缩放、透明度、速度表、阈值都不要内联在业务逻辑里。优先写到当前项目已有配置类，例如 `GameConst`、`GameConfig` 或模块专属 `Config`。

```typescript
export class GameConst {
    static readonly CARD_PLAY_MOVE_DURATION = 0.24;
    static readonly CARD_PLAY_FLOAT_Y = 18;
    static readonly CARD_PLAY_SCALE = 1.08;
    static readonly UI_OPACITY_MAX = 255;
}

tween(cardNode)
    .to(GameConst.CARD_PLAY_MOVE_DURATION, {
        position: v3(targetX, targetY + GameConst.CARD_PLAY_FLOAT_Y, 0),
        scale: v3(GameConst.CARD_PLAY_SCALE, GameConst.CARD_PLAY_SCALE, 1),
    })
    .start();
```

### 比较状态、uid、动画名用宽松等号

本项目 Cocos 代码中比较 uid、状态、动画名等值时使用 `==` / `!=`，不要写 `===` / `!==`。

```typescript
this._skeleton.setCompleteListener((entry) => {
    if (entry.animation?.name == GameConst.SPINE_ANIM_OPEN) {
        this.onOpenComplete();
    }
});
```

### 注释只写 WHY

代码注释使用中文，只解释隐藏约束、设计原因或非显而易见行为，不复述代码做了什么。

```typescript
// 归分逻辑必须等飞行动画结束，否则金币数量会先跳变造成视觉穿帮
this.playCoinFly(() => {
    this.applyScoreChange();
});
```

## Tween 补间动画

适用于简单属性插值动画：位移、缩放、旋转、透明度。

### 基础组件模板

```typescript
import { _decorator, Component, Node, Tween, UIOpacity, tween, v3 } from 'cc';
import { GameConst } from '../common/GameConst';

const { ccclass, property } = _decorator;

@ccclass('CardPlayAnimComp')
export class CardPlayAnimComp extends Component {
    // cardRoot
    @property(Node)
    cardRoot: Node = null;

    private _isPlaying: boolean = false;

    playTo(targetX: number, targetY: number, onComplete?: Function) {
        if (!this.cardRoot?.isValid) return;

        this.stopCardTween();
        this._isPlaying = true;

        tween(this.cardRoot)
            .to(GameConst.CARD_PLAY_MOVE_DURATION, {
                position: v3(targetX, targetY, 0),
                scale: v3(GameConst.CARD_PLAY_SCALE, GameConst.CARD_PLAY_SCALE, 1),
            }, { easing: 'quadOut' })
            .to(GameConst.CARD_PLAY_RECOVER_DURATION, {
                scale: v3(1, 1, 1),
            })
            .call(() => {
                if (!this.node?.isValid) return;

                this._isPlaying = false;
                onComplete?.();
            })
            .start();
    }

    stopCardTween() {
        if (!this.cardRoot?.isValid) return;

        Tween.stopAllByTarget(this.cardRoot);
        this._isPlaying = false;
    }

    protected onDestroy() {
        this.stopCardTween();
    }
}
```

### Tween 使用规则

- 启动同一节点同一类动画前，先停止旧 Tween，避免重复点击或服务器连续推送导致动画叠加。
- 如果同一根节点上有多个并行动画，不要粗暴 `Tween.stopAllByTarget(root)`；优先拆子节点分别承载移动、缩放、透明度。
- 后续业务逻辑挂在 `.call()`，不要用另一个 timer 猜动画结束时间。
- `.call()` 中先检查 `this.node.isValid` / 目标节点 `isValid`。
- 循环 Tween 必须在 `onDestroy()` 或退出状态时停止。

### 透明度动画

```typescript
const opacity = this.node.getComponent(UIOpacity);
if (!opacity) return;

Tween.stopAllByTarget(opacity);
opacity.opacity = 0;

tween(opacity)
    .to(GameConst.TIP_FADE_IN_DURATION, { opacity: GameConst.UI_OPACITY_MAX })
    .delay(GameConst.TIP_STAY_DURATION)
    .to(GameConst.TIP_FADE_OUT_DURATION, { opacity: 0 })
    .start();
```

## Spine 骨骼动画

适用于复杂角色、宝箱、结算、胜利、特效等由美术提供的 Spine 动画。

### 播放与完成监听

```typescript
import { sp } from 'cc';
import { GameConst } from '../common/GameConst';

private _skeleton: sp.Skeleton = null;
private _spineCompleteCallback: Function = null;

playOpenAnim(onComplete?: Function) {
    if (!this._skeleton?.isValid) return;

    this._spineCompleteCallback = onComplete || null;
    this._skeleton.setCompleteListener((entry) => {
        if (!this.node?.isValid) return;
        if (entry.animation?.name != GameConst.SPINE_ANIM_OPEN) return;

        const callback = this._spineCompleteCallback;
        this._spineCompleteCallback = null;
        callback?.();
    });

    this._skeleton.setAnimation(0, GameConst.SPINE_ANIM_OPEN, false);
}

playIdleAnim() {
    if (!this._skeleton?.isValid) return;

    this._skeleton.setAnimation(0, GameConst.SPINE_ANIM_IDLE, true);
}

protected onDestroy() {
    this._spineCompleteCallback = null;
    if (this._skeleton?.isValid) {
        this._skeleton.setCompleteListener(null);
    }
}
```

### Spine 使用规则

- complete listener 里必须判断动画名，避免 idle、loop 或队列动画误触发业务。
- 回调执行前先复制到局部变量，再把字段置空，防止回调里再次触发动画造成重复调用。
- Spine 完成点就是业务完成点；不要额外用固定延迟补一层完成逻辑。
- 如果 `setAnimation` 后接 `addAnimation`，业务回调要挂在真正代表完成的那段动画上。
- 组件销毁时清理 listener 和预回调引用。

### 队列播放

```typescript
this._skeleton.setAnimation(0, GameConst.SPINE_ANIM_WIN, false);
this._skeleton.addAnimation(0, GameConst.SPINE_ANIM_IDLE, true, 0);
```

## 定时器动画

适用于节奏控制、短延迟和定时轮询。能用 Cocos/OOPS 生命周期定时器时，不优先使用原生 timer。

### Cocos schedule

```typescript
scheduleShowResult() {
    this.unschedule(this.onShowResultTick);
    this.scheduleOnce(this.onShowResultTick, GameConst.RESULT_SHOW_DELAY);
}

private onShowResultTick = () => {
    if (!this.node?.isValid) return;

    this.showResult();
};

protected onDestroy() {
    this.unschedule(this.onShowResultTick);
}
```

### 原生定时器

只有在必须与浏览器 API 或外部回调协调时才使用原生 `setTimeout` / `setInterval`，并且必须保存句柄、在 `onDestroy()` 清理。

```typescript
private _resultTimer: ReturnType<typeof setTimeout> = null;

waitResult() {
    this.clearResultTimer();
    this._resultTimer = setTimeout(() => {
        if (!this.node?.isValid) return;

        this.onResultReady();
    }, GameConst.RESULT_READY_DELAY_MS);
}

clearResultTimer() {
    if (this._resultTimer) {
        clearTimeout(this._resultTimer);
        this._resultTimer = null;
    }
}

protected onDestroy() {
    this.clearResultTimer();
}
```

## update 循环动画

适用于需要每帧更新的连续动画：跑灯、滚动、拖拽跟随、长时间变速动画。

### 状态机驱动动画

```typescript
export const enum RunAnimationType {
    Idle = 0,
    SpeedUp,
    Run,
    SpeedDown,
    Stop,
}

@ccclass('RunLightAnimComp')
export class RunLightAnimComp extends Component {
    private _runType: RunAnimationType = RunAnimationType.Idle;
    private _elapsedTime: number = 0;
    private _stepIndex: number = 0;
    private _stepDuration: number = GameConst.RUN_LIGHT_DEFAULT_STEP_DURATION;
    private _isPause: boolean = false;

    protected update(dt: number) {
        if (this._isPause) return;
        if (this._runType == RunAnimationType.Idle) return;

        this._elapsedTime += dt;
        if (this._elapsedTime < this._stepDuration) return;

        this._elapsedTime = 0;
        this.nextStep();
    }

    private nextStep() {
        this._stepIndex += 1;
        this.updateStepDuration();
    }

    private updateStepDuration() {
        const speedList = GameConst.RUN_LIGHT_SPEED_UP_TIME_LIST;
        if (this._runType == RunAnimationType.SpeedUp && this._stepIndex < speedList.length) {
            this._stepDuration = speedList[this._stepIndex];
            return;
        }

        this._stepDuration = GameConst.RUN_LIGHT_DEFAULT_STEP_DURATION;
    }
}
```

### update 使用规则

- 必须有 Idle / Pause 判断，避免组件不可见时仍持续计算。
- 阶段用枚举表达，不要用散落的布尔组合。
- 速度表放配置常量，访问前检查下标，越界后给默认节奏。
- 停止时重置 `_elapsedTime`、`_stepIndex`、目标索引等内部状态。

## 预回调（Pre-Callback）模式

预回调模式：先根据业务状态设置回调函数，再播放动画，动画完成时触发并清空回调。适合“同一动画结束后，根据当前结果走不同分支”的场景。

```typescript
private _playCompleteCallback: Function = null;

playResultAnim(score: number, onComplete?: Function) {
    this._playCompleteCallback = () => {
        this.applyScore(score);
        onComplete?.();
    };

    this.playScoreSpine();
}

private onScoreSpineComplete(animName: string) {
    if (animName != GameConst.SPINE_ANIM_SCORE) return;

    const callback = this._playCompleteCallback;
    this._playCompleteCallback = null;
    callback?.();
}
```

### 完成点收敛规则

- 用户已明确“等 A 完成后再 B”时，只把 B 移进 A 的真实完成回调，不要升级成开放式调试。
- Tween 后续逻辑挂 `.call()`；Spine 后续逻辑挂 complete listener；飞币后续逻辑挂飞行动画完成回调。
- 不要用 `delay` / `setTimeout` 模拟另一个动画的完成点。
- 多段动画只保留一个最终业务出口，避免中间段和最终段都改状态。

## 可变引擎对象 clone

Cocos 的 `Vec3`、`Color` 等引擎对象经常被复用或原地修改。动画开始前如果要保存当前位置、世界坐标、颜色等作为后续计算基准，先 `clone()`，不要长期保存直接引用。

```typescript
const startWorldPos = this.cardRoot.worldPosition.clone();
const endWorldPos = targetNode.worldPosition.clone();

this.node.parent.inverseTransformPoint(this._tempStartPos, startWorldPos);
this.node.parent.inverseTransformPoint(this._tempEndPos, endWorldPos);
```

使用规则：

- 跨帧、跨回调、跨 Tween 保存的向量必须 clone。
- 临时计算可复用 `_tempVec3`，但不要把 `_tempVec3` 存进业务数据。
- 从 `getWorldPosition()` / `worldPosition` 得到的值如果后续会被动画使用，先复制出稳定快照。

## 状态与表现分离

复杂动画（手牌、出牌、归分、结算）优先拆成两层：

1. 先计算稳定的业务/布局结果。
2. 再把节点从当前表现动画到目标表现。
3. 动画完成后再提交必须等待视觉完成的业务状态。

推荐：

```typescript
const nextLayout = this.layoutUtil.createNextLayout(this.handCards, playCard);
this.playCardsToLayout(nextLayout, () => {
    // 手牌数据提交要和视觉完成点一致，避免拖拽/补牌读到中间态
    this.commitHandLayout(nextLayout);
});
```

避免：

- 动画中途一边改真实数据，一边用旧数据继续计算下一段布局。
- 用节点当前位置反推业务状态。
- 多个动画同时写同一组业务字段。

## 音效与动画同步

- 一次性动作音效放在动画开始点，例如出牌、弹窗出现。
- 命中奖励、归分、胜利等强调结果的音效放在视觉结果出现点或最终完成点。
- 循环动画音效必须在动画停止时停止或切回默认状态。
- 不要把音效当作动画完成信号；音效只跟随动画状态，不驱动业务状态。

## 风险表

| 风险 | 症状 | 推荐处理 |
|------|------|----------|
| 重复启动同一 Tween | 节点抖动、回调重复、最终位置错乱 | 启动前停止同通道 Tween，或设置 `_isPlaying` |
| 对根节点 `stopAll` | 其他并行动画被误停 | 拆子节点或按组件封装动画目标 |
| 用 timer 等动画结束 | 调整时长后业务提前/滞后 | 业务逻辑挂真实完成回调 |
| Spine complete 不判断动画名 | idle/队列动画误触发结果 | 使用动画名常量并用 `==` / `!=` 判断 |
| 回调不清空 | 下一轮动画触发上一轮逻辑 | 执行前复制局部变量，字段置空 |
| 销毁后回调写节点 | 控制台报错或 UI 复活 | 回调开头检查 `isValid`，`onDestroy` 清理 |
| 保存可变 Vec3 引用 | 起终点被后续计算污染 | 跨帧保存前 clone |
| 速度表越界 | 跑灯节奏突然异常 | 下标检查，越界回默认速度 |
| 动画中改业务数据 | 拖拽、补牌、归分读到中间态 | 先算 next state，完成点统一 commit |
| 魔法数字散落 | 调动画节奏需要多处搜索 | 统一写入配置常量 |

## 输出约束

执行动画任务时，回复或改代码前应确认：

- 动画目标节点和所属 prefab 路径。
- 动画类型：Tween / Spine / timer / update / 组合。
- 哪个点才是后续业务的真实完成点。
- 是否可能重复触发、被打断、暂停或销毁。
- 动画参数应该放到哪个配置类。

完成后必须说明：

- 使用了哪种动画方式。
- 完成回调挂在哪里。
- 清理点在哪里。
- 新增或复用的动画常量在哪里。
- 如果用户要求不用验证，明确说明未验证。

## 评分优化 Hook

当用户要求优化、审查或迭代本技能本身时，使用 `hook-scoring.md` 对 `SKILL.md` 进行系统评分。

评分流程：

1. 先完整阅读当前 `SKILL.md`。
2. 按 `hook-scoring.md` 的 8 个维度给出 0-5 分和加权总分。
3. 找出低于 4 分的维度，提出可直接写入技能文档的补强内容。
4. 修改后重新评分，确认低分项已被具体内容修复。

不要把评分标准直接展开到常规动画实现回答中；它只在优化技能文档时作为质量 Hook 使用。

## 清单

- [ ] 选择合适动画类型，并说明为什么不用其他方式
- [ ] 动画时长、延迟、偏移、透明度、速度表已常量化
- [ ] 比较状态、uid、动画名时使用 `==` / `!=`
- [ ] Tween 启动前处理旧 Tween，销毁时停止循环或未完成 Tween
- [ ] Spine complete listener 判断动画名并在销毁时清理
- [ ] 原生 timer 保存句柄并在 `onDestroy` 清理
- [ ] 回调中检查 `this.node.isValid` 和目标节点有效性
- [ ] 预回调执行后置空，防止下一轮重复触发
- [ ] 后续业务挂在真实完成点，不用固定延迟猜测
- [ ] 跨帧保存 `Vec3` / `Color` 等引擎对象前已 clone
- [ ] 复杂动画先计算 next state，再在完成点 commit
- [ ] 停止动画时重置内部状态

## 相关技能

- `cocos-coin-animation` — 贝塞尔曲线飞币动画详解
- `ts-common-patterns` — EasingMethod 枚举完整映射
- `rules/cocos/component-patterns.md` — 组件编写模式中的动画章节
