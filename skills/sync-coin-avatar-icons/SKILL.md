---
name: sync-coin-avatar-icons
description: Use when syncing game_coin, coin, or defaultHead icon resources to another Cocos Creator game project. Triggers when user says "同步图标"、"迁移coin"、"迁移头像图标"、"同步资源" or mentions missing icon resources in a target project.
---

# sync-coin-avatar-icons

## Overview

将 `game_coin`、`coin`、`defaultHead` 三类图标资源同步到 Cocos Creator 游戏项目，并补全对应的加载逻辑。

**资源来源：本 skill 目录 `assets/` 子目录**（`assets/game_coin/`、`assets/coin/`、`assets/defaultHead/`），不依赖任何其他项目路径。

**核心原则：必须先查询目标项目现有资源，再决定同步内容。** 目标项目可能已有语义相同但文件名不同的资源（如 `default_head.png` vs `icon_default.png`），严禁盲目复制造成资源重复。

这三类资源按 appName 命名约定（convention-based）由 `AppUtil` 动态拼接路径加载，**不走 game_different.json 配置**。

---

## 第一步（强制）：查询目标项目现有资源

**在做任何同步操作之前**，必须先在目标项目中搜索：

### 1. 列出目标项目现有的图标文件

```bash
# 查找目标项目 ui 目录下所有与 coin/head/avatar 相关的图片
ls assets/resources/ui/
ls assets/resources/ui/game_coin/ 2>/dev/null
ls assets/resources/ui/coin/ 2>/dev/null
ls assets/resources/ui/defaultHead/ 2>/dev/null
```

同时搜索语义相似的文件名（不同项目可能用不同命名）：

```bash
# 搜索头像相关
find assets/resources -name "*head*" -o -name "*avatar*" -o -name "*default*"
# 搜索金币相关
find assets/resources -name "*coin*" -o -name "*game_coin*"
```

### 2. 查看目标项目的加载代码

搜索目标项目中是否已有对应的加载逻辑：

```bash
# 在 TypeScript 文件中搜索 defaultHead / coin / game_coin 的引用
grep -r "defaultHead\|icon_default\|icon_coin\|game_coin" assets/ --include="*.ts" -l
grep -r "DEFAULT_AVATOR_FUNC\|getDefaultHead\|getCoinIcon\|getGameCoinIcon" assets/ --include="*.ts"
```

### 3. 判断决策

| 情况 | 处理方式 |
|------|----------|
| 目标项目已有同名文件且内容一致 | **跳过**，无需同步 |
| 目标项目已有语义相同但命名不同的文件 | **不复制新文件**，调整加载代码指向已有文件 |
| 目标项目加载代码已存在但路径与 jackaroo 不同 | **适配加载代码**，沿用目标项目的路径规范 |
| 目标项目完全缺失该资源 | 从 jackaroo 复制对应 appName 的变体及 fallback |

---

## Skill 内置资源清单

所有图片存放在本 skill 目录的 `assets/` 下，路径形如：
`~/.claude/skills/sync-coin-avatar-icons/assets/{类型}/{文件名}.png`

### `assets/game_coin/` — 游戏内顶部金币大图标
```
game_coin.png            ← 通用 fallback（必须有）
game_coin_inchat.png
game_coin_lamaludo.png
game_coin_gameparty.png
```
> wyak / weparty / fungo / yoki / hichat / lama 暂无专属变体，运行时 fallback 到 `game_coin.png`

### `assets/coin/` — 小金币图标（Emoji 场景等）
```
icon_coin.png            ← 通用 fallback（必须有）
icon_coin_fungo.png
icon_coin_gameparty.png
icon_coin_hichat.png
icon_coin_inchat.png
icon_coin_lama.png
icon_coin_lama_token.png ← lama 专属 token 图标
icon_coin_lamaludo.png
icon_coin_weparty.png
icon_coin_wyak.png
icon_coin_yoki.png
```

