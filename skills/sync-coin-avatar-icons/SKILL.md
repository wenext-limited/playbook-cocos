---
name: sync-coin-avatar-icons
description: Use when syncing game_coin, coin, or defaultHead icon resources to another Cocos Creator game project. Triggers when user says "同步图标"、"迁移coin"、"迁移头像图标"、"同步资源" or mentions missing icon resources in a target project.
---

# sync-coin-avatar-icons

## Overview

将 `game_coin`、`coin`、`defaultHead` 三类图标资源同步到 Cocos Creator 游戏项目，并补全对应的加载逻辑。

**资源来源：本 skill 目录 `assets/` 子目录**（`assets/game_coin/`、`assets/coin/`、`assets/defaultHead/`），不依赖任何其他项目路径。skill 所在目录由调用时的 base directory 决定（参见调用时的 `Base directory for this skill:` 提示）。

**核心原则：必须先查询目标项目现有资源，再决定同步内容。** 目标项目可能已有语义相同但文件名不同的资源（如 `default_head.png` vs `icon_default.png`），严禁盲目复制造成资源重复。

**同步方向：skill assets 是唯一来源。** 同步操作 = 覆盖更新（用 skill 文件覆盖项目现有同语义文件）+ 删除多余（项目中有但 skill 中没有的文件及其 .meta 一并删除）。

这三类资源按 appName 命名约定（convention-based）由 `AppUtil` 动态拼接路径加载，**不走 game_different.json 配置**。

---

## 第一步（强制）：查询目标项目现有资源

**在做任何同步操作之前**，必须先在目标项目中搜索：

### 1. 读取 skill assets 文件名 + 目标项目现有文件

先读 skill（见"Skill 内置资源清单"章节的命令），再列目标项目现有文件：

```bash
ls assets/resources/ui/game_coin/*.png 2>/dev/null | xargs -I{} basename {}
ls assets/resources/ui/coin/*.png 2>/dev/null | xargs -I{} basename {}
ls assets/resources/ui/defaultHead/*.png 2>/dev/null | xargs -I{} basename {}
```

同时搜索语义相似的文件名（不同项目可能用不同命名）：

```bash
find assets/resources -name "*head*" -o -name "*avatar*" -o -name "*default*"
find assets/resources -name "*coin*" -o -name "*game_coin*"
```

### 2. 查看目标项目的加载代码

搜索目标项目中是否已有对应的加载逻辑：

```bash
# 在 TypeScript 文件中搜索 defaultHead / coin / game_coin 的引用
grep -r "defaultHead\|icon_default\|icon_coin\|game_coin" assets/ --include="*.ts" -l
grep -r "DEFAULT_AVATOR_FUNC\|getDefaultHead\|getCoinIcon\|getGameCoinIcon" assets/ --include="*.ts"
```

### 3. 逐一对比文件名（不能笼统说"都在"）

必须对每个文件做明确的对比表，四列：**Skill 文件名 | 项目现有文件 | 是否一致 | 动作**。每一行都必须明确写出动作，不能省略。

### 4. 判断决策

| 情况 | 处理方式 |
|------|----------|
| skill 有，项目有，内容相同 | 仍然覆盖（保证与 skill 一致） |
| skill 有，项目有，内容不同 | 用 skill 文件覆盖 |
| skill 有，项目无 | 新增到项目 |
| skill 无，项目有 | **删除项目文件及其 .meta** |
| 目标项目加载代码已存在但路径不同 | 适配加载代码，沿用目标项目路径规范 |

---

## Skill 内置资源清单

**不要在此处查阅文件名——文件名以 skill assets 目录的实际内容为准。** 每次执行时必须运行以下命令读取：

```bash
SKILL=<base_directory>/assets   # 替换为调用时的 base directory
ls "$SKILL/game_coin/"
ls "$SKILL/coin/"
ls "$SKILL/defaultHead/"
```

读取结果即为本次同步的完整文件列表，文件名即为目标文件名（直接复制，无需重命名）。

### AppName 枚举派生规则

**AppName 枚举值从 skill `coin/` 资源动态派生，不使用硬编码列表。** 每次执行时运行：

```bash
SKILL=<base_directory>/assets
ls "$SKILL/coin/"*.png | xargs -I{} basename {} .png
```

