---
name: migrate-player-avatar
description: 迁移 PlayerAvatarComponent 头像管理系统（含 GIF 动图播放、远程图片缓存、引用计数、双限制内存清理、双线性降采样、DEFAULT_AVATOR_FUNC 适配）到新 Cocos Creator 项目。当用户说"迁移头像"、"迁移PlayerAvatarComponent"、"迁移RemoteSpriteMgr"、"migrate avatar"、"移植头像管理"时使用此 skill。
argument-hint: [目标项目路径]
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash]
---

# PlayerAvatarComponent 迁移指南

你是 Cocos Creator 项目迁移专家。执行以下步骤，将头像管理系统从参考项目迁移到目标项目。

## 架构概览

头像系统支持静态图和 GIF 动图，由以下文件组成：

| 文件 | 建议放置路径 | 说明 |
|------|-------------|------|
| `ImageResHelper.ts` | `script/game/` | GIF 解码工具，依赖 `omggif` npm 包 |
| `RemoteSpriteFrameManager.ts` | `script/playerAvatar/` | 远程图片缓存单例，无业务依赖 |
| `PlayerAvatarGIF.ts` | `script/playerAvatar/` | GIF 帧动画播放器（纯逻辑类） |
| `PlayerAvatarComponent.ts` | `script/playerAvatar/` | 头像 UI 组件，依赖上面所有文件 |
| `SpriteFrameUtil.ts` | `framework/mgrs/` | 引用计数工具，目标项目可能已有 |

**需要适配（不能直接复用）：**

| 内容 | 说明 |
|------|------|
| `DEFAULT_AVATOR_FUNC` | 在目标项目 Entry 脚本初始化阶段赋值 |
| 默认头像资源 | 目标项目需有对应 texture 文件 |
| import 路径 | 各文件间的相对路径按目标项目目录调整 |

---

## 第一步：确认依赖

```bash
# 确认 omggif 已安装（GIF 解码依赖）
cat package.json | grep omggif
```

若 `package.json` 中没有 `omggif`，**提示用户在项目根目录下自行执行**：

```bash
sudo npm install omggif
```

> 注意：不要代替用户执行 `npm install`，因为 npm 缓存目录权限问题可能导致失败，需要用户在自己的终端中以 sudo 运行。

---

## 第二步：复制核心文件

### 2.1 ImageResHelper.ts

包含 `downloadAndParseGIF`（XHR 下载 + omggif 解码，支持 disposal 帧合成）和 `getImageTypeDesc`（魔术字节检测）。直接从参考项目复制，无需改动。

关键注意：`downloadAndParseGIF` 返回 `{ width, height, frameCount, frameInfo: [{ delay, pixels }] }`，`pixels` 为 RGBA `Uint8Array`。

### 2.2 RemoteSpriteFrameManager.ts

