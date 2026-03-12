---
name: cocos-coin-animation
description: 实现金币飞行、贝塞尔曲线路径动画和对象池管理时使用，包括多方向飞行路径、透明度渐变和粒子效果。不适用于简单的 Tween 线性动画。
tags: [cocos, animation, bezier, coin, pool, flyout]
inputs: [起点坐标, 终点坐标, 金币数量, 缓动函数]
outputs: [飞行动画代码, 对象池代码, 贝塞尔曲线计算]
---

# 金币飞行动画系统

## 概述

金币飞行动画是 2D 游戏中的高频需求：下注筹码飞入、结算金币回收、奖励飞出等。本技能涵盖贝塞尔曲线路径计算、手动对象池、多方向飞行和渐变效果。

## 系统架构

```
┌──────────────┐     路径请求     ┌──────────────┐     飞行执行     ┌──────────────┐
│  FlyChips    │ ──────────── │ PanelCoinBank│ ──────────── │  金币节点    │
│  (ECS实体)   │              │  Fly         │              │  (Prefab)   │
│              │              │  (面板组件)   │              │             │
│ 管理4种路径  │              │ 贝塞尔计算   │              │ 池化管理    │
│ 坐标存储     │              │ Tween驱动    │              │ 粒子重置    │
└──────────────┘              └──────────────┘              └──────────────┘
```

## 飞行路径定义

```typescript
export enum EMPathFlyCoin {
    AllPlayer2Bet = 1,  // 所有玩家 → 下注区（他人下注动画）
    MyChips2Bet,        // 我的筹码 → 下注区（我下注动画）
    Bet2MyCoin,         // 下注区 → 我的金币（赢币回收）
    Bet2AllPlayer,      // 下注区 → 所有玩家（输币分发）
}
```

## FlyChips 实体（路径管理器）

```typescript
@ecs.register('FlyChips')
export class FlyChips extends ecs.Entity {
    BetAreaPosModel!: BetAreaPosModelComp;
    ChipsStartPosModel!: ChipsStartPosModelComp;
    AllPlayersPosModel!: AllPlayersPosModelComp;
    MyCoinPosModel!: MyCoinPosModelComp;

    init() {
        this.addComponents<ecs.Comp>(
            BetAreaPosModelComp,
            ChipsStartPosModelComp,
            AllPlayersPosModelComp,
            MyCoinPosModelComp
        );
    }

    getFlyChipsPathInfo(path: EMPathFlyCoin, idxGear: number, idxArea: number): FlyChipsPathInfo {
        let posStart: Vec3, posTarget: Vec3;

        if (path == EMPathFlyCoin.AllPlayer2Bet) {
            posStart = this.getAllPlayersPos();
            posTarget = this.addRandPosition(this.getBetAreaPos(idxArea), this.getBetAreaPosSize(idxArea));
        }
        else if (path == EMPathFlyCoin.MyChips2Bet) {
            posStart = this.getChipsStartPos(idxGear);
            posTarget = this.addRandPosition(this.getBetAreaPos(idxArea), this.getBetAreaPosSize(idxArea));
        }
        else if (path == EMPathFlyCoin.Bet2MyCoin) {
            posStart = this.getBetAreaPos(idxArea);
            posTarget = this.getMyCoinPos();
        }
        else if (path == EMPathFlyCoin.Bet2AllPlayer) {
            posStart = this.getBetAreaPos(idxArea);
            posTarget = this.getAllPlayersPos();
        }

        return new FlyChipsPathInfo(posStart, posTarget);
    }

    // 在目标区域内添加随机散布
    addRandPosition(posInput: Vec3, sizeInput: Size): Vec3 {
        const halfWidth = sizeInput.width / 2;
        const halfHeight = sizeInput.height / 2;
        const x = oops.random.getRandomFloat(-halfWidth, halfWidth);
        const y = oops.random.getRandomFloat(-halfHeight, halfHeight);
        return new Vec3(posInput.x + x, posInput.y + y, 1);
    }
}
```

## 贝塞尔曲线计算

