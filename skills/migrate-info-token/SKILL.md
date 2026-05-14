---
name: migrate-info-token
description: 将 info_token.prefab（代币信息弹出面板）及其脚本 CoinTokenInfoComp、纹理资源从 cocos-game-dragontiger 项目迁移到新 Cocos Creator 项目。当用户说"迁移info_token"、"迁移代币信息面板"、"迁移CoinTokenInfoComp"、"migrate info token"、"migrate coin token info"时使用此 skill。
argument-hint: [目标项目路径]
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash]
---

# info_token 代币信息面板迁移指南

你是 Cocos Creator 项目迁移专家。本指南基于 `cocos-game-dragontiger` 项目提炼，包含完整的文件清单、依赖说明、集成方式和验证步骤。

**源项目**: `/Users/zengxingxing/cocosGame/cocos-game-dragontiger`

---

## 模块说明

`info_token.prefab` 是代币信息弹出面板，点击 `btnTokenInfo` 按钮时弹出，显示当前玩家持有的幸运币数量和金币数量，带缩放 Tween 动画，点击背景遮罩关闭。

### 节点树

```
info_token (root) [CoinTokenInfoComp]
├── nodeBlock         [Button — 点击遮罩关闭面板]
└── layout            [Layout, Sprite — info_bg.png 背景]
    ├── nodeluckyCoins [Layout, Sprite — lucky_coin.png]
    │   ├── labelToken    [Label, LanguageLabel — 多语言标签]
    │   └── nodeToken     [Layout]
    │       ├── labelTokenNum [Label — 幸运币数量]
    │       └── icon          [Sprite — 幸运币图标]
    ├── nodeluckLine
    │   └── info_line   [Sprite — info_line.png 分割线]
    └── nodeCoins      [Layout]
        ├── labelCoin     [Label, LanguageLabel — 多语言标签]
        └── nodeCoin      [Layout]
            ├── labelCoinNum [Label — 金币数量]
            └── icon         [Sprite — 金币图标]
```

---

## 第一步：探查目标项目

```bash
SRC=/Users/zengxingxing/cocosGame/cocos-game-dragontiger
DST=<目标项目绝对路径>

# 检查是否已有 CoinTokenInfoComp
Grep: pattern="CoinTokenInfoComp", path=$DST/assets

# 检查外部依赖是否存在
Glob: pattern="**/AppUtil.ts", path=$DST/assets
Glob: pattern="**/Utils.ts", path=$DST/assets
Glob: pattern="**/SubSingletonModuleComp.ts", path=$DST/assets

# 检查 oops-plugin-framework
Glob: pattern="**/Oops.ts", path=$DST

# 检查字体是否已存在
find "$DST" -name "Montserrat-Regular.ttf" 2>/dev/null

# 检查 icon_coin.png 是否已存在
find "$DST" -name "icon_coin.png" 2>/dev/null
```

记录缺失项，下面按「缺失则迁移」原则执行。

---

## 第二步：复制文件

执行脚本完成文件复制（脚本已内置在本 skill 中）：

```bash
bash ~/.claude/skills/migrate-info-token/scripts/copy_files.sh <目标项目绝对路径>
```

脚本会复制以下内容：
- `info_token.prefab` + `.meta` → 目标项目同路径
- `CoinTokenInfoComp.ts` + `.meta` → 目标项目同路径
- `texture/coinToken/` 下 3 张图 + 各自 `.meta`
- `texture/coin/icon_coin.png` + `.meta`（若目标项目已有则跳过）
- `fonts/Montserrat-Regular.ttf` + `.meta`（若目标项目已有则跳过）

---

## 第三步：适配外部依赖

### 3.1 CoinTokenInfoComp.ts 的 import 依赖

| import | 路径 | 说明 |
|--------|------|------|
| `sub_smc` | `../ecs/SubSingletonModuleComp` | ECS 单例，提供 `UserGameModel` |
| `AppUtil` | `../util/AppUtil` | 提供 `getCurrencyNameKey()` 和 `getCoinIcon()` |
| `Utils` | `../util/Utils` | 提供 `setCoinSprite()` |
| `oops` | `db://oops-framework/core/Oops` | oops-plugin-framework 框架 |

复制完成后检查目标项目中这些模块是否存在，若路径不同需修改 import 路径。

### 3.2 CoinTokenInfoComp 依赖的接口

