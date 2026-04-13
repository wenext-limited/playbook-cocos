---
name: oops-mvvm-binding
description: 使用 OOPS 框架的 MVVM 数据绑定系统时使用，包括 ViewModel 注册、路径键定义、数据双向同步和 UI 自动更新。不适用于不使用 VM 系统的简单 UI 组件。
tags: [oops, mvvm, viewmodel, binding, reactive]
inputs: [数据模型名, 绑定路径, UI组件类型]
outputs: [VMKey定义, Model绑定代码, View监听代码, 数据更新代码]
---

# MVVM 数据绑定

## 概述

OOPS 框架内置 MVVM（Model-View-ViewModel）系统，通过 `VM` 对象实现数据与 UI 的响应式绑定。当 Model 数据变更时，View 自动更新，无需手动派发事件。

## 核心机制

```
┌──────────────┐     VM.add()      ┌──────────────┐     director.emit()    ┌──────────────┐
│    Model     │ ──────────────> │   ViewModel  │ ──────────────────> │    View      │
│  (ecs.Comp)  │                 │  (Proxy 代理) │                     │ (Component)  │
│              │ <────────────── │              │ <────────────────── │              │
│  vm.setValue │     auto sync   │  路径监听     │    用户操作          │ UI 交互       │
└──────────────┘                 └──────────────┘                     └──────────────┘
```

**实现原理**：`VM.add()` 将普通对象包装为 Proxy，拦截 `set` 操作，通过 `director.emit("VC:Tag.Path")` 通知所有监听者。

## VMKey 路径定义

在 `SubGameConfig.ts` 中集中管理绑定路径：

```typescript
export class VMKey {
    // MVVM 标签（命名空间）
    static readonly Tag_MyChips: string = 'mychips';

    // 绑定路径（数据字段名）
    static readonly Path_MyChipsGear: string = 'ChipsSelectGear';
    static readonly Path_MyChipsNum: string = 'ChipsSelectNum';
    static readonly Path_RoundNum: string = 'RoundNum';
    static readonly Path_MyCoin: string = 'myCoin';
    static readonly Path_TotalBet: string = 'totalBetCoin';
    static readonly Path_MyBet: string = 'myBetCoin';
}
```

### 命名规则

| 类型 | 前缀 | 示例 | 说明 |
|------|------|------|------|
| 标签 | `Tag_` | `Tag_MyChips` | VM 实例的唯一命名空间 |
| 路径 | `Path_` | `Path_MyCoin` | 数据字段的绑定名 |

## Model 端：注册 ViewModel

### 在 ECS Model 组件中注册

```typescript
import { VM } from 'path/to/oops-framework/libs/model-view/ViewModel';

@ecs.register('UserGameModel')
export class UserGameModelComp extends ecs.Comp {
    private vm: any = {};

    vmAdd() {
        this.vm = {
            [VMKey.Path_RoundNum]: 0,
            [VMKey.Path_MyCoin]: 0,
            [VMKey.Path_TotalBet]: 0,
            [VMKey.Path_MyBet]: 0,
        };
        VM.add(this.vm, "UserGameModel");
    }

    vmRemove() {
        VM.remove("UserGameModel");
    }

    // 更新数据 → UI 自动刷新
    setRoundNum(nRoundNum: number) {
        this._curRoundNum = nRoundNum;
        let vm = VM.get("UserGameModel");
        vm.setValue(VMKey.Path_RoundNum, this._curRoundNum);
    }

    setMyCoinNum(nCoin: number) {
        if (nCoin == null) return;
        this._myCoins = nCoin;
        let vm = VM.get("UserGameModel");
        vm.setValue(VMKey.Path_MyCoin, nCoin);
    }
}
```

### 在 View 组件中直接注册

用于不属于 ECS 的临时 UI 数据：

```typescript
@ccclass('NodeBetChipsComponent')
export class NodeBetChipsComponent extends Component {

    protected onLoad(): void {
        // 直接在 View 中创建 ViewModel 实例
        oops.mvvm.add({
            [VMKey.Path_MyChipsGear]: 0,
            [VMKey.Path_MyChipsNum]: 0,
        }, VMKey.Tag_MyChips);
    }
}
```

## View 端：读取/监听数据

### 主动读取