```typescript
import { AssetManager, assetManager, error, ImageAsset, SpriteFrame, Texture2D, gfx } from 'cc';
import { EDITOR } from 'cc/env';
import { downloadAndParseGIF } from '../game/ImageResHelper'; // 调整为实际路径

// 缓存项，静态图为单帧（delays[0]=Infinity），GIF 为多帧
export class CacheItem {
    spriteFrames: SpriteFrame[] = [];
    delays: number[] = [];
    url: string = '';
    refCount: number = 1;    // 初始为 1，代表缓存自身持有一份引用（GIF 专用，静态图不计数）
    memoryBytes: number = 0; // 该缓存项占用的像素内存字节数（width × height × 4 × frameCount）
}

export class RemoteSpriteMgr {
    private remoteCache: AssetManager.Cache<CacheItem> = new AssetManager.Cache<CacheItem>();
    private loadingCache: Map<string, Function[]> = new Map<string, Function[]>();

    public static readonly MIN_VALID_URL_LENGTH = 5;
    public static readonly MAX_MEMORY_CACHE_SIZE = 50;
    // 最大像素内存占用，按需调整
    public static readonly MAX_MEMORY_CACHE_BYTES = 150 * 1024 * 1024;

    private cleanupInterval: number = 2 * 60 * 1000;
    private cleanupTimer: any = null;
    private _totalMemoryBytes: number = 0;
    private lockPromise: Promise<void> = Promise.resolve();

    private static _instance: RemoteSpriteMgr = null;
    public static get Instance(): RemoteSpriteMgr {
        if (!RemoteSpriteMgr._instance) {
            RemoteSpriteMgr._instance = new RemoteSpriteMgr();
        }
        return RemoteSpriteMgr._instance;
    }

    constructor() {
        this.startAutoCleanup();
    }

    private startAutoCleanup(): void {
        if (EDITOR) { return; }
        if (this.cleanupTimer) { clearInterval(this.cleanupTimer); }
        this.cleanupTimer = setInterval(() => {
            this.removeUnusedCache();
        }, this.cleanupInterval);
    }

    /**
     * 申请 GIF 帧组，refCount+1；callback(success, frames, delays)
     * @param maxSize 限制帧的最短边像素数，超出时等比降采样后再创建 ImageAsset
     */
    public acquireGif(url: string, callback: Function, maxSize?: number): void {
        this.acquireInternal(url, callback, true, maxSize);
    }

    /**
     * 申请静态图单帧；callback(success, frames, delays)
     * 静态图不计 refCount，由数量上限+定时器驱动清理
     */
    public acquireStatic(url: string, callback: Function): void {
        this.acquireInternal(url, callback, false);
    }

    /**
     * 释放一次 GIF 的引用（refCount 回到 1 表示只剩缓存自身持有，不立即销毁）
     */
    public release(url: string): void {
        const entry = this.remoteCache.get(url);
        if (!entry) { return; }
        entry.refCount--;
    }

    private acquireInternal(url: string, callback: Function, isGif: boolean, maxSize?: number): void {
        const entry = this.remoteCache.get(url);
        if (entry) {
            if (isGif) { entry.refCount++; }
            callback(true, entry.spriteFrames, entry.delays);
            return;
        }
        this.processExceed();
        if (this.loadingCache.has(url)) {
            this.loadingCache.get(url).push(callback);
            return;
        }
        this.loadingCache.set(url, [callback]);
        if (isGif) {
            this.loadGif(url, maxSize);
        } else {
            this.loadStatic(url);
        }
    }

    /**
     * 双线性插值降采样：将 src 从 srcW×srcH 缩放到 dstW×dstH
     */
    private downscalePixels(src: Uint8Array, srcW: number, srcH: number, dstW: number, dstH: number): Uint8Array {
        const dst = new Uint8Array(dstW * dstH * 4);
        const xRatio = srcW / dstW;
        const yRatio = srcH / dstH;
        for (let y = 0; y < dstH; y++) {
            const srcY = y * yRatio;
            const y0 = Math.floor(srcY);
            const y1 = Math.min(y0 + 1, srcH - 1);
            const ty = srcY - y0;
            for (let x = 0; x < dstW; x++) {
                const srcX = x * xRatio;
                const x0 = Math.floor(srcX);
                const x1 = Math.min(x0 + 1, srcW - 1);
                const tx = srcX - x0;
                const i00 = (y0 * srcW + x0) * 4;
                const i10 = (y0 * srcW + x1) * 4;
                const i01 = (y1 * srcW + x0) * 4;
                const i11 = (y1 * srcW + x1) * 4;
                const w00 = (1 - tx) * (1 - ty);
                const w10 = tx       * (1 - ty);
                const w01 = (1 - tx) * ty;
                const w11 = tx       * ty;
                const di = (y * dstW + x) * 4;
                dst[di]     = src[i00]     * w00 + src[i10]     * w10 + src[i01]     * w01 + src[i11]     * w11;
                dst[di + 1] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
                dst[di + 2] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
                dst[di + 3] = src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11;
            }
        }
        return dst;
    }

    private loadGif(url: string, maxSize?: number): void {
        downloadAndParseGIF(url).then((gifInfo) => {
            const callbacks = this.loadingCache.get(url) || [];
            this.loadingCache.delete(url);

            // 按最短边等比计算目标尺寸，GIF 本身已小于 maxSize 时不放大
            let targetW = gifInfo.width;
            let targetH = gifInfo.height;
            if (maxSize > 0 && Math.min(gifInfo.width, gifInfo.height) > maxSize) {
                const scale = maxSize / Math.min(gifInfo.width, gifInfo.height);
                targetW = Math.round(gifInfo.width * scale);
                targetH = Math.round(gifInfo.height * scale);
            }
            const needDownscale = targetW !== gifInfo.width || targetH !== gifInfo.height;

            const spriteFrames: SpriteFrame[] = [];
            const delays: number[] = [];
            for (const frameInfo of gifInfo.frameInfo) {
                const pixels = needDownscale
                    ? this.downscalePixels(frameInfo.pixels, gifInfo.width, gifInfo.height, targetW, targetH)
                    : frameInfo.pixels;
                const imageAsset = new ImageAsset();
                imageAsset.reset({
                    _compressed: false,
                    _data: pixels,
                    width: targetW,
                    height: targetH,
                    format: gfx.Format.RGBA8
                });
                const sp = SpriteFrame.createWithImage(imageAsset);
                sp.packable = false;
                sp.addRef();
                spriteFrames.push(sp);
                delays.push(frameInfo.delay);
            }

            const memoryBytes = targetW * targetH * 4 * spriteFrames.length;
            const entry: CacheItem = { spriteFrames, delays, url, refCount: 1, memoryBytes };
            this._totalMemoryBytes += memoryBytes;
            this.remoteCache.add(url, entry);

            callbacks.forEach(cb => {
                entry.refCount++;
                cb(true, entry.spriteFrames, entry.delays);
            });
        }).catch((err) => {
            const callbacks = this.loadingCache.get(url) || [];
            this.loadingCache.delete(url);
            console.warn(`[RemoteSpriteMgr] gif decode failed: ${url}`, err);
            callbacks.forEach(cb => cb(false, null, null));
        });
    }

    private loadStatic(url: string): void {
        assetManager.loadRemote<ImageAsset>(url, { ext: '.png' }, (err: Error | null, data: ImageAsset) => {
            const callbacks = this.loadingCache.get(url) || [];
            this.loadingCache.delete(url);
            if (err) {
                error(`[RemoteSpriteMgr] load ${url} error: ${err}`);
                callbacks.forEach(cb => cb(false, null, null));
                return;
            }
            const texture = new Texture2D();
            texture.image = data;
            const sp = new SpriteFrame();
            sp.texture = texture;
            sp.packable = false;
            sp.name = url;
            sp.addRef();

            const memoryBytes = data.width * data.height * 4;
            const entry: CacheItem = { spriteFrames: [sp], delays: [Infinity], url, refCount: 1, memoryBytes };
            this._totalMemoryBytes += memoryBytes;
            this.remoteCache.add(url, entry);

            callbacks.forEach(cb => {
                cb(true, entry.spriteFrames, entry.delays);
            });
        });
    }

    private processExceed() {
        if (this.remoteCache.count >= RemoteSpriteMgr.MAX_MEMORY_CACHE_SIZE ||
            this._totalMemoryBytes >= RemoteSpriteMgr.MAX_MEMORY_CACHE_BYTES) {
            this.removeUnusedCache();
        }
    }

    private async removeUnusedCache(): Promise<void> {
        this.lockPromise = this.lockPromise.then(async () => {
            this.remoteCache.forEach((entry, key) => {
                if (entry && entry.refCount <= 1) {
                    // 全帧 refCount <= 1 才释放，有 Sprite 仍引用时本轮跳过
                    const allFramesFree = entry.spriteFrames.every(sp => !sp || !sp.isValid || sp.refCount <= 1);
                    if (allFramesFree) {
                        this._totalMemoryBytes -= entry.memoryBytes;
                        this.safeReleaseResource(entry);
                        this.remoteCache.remove(key);
                    }
                }
            });
        });
        return this.lockPromise;
    }

    private safeReleaseResource(entry: CacheItem): void {
        entry.spriteFrames.forEach(sp => {
            if (!sp || !sp.isValid) { return; }
            const texture = sp.texture as Texture2D;
            const remoteImage = texture?.image;
            assetManager.releaseAsset(sp);
            if (texture && texture.isValid) { assetManager.releaseAsset(texture); }
            if (remoteImage && remoteImage.isValid) { assetManager.releaseAsset(remoteImage); }
        });
        entry.spriteFrames = [];
        entry.delays = [];
    }

    public destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.remoteCache.clear();
    }
}
```

