---
paths:
  - "assets/**/*.ts"
---
# 组件编写模式

> 本文件记录 Cocos Creator 组件的标准编写模式，所有模式均从实际项目中提取。

## 组件生命周期

标准组件的生命周期方法使用顺序：

```typescript
@ccclass('MyComponent')
export class MyComponent extends Component {
    // 1. 私有字段声明（_ 前缀）
    _labTitle: Label;
    _nodeContent: Node;

    // 2. onLoad()：缓存子节点引用
    protected onLoad() {
        this._labTitle = this.node.getChildByName("labTitle").getComponent(Label);
        this._nodeContent = this.node.getChildByName("nodeContent");
    }

    // 3. start()：注册事件，初始化逻辑
    protected start() {
        this.addEvent();
        this.initData();
    }

    // 4. update(dt)：帧循环（仅动画/实时更新组件需要）
    protected update(dt: number) {
        if (this.isPause) return;
        this.runAnimation(dt);
    }

    // 5. onDestroy()：清理事件和定时器
    protected onDestroy() {
        this.removeEvent();
    }
}
```

## 节点缓存模式

在 `onLoad()` 中缓存所有需要的子节点引用，避免运行时重复查找：

```typescript
protected onLoad() {
    // 缓存 Label 组件
    this._labRound = this.node.getChildByName("labRonds").getComponent(Label);

    // 缓存子节点
    this._nodeGameBoxs = this.node.getChildByName("nodeGameBoxs");

    // 缓存子组件列表
    this._itemGameBoxList = this._nodeGameBoxs.getComponentsInChildren(ItemGameBoxComponent);

    // 缓存 Spine 骨骼组件
    this._sktBigReward = this.node.getChildByName("sktBigReward").getComponent(sp.Skeleton);
}
```

### 节点安全访问

```typescript
// 节点可能不存在时做安全检查
const sktNode = this.node.getChildByName("sktGreedybox");
if (sktNode) {
    this._sktGreedybox = sktNode.getComponent(sp.Skeleton);
    sktNode.active = false;
}
```

## 事件注册模式

使用统一的 `addEvent()` 方法集中注册事件：

```typescript
addEvent() {
    oops.message.on(SubGameEvent.OnGetUserGameData, this.onGetUserGameData, this);
    oops.message.on(SubGameEvent.OnGetCurrentResult, this.onGetCurrentResultData, this);
    oops.message.on(SubGameEvent.GameResetDesk, this.onGameReset, this);
    oops.message.on(SubGameEvent.GameSettlementStart, this.onGameAnimationStart, this);
}

removeEvent() {
    oops.message.off(SubGameEvent.OnGetUserGameData, this.onGetUserGameData, this);
    oops.message.off(SubGameEvent.OnGetCurrentResult, this.onGetCurrentResultData, this);
    oops.message.off(SubGameEvent.GameResetDesk, this.onGameReset, this);
    oops.message.off(SubGameEvent.GameSettlementStart, this.onGameAnimationStart, this);
}
```

### 红线

- 事件处理器方法使用 `on` 前缀命名
- 注册时传 `this` 作为第三个参数（确保回调上下文正确）
- 在 `onDestroy()` 中移除所有已注册的事件，避免内存泄漏
- 不要在 `update()` 中注册事件

## 面板组件模式

弹窗面板使用 `onEnable` / `onDisable` 管理数据刷新和清理：

```typescript
@ccclass('PanelMyRecordComponent')
export class PanelMyRecordComponent extends Component {

    protected onLoad() {
        // 缓存节点
        this._content = this.node.getChildByName("content");
    }

    protected onEnable() {
        // 面板显示时刷新数据
        this.refreshData();
        this.addEvent();
    }

    protected onDisable() {
        // 面板隐藏时清理
        this.removeEvent();
    }

    onBtnClose() {
        oops.gui.remove(SubUIID.MyRecords);
    }
}
```

## 动画控制模式

### 基于 update 的帧动画

```typescript
protected update(dt: number) {
    if (this.isPause) return;

    this._runTwinkleTime += dt;

    if (this._runTwinkleTime >= this._twinkleTime) {
        this._runTwinkleTime = 0;
        this.nextStep();
    }
}
```

### 定时器动画

```typescript
// 单次延时
oops.timer.scheduleOnce(() => {
    this.showResult();
}, 1.5);

// 取消所有回调
this.unscheduleAllCallbacks();
```

### Tween 补间动画

```typescript
import { tween, v3 } from 'cc';

tween(this.node)
    .to(0.3, { scale: v3(1.2, 1.2, 1) })
    .to(0.15, { scale: v3(1, 1, 1) })
    .start();
```

### Spine 骨骼动画

```typescript
// 播放一次
this._sktBigReward.setAnimation(0, 'open', false);

// 循环播放
this._sktBigReward.setAnimation(0, 'idle', true);

// 监听完成
this._sktBigReward.setCompleteListener(() => {
    this.onAnimationComplete();
});
```

## 初始化列表组件

```typescript
initGameBox() {
    for (let index = 0; index < this._gameBoxIndexs.length; index++) {
        const boxIdx = this._gameBoxIndexs[index];
        const item = this._itemGameBoxList[index];

        if (item != undefined && boxIdx != undefined) {
            item.initItemGameBox(boxIdx);
        }
    }
}
```

## UI 数据绑定

通过事件回调更新 UI：

```typescript
onGetUserGameData() {
    this.unscheduleAllCallbacks();
    this.onUpdateRound();
    this.initGameBox();
    oops.message.dispatchEvent(SubGameEvent.OnStartTheGame);
}

onUpdateRound() {
    this._labRound.string = GreedyBoxUtil.getLangByID('round')
        + sub_smc.subGame.UserGameModel.getRoundNum();
}
```

## 检查清单

新增组件前检查：

- [ ] 节点引用在 `onLoad()` 中缓存
- [ ] 事件在 `addEvent()` 中集中注册
- [ ] 事件在 `onDestroy()` 中全部移除
- [ ] Sprite/Label 更新通过事件驱动，不在 `update()` 中轮询
- [ ] 面板组件使用 `onEnable/onDisable` 生命周期
- [ ] 动画控制有暂停/恢复机制
