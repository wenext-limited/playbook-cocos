---
name: cocos-asset-management
description: 动态加载和管理游戏资源时使用，包括 Sprite 加载、图集管理、预加载策略和资源缓存。不适用于编辑器内的静态资源引用。
tags: [cocos, asset, sprite, atlas, resource, cache]
inputs: [资源类型, 资源路径, 目标组件]
outputs: [加载代码, 缓存策略, 预加载逻辑]
---

# 资源加载与管理

## 概述

Cocos Creator 资源加载包括静态引用（编辑器拖拽）和动态加载（运行时代码加载）。本技能聚焦动态加载模式。

## Sprite 动态加载

### 基础加载

```typescript
export class SubGameUtil {
    static _loadSpriteFramePool: Map<string, SpriteFrame> = new Map();

    static setSpriteFrame(sprite: Sprite, url: string, callback?: Function) {
        url += "/spriteFrame";

        oops.res.load(url, (err: Error | null, sp: SpriteFrame) => {
            if (err || sp == null) {
                oops.log.logBusiness(`setSpriteFrame - err = ${err}`);
                callback && callback(false);
                return;
            }

            if (sprite && sprite.isValid && sprite.node) {
                sprite.spriteFrame = sp;
                callback && callback(true);
            }
        });
    }
}
```

### 业务封装

```typescript
export class GreedyBoxUtil {
    // 设置宝箱 Sprite
    static setBoxSprite(sprite: Sprite, imgName: string) {
        SubGameUtil.setSpriteFrame(sprite, `texture/box/${imgName}`);
    }

    // 设置数字 Sprite
    static setNumberSprite(sprite: Sprite, num: number) {
        SubGameUtil.setSpriteFrame(sprite, `texture/number/num_${num}`);
    }

    // 设置头像 Sprite
    static setHeadSprite(sprite: Sprite, headId: string) {
        SubGameUtil.setSpriteFrame(sprite, `texture/head/${headId}`);
    }
}
```

## 远程纹理加载

```typescript
export class GreedyBoxUtil {
    private static _remoteTextureCache: Map<string, SpriteFrame> = new Map();

    static loadRemoteTexture(sprite: Sprite, url: string) {
        // 先检查缓存
        if (this._remoteTextureCache.has(url)) {
            sprite.spriteFrame = this._remoteTextureCache.get(url);
            return;
        }

        oops.res.loadRemote(url, (err, texture) => {
            if (err || !texture) return;
            const sf = new SpriteFrame();
            sf.texture = texture;
            this._remoteTextureCache.set(url, sf);
            if (sprite && sprite.isValid) {
                sprite.spriteFrame = sf;
            }
        });
    }
}
```

## 预加载策略

### 入口预加载

在子游戏入口 `SubGameEntry` 中预加载关键资源：

```typescript
preloadResource() {
    // 预加载图集图片
    const key = AppUtil.getCoinIcon();
    RichAtlasMgr.addResourceImageByOops(key, `texture/coin/${key}`);

    // 预加载 UI 预制体
    const uiConfig = oops.gui.getConfig(SubUIID.TotualRank);
    oops.res.loadAsync(oops.res.defaultBundleName, uiConfig.prefab, Prefab);
}
```

### 按需加载

Panel 等非首屏 UI 在首次打开时自动加载（由 OOPS 框架处理）：

```typescript
// oops.gui.open 内部会按 UIConfig 中的 prefab 和 bundle 自动加载
oops.gui.open(SubUIID.Settlement);
```

## Spine 资源加载

```typescript
static setSkeletonData(skeleton: sp.Skeleton, path: string) {
    oops.res.load(path, sp.SkeletonData, (err, data) => {
        if (err || !data) return;
        if (skeleton && skeleton.isValid) {
            skeleton.skeletonData = data;
        }
    });
}
```

## 资源组织规范

```
texture/
├── box/              # 宝箱图片（box_close_1 ~ box_close_9）
├── coin/             # 货币图标
├── number/           # 数字纹理
├── head/             # 玩家头像
├── rank/             # 排名徽章
└── common/           # 通用 UI 元素

spine/
├── box_1/            # 宝箱骨骼动画
├── box_2/
└── effect/           # 特效动画

config/               # JSON 配置
language/              # 本地化文件
```