### 2.3 PlayerAvatarGIF.ts（新文件，GIF 帧动画播放器）

```typescript
import { SpriteFrame } from 'cc';
import { RemoteSpriteMgr } from './RemoteSpriteFrameManager';

export class PlayerAvatarGIF {
    private _cacheUrl: string = null;
    private _pendingUrl: string = null;
    private _spriteFrames: SpriteFrame[] = [];
    private _delays: number[] = [];
    private _isPlaying: boolean = false;
    private _currentIndex: number = 0;
    private _timer: number = 0;
    private _onFrameChange: ((spriteFrame: SpriteFrame) => void) | null = null;

    get isPlaying(): boolean { return this._isPlaying; }

    /**
     * @param maxSize 最短边像素上限，超出时降采样后存缓存
     */
    public load(
        url: string,
        onFrameChange: (spriteFrame: SpriteFrame) => void,
        onFail: () => void,
        maxSize?: number
    ): void {
        this._pendingUrl = url;

        RemoteSpriteMgr.Instance.acquireGif(url, (success: boolean, frames: SpriteFrame[], delays: number[]) => {
            if (!success) { onFail(); return; }
            if (this._pendingUrl !== url) {
                RemoteSpriteMgr.Instance.release(url);
                return;
            }
            this._pendingUrl = null;

            // 先上屏新第一帧，再释放旧缓存，防止旧帧被 removeUnusedCache 提前销毁
            onFrameChange(frames[0]);
            this.clear();

            this._cacheUrl = url;
            this._spriteFrames = frames;
            this._delays = delays;
            this._isPlaying = true;
            this._currentIndex = 0;
            this._timer = 0;
            this._onFrameChange = onFrameChange;
        }, maxSize);
    }

    public tick(dt: number): void {
        if (!this._isPlaying || this._spriteFrames.length === 0) { return; }
        this._timer += dt;
        const delay = this._delays[this._currentIndex] || 0;
        if (this._timer >= delay) {
            this._timer = 0;
            this._currentIndex = (this._currentIndex + 1) % this._spriteFrames.length;
            const frame = this._spriteFrames[this._currentIndex];
            if (frame?.isValid) { this._onFrameChange?.(frame); }
        }
    }

    public clear(): void {
        this._pendingUrl = null;
        this._isPlaying = false;
        this._currentIndex = 0;
        this._timer = 0;
        this._spriteFrames = [];
        this._delays = [];
        this._onFrameChange = null;
        if (this._cacheUrl) {
            RemoteSpriteMgr.Instance.release(this._cacheUrl);
            this._cacheUrl = null;
        }
    }
}
```