### 三次贝塞尔公式

$$B(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t) t^2 P_2 + t^3 P_3$$

### 代码实现

```typescript
computeCubicBezier(
    p0: Vec2,  // 起始点
    p1: Vec2,  // 控制点1
    p2: Vec2,  // 控制点2
    p3: Vec2,  // 终点
    t: number  // 插值 [0, 1]
): Vec2 {
    const u = 1 - t;
    const uu = u * u;
    const uuu = uu * u;
    const tt = t * t;
    const ttt = tt * t;

    return new Vec2(
        uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
        uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
    );
}
```

### 控制点计算

```typescript
flyOneCoin(posStart: Vec3, posEnd: Vec3, delay: number, index: number) {
    const A = new Vec2(posStart.x, posStart.y);
    const B = new Vec2(posEnd.x, posEnd.y);
    const vectorAB = new Vec2(B.x - A.x, B.y - A.y);
    const distanceAB = vectorAB.length();

    // 控制点偏移量（可配置参数）
    const offsetStart = distanceAB * this.factorDistanceStart;  // 0.2
    const offsetEnd = distanceAB * this.factorDistanceEnd;      // 0.3
    const heightCtrlStart = offsetStart * this._factorTan;
    const heightCtrlEnd = offsetEnd * this._factorTan;

    // 控制点1：沿 AB 方向偏移 + 垂直方向抬高
    const dirStart = vectorAB.clone().normalize().multiplyScalar(offsetStart);
    const posVertStart = new Vec2(A.x + dirStart.x, A.y + dirStart.y);

    // 控制点2：从 B 反向偏移 + 垂直方向抬高
    const dirEnd = vectorAB.clone().normalize().multiplyScalar(-offsetEnd);
    const posVertEnd = new Vec2(B.x + dirEnd.x, B.y + dirEnd.y);

    // 垂直方向单位向量
    let vectorVert = new Vec2(vectorAB.y, vectorAB.x).normalize();
    const pStart = vectorVert.clone().multiplyScalar(heightCtrlStart);
    const pEnd = vectorVert.clone().multiplyScalar(heightCtrlEnd);

    const cp1 = new Vec2(posVertStart.x + pStart.x, posVertStart.y - pStart.y);
    const cp2 = new Vec2(posVertEnd.x + pEnd.x, posVertEnd.y - pEnd.y);

    // ... 使用 cp1, cp2 驱动 Tween
}
```

## Tween + 贝塞尔驱动

```typescript
const obj = { t: 0 };
tween(obj)
    .delay(delay)
    .call(() => {
        nodeCoin.active = true;
        if (opacityComp) opacityComp.opacity = 0;
    })
    .to(this.flyCoinDuration, { t: 1 }, {
        easing: getEasingFn(this.flyCoinEasing),
        onUpdate: () => {
            const percent = obj.t;

            // 位置：贝塞尔曲线
            const pos = this.computeCubicBezier(A, cp1, cp2, B, percent);
            nodeCoin.setWorldPosition(pos.x, pos.y, 0);

            // 透明度：淡入淡出
            if (opacityComp) {
                if (percent > 0.4 && percent <= this.opacityShowPercent) {
                    opacityComp.opacity = Math.floor(255 * (percent / this.opacityShowPercent));
                } else if (percent >= this.opacityHidePercent) {
                    opacityComp.opacity = Math.floor(255 * ((1 - percent) / (1 - this.opacityHidePercent)));
                } else {
                    opacityComp.opacity = 255;
                }
            }

            // 缩放：终点附近缩小
            if (percent >= this.coinHidePercent) {
                const scalePercent = (percent - this.coinHidePercent) / (1 - this.coinHidePercent);
                const scale = 1 - (1 - 0.3) * scalePercent;
                nodeCoin.setScale(scale, scale, 1);
            }
        },
        onComplete: () => {
            this.recycleCoin(nodeCoin);
            Tween.stopAllByTarget(obj);
            cbListener?.('complete', index);
        }
    })
    .start();
```

## 手动对象池

