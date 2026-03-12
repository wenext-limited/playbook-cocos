---
paths:
  - "**/*.ts"
  - "**/tsconfig.json"
---
# TypeScript 编码风格

> 本文件扩展 [common/coding-style.md](../common/coding-style.md)，添加 TypeScript 和 Cocos Creator 项目特定的内容。

## 命名约定

| 类别 | 风格 | 示例 |
|------|------|------|
| 类名 | PascalCase | `NodeGameMainComponent`、`SubGame` |
| 私有字段 | `_` 前缀 camelCase | `_labRound`、`_nodeGameBoxs` |
| 公有字段 | camelCase | `isPause`、`syncState` |
| 常量 | UPPER_CASE 或 PascalCase 枚举 | `EMGameStage.Betting` |
| 方法 | camelCase | `onGetUserGameData()`、`initGameBox()` |
| 事件处理器 | `on` 前缀 | `onGetCurrentResult()`、`onGameReset()` |
| Getter 方法 | `get` 前缀 | `getRoundNum()`、`getChipsNumber()` |
| 数据处理方法 | `deal` 前缀 | `dealGetResultData()`、`dealMyBetSuccess()` |
| 枚举 | `EM` 或 `Enum` 前缀（可选） | `EMGameStage`、`RunAnimationType` |

## 装饰器

### Cocos Creator 装饰器

```typescript
import { _decorator, Component } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('NodeGameMainComponent')
export class NodeGameMainComponent extends Component {
    @property(Label)
    labTitle: Label = null;
}
```

### ECS 装饰器（OOPS 框架）

```typescript
import { ecs } from 'path/to/oops-framework/libs/ecs/ECS';

@ecs.register('SubGame')
export class SubGame extends ecs.Entity { }

@ecs.register('BettingModel')
export class BettingModelComp extends ecs.Comp { }
```

**注意**：`@ecs.register` 的参数字符串必须与类名或模块名匹配。

## 导入路径

### 框架导入（使用 `db://` 别名）

```typescript
// OOPS 框架核心
import { oops } from 'db://oops-framework/core/Oops';

// 游戏资源
import { smc } from 'db://assets/script/game/common/ecs/SingletonModuleComp';
```

### 相对路径导入

```typescript
// 同 Bundle 内使用相对路径
import { SubGameEvent } from '../config/SubGameEvent';
import { sub_smc } from '../ecs/SubSingletonModuleComp';

// 跨 Bundle 引用使用相对路径到 extensions/
import { ecs } from '../../../../../extensions/oops-plugin-framework/assets/libs/ecs/ECS';
```

### Cocos 引擎导入

```typescript
// 核心类从 'cc' 导入
import { _decorator, Component, Label, Node, sp, Sprite, tween, v3 } from 'cc';

// 编辑器环境变量
import { EDITOR } from 'cc/env';
```

## 类型安全

### 接口定义

为网络协议和数据结构定义接口：

```typescript
export interface CurrentResultData {
    roundNum: number;
    drawInfoJson: string;
    gameInfoJson: string;
    addAmount: number;
}
```

### 枚举用于配置

使用枚举定义固定选项集：

```typescript
export enum EMGameStage {
    Betting = 1,
    Settlement = 2,
    ShowResult = 3,
    Ready = 4,
}
```

### 类型断言

ECS 获取组件时使用泛型：

```typescript
const entity = ecs.getEntity<SubGame>(SubGame);
const comp = entity.get<InitGameComp>(InitGameComp);
```

## 模块导出

- 每个文件只导出一个主要类或枚举
- 单例实例在声明文件底部导出：

```typescript
export var smc: SingletonModuleComp = ecs.getSingleton(SingletonModuleComp);
```

- 配置数据使用 `export var`：

```typescript
export var SubUIConfigData: { [key: number]: UIConfig } = { ... };
```