### 2.4 PlayerAvatarComponent.ts（调整 import 路径）

```typescript
import { _decorator, Component, Sprite, SpriteFrame, UITransform } from 'cc';
import { RemoteSpriteMgr } from './RemoteSpriteFrameManager';
import { PlayerAvatarGIF } from './PlayerAvatarGIF';
import { SpriteFrameUtil } from '../../framework/mgrs/SpriteFrameUtil'; // 调整为实际路径
const { ccclass } = _decorator;

enum AvatarLoadState { RESET = 0, LOADING_DEFAULT = 1, LOADING_REMOTE = 2 }

@ccclass('PlayerAvatarComponent')
export class PlayerAvatarComponent extends Component {
    private _url: string = "";
    private _sprite: Sprite = null;
    private _uiTransform: UITransform = null;
    private _originSize_x: number = 0;
    private _originSize_y: number = 0;
    private _limitMinSize: number = 0;
    private _loadState: AvatarLoadState = AvatarLoadState.RESET;
    private _gifPlayer: PlayerAvatarGIF = new PlayerAvatarGIF();

    // ⚠️ 必须在项目 Entry 初始化阶段赋值，早于任何头像节点激活
    public static DEFAULT_AVATOR_FUNC: (callback: (spriteFrame: SpriteFrame) => void) => void = null;

    protected onLoad(): void {
        this._uiTransform = this.node.getComponent(UITransform);
        this._originSize_x = this._uiTransform.contentSize.width;
        this._originSize_y = this._uiTransform.contentSize.height;
        this._limitMinSize = Math.min(this._originSize_x, this._originSize_y);
        this._sprite = this.getComponent(Sprite) || this.addComponent(Sprite);
    }

    protected onEnable(): void { this.SetDefault(); }

    protected update(dt: number): void { this._gifPlayer.tick(dt); }

    get spriteFrame(): SpriteFrame { return this._sprite?.spriteFrame; }

    public SetDefault() {
        if (this._loadState == AvatarLoadState.LOADING_REMOTE ||
            this._loadState == AvatarLoadState.LOADING_DEFAULT) { return; }
        this._loadState = AvatarLoadState.LOADING_DEFAULT;
        PlayerAvatarComponent.DEFAULT_AVATOR_FUNC?.((spriteFrame) => {
            if (this._loadState == AvatarLoadState.LOADING_REMOTE) { return; }
            this._uiTransform?.setContentSize(this._originSize_x, this._originSize_y);
            SpriteFrameUtil.SetSpriteFrameAutoRef(this._sprite, spriteFrame);
        });
    }

    public SetRemote(url: string) {
        if (this._sprite == null || this._url == url) { return; }
        this._url = url;
        if (!url || url.length <= RemoteSpriteMgr.MIN_VALID_URL_LENGTH) {
            this.resetAvatar();
            return;
        }
        if (url.indexOf('.gif') > 0) {
            this.loadGif(url);
        } else {
            this.loadRemote(url);
        }
    }

    private loadGif(url: string) {
        this._loadState = AvatarLoadState.LOADING_REMOTE;
        this.SetDefault();
        this._gifPlayer.load(
            url,
            (frame) => { this.setSpriteFrame(frame); },
            () => this.resetAvatar(),
            this._limitMinSize  // 按显示尺寸降采样，节省内存
        );
    }

    private loadRemote(url: string) {
        this._loadState = AvatarLoadState.LOADING_REMOTE;
        this._gifPlayer.clear();
        this.SetDefault();
        RemoteSpriteMgr.Instance.acquireStatic(url, (success: boolean, frames: SpriteFrame[]) => {
            if (!this.node || !this.node.isValid || !this._sprite || !this._sprite.isValid) { return; }
            if (success && frames.length > 0) {
                this.setSpriteFrame(frames[0]);
            } else {
                this.resetAvatar();
            }
        });
    }

    private setSpriteFrame(spriteFrame: SpriteFrame) {
        if (!this._sprite?.isValid || !spriteFrame?.isValid || !this._uiTransform.isValid) { return; }
        SpriteFrameUtil.SetSpriteFrameAutoRef(this._sprite, spriteFrame);
        this._sprite.sizeMode = Sprite.SizeMode.RAW;
        const size = this._uiTransform.contentSize;
        const scale = this._limitMinSize / Math.min(size.width, size.height);
        this._sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this._uiTransform.setContentSize(size.width * scale, size.height * scale);
    }

    private resetAvatar() {
        this._loadState = AvatarLoadState.RESET;
        this.SetDefault();
    }

    protected onDisable(): void {
        this._gifPlayer.clear();
        if (this._sprite?.spriteFrame?.isValid) {
            this._sprite.spriteFrame.decRef(false);
            this._sprite.spriteFrame = null;
        }
        this._url = "";
        this._loadState = AvatarLoadState.RESET;
    }
}
```

