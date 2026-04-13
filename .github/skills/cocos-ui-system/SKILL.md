---
name: cocos-ui-system
description: 构建 UI 层级系统、弹窗管理、Panel 开关和配置表时使用。不适用于纯逻辑组件或非 UI 相关任务。
tags: [cocos, ui, panel, popup, layer]
inputs: [UI类型, 层级, 预制体路径]
outputs: [UIConfig配置, Panel组件, 层级管理]
---

# UI 层级与 Panel 系统

## 概述

基于 OOPS 框架的 LayerManager 实现分层 UI 管理。所有 UI 通过 UIID + 配置表驱动，支持自动加载、层级排序和生命周期管理。

## UI 层级

```typescript
enum LayerType {
    UI = 0,           // 主游戏 UI（全屏界面）
    PopUp = 1,        // 模态弹窗（遮罩层）
    Dialog = 2,       // 系统对话框
    UIEffect = 3,     // 特效层（飞币、粒子）
}
```

### 层级选择指南

| 层级 | 使用场景 | 示例 |
|------|----------|------|
| `UI` | 全屏或半屏的主界面 | 游戏主界面、结算面板 |
| `PopUp` | 需要遮罩的弹窗 | 规则说明、排行榜、我的记录 |
| `Dialog` | 系统级弹窗 | 确认对话框、错误提示 |
| `UIEffect` | 不阻挡交互的特效 | 飘币动画、代币收集 |

## 配置表定义

### UIID 枚举

```typescript
export enum SubUIID {
    SubGame = 1000,        // 子游戏内 ID 从 1000 开始
    Rule,                  // 1001
    MyRecords,             // 1002
    Settlement,            // 1003
    PlayerRank,            // 1004
    TipPause,              // 1005
    TipRecharge,           // 1006
    TipToast,              // 1007
    CoinBankFly,           // 1008
    JeckpotWin,            // 1009
}
```

### 配置映射

```typescript
export var SubUIConfigData: { [key: number]: UIConfig } = {
    [SubUIID.Rule]:        { layer: LayerType.PopUp, prefab: "prefab/panel/panelRule" },
    [SubUIID.MyRecords]:   { layer: LayerType.PopUp, prefab: "prefab/panel/panelMyRecords" },
    [SubUIID.Settlement]:  { layer: LayerType.UI,    prefab: "prefab/panel/panelSettlement" },
    [SubUIID.PlayerRank]:  { layer: LayerType.PopUp, prefab: "prefab/panel/panelRank" },
    [SubUIID.TipPause]:    { layer: LayerType.UI,    prefab: "prefab/tips/tipPause" },
    [SubUIID.TipToast]:    { layer: LayerType.UI,    prefab: "prefab/tips/tipToast" },
    [SubUIID.CoinBankFly]: { layer: LayerType.UIEffect, prefab: "prefab/panel/panelCoinBankFly" },
    [SubUIID.JeckpotWin]:  { layer: LayerType.UI,    prefab: "prefab/panel/panelJeckpotWin" },
};

// 自动为配置加上 bundle 名
for (let key in SubUIConfigData) {
    SubUIConfigData[key].bundle = gameBundleName;
}
```

## UI 操作 API

### 打开 UI

```typescript
// 直接打开
oops.gui.open(SubUIID.Settlement);

// 带参数打开
oops.gui.open(SubUIID.TipToast, "操作成功");

// 异步打开（返回 Promise）
await oops.gui.openAsync(SubUIID.TipPause);
```

### 关闭 UI

```typescript
// 关闭并销毁
oops.gui.remove(SubUIID.Settlement);

// 关闭但不销毁（下次打开更快）
oops.gui.remove(SubUIID.Settlement, false);
```

## Panel 组件模板

```typescript
import { _decorator, Component, Node, Label } from 'cc';
const { ccclass } = _decorator;

@ccclass('PanelMyRecordComponent')
export class PanelMyRecordComponent extends Component {
    _labTitle: Label;
    _content: Node;

    protected onLoad() {
        this._labTitle = this.node.getChildByName("labTitle").getComponent(Label);
        this._content = this.node.getChildByName("content");
    }

    protected onEnable() {
        // 面板每次显示时刷新数据
        this.refreshData();
        this.addEvent();
    }

    protected onDisable() {
        this.removeEvent();
    }

    addEvent() {
        oops.message.on(SubGameEvent.OnGetMyRecordData, this.onRefresh, this);
    }

    removeEvent() {
        oops.message.off(SubGameEvent.OnGetMyRecordData, this.onRefresh, this);
    }

    onRefresh() {
        // 更新列表内容
    }

    onBtnClose() {
        oops.gui.remove(SubUIID.MyRecords);
    }
}
```

## 预制体组织

```
prefab/
├── panel/                     # 弹窗面板
│   ├── panelSettlement.prefab
│   ├── panelMyRecords.prefab
│   ├── panelRank.prefab
│   └── panelRule.prefab
└── tips/                      # 轻量提示
    ├── tipToast.prefab
    ├── tipPause.prefab
    └── tipRecharge.prefab
```

## 新增 UI 检查清单

- [ ] 在 SubUIID 枚举中添加新 ID
- [ ] 在 SubUIConfigData 中添加配置（指定 layer 和 prefab 路径）
- [ ] 创建预制体文件
- [ ] 创建对应的组件脚本
- [ ] 组件使用 `onEnable/onDisable` 管理生命周期
- [ ] 关闭按钮调用 `oops.gui.remove()`

## 相关技能

- `cocos-scene-management` — Bundle 和子游戏入口
- `rules/cocos/component-patterns.md` — 组件编写模式
