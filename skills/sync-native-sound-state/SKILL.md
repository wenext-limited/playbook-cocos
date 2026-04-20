---
name: sync-native-sound-state
description: Use when native app pushes sound/vibrate state changes to Cocos Creator game via bridge (e.g. onGameOp), and game UI (setting panels, toggle buttons, menu labels) needs to sync in real time. Applies when NativeUtil._soundState is the source of truth but UI reads from localStorage or AudioMgr cache, causing state desync.
---

# 同步原生音效状态到游戏 UI

## Overview

原生 App 可以在游戏外切换音效开关，通过 bridge 推送 `onGameOp` 通知游戏侧。游戏侧需要：
1. 更新内存状态（`NativeUtil._soundState`）
2. 广播事件通知所有 UI
3. UI 组件以 `NativeUtil.soundState` 为唯一数据源，不读 localStorage 缓存

**核心原则：** `NativeUtil._soundState` 是音效状态的 single source of truth，所有 UI 读取和初始化都应该从它取值，不从 `AudioMgr.isOpenSound()`（localStorage）取值。

## 适配前诊断

在目标项目中依次确认：

| 检查项 | 查找方式 | 目的 |
|--------|----------|------|
| 原生 bridge 入口 | `grep -r "onGameOp"` | 找到处理原生推送的 switch/case |
| Sound 枚举值 | `grep -r "NativeToGameOpType"` 或类似枚举 | 确认音效 op 值（通常 op=1） |
| 音效状态字段 | `grep -r "_soundState"` | 找到内存状态存储位置 |
| 状态变更事件 | `grep -r "CHANGE_SOUND_STATE"` | 找到事件常量和已有监听者 |
| UI 面板 | `grep -r "isOpenSound\|soundState"` | 找到所有读取音效状态的 UI 组件 |

## 数据结构

原生推送的典型数据格式：

```json
{"data":{"data":{"status":0,"uid":100001067},"op":1}}
```

经 `onGameOp` 解析后：
- `op` = 1（Sound）
- `data` = `{"status": 0, "uid": 100001067}`
- `status: 0` = 关闭，`status: 1` = 开启

## 改动清单

### 第 1 步：bridge 层 — 处理原生推送

找到 `onGameOp`（或等效的原生回调方法）中 Sound case，恢复/新增状态同步逻辑：

```typescript
// ❌ 改动前：标记废弃，不处理
case NativeToGameOpType.Sound:
    // 音效改动，废弃
    break;

// ✅ 改动后：更新状态 + 广播事件
case NativeToGameOpType.Sound:
    // 音效改动，同步原生侧的音效状态
    this._soundState = !!data["status"];
    EventDispatcher.getInstance().emit(COMMON_EVENT.CHANGE_SOUND_STATE, this._soundState);
    break;
```

**要点：**
- `!!data["status"]` 将 `0/1` 转为 `false/true`
- 必须发送事件，否则下游 UI 无法感知变化
- 这与 `onGetGameViewRet` 中初始化音效状态的逻辑一致（作为参考模板）

### 第 2 步：识别所有需要同步的 UI 组件

搜索项目中所有读取音效状态的 UI：

```bash
# 找到所有读 AudioMgr.isOpenSound() 的地方（需要改为 NativeUtil.soundState）
grep -rn "isOpenSound" assets/

# 找到所有读 NativeUtil.soundState 的地方（需要加事件监听）
grep -rn "soundState" assets/

# 找到所有已监听 CHANGE_SOUND_STATE 的地方（已自动同步，无需改动）
grep -rn "CHANGE_SOUND_STATE" assets/
```

将 UI 组件分为三类：

| 类别 | 特征 | 需要的改动 |
|------|------|-----------|
| **已监听事件** | `on(CHANGE_SOUND_STATE, ...)` | 无需改动，第 1 步的事件广播已覆盖 |
| **读 NativeUtil.soundState 但未监听** | `NativeUtil.soundState` 读取但无事件注册 | 加事件监听 + 回调刷新 UI |
| **读 AudioMgr.isOpenSound()** | `AudioMgr.getInstance().isOpenSound()` | 改数据源 + 加事件监听 |

### 第 3 步：改造"读 NativeUtil.soundState 但未监听"的面板

典型场景：菜单面板只在 `init()` 时读一次状态，打开期间原生切换无法同步。