### 2.5 SpriteFrameUtil.ts（确认目标项目是否已有，若有则合并）

```typescript
import { Sprite, SpriteFrame } from "cc";

export class SpriteFrameUtil {
    public static SetSpriteFrame(sprite: Sprite, spFrame: SpriteFrame, callback?: Function) {
        if (sprite?.isValid && spFrame?.isValid) {
            sprite.spriteFrame = spFrame;
            callback?.(true);
        } else {
            callback?.(false);
        }
    }

    // 自动管理引用计数，所有动态设置 spriteFrame 的地方必须用此方法
    public static SetSpriteFrameAutoRef(sprite: Sprite, spFrame: SpriteFrame, callback?: Function) {
        if (sprite?.isValid && spFrame?.isValid) {
            const oldSpriteFrame = sprite.spriteFrame;
            if (oldSpriteFrame?.isValid) {
                oldSpriteFrame.decRef(false); // false = 不立即销毁
            }
            sprite.spriteFrame = spFrame;
            spFrame.addRef();
            callback?.(true);
        } else {
            callback?.(false);
        }
    }
}
```

---

## 第三步：适配 DEFAULT_AVATOR_FUNC

在项目 Entry 脚本 `onLoad` / `init` 中赋值，**必须早于任何头像节点激活**：

```typescript
import { PlayerAvatarComponent } from './playerAvatar/PlayerAvatarComponent';

// 场景 A：目标项目有资源加载工具
PlayerAvatarComponent.DEFAULT_AVATOR_FUNC = (callback) => {
    YourUtil.getSpriteFrame(`texture/head/icon_default_xxx`, callback);
};

// 场景 B：直接用 assetManager
PlayerAvatarComponent.DEFAULT_AVATOR_FUNC = (callback) => {
    assetManager.loadRemote<SpriteFrame>(`url/to/default_avatar`, (err, sp) => {
        if (!err && sp) { callback(sp); }
    });
};

// 场景 C：默认头像已预加载（最简单）
PlayerAvatarComponent.DEFAULT_AVATOR_FUNC = (callback) => {
    callback(YourGlobalConfig.defaultAvatarSpriteFrame);
};
```

---

## 第四步：业务代码使用

