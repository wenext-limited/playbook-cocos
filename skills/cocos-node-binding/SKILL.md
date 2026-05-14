---
name: cocos-node-binding
description: Use when binding child nodes in Cocos Creator onLoad() — when given a .prefab file path, or when multiple fields share a common parent node, or traversal involves multi-level paths.
---

# Cocos Creator onLoad 节点绑定规范

## Overview

给定 `.prefab` 文件路径时，先用 `scan.js` 解析节点结构，再按规范生成 `onLoad()` 绑定代码：缓存中间父节点、用路径替代链式查找、字段声明上方注释路径。

---

## 第一步：解析 prefab 节点结构

用项目内的 `scan.js` 直接解析 `.prefab` 文件，无需打开编辑器：

```bash
node extensions/prefab-scanner/scan.js assets/resources/prefab/game/gamePlayer.prefab
```

输出格式：

```
[custom] [gamePlayer]
  [img]    [bg_self] (cc.Sprite)
  [group]  [headInfo]
    [img]  [Mask] (cc.Mask)
      [img] [Sprite] (cc.Sprite)
    [img]  [progress] (cc.Sprite) (inactive)
    [btn]  [gift] (cc.Sprite, cc.Button)
  [layout] [scoreInfo] (cc.Layout)
    [text] [curScore] (cc.Label)
  [custom] [playerPokerNode] (PlayerPokerNode)
```

**图标 → 推断 getComponent 类型：**

| 图标 | 通常绑定类型 |
|------|-------------|
| `[img]` | `Sprite`（或直接 `Node`） |
| `[text]` | `Label` |
| `[btn]` | `Button`（或直接 `Node`） |
| `[layout]` | `Node`（布局容器一般只用 Node） |
| `[custom]` | 对应组件名 `getComponent(XxxComp)` |
| `[group]` / `[node]` | `Node` |

---

## 第二步：分析缓存分组

扫描 Hierarchy，找出**有多个子节点需要绑定**的父节点 → 这些父节点需要 `const` 局部变量缓存。

**规则：**
- 同一父节点下绑定 **≥ 2 个字段** → 必须缓存该父节点
- 只有 1 个字段 → 直接 `this.node.getChildByPath('父/子')` 即可
- 中间节点**不声明为类字段**，只用 `const` 局部变量

---

## 第三步：生成绑定代码

**三条规范同时执行：**

### 规范一：缓存中间父节点

```typescript
// ❌ 每次从根节点遍历
this.icon = this.node.getChildByPath('headInfo/Mask/Sprite').getComponent(Sprite);
this.nameLbl = this.node.getChildByPath('headInfo/nameLbl').getComponent(Label);

// ✅ 缓存 headInfo，再查子节点
const headInfo = this.node.getChildByName('headInfo');
this.icon = headInfo.getChildByPath('Mask/Sprite').getComponent(Sprite);
this.nameLbl = headInfo.getChildByName('nameLbl').getComponent(Label);
```

### 规范二：多级路径用 getChildByPath

```typescript
// ❌ 链式调用
headInfo.getChildByName('mic').getChildByName('MicAnim')

// ✅ 路径写法
headInfo.getChildByPath('mic/MicAnim')
```

### 规范三：字段声明上方注释节点路径

```typescript
// head/Mask/Sprite
@property(Sprite)
icon: Sprite = null;

// scoreInfo/curScore
@property(Label)
curScoreLbl: Label = null;
```

注释写在**声明上方一行**，不写在行尾。

---

## 完整示例

给定 Hierarchy（节选 gamePlayer）：

```
[group]  [headInfo]
  [img]  [Mask]
    [img] [Sprite]
  [img]  [progress]
  [btn]  [gift]
[layout] [scoreInfo]
  [text] [curScore]
  [text] [tarScore]
[custom] [playerPokerNode] (PlayerPokerNode)
[text]   [timeLbl] (inactive)
```

生成代码：

```typescript
// headInfo/Mask/Sprite
@property(Sprite)
icon: Sprite = null;
// headInfo/progress
@property(Sprite)
progress: Sprite = null;
// headInfo/gift
@property(Node)
gift: Node = null;
// scoreInfo/curScore
@property(Label)
curScoreLbl: Label = null;
// scoreInfo/tarScore
@property(Label)
tarScoreLbl: Label = null;
// playerPokerNode
@property(PlayerPokerNode)
playerPokerNode: PlayerPokerNode = null;
// timeLbl
@property(Label)
timeLbl: Label = null;

onLoad() {
    const headInfo = this.node.getChildByName('headInfo');
    this.icon = headInfo.getChildByPath('Mask/Sprite').getComponent(Sprite);
    this.progress = headInfo.getChildByName('progress').getComponent(Sprite);
    this.gift = headInfo.getChildByName('gift');

    const scoreInfo = this.node.getChildByName('scoreInfo');
    this.curScoreLbl = scoreInfo.getChildByName('curScore').getComponent(Label);
    this.tarScoreLbl = scoreInfo.getChildByName('tarScore').getComponent(Label);

    this.playerPokerNode = this.node.getChildByName('playerPokerNode').getComponent(PlayerPokerNode);
    this.timeLbl = this.node.getChildByName('timeLbl').getComponent(Label);
}
```

---

## 常见错误

| 错误写法 | 正确写法 |
|---------|---------|
| `this.node.getChildByPath('a/b').getChildByName('c')` | `this.node.getChildByPath('a/b/c')` |
| 把中间节点声明为类字段 | 用 `const` 局部变量，不挂在 `this` 上 |
| 跳过 (inactive) 节点不绑 | inactive 只是初始隐藏，仍需绑定 |
| 注释写在行尾 | 注释写在声明上方一行 |
