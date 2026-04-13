---
name: cocos-scene-management
description: 需要管理场景切换、Asset Bundle 懒加载、子游戏入口时使用。不适用于单场景无 Bundle 的简单项目。
tags: [cocos, scene, bundle, lazy-load]
inputs: [子游戏名称, Bundle配置, 入口组件]
outputs: [Bundle目录结构, 子游戏入口类, Bundle加载流程]
---

# 场景与 Bundle 管理

## 概述

Cocos Creator 的 Asset Bundle 系统允许将游戏拆分为多个可独立加载的模块。本技能指导如何组织 Bundle 结构和子游戏入口。

## Bundle 架构

```
assets/
├── script/                 # 全局脚本（主 Bundle）
├── GameBundle/             # 子游戏 Bundle 容器
│   ├── greedybox/         # 子游戏 A
│   ├── hall/              # 大厅
│   └── newgame/           # 子游戏 B
└── main.scene             # 主场景（加载入口）
```

### Bundle 配置

在 Cocos Creator 编辑器中：

1. 选择 `assets/GameBundle/<game-name>` 文件夹
2. 在属性面板勾选 `Is Bundle`
3. 设置 Bundle 名称（如 `greedybox`）
4. 设置优先级和压缩类型

## 子游戏入口类

每个子游戏需要一个入口组件 `SubGameEntry`，挂载在子游戏场景的根节点上：

```typescript
import { _decorator, Component, Game, game, Prefab } from "cc";
const { ccclass } = _decorator;
import { oops } from "path/to/oops-framework/core/Oops";
import { sub_smc } from "./ecs/SubSingletonModuleComp";
import { smc } from "global/ecs/SingletonModuleComp";
import { SubUIConfigData, SubUIID } from "./config/SubGameUIConfig";
import { soundManager } from "global/mgrs/SoundManager";
import { AudioClips } from "./data/AudioClips";

@ccclass("SubGameEntry")
export class SubGameEntry extends Component {
    protected onLoad(): void {
        // 1. 扩展 GUI 配置（注册子游戏的 UI）
        this.expandGuiConfig();

        // 2. 初始化 ECS
        oops.ecs.init();

        // 3. 播放背景音乐
        soundManager.PlayBackgroundMusic(AudioClips.BGM);

        // 4. 设置语言
        oops.language.setLanguage(smc.initialize.getLangCode(), () => {});

        // 5. 监听网络恢复
        window?.addEventListener("online", () => {
            sub_smc.subGame.getUserGameInfo();
        });

        // 6. 监听前后台切换
        game.on(Game.EVENT_SHOW, () => {
            soundManager.canPlaySound = true;
            soundManager.ResumeBackGroundMusic();
        });
        game.on(Game.EVENT_HIDE, () => {
            soundManager.canPlaySound = false;
            soundManager.StopAllSoundAndMusic();
        });

        // 7. 预加载资源
        this.preloadResource();
    }

    protected start(): void {
        // 初始化子游戏单例
        sub_smc.init();
    }

    private expandGuiConfig() {
        // 将子游戏 UI 配置注册到全局 GUI 管理器
        LayerManagerExtension.ExpandGuiConfig(SubUIConfigData);
    }

    preloadResource() {
        // 预加载关键 UI 预制体
        const uiConfig = oops.gui.getConfig(SubUIID.TotualRank);
        oops.res.loadAsync(oops.res.defaultBundleName, uiConfig.prefab, Prefab);
    }
}
```

## Bundle 加载方式

### 动态打开 Bundle 中的 UI

```typescript
// 子游戏 UI 配置自动带有 bundle 属性
export var SubUIConfigData: { [key: number]: UIConfig } = {
    [SubUIID.Settlement]: {
        layer: LayerType.UI,
        prefab: "prefab/panel/panelSettlement"
    },
};

// 自动加 bundle 名
for (let key in SubUIConfigData) {
    SubUIConfigData[key].bundle = gameBundleName;
}

// 打开 UI（框架自动按 bundle 加载）
oops.gui.open(SubUIID.Settlement);
```

### 手动加载 Bundle 资源

```typescript
// 从指定 bundle 加载资源
oops.res.load("texture/box/box_close_1/spriteFrame", (err, spriteFrame) => {
    if (!err && spriteFrame) {
        sprite.spriteFrame = spriteFrame;
    }
});
```

## 子游戏 UI 配置表

```typescript
export enum SubUIID {
    SubGame = 1000,       // 起始ID避免与全局冲突
    Rule,
    MyRecords,
    Settlement,
    PlayerRank,
    TipPause,
    TipRecharge,
    TipToast,
    CoinBankFly,
}

export const gameBundleName = "greedybox";
```

**命名规范**：子游戏的 UIID 从 1000 开始编号，避免与全局 UIID 冲突。

## 前后台生命周期

```typescript
// 游戏切到前台
game.on(Game.EVENT_SHOW, () => {
    soundManager.ResumeBackGroundMusic();
    sub_smc.subGame.getUserGameInfo();  // 刷新数据
});

// 游戏切到后台
game.on(Game.EVENT_HIDE, () => {
    soundManager.StopAllSoundAndMusic();
});
```

## 清单

- [ ] 子游戏文件夹已配置为 Bundle
- [ ] SubGameEntry 组件已挂载到场景根节点
- [ ] SubUI 配置表已创建且 UIID 无冲突
- [ ] 子游戏单例 `sub_smc` 已定义
- [ ] 前后台生命周期已处理
- [ ] 预加载逻辑已实现

## 相关技能

- `cocos-project-setup` — 项目脚手架
- `cocos-ui-system` — UI 层级系统
- `oops-framework` — 框架核心