```typescript
// ❌ 改动前：只在 init/点击时读取，面板打开期间不同步
updateMusicLabel() {
    const on = NativeUtil.soundState;
    this.txtMusic.string = Lang.getText(on ? "sound_on" : "sound_off");
}

// ✅ 改动后：加事件监听，实时同步
import { COMMON_EVENT } from '../../framework/events/CommonEvent';

public addEventListeners() {
    // ... 原有事件 ...
    EventDispatcher.getInstance().on(COMMON_EVENT.CHANGE_SOUND_STATE, this.onChangeSoundState, this);
}

public removeEventListeners() {
    // ... 原有事件 ...
    EventDispatcher.getInstance().off(COMMON_EVENT.CHANGE_SOUND_STATE, this.onChangeSoundState, this);
}

private onChangeSoundState() {
    this.updateMusicLabel();
}
```

**适配要点：**
- 事件注册/注销跟随组件生命周期（`addEventListeners/removeEventListeners`、`onEnable/onDisable`、`start/onDestroy`）
- 回调中复用已有的 UI 刷新方法，不重复写渲染逻辑

### 第 4 步：改造"读 AudioMgr.isOpenSound()"的面板

这类组件从 localStorage 读取音效状态，需要改为以 `NativeUtil.soundState` 为数据源：

```typescript
// ❌ 改动前：从 localStorage 读取（可能与原生状态不一致）
import { AudioMgr } from '../../framework/GameFrame';

initState() {
    let isSoundCheck = AudioMgr.getInstance().isOpenSound();
    this.changeMaskCloseOpen(this.soundNode, isSoundCheck);
}

// ✅ 改动后：从 NativeUtil 读取 + 监听事件
import { NativeUtil } from '../../framework/mgrs/NativeUtil';
import { COMMON_EVENT } from '../../framework/events/CommonEvent';

initState() {
    this.changeMaskCloseOpen(this.soundNode, NativeUtil.soundState);
}

protected onEnable(): void {
    // ... 原有事件 ...
    EventDispatcher.getInstance().on(COMMON_EVENT.CHANGE_SOUND_STATE, this.onChangeSoundState, this);
}

protected onDisable(): void {
    // ... 原有事件 ...
    EventDispatcher.getInstance().off(COMMON_EVENT.CHANGE_SOUND_STATE, this.onChangeSoundState, this);
}

private onChangeSoundState() {
    this.changeMaskCloseOpen(this.soundNode, NativeUtil.soundState);
}
```

**适配要点：**
- 移除不再使用的 `AudioMgr` 导入
- `changeMaskCloseOpen` 是项目特定的 UI 切换方法，根据实际项目替换为对应的 toggle/mask/sprite 切换逻辑

## 震动状态同理

如果项目同时有震动（vibrate）开关，模式完全相同：

```typescript
case NativeToGameOpType.Vibrate:  // 如果有对应的枚举值
    this._shockState = !!data["status"];
    EventDispatcher.getInstance().emit(COMMON_EVENT.CHANGE_VIBRATE_STATE, this._shockState);
    break;
```

UI 面板中的震动 toggle 同样需要：数据源改为 `NativeUtil.shockState`，加事件监听。

## 适配检查清单

- [ ] `onGameOp` 的 Sound case 更新 `_soundState` 并广播事件
- [ ] 所有读 `AudioMgr.isOpenSound()` 的 UI 改为读 `NativeUtil.soundState`
- [ ] 所有显示音效状态的 UI 组件监听 `CHANGE_SOUND_STATE`
- [ ] 事件注册/注销正确配对，跟随组件生命周期
- [ ] 移除不再使用的 `AudioMgr` 导入
- [ ] 震动状态（如有）同步处理

## 常见错误

| 错误 | 后果 | 修复 |
|------|------|------|
| 只更新 `_soundState` 不发事件 | UI 不同步，下次打开面板才刷新 | 必须 `emit(CHANGE_SOUND_STATE)` |
| 初始化时读 `AudioMgr.isOpenSound()` | localStorage 可能与原生状态不一致 | 改为读 `NativeUtil.soundState` |
| 注册事件但忘记注销 | 组件销毁后回调仍触发，空引用崩溃 | `removeEventListeners` / `onDisable` 中 `off` |
| 回调中重新读 `AudioMgr` 而非 `NativeUtil` | 读到旧的 localStorage 值 | 回调中读 `NativeUtil.soundState` |