## 资源命名规范

| 资源类型 | 命名格式 | 示例 |
|----------|----------|------|
| 宝箱图片 | `box_close_<编号>` / `box_open_<编号>` | `box_close_1.png` |
| 货币图标 | `icon_coin_<类型>` | `icon_coin_gold.png` |
| 数字纹理 | `num_<数字>` | `num_1.png` |
| 头像 | `head_<ID>` | `head_default.png` |
| 音频 | 语义化命名 | `bgm.mp3`、`bet_success.mp3` |

## UUID 远程图片缓存

远程图片使用 UUID 作为缓存键，创建 SpriteFrame 后通过 `addRef()` 防止被 GC 回收：

```typescript
export class GreedyBoxUtil {
    static cache: Map<string, SpriteFrame> = new Map();

    static loadRemoteImage(sprite: Sprite, uuid: string, url: string) {
        // 命中缓存直接使用
        if (this.cache.has(uuid)) {
            if (sprite && sprite.isValid) {
                sprite.spriteFrame = this.cache.get(uuid)!;
            }
            return;
        }

        oops.res.loadRemote(url, (err, texture) => {
            if (err || !texture) return;

            const sf = new SpriteFrame();
            sf.texture = texture;
            sf.addRef();  // 增加引用计数防止 GC
            this.cache.set(uuid, sf);

            if (sprite && sprite.isValid) {
                sprite.spriteFrame = sf;
            }
        });
    }
}
```

**缓存管理要点**：
- `addRef()` 后资源不会被自动释放
- 子游戏退出时应调用 `decRef()` 或 `cache.clear()` 释放内存
- UUID 作为键确保同一图片不会重复下载

## 手动对象池

频繁创建/销毁的节点使用对象池复用，避免 GC 抖动：

```typescript
export class PanelCoinBankFly extends Component {
    @property(Prefab)
    coinPrefab: Prefab = null;

    private _coinPool: Node[] = [];

    getFreeCoin(): Node {
        if (this._coinPool.length > 0) {
            const coin = this._coinPool.pop()!;
            coin.active = true;
            return coin;
        }
        return instantiate(this.coinPrefab);
    }

    recycleCoin(coin: Node) {
        coin.active = false;
        Tween.stopAllByTarget(coin);     // 停止残留动画
        coin.setPosition(0, 0, 0);       // 重置位置
        coin.setScale(1, 1, 1);          // 重置缩放
        this._coinPool.push(coin);
    }

    onDestroy() {
        // 销毁池中所有节点
        this._coinPool.forEach(n => n.destroy());
        this._coinPool.length = 0;
    }
}
```

**对象池要点**：
- 回收时重置所有状态（位置、缩放、透明度、动画）
- `onDestroy` 中清理池内节点防止泄漏
- 池大小可根据最大飞币数量预估

## 资源释放

```typescript
// Bundle 资源释放
oops.res.release(path);

// 远程纹理释放（需配合 addRef/decRef）
const sf = cache.get(uuid);
sf?.decRef();
cache.delete(uuid);
```

## 安全检查

加载完成回调中必须检查组件有效性：

```typescript
oops.res.load(url, (err, asset) => {
    // 必须检查：组件可能已被销毁
    if (sprite && sprite.isValid && sprite.node) {
        sprite.spriteFrame = asset;
    }
});
```

## 清单

- [ ] 动态加载使用 OOPS 资源管理 API
- [ ] 加载回调中检查组件有效性（`isValid`）
- [ ] 频繁加载的资源使用 Map 缓存
- [ ] 远程图片使用 `addRef()` 防止被 GC
- [ ] 关键资源在入口处预加载
- [ ] 资源路径定义在工具类或常量中
- [ ] 手动对象池在 `onDestroy` 中清理
- [ ] 子游戏退出时释放缓存（`decRef` + `cache.clear`）

## 相关技能

- `cocos-scene-management` — Bundle 资源加载
- `cocos-animation` — Spine 资源加载
- `cocos-coin-animation` — 飞币动画中的对象池模式
- `cocos-data-persistence` — 内存缓存策略
