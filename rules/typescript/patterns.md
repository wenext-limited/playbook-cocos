---
paths:
  - "**/*.ts"
---
# TypeScript 设计模式

> 本文件记录项目中常用的 TypeScript 设计模式，所有模式均从实际 Cocos Creator + OOPS 框架项目中提取。

## 单例模式（Singleton）

通过 OOPS 框架的 ECS 实现全局单例：

```typescript
// 定义单例组件
@ecs.register('SingletonModule')
export class SingletonModuleComp extends ecs.Comp {
    initialize: Initialize = null!;
    wsdkHandler: WsdkHandler = null!;
    reset() { }
}

// 导出全局实例
export var smc: SingletonModuleComp = ecs.getSingleton(SingletonModuleComp);
```

### 子游戏单例

每个子游戏（Bundle）有独立的单例：

```typescript
@ecs.register('SubSingletonModule')
export class SubSingletonModuleComp extends ecs.Comp {
    subGame: SubGame = null;
    gameHttp: GameHttp = null;
    flyChips: FlyChips = null;

    init() {
        this.subGame = ecs.getEntity<SubGame>(SubGame);
        this.gameHttp = ecs.getEntity<GameHttp>(GameHttp);
        this.flyChips = ecs.getEntity<FlyChips>(FlyChips);
    }

    reset() { }
}

export var sub_smc: SubSingletonModuleComp = ecs.getSingleton(SubSingletonModuleComp);
```

### 使用规则

- 全局单例 `smc`：存放游戏级共享状态（初始化数据、SDK 句柄）
- 子游戏单例 `sub_smc`：存放子游戏内共享状态（游戏实体、HTTP 实例、动画系统）
- 所有组件和系统通过单例访问共享数据，避免直接依赖

## ECS 实体注册模式

实体通过 `@ecs.register` 注册，在 `init()` 中添加所有必要组件：

```typescript
@ecs.register('SubGame')
export class SubGame extends ecs.Entity {
    // 声明组件类型（编译时类型检查）
    BettingModel!: BettingModelComp;
    CurrentResultModel!: CurrentResultModelComp;
    UserGameModel!: UserGameModelComp;

    // BLL 组件
    ReqBettingData!: ReqBettingDataComp;
    CurrentResultData!: CurrentResultDataComp;

    protected init() {
        // 添加常驻组件
        this.addComponents<ecs.Comp>(
            BettingModelComp,
            CurrentResultModelComp,
            UserGameModelComp,
        );

        this.initMvvm();
        this.addEvent();
    }
}
```

## 事件驱动数据流

游戏中的数据流遵循单向事件驱动模式：

```
用户操作 → 触发 BLL → HTTP 请求 → 更新 Model → 派发事件 → View 响应
```

### 事件定义

```typescript
export enum SubGameEvent {
    OnGetUserGameData = 'SubGameEvent.OnGetUserGameData',
    OnMyBettingSuccess = 'SubGameEvent.OnMyBettingSuccess',
    GameStageChange = 'SubGameEvent.GameStageChange',
    GameResetDesk = 'SubGameEvent.GameResetDesk',
}
```

### 事件注册与派发

```typescript
// 注册（在 Component 或 Entity 中）
oops.message.on(SubGameEvent.OnGetUserGameData, this.onGetUserGameData, this);

// 派发（在 BLL 或 Model 中）
oops.message.dispatchEvent(SubGameEvent.OnGetCurrentResult);

// 带数据派发
oops.message.dispatchEvent(SubGameEvent.GameStageChange, stageResult, bByServer);
```

### 红线

- 不要在 View 层直接修改 Model 数据
- 不要在 Model 层直接操作 UI 节点
- 事件名使用 `枚举名.事件名` 格式，确保唯一性

## 配置表模式

UI 配置使用枚举 ID + 配置映射表：

```typescript
export enum SubUIID {
    SubGame = 1000,
    Settlement,
    PlayerRank,
    MyRecords,
    TipToast,
}

export var SubUIConfigData: { [key: number]: UIConfig } = {
    [SubUIID.Settlement]: { layer: LayerType.UI, prefab: "prefab/panel/panelSettlement" },
    [SubUIID.PlayerRank]: { layer: LayerType.PopUp, prefab: "prefab/panel/panelRank" },
    [SubUIID.TipToast]: { layer: LayerType.UI, prefab: "prefab/tips/tipToast" },
};

// 自动为所有配置加上 bundle 名
for (let key in SubUIConfigData) {
    SubUIConfigData[key].bundle = gameBundleName;
}
```

## 回调模式

网络请求和异步操作统一使用回调函数：

```typescript
// HTTP 回调
sub_smc.gameHttp.httpPost(url, (data: HttpReturn) => {
    if (data.isSucc && data.res.sucessed) {
        // 处理成功响应
        model.dealGetResultData(data.res.data);
        oops.message.dispatchEvent(SubGameEvent.OnGetCurrentResult);
    }
}, strReq);

// 原生桥回调
appCross.callAppMethod(MsgGame2App.KVStorageGet, { key: 'xxx' }, (data) => {
    cb && cb(data);
});
```

## 工具类模式

静态工具类提供通用功能，不持有状态：

```typescript
export class SubGameUtil {
    static _loadSpriteFramePool: Map<string, SpriteFrame> = new Map();

    static getBaseUrl(): string {
        return smc.initialize.getBaseUrl();
    }

    static setSpriteFrame(sprite: Sprite, url: string, callback?: Function) {
        url += "/spriteFrame";
        oops.res.load(url, (err, sp) => {
            if (err || sp == null) return;
            if (sprite && sprite.isValid && sprite.node) {
                sprite.spriteFrame = sp;
            }
        });
    }
}
```