```typescript
// 获取 ViewModel 实例
let vm = oops.mvvm.get(VMKey.Tag_MyChips);

// 读取当前值
const gear = vm.getValue(VMKey.Path_MyChipsGear);
const num = vm.getValue(VMKey.Path_MyChipsNum);
```

### 主动写入

```typescript
let vm = oops.mvvm.get(VMKey.Tag_MyChips);
vm.setValue(VMKey.Path_MyChipsGear, 3);
vm.setValue(VMKey.Path_MyChipsNum, 500);
```

### 组件级绑定（VMParent / VMBase）

OOPS 提供预置的 ViewModel 组件，可直接挂载到节点上：

```
VMParent    — 父节点控制器，管理子节点的 VM 绑定
VMBase      — 基础绑定组件
VMState     — 状态绑定（显示/隐藏）
VMProgress  — 进度条绑定
VMCustom    — 自定义绑定逻辑
VMModify    — 数据修改绑定
VMEvent     — 事件绑定
```

## 数据流完整示例

```
1. 服务器返回用户金币数据
2. BLL → Model: UserGameModel.setMyCoinNum(5000)
3. Model 内部:
   let vm = VM.get("UserGameModel");
   vm.setValue(VMKey.Path_MyCoin, 5000);
4. ViewModel Proxy 拦截 set → director.emit("VC:UserGameModel.myCoin", 5000)
5. View: 所有绑定了 "UserGameModel.myCoin" 的组件自动更新
```

## MVVM vs 事件系统

| 维度 | MVVM (VM) | 事件系统 (oops.message) |
|------|-----------|------------------------|
| **触发方式** | 数据赋值自动触发 | 手动 dispatchEvent |
| **适用场景** | 数值型 UI 绑定（金币、倒计时、分数） | 业务流程通知（请求完成、阶段切换） |
| **粒度** | 字段级别 | 事件级别 |
| **一对多** | 支持 | 支持 |
| **参数传递** | 新值/旧值/路径 | 自定义参数 |
| **生命周期** | vmAdd/vmRemove | on/off |

### 最佳实践

- **数值显示**（金币、局数、倒计时）→ 用 MVVM
- **状态切换**（阶段变更、请求完成）→ 用事件
- **混合使用**：Model 同时提供 VM 绑定和事件派发

```typescript
// 混合示例：更新金币数 + 通知变化
setMyCoinNum(nCoin: number) {
    this._myCoins = nCoin;

    // MVVM：自动更新绑定了 Path_MyCoin 的 UI
    let vm = VM.get("UserGameModel");
    vm.setValue(VMKey.Path_MyCoin, nCoin);

    // 事件：通知需要执行额外逻辑的组件
    oops.message.dispatchEvent(SubGameEvent.MyCoinChange);
}
```

## Entity 中的 MVVM 初始化

```typescript
@ecs.register('SubGame')
export class SubGame extends ecs.Entity {
    initMvvm() {
        this.BettingModel.vmAdd();
        this.DashboardModel.vmAdd();
        this.CurrentResultModel.vmAdd();
        this.GameRecordsModel.vmAdd();
        this.UserGameModel.vmAdd();
        this.UserRecordsModel.vmAdd();
        this.TodayRankModel.vmAdd();
        this.RankModel.vmAdd();
    }
}
```

## 新增 MVVM 绑定清单

- [ ] 在 `VMKey` 中定义 `Tag_` 和 `Path_` 常量
- [ ] Model 组件实现 `vmAdd()` / `vmRemove()`
- [ ] Entity `initMvvm()` 中调用 Model 的 `vmAdd()`
- [ ] 数据变更处用 `vm.setValue(path, value)`
- [ ] View 端用 `vm.getValue(path)` 读取或挂载 VM 组件绑定
- [ ] Entity 销毁时确保调用 `vmRemove()`

## 红线

| 违规 | 后果 | 正确做法 |
|------|------|----------|
| 直接修改 `vm` 对象字段 | Proxy 可能未触发 | 用 `vm.setValue()` |
| 忘记 `vmRemove()` | 内存泄漏 | Entity 销毁前调用 |
| Tag 重名 | 数据覆盖 | Tag 全局唯一 |
| Path 硬编码字符串 | 难以维护 | 统一用 `VMKey` 常量 |

## 相关技能

- `oops-ecs-pattern` — Model 层中的 MVVM 集成
- `oops-event-system` — 与事件系统的配合使用
- `oops-framework` — oops.mvvm 全局 API