```typescript
// 挂载组件
const avatarComp = headNode.getComponent(PlayerAvatarComponent)
                   || headNode.addComponent(PlayerAvatarComponent);

// 设置头像（自动区分 GIF / 静态图，url 空或过短时降级为默认头像）
avatarComp.SetRemote(playerData.avatar || "");

// 节点回收/复用：onDisable 自动 gifPlayer.clear() + decRef，无需手动清理
// 重新激活时 onEnable 自动显示默认头像
```

---

## 第五步：检查头像节点上的现有自定义组件

**在清除旧逻辑之前，必须先检查将挂载 `PlayerAvatarComponent` 的那些节点上是否已有其他自定义组件。** 若存在会自动设置 spriteFrame 的组件（如 `BaseCommon`、`AutoLoadSprite` 等），两者并存会造成头像互相覆盖，必须先删除。

### 5.1 枚举头像节点上的自定义组件

```python
import json, glob

PREFAB_PATHS = [
    "assets/resources/prefab/gameView/GamePlayerItem.prefab",
    "assets/resources/prefab/gameOver/GameOverPlayerItem.prefab",
    "assets/resources/prefab/lobby/LobbyPlayerItem.prefab",
    # 按实际情况添加
]
# 头像节点名（按实际情况调整）
HEAD_NODE_NAMES = {"headIcon", "head"}

for path in PREFAB_PATHS:
    with open(path) as f:
        data = json.load(f)
    for obj in data:
        if isinstance(obj, dict) and obj.get("_name") in HEAD_NODE_NAMES:
            comp_ids = [c["__id__"] for c in obj.get("_components", [])]
            print(f"\n{path} → {obj['_name']}")
            for cid in comp_ids:
                t = data[cid].get("__type__", "?")
                print(f"  [{cid}] {t}")
```

输出中 `cc.*` 开头是引擎内置组件（正常），**非 `cc.` 开头的均为自定义组件，需逐一排查**。

### 5.2 通过 UUID 查找对应脚本

Cocos Creator 在 prefab 中用压缩 UUID 表示组件类型，前 5 个字符与 `.meta` 文件的 `uuid` 字段前缀一致：

```bash
# 例：组件类型为 "c4271JfOgpGXLiAMB508ThK"，取前 5 位 "c4271" 搜索
grep -rn "c4271" assets/ --include="*.meta" | head -5
```

找到对应 `.ts` 文件后，阅读其 `onLoad` / `start` 逻辑，判断是否会写入 `spriteFrame`（典型：`SpritePath` 字段、`loadSpriteFrame`、`loadRemoteFrame` 调用）。若有，则必须删除。

### 5.3 从 prefab JSON 中删除冲突组件

Cocos prefab 是扁平 JSON 数组，删除对象后所有 `__id__` 引用必须重新编号。用以下 Python 脚本处理，**手动编辑极易出错，必须用脚本**：

```python
import json

def remove_component_from_prefab(filepath, comp_type):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    to_remove = set()
    for i, obj in enumerate(data):
        if isinstance(obj, dict) and obj.get('__type__') == comp_type:
            to_remove.add(i)
            # 同时删除紧跟的 cc.CompPrefabInfo
            prefab_id = obj.get('__prefab', {}).get('__id__')
            if prefab_id is not None:
                to_remove.add(prefab_id)

    # 构建旧→新 index 映射
    new_index = {}
    new_idx = 0
    for old_idx in range(len(data)):
        if old_idx not in to_remove:
            new_index[old_idx] = new_idx
            new_idx += 1

    def remap(obj):
        if isinstance(obj, dict):
            if '__id__' in obj:
                old_id = obj['__id__']
                if old_id in to_remove:
                    return None   # 标记删除
                return {'__id__': new_index[old_id]}
            result = {}
            for k, v in obj.items():
                if k == '_components' and isinstance(v, list):
                    remapped = [remap(item) for item in v]
                    result[k] = [x for x in remapped if x is not None]
                else:
                    result[k] = remap(v)
            return result
        elif isinstance(obj, list):
            return [remap(item) for item in obj]
        return obj

    new_data = [remap(data[i]) for i in range(len(data)) if i not in to_remove]
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(new_data, f, indent=2, ensure_ascii=False)
    print(f"Done: removed {len(to_remove)} objects, {len(new_data)} remain (was {len(data)})")

# 对每个含冲突组件的 prefab 调用
remove_component_from_prefab("assets/resources/prefab/gameView/GamePlayerItem.prefab", "c4271JfOgpGXLiAMB508ThK")
```