然后从输出中：
1. 去掉 `icon_coin`（通用 fallback，无 appName 后缀）
2. 去掉 `icon_coin_token`（特殊 token 图标，不对应任何 appName）
3. 其余文件去掉 `icon_coin_` 前缀

得到的字符串列表即为 **AppName 枚举的 value 完整列表**，必须与 `AppUtil.ts` 中的 `AppName` 枚举一一对应。

TypeScript 枚举 key（PascalCase）推导规则：

- 单词构成的 appName：首字母大写（如 `lama` → `Lama`）
- 多个英文单词拼合的 appName：按英文单词边界拆分，每个单词首字母大写（如 `gameparty` → `GameParty`、`lamaludo` → `LamaLudo`、`hichat` → `HiChat`）
- 拆分依据：用英文单词识别确定边界（`game`、`party`、`lama`、`ludo`、`chat`、`in`、`hi`、`we` 等常见词）

---

## 加载逻辑（目标项目必须包含以下三个部分）

检查目标项目现有代码后，按实际缺失情况补全——**已有且语义一致的逻辑不要重复添加**。

### 1. AppUtil.ts（`assets/framework/mgrs/AppUtil.ts`）

#### AppName 枚举

**枚举内容必须根据 Step 2 从 coin/ 派生的 appName 列表写入**，不得硬编码。格式：

```typescript
export enum AppName {
    // 每个 appName value 对应一项，key 按 PascalCase 规则推导
    // 示例结构（实际 key/value 以 coin/ 资源派生为准）：
    XxxYyy = "xxxyyy",
}
```

对比目标项目现有 AppName 枚举：
- skill coin/ 有但枚举缺少的 → **新增枚举项**
- 枚举有但 skill coin/ 已删除的 → **删除枚举项**

#### 三个加载方法

检查是否已有 `getGameCoinIcon()` / `getCoinIcon()` / `getDefaultHead()`。若缺失则补全：

```typescript
static getGameCoinIcon(): string {
    return `game_coin_${AppUtil.appName}`;
}

static getCoinIcon(useTokenCoin: boolean = false): string {
    return useTokenCoin ? 'icon_coin_token' : `icon_coin_${AppUtil.appName}`;
}

static getDefaultHead(): string {
    return !this.containAppName ? 'icon_default' : `icon_default_${AppUtil.appName}`;
}
```

> 若目标项目已有功能相同但方法名不同的实现，**沿用目标项目的方法名**，不要引入重复方法。

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
Step 1（强制）：列出 skill assets 实际文件名（ls "$SKILL/game_coin/"、"$SKILL/coin/"、"$SKILL/defaultHead/"）
Step 2：从 coin/ 文件列表派生 AppName 值列表（去掉 fallback + token，去掉前缀）
        - 对比目标项目 AppUtil.ts 中的 AppName 枚举，覆盖更新使其与派生列表一致
        - 新增 appName 补全枚举项；skill 中已删除的 appName 从枚举中删除
Step 3：列出目标项目现有文件，逐一对比每个 appName 变体，写出明确动作（覆盖/新增/删除/跳过）
Step 4：执行文件操作：
        - 覆盖/新增：从 skill assets 直接复制，文件名不变
        - 删除：rm 目标文件及其 .meta
        - 不要从 skill 复制 .meta 文件