### `assets/defaultHead/` — 玩家默认头像
```
icon_default.png         ← 通用 fallback（必须有）
icon_default_fungo.png
icon_default_gameparty.png
icon_default_hichat.png
icon_default_inchat.png
icon_default_lama.png
icon_default_lamaludo.png
icon_default_weparty.png
icon_default_wyak.png
icon_default_yoki.png
```

**appName 枚举完整列表**（`AppUtil.AppName`）：
`lamaludo`, `lama`, `hayi`, `wyak`, `weparty`, `inchat`, `hichat`, `fungo`, `yoki`, `gameparty`

---

## 加载逻辑（目标项目必须包含以下三个部分）

检查目标项目现有代码后，按实际缺失情况补全——**已有且语义一致的逻辑不要重复添加**。

### 1. AppUtil.ts（`assets/framework/mgrs/AppUtil.ts`）

检查是否已有 `getGameCoinIcon()` / `getCoinIcon()` / `getDefaultHead()` 三个方法。若缺失则补全：

```typescript
export enum AppName {
    LamaLudo = "lamaludo",
    Lama = "lama",
    Hayi = "hayi",
    Wyak = "wyak",
    WeParty = "weparty",
    InChat = 'inchat',
    HiChat = 'hichat',
    Fungo = 'fungo',
    Yoki = 'yoki',
    GameParty = 'gameparty'
}

export class AppUtil {
    static _appName: string = '';
    static set appName(name: string) {
        this._appName = name || '';
        this.containAppName = this._appName;
    }
    static get appName(): string { return this._appName; }

    private static _containAppName: boolean = false;
    static get containAppName(): boolean { return this._containAppName; }
    static set containAppName(appName: string) {
        for (const key in AppName) {
            if (AppName[key as keyof typeof AppName] === appName) {
                this._containAppName = true;
                break;
            }
        }
    }

    static getGameCoinIcon(): string {
        return `game_coin_${AppUtil.appName}`;
    }

    static getCoinIcon(useTokenCoin: boolean = false): string {
        return useTokenCoin ? 'icon_coin_yoki_token' : `icon_coin_${AppUtil.appName}`;
    }

    static getDefaultHead(): string {
        return !this.containAppName ? 'icon_default' : `icon_default_${AppUtil.appName}`;
    }
}
```

> 若目标项目 `AppUtil` 中已有功能相同但方法名不同的实现（如 `getAvatarPath()`），**沿用目标项目的方法名**，不要引入重复方法。

### 2. Tool.ts — 加载方法

检查目标项目是否已有货币图标/默认头像的加载方法。若缺失则补全：

```typescript
static setCurrencyIcon(sprite: Sprite, currencyName: string = CurrencyName.GameCoin) {
    const staticUrl = CurrencyTexture[currencyName];
    if (staticUrl) {
        Tool.setSpriteFrame(sprite, staticUrl);
        return;
    }
    const url = currencyName === CurrencyName.Coin
        ? `ui/coin/${AppUtil.getCoinIcon()}`
        : `ui/game_coin/${AppUtil.getGameCoinIcon()}`;
    Tool.setSpriteFrame(sprite, url);
}

static setDefaultHeadSpriteFrame(sp: Sprite, cb: Function = null) {
    this.setSpriteFrame(sp, `ui/defaultHead/${AppUtil.getDefaultHead()}`, cb);
}

// 底层加载，用 resources.load
static setSpriteFrame(sprite: Sprite, url: string, callback?: Function) {
    url += "/spriteFrame";
    resources.load(url, (err, sp: SpriteFrame) => {
        if (err || !sprite?.isValid) { return; }
        sprite.spriteFrame = sp;
        callback?.();
    });
}
```

### 3. Main.ts — DEFAULT_AVATOR_FUNC 注册

检查入口文件 `initFramework()` 中是否已有 `DEFAULT_AVATOR_FUNC` 的注册。若缺失则在 `GameFrame.init` 之前插入：