验证：
```bash
# 组件 UUID 不应再出现
grep -c "c4271JfOgpGXLiAMB508ThK" assets/resources/prefab/gameView/GamePlayerItem.prefab
# 应输出 0
```

### 5.4 清除 TS 代码对该组件的所有引用

```bash
# 搜索 import 和使用
grep -rn "BaseCommon\|AutoLoadSprite\|<组件类名>" assets/ --include="*.ts"
```

逐一处理：
- **import 行**：直接删除
- **事件监听**（如 `BaseCommonButtonClickEvent`）：若该组件是唯一 emit 方，确认无其他监听者后删除整个事件条目
- **框架层引用**（非该项目脚本）：用字符串字面量替换静态常量，解除对已删除文件的依赖
- **组件文件本身**（`.ts` + `.ts.meta`）：确认无任何外部引用后删除

```bash
# 最终验证：结果应为空（BaseCommon 替换为实际组件类名）
grep -rn "import.*BaseCommon\|BaseCommon\." assets/ --include="*.ts"
```

---

## 第六步：清除目标项目原有头像逻辑

目标项目通常有一套旧的头像方案，**必须全部清除并替换**，统一由 `PlayerAvatarComponent` 接管。混用两套系统会导致头像互相覆盖、内存泄漏、引用计数错乱。

**在开始搜索之前**，先用下方命令快速扫描现有头像相关代码：

```bash
grep -rn "avatar\|Avatar\|headUrl\|HeadComponent\|loadRemoteFrame\|RemoteSprite\|setHeadUrl" assets/script/ --include="*.ts" -l
```

若扫描结果与 6.1 中描述的旧版模式**不符合**（命名不同、结构迥异），**必须先向用户提问**，说明现有的头像逻辑结构，询问是否需要保留任何部分、调用入口在哪里，再继续后续操作。不要假设旧版结构，错误替换会导致功能丢失。

### 6.1 旧版系统识别（`HeadComponent` 模式）

本项目经历过的旧版架构如下，目标项目可能存在类似结构：

**旧版文件：** `HeadComponent.ts`（或同等命名的头像组件）

**特征代码：**

```typescript
// ❌ 旧版调用方（GamePlayer.ts 或类似）
import { HeadComponent } from './HeadComponent';
this.icon.node.getComponent(HeadComponent).setHeadUrl(urlDynamic, urlStatic);

// ❌ 旧版 HeadComponent 内部：每个组件独立持有帧，无共享缓存
private _spriteFrames: SpriteFrame[] = [];
private _delayGIF: number[] = [];

// ❌ 旧版 GIF 加载：直接 downloadAndParseGIF，无缓存
downloadAndParseGIF(url).then((gifInfo) => {
    for (let i = 0; i < gifInfo.frameInfo.length; i++) {
        const sp = SpriteFrame.createWithImage(imageAsset);
        this._spriteFrames.push(sp);   // 每个实例各自持有一份
    }
});

// ❌ 旧版静态图：直接 loadRemote，无缓存无引用计数
assetManager.loadRemote<ImageAsset>(url, { ext: '.png' }, (err, imgAsset) => {
    const sp = SpriteFrame.createWithImage(imgAsset);
    this._spComp.spriteFrame = sp;
});

// ❌ 旧版释放：直接 destroy()，不走引用计数，并发场景会崩溃
private safeRealseSpriteFrame(spFrame: SpriteFrame) {
    spFrame.decRef(false);
    const texture = spFrame.texture;
    if (texture) { texture.decRef(); texture.destroy(); }
    spFrame.destroy();
}
```

**旧版缺陷总结：**
- 无共享缓存：4 个头像节点加载同一 URL → 内存 × 4
- `destroy()` 直接销毁：并发回调时易崩溃（"frame should not be invalid"）
- 不支持旧版 `RemoteSpriteMgr.getRemoteSprite`（无 GIF、无 refCount）
- 无内存上限，多 GIF 并存时内存无限增长

### 6.2 先搜索，再动手

```bash
# 找出所有涉及头像的旧代码点
grep -rn "HeadComponent\|setHeadUrl\|getRemoteSprite\|_TEST_AVATAR\|AvatarCycleTest\|_onAvatarCycleTick\|clearSpriteFrames\|safeRealseSpriteFrame" assets/script/ --include="*.ts"
```

### 6.3 删除旧版头像组件文件

若存在 `HeadComponent.ts`（或类似文件），**整个文件删除**，并清理 prefab 中的组件引用（Cocos 会自动提示 missing script，在 Inspector 中移除即可）。

### 6.4 替换调用方代码