Step 5：为缺少 .meta 的 PNG 批量生成 .meta（见下方脚本）
Step 6：检查并补全加载逻辑（已有且语义一致的不重复添加）
Step 7：验证（浏览器 dev 模式传入 appName 参数，检查图标显示）
```

### .meta 批量生成说明（Step 5）

**覆盖的文件已有 .meta，无需处理。只对没有 .meta 的 PNG 生成。**

UUID 来源：`uuidgen` 生成标准 UUID v4，2¹²² 种可能，碰撞概率可忽略。
Cocos Creator 看到 .meta 已存在时直接使用其中的 UUID，不会重新分配。

执行以下脚本，自动扫描三个目录中所有缺少 .meta 的 PNG 并生成：

```bash
gen_meta() {
    local png="$1"
    local name
    name=$(basename "$png" .png)
    local uuid
    uuid=$(uuidgen | tr '[:upper:]' '[:lower:]')
    local w h
    w=$(sips -g pixelWidth  "$png" 2>/dev/null | awk '/pixelWidth/{print $2}')
    h=$(sips -g pixelHeight "$png" 2>/dev/null | awk '/pixelHeight/{print $2}')
    local hw=$((w/2)) hh=$((h/2))
    cat > "${png}.meta" << METAEOF
{
  "ver": "1.0.25",
  "importer": "image",
  "imported": true,
  "uuid": "${uuid}",
  "files": [".json", ".png"],
  "subMetas": {
    "6c48a": {
      "importer": "texture",
      "uuid": "${uuid}@6c48a",
      "displayName": "${name}",
      "id": "6c48a",
      "name": "texture",
      "userData": {
        "wrapModeS": "clamp-to-edge",
        "wrapModeT": "clamp-to-edge",
        "imageUuidOrDatabaseUri": "${uuid}",
        "isUuid": true,
        "visible": false,
        "minfilter": "linear",
        "magfilter": "linear",
        "mipfilter": "none",
        "anisotropy": 0
      },
      "ver": "1.0.22",
      "imported": true,
      "files": [".json"],
      "subMetas": {}
    },
    "f9941": {
      "importer": "sprite-frame",
      "uuid": "${uuid}@f9941",
      "displayName": "${name}",
      "id": "f9941",
      "name": "spriteFrame",
      "userData": {
        "trimType": "auto",
        "trimThreshold": 1,
        "rotated": false,
        "offsetX": 0,
        "offsetY": 0,
        "trimX": 0,
        "trimY": 0,
        "width": ${w},
        "height": ${h},
        "rawWidth": ${w},
        "rawHeight": ${h},
        "borderTop": 0,
        "borderBottom": 0,
        "borderLeft": 0,
        "borderRight": 0,
        "packable": true,
        "pixelsToUnit": 100,
        "pivotX": 0.5,
        "pivotY": 0.5,
        "meshType": 0,
        "vertices": {
          "rawPosition": [-${hw},-${hh},0,${hw},-${hh},0,-${hw},${hh},0,${hw},${hh},0],
          "indexes": [0,1,2,2,1,3],
          "uv": [0,${h},${w},${h},0,0,${w},0],
          "nuv": [0,0,1,0,0,1,1,1],
          "minPos": [-${hw},-${hh},0],
          "maxPos": [${hw},${hh},0]
        },
        "isUuid": true,
        "imageUuidOrDatabaseUri": "${uuid}@6c48a",
        "atlasUuid": ""
      },
      "ver": "1.0.11",
      "imported": true,
      "files": [".json"],
      "subMetas": {}
    }
  },
  "userData": {
    "type": "sprite-frame",
    "fixAlphaTransparencyArtifacts": true,
    "hasAlpha": true,
    "redirect": "${uuid}@f9941"
  }
}
METAEOF
    echo "generated: ${png}.meta"
}

# 扫描三个目录，对所有缺少 .meta 的 PNG 自动生成
for dir in "$TARGET/game_coin" "$TARGET/coin" "$TARGET/defaultHead"; do
    for png in "$dir"/*.png; do
        [ -f "${png}.meta" ] || gen_meta "$png"
    done
done
```

> **注意**：trimX/trimY 使用无裁切默认值（与图片实际尺寸相同）。
> 编辑器下次打开时会根据 PNG 像素重新计算 trim 数据并更新 .meta，不影响正常使用。

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 图标显示白块 | 资源路径拼接错误或文件不存在 | 检查 `AppUtil.appName` 是否已赋值，核对实际文件名 |
| defaultHead 不生效 | `DEFAULT_AVATOR_FUNC` 未注册 | 在 Main.ts `initFramework()` 中添加注册 |
| 新 appName 没有专属变体 | 命名约定找不到对应文件 | `getDefaultHead()` 的 `containAppName` 判断会 fallback 到通用文件；game_coin/coin 同理 |
| .meta 文件报错 | 跨项目复制了 .meta | 删除复制的 .meta，重新执行 Step 5 的 gen_meta 脚本 |
| 图标不显示（加载返回 null） | .meta 未生成或 type 配置异常 | 检查 .meta 是否存在；重新执行 gen_meta 脚本，或在 Inspector 手动改 type 为 sprite-frame 并 Apply |
| 图片边缘重复/撕裂 | wrapMode 配置异常（极少见） | 在 Inspector 将 Wrap Mode S/T 改为 clamp 并 Apply |
| 目标项目资源路径与 jackaroo 不同 | 各项目目录规范不统一 | 以目标项目现有路径为准，调整 `Tool.ts` 中的拼接字符串而非强行对齐到 jackaroo |