```typescript
import { PlayerAvatarComponent } from './playerAvatar/PlayerAvatarComponent';
import { AppUtil } from '../framework/mgrs/AppUtil';

PlayerAvatarComponent.DEFAULT_AVATOR_FUNC = (callback) => {
    const url = `ui/defaultHead/${AppUtil.getDefaultHead()}/spriteFrame`;
    resources.load(url, (err: Error | null, sp: SpriteFrame) => {
        if (!err && sp) callback(sp);
    });
};
```

---

## 同步步骤汇总

```
Step 1（强制）：在目标项目搜索现有资源文件和加载代码
Step 2：确认目标项目支持的 appName（读 AppUtil.ts 中的 AppName 枚举）
Step 3：对比缺失的图片文件，仅同步目标项目实际需要的 appName 变体及 fallback
Step 4：从本 skill 的 assets/ 目录复制所需 .png 到目标项目（不要复制 .meta）
Step 5：在 Cocos 编辑器中配置图片属性（见下方"编辑器属性配置"）
Step 6：检查并补全加载逻辑（已有的不重复添加；命名不同时适配目标项目命名）
Step 7：验证（浏览器 dev 模式传入 appName 参数，检查图标显示）
```

### 编辑器属性配置（Step 5，必须执行）

**每一张复制进来的 .png 都必须在 Cocos 编辑器中完成以下设置：**

1. 在 Assets 面板中选中新增的 PNG 文件
2. Inspector 面板 → **Type** 改为 `sprite-frame`
3. Inspector 面板 → **Wrap Mode S / Wrap Mode T** 均改为 `clamp`
4. 点击右上角 **Apply** 保存

> 可以在 Assets 面板中框选同一目录下所有新增图片后批量修改，一次 Apply 即可全部生效。

**不配置的后果：**
- Type 不设为 `sprite-frame`：`resources.load(..., SpriteFrame)` 加载返回 null，图标不显示
- Wrap Mode 不设为 `clamp`：图片边缘出现重复/撕裂瑕疵

**复制命令模板**（按需替换 `TARGET` 和需要的文件）：
```bash
SKILL=~/.claude/skills/sync-coin-avatar-icons/assets
TARGET=/path/to/target-project/assets/resources/ui

# 复制 fallback（任何项目必须有）
cp "$SKILL/game_coin/game_coin.png"   "$TARGET/game_coin/"
cp "$SKILL/coin/icon_coin.png"        "$TARGET/coin/"
cp "$SKILL/defaultHead/icon_default.png" "$TARGET/defaultHead/"

# 按需复制 appName 变体，例如 lamaludo：
cp "$SKILL/game_coin/game_coin_lamaludo.png"    "$TARGET/game_coin/"
cp "$SKILL/coin/icon_coin_lamaludo.png"         "$TARGET/coin/"
cp "$SKILL/defaultHead/icon_default_lamaludo.png" "$TARGET/defaultHead/"
```

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 图标显示白块 | 资源路径拼接错误或文件不存在 | 检查 `AppUtil.appName` 是否已赋值，核对实际文件名 |
| defaultHead 不生效 | `DEFAULT_AVATOR_FUNC` 未注册 | 在 Main.ts `initFramework()` 中添加注册 |
| 新 appName 没有专属变体 | 命名约定找不到对应文件 | `getDefaultHead()` 的 `containAppName` 判断会 fallback 到通用文件；game_coin/coin 同理 |
| .meta 文件报错 | 跨项目复制了 .meta | 删除复制的 .meta，在编辑器中刷新让编辑器重新生成 |
| 图标不显示（加载返回 null） | PNG Type 未设为 `sprite-frame` | 在编辑器 Inspector 中将 Type 改为 `sprite-frame` 并 Apply |
| 图片边缘重复/撕裂 | Wrap Mode 未设为 `clamp` | 将 Wrap Mode S 和 T 均改为 `clamp` 并 Apply |
| 目标项目资源路径与 jackaroo 不同 | 各项目目录规范不统一 | 以目标项目现有路径为准，调整 `Tool.ts` 中的拼接字符串而非强行对齐到 jackaroo |