```typescript
// sub_smc 需提供：
sub_smc.subGame.UserGameModel.getMyCoinTokenNum(): number
sub_smc.subGame.UserGameModel.getMyCoinNum(): number

// AppUtil 需提供：
AppUtil.getCurrencyNameKey(): string     // 返回多语言 key
AppUtil.getCoinIcon(bToken?: boolean): string  // 返回图标资源路径

// Utils 需提供：
Utils.setCoinSprite(sprite: Sprite, iconPath: string): void

// oops 需提供：
oops.language.getLangByID(key: string): string
```

---

## 第四步：修改消费方文件

`info_token.prefab` **不是动态 instantiate**，而是作为子节点预先放置在 `btnTokenInfo` 节点下（在场景/父预制体中静态绑定）。

### 4.1 NodeBetChipsComponent.ts（或目标项目等效组件）

在 `onOnCoinTokenOpenChange()` 中（当代币系统开启时），获取组件并绑定按钮事件：

```typescript
import { CoinTokenInfoComp } from './CoinTokenInfoComp';

// 成员变量
private _btnTokenInfo: Node;
private _coinTokenInfoComp: CoinTokenInfoComp;

onOnCoinTokenOpenChange() {
    const btnTokenInfo = this._btnTokenInfo;
    const coinTokenOpen = AppUtil.isCoinTokenSystemOpen;
    btnTokenInfo.active = coinTokenOpen;

    if (coinTokenOpen) {
        // info_token 是 btnTokenInfo 的子节点，getChildByName 获取组件
        this._coinTokenInfoComp = btnTokenInfo
            .getChildByName('info_token')
            .getComponent(CoinTokenInfoComp);

        btnTokenInfo.on(Button.EventType.CLICK, () => {
            this._coinTokenInfoComp.onClickTokenBtn();
        });
    }
}
```

### 4.2 场景 / 父预制体

在编辑器中确保 `btnTokenInfo` 节点下有 `info_token.prefab` 的实例（拖入预制体）。`info_token` 节点默认 `active = false`，由 `CoinTokenInfoComp.onClickTokenBtn()` 控制显隐。

---

## 第五步：验证清单

```bash
DST=<目标项目绝对路径>

# 文件存在性
ls "$DST/assets/GameBundle/dragontiger/prefab/scene/info_token.prefab"
ls "$DST/assets/GameBundle/dragontiger/script/component/CoinTokenInfoComp.ts"
ls "$DST/assets/GameBundle/dragontiger/texture/coinToken/lucky_coin.png"
ls "$DST/assets/GameBundle/dragontiger/texture/coinToken/info_line.png"
ls "$DST/assets/GameBundle/dragontiger/texture/coinToken/info_bg.png"
ls "$DST/assets/GameBundle/dragontiger/texture/coin/icon_coin.png"
ls "$DST/assets/GameBundle/dragontiger/fonts/Montserrat-Regular.ttf"

# 引用完整性
Grep: pattern="CoinTokenInfoComp", include="*.ts", path=$DST/assets
# 预期：CoinTokenInfoComp.ts（定义）、NodeBetChipsComponent.ts（引用）

Grep: pattern="info_token", include="*.ts", path=$DST/assets
# 预期：NodeBetChipsComponent.ts（getChildByName）
```

---

## 常见适配问题

### 问题 1：sub_smc 不存在
目标项目若无 ECS 单例体系，需将 `getMyCoinTokenNum()` 和 `getMyCoinNum()` 替换为目标项目的等效数据获取方式。

### 问题 2：oops-plugin-framework 路径不同
`db://oops-framework/core/Oops` 是数据库别名路径，目标项目若 oops 版本或安装位置不同，需调整该 import。

### 问题 3：LanguageLabel 组件丢失
prefab 内 label 节点上挂有 `LanguageLabel`（来自 oops-plugin-framework）。若目标项目 oops 版本不同，编辑器打开 prefab 时该组件会报 missing，需手动重新绑定或删除该组件，改为代码动态设置文本。

### 问题 4：icon_coin.png 在目标项目已存在但 UUID 不同
复制脚本默认跳过已存在的 icon_coin.png。若 prefab 内 Sprite 引用的 UUID 与目标项目已有图片 UUID 不一致，需在编辑器中手动重新指定 SpriteFrame。

### 问题 5：Layout 自动更新宽度逻辑异常
`updateLayout()` 方法在下一帧（`scheduleOnce 0.1s`）调用，依赖 Layout 组件的 `ResizeMode.CONTAINER` 自动计算宽度。若目标项目 Cocos 版本差异导致 Layout 行为变化，可能需要调整 `maxSpace_x`（当前值 56）。

---

## 已验证项目

| 项目 | 状态 |
|------|------|
| cocos-game-dragontiger | 源项目，完整实现 |