```typescript
@ccclass('PanelCoinBankFly')
export class PanelCoinBankFly extends Component {
    @property(Prefab) prefabCoin: Prefab = null!;

    _coinFreePool: Node[] = [];

    // 获取空闲金币（池中取或新建）
    private getFreeCoin(active?: boolean): Node {
        let coin = this._coinFreePool.pop();
        if (!coin) {
            coin = instantiate(this.prefabCoin);
            coin.parent = this.node;
            const imgCoin = coin.getChildByName('nodeCoin').getComponent(Sprite);
            GreedyBoxUtil.setCoinSprite(imgCoin, AppUtil.getCoinIcon());
        }

        if (active != null) coin.active = active;

        // 重置状态
        coin.setScale(1, 1, 1);
        const particles = coin.getComponentsInChildren(ParticleSystem2D);
        particles.forEach(p => p.resetSystem());

        return coin;
    }

    // 回收金币（回池而非销毁）
    private recycleCoin(coin: Node) {
        this._coinFreePool.push(coin);
        coin.active = false;
    }
}
```

### 对象池要点

- **延迟创建**：首次需要时 `instantiate`，之后从池中取
- **状态重置**：取出时重置 scale、粒子系统
- **回收而非销毁**：`active = false` + 入池
- **粒子重置**：`resetSystem()` 确保粒子从头播放

## 可配置参数（Inspector 面板）

```typescript
@property({ displayName: '起点百分比', range: [0, 0.5, 0.01], slide: true })
factorDistanceStart: number = 0.2;

@property({ displayName: '终点百分比', range: [0, 0.5, 0.01], slide: true })
factorDistanceEnd: number = 0.3;

@property({ displayName: '切入角', range: [0, 90, 1], slide: true })
factorAngle: number = 25;

@property({ displayName: '金币个数', range: [1, 8, 1], slide: true })
bornCoinCount: number = 6;

@property({ displayName: '出生间隔', range: [0, 1, 0.01], slide: true })
bornCoinInterval: number = 0.1;

@property({ displayName: '飞行时间', range: [0, 2, 0.1], slide: true })
flyCoinDuration: number = 0.7;

@property({ displayName: '缓动函数', type: Enum(EasingMethod) })
flyCoinEasing: EasingMethod = EasingMethod.LINEAR;
```

## 批量飞行（错峰延迟）

```typescript
startFlyCoin(posStarts: Vec3[], posEnd: Vec3, cbListener?: Function) {
    for (let i = 0; i < this.bornCoinCount; i++) {
        const posStart = this.getStartWorldPos(i);
        this.flyOneCoin(
            posStart,
            posEnd,
            this.bornCoinInterval * i,  // 错峰延迟
            i,
            cbListener
        );
    }
}
```

## 坐标转换（屏幕→世界）

```typescript
getCoinBankWorldPos(leftPercent: number): Vec3 {
    const UICamera = find('root/gui/UICamera')?.getComponent(Camera);
    const visibleSize = view.getVisibleSizeInPixel();
    const clampedX = visibleSize.width * leftPercent;
    const clampedY = visibleSize.height - 20;
    return UICamera.screenToWorld(new Vec3(clampedX, clampedY, 0));
}
```

## 新增飞行动画清单

- [ ] 定义飞行路径枚举（起点→终点）
- [ ] 在 FlyChips 实体中注册坐标（`setBetAreaPos`、`setMyCoinPos` 等）
- [ ] 计算贝塞尔控制点（`factorDistanceStart`、`factorAngle`）
- [ ] 创建金币预制体（含 Sprite、UIOpacity、ParticleSystem2D）
- [ ] 实现对象池 `getFreeCoin` / `recycleCoin`
- [ ] Tween 驱动 + `onUpdate` 计算曲线位置
- [ ] 处理透明度淡入淡出和缩放
- [ ] 批量飞行用 `delay` 错峰

## 相关技能

- `cocos-animation` — 基础 Tween/Spine 动画
- `oops-ecs-pattern` — FlyChips 实体结构
- `cocos-asset-management` — Prefab 资源加载