```typescript
// ❌ 旧版：HeadComponent.setHeadUrl
import { HeadComponent } from './HeadComponent';
node.getComponent(HeadComponent).setHeadUrl(url, url);

// ✓ 新版：PlayerAvatarComponent.SetRemote
import { PlayerAvatarComponent } from '../playerAvatar/PlayerAvatarComponent';
const avatarComp = node.getComponent(PlayerAvatarComponent)
                   || node.addComponent(PlayerAvatarComponent);
avatarComp.SetRemote(playerData.avatar || "");
```

### 6.5 删除测试/调试专用代码

| 识别特征 | 处理方式 |
|---------|---------|
| 硬编码 URL 数组（`picsum.photos`、`giphy.com`、`_TEST_AVATAR_URLS`） | 整块删除 |
| `startAvatarCycleTest()` / `stopAvatarCycleTest()` 方法 | 整块删除 |
| `_onAvatarCycleTick` 定时回调箭头函数 | 整块删除 |
| `_avatarCycleIndex` 等测试计数字段 | 删除字段声明 |
| `onEnable` 中对上述方法的调用 | 删除对应调用行 |

### 6.6 清理旧版 RemoteSpriteMgr 文件（若有）

若目标项目原来有旧版 `RemoteSpriteFrameManager.ts`（`CacheItem` 只有单个 `spriteFrame` 字段，无 `delays`/`refCount`/`memoryBytes`），**直接覆盖为新版文件**。

判断：
```bash
grep -n "acquireGif\|acquireStatic\|memoryBytes" assets/script/playerAvatar/RemoteSpriteFrameManager.ts
# 输出为空 → 旧版，需整体替换
```

### 6.7 最终验证——搜索结果应为空

```bash
grep -rn "HeadComponent\|setHeadUrl\|getRemoteSprite\|startAvatarCycleTest\|_TEST_AVATAR_URLS\|_onAvatarCycleTick\|safeRealseSpriteFrame\|clearSpriteFrames" assets/script/
```

---

## 第七步：迁移后检查清单

```
□ omggif 已安装（package.json 中有此依赖）
□ 所有文件 import 路径均正确，无红线
□ DEFAULT_AVATOR_FUNC 在 Entry 初始化时赋值，早于头像节点 onEnable
□ 默认头像图片资源已放入目标项目对应目录
□ SpriteFrameUtil 未与目标项目已有文件冲突（若有则合并方法）
□ 头像节点已用 Python 脚本扫描，非 cc.* 组件已逐一核查（第五步）
□ 冲突的自定义组件已从 prefab 中用脚本删除（__id__ 已重新编号）
□ 冲突组件的 .ts 和 .ts.meta 文件已删除，无任何残留 import
□ 旧版 HeadComponent.ts 已删除，prefab 中 missing script 已清除
□ 所有 setHeadUrl / getRemoteSprite 调用已替换为 PlayerAvatarComponent.SetRemote
□ 测试轮播代码已全部删除（第六步 6.7 搜索结果为空）
□ 旧版 RemoteSpriteFrameManager.ts 已覆盖为新版（含 acquireGif/acquireStatic）
□ 运行验证：onEnable 显示默认图；SetRemote 静态图/GIF 均正常显示
□ GIF 头像：帧动画正常播放，切换头像无闪白
```

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 头像白块/空白 | `DEFAULT_AVATOR_FUNC` 未赋值或赋值太晚 | 确保 Entry 初始化时赋值，早于场景节点 onEnable |
| GIF 不动 | `update()` 未被调用 | 确认节点 active，Component 的 `update` 会调用 `_gifPlayer.tick(dt)` |
| GIF 加载失败报 "not gif" | URL 返回非 GIF 内容（如 404 HTML） | 检查 URL 有效性；`downloadAndParseGIF` 通过魔术字节校验 |
| 渲染崩溃 "frame should not be invalid" | `safeReleaseResource` 释放了仍在使用的帧 | `removeUnusedCache` 已加 `allFramesFree` 检查，确保代码版本正确 |
| 节点复用后头像不更新 | `_url` 相同被跳过 | 确保节点入池时 `onDisable` 被触发以重置 `_url` |
| 内存持续增长 | 引用计数未正确 decRef | 所有动态设置 spriteFrame 的地方必须用 `SetSpriteFrameAutoRef` |
| GIF 内存过大 | 源图分辨率远大于显示尺寸 | 传入 `maxSize = _limitMinSize` 让缓存按显示尺寸降采样存储 |
