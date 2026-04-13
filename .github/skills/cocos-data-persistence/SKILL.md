---
name: cocos-data-persistence
description: 实现客户端数据持久化时使用，包括本地存储、带前缀的键值管理和 OOPS storage 系统。不适用于服务器端数据存储。
tags: [cocos, storage, persistence, cache, local]
inputs: [存储键名, 数据类型, 游戏名]
outputs: [存储工具类, 读写代码, 缓存策略]
---

# 数据持久化

## 概述

客户端数据持久化用于保存用户偏好、游戏设置和临时缓存。Cocos Creator 提供 `sys.localStorage`，OOPS 框架提供 `oops.storage`，项目中封装了 `SysStorageUtil` 工具类。

## 三层存储体系

```
┌────────────────────┐
│  oops.storage      │ ← 框架级：加密存储，Root 初始化时配置
├────────────────────┤
│  SysStorageUtil    │ ← 业务级：带前缀的键值存储
├────────────────────┤
│  sys.localStorage  │ ← 引擎级：原始 Web Storage API
└────────────────────┘
```

## SysStorageUtil（业务级存储）

```typescript
import { sys } from 'cc';

export class SysStorageUtil {
    private static _prefix = '';

    // 设置全局前缀
    static setPrefix(prefix: string) {
        this._prefix = prefix;
    }

    // 以游戏名作为前缀（多子游戏隔离）
    static setPrefixByGame(gameName: string) {
        this._prefix = `${gameName}_`;
    }

    // 写入
    static setItem(key: string, value: string) {
        sys.localStorage.setItem(`${this._prefix}${key}`, value);
    }

    // 读取
    static getItem(key: string): string | null {
        return sys.localStorage.getItem(`${this._prefix}${key}`);
    }
}
```

### 使用示例

```typescript
// 子游戏入口初始化前缀
SysStorageUtil.setPrefixByGame('greedybox');

// 保存用户选择的筹码档位
SysStorageUtil.setItem('lastChipsGear', '3');

// 读取
const gear = SysStorageUtil.getItem('lastChipsGear');
if (gear != null) {
    this.setChipsGear(parseInt(gear));
}
```

### 前缀隔离

```
键名存储格式: {gameName}_{key}
示例:
  greedybox_lastChipsGear = "3"
  dragontiger_lastBetArea = "2"
```

## oops.storage（框架级存储）

```typescript
// 写入（支持加密）
oops.storage.setData('userToken', tokenValue);

// 读取
const token = oops.storage.getData('userToken');

// 移除
oops.storage.removeData('userToken');
```

### 与 SysStorageUtil 的区别

| 维度 | SysStorageUtil | oops.storage |
|------|---------------|--------------|
| 加密 | 无 | 可配置加密 |
| 前缀 | 手动管理 | 框架管理 |
| 用途 | 子游戏偏好 | 全局敏感数据（token、用户信息） |
| 生命周期 | 子游戏级 | 应用级 |

## 内存缓存

除持久化外，项目中也使用内存缓存：

### 远程图片缓存

```typescript
export class GreedyBoxUtil {
    static cache: { [name: string]: SpriteFrame } = {};

    static setRemoteSprite(sp: Sprite, url: string, isCache: boolean = true) {
        oops.res.loadRemote<ImageAsset>(url, { ext: ".png" }, (err, data) => {
            if (err) return;

            let spr = this.cache[data.uuid];
            if (!spr || spr.texture == null) {
                spr = new SpriteFrame();
                let texture = new Texture2D();
                texture.image = data;
                spr.texture = texture;
                spr.packable = false;
                spr.addRef();   // 引用计数 +1

                if (isCache) {
                    this.cache[data.uuid] = spr;
                }
            }

            sp.spriteFrame = spr;
        });
    }
}
```

### 坐标缓存

```typescript
// PanelCoinBankFly - 缓存飞行终点
private _bUnlock: boolean = false;
private _vec3FlyEnd: Vec3;

onCoinBankStartFly() {
    if (this._bUnlock && this._vec3FlyEnd) {
        this.flyFromCacheData();    // 使用缓存坐标
    } else {
        // 首次从平台获取坐标
        webCross.getCoinBankInfo((data) => {
            this._bUnlock = data.unlock;
            this._vec3FlyEnd = this.getCoinBankWorldPos(data.leftPercent);
            this.flyFromCacheData();
        });
    }
}
```

## 存储规范

| 数据类型 | 存储方式 | 示例 |
|---------|---------|------|
| 用户偏好（筹码档位、音量） | SysStorageUtil | `setItem('lastGear', '3')` |
| 登录态（token） | oops.storage（加密） | `setData('token', value)` |
| 远程图片 | 内存缓存（Map） | `cache[uuid] = spriteFrame` |
| 计算结果（坐标） | 内存缓存（字段） | `_vec3FlyEnd = pos` |
| 服务器数据 | 不持久化，实时请求 | ECS Model 层 |

## 红线

| 违规 | 后果 | 正确做法 |
|------|------|----------|
| 存储敏感数据到 SysStorageUtil | 数据明文暴露 | 用 oops.storage 加密 |
| 硬编码 key 字符串 | 键名冲突 | 用常量类管理 |
| 不设前缀 | 多子游戏数据冲突 | `setPrefixByGame()` |
| 内存缓存未释放 | 内存泄漏 | 子游戏退出时清空 |
| 缓存过大数据 | 内存溢出 | 限制缓存大小或用 LRU |

## 相关技能

- `oops-framework` — oops.storage API
- `cocos-asset-management` — 远程资源缓存
- `cocos-scene-management` — 子游戏生命周期与缓存清理
