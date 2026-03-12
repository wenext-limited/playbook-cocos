# 通用编码风格

## 不可变优先（关键）

尽量创建新对象，不要修改已有对象：

```
// 错误：原地修改
modify(original, field, value) → 直接改变 original

// 正确：返回新副本
update(original, field, value) → 返回包含变更的新对象
```

原因：不可变数据避免隐藏副作用，简化调试，支持安全并发。

## 文件组织

多个小文件优于少数大文件：

- 高内聚、低耦合
- 典型 200-400 行，最多 800 行
- 从大模块中提取工具函数
- **按功能/领域组织**，不按类型组织

## 命名约定

### 类和文件

| 类型 | 约定 | 示例 |
|------|------|------|
| 组件类 | PascalCase + 语义后缀 | `NodeGameMainComponent`、`PanelRuleComponent` |
| Model 组件 | PascalCase + `ModelComp` | `UserGameModelComp`、`BettingModelComp` |
| BLL 组件 | PascalCase + `Comp`/`Data` | `ReqBettingDataComp` |
| 工具类 | PascalCase + `Util` | `SubGameUtil`、`GreedyBoxUtil` |
| 配置类 | PascalCase + `Config` | `SubGameConfig` |
| 枚举 | `EM` 前缀或 `const enum` | `EMGameStage`、`RunAnimationType` |
| 事件名 | PascalCase 静态字段 | `SubGameEvent.OnMyBettingSuccess` |
| 文件名 | 与主导出类名一致 | `UserGameModelComp.ts` |

### 变量和函数

| 类型 | 约定 | 示例 |
|------|------|------|
| 私有字段 | `_` 前缀 | `_runType`、`_skeleton` |
| 布尔变量 | `is`/`has`/`need` 前缀 | `isPause`、`isPlaying`、`needReverse` |
| 回调函数 | `on` 前缀 | `onBettingSuccess`、`onClickBetArea` |
| 处理数据方法 | `deal` 前缀 | `dealMyBetSuccess`、`dealCurrentResult` |
| 请求方法 | `req` 前缀 | `reqBetting`、`reqUserGameInfo` |
| 常量 | UPPER_SNAKE_CASE | `MAX_BET_COUNT` |

## 错误处理

始终全面处理错误：

- 在每一层显式处理错误
- 面向用户的代码提供友好的错误提示（Toast）
- 记录详细的错误上下文用于调试（`oops.log.logBusiness`）
- 绝不静默吞掉错误

```typescript
// 正确：明确处理两种路径
sub_smc.gameHttp.httpPost(url, (data: HttpReturn) => {
    if (data.isSucc && data.res.sucessed) {
        model.dealSuccess(data.res.data);
    } else {
        oops.gui.open(SubUIID.TipToast, data.res?.message || "请求失败");
    }
    e.remove(BLLComp);  // 无论成功失败都清理
}, strReq);
```

## 输入校验

在系统边界始终校验输入：

- 处理前校验所有用户输入
- API 响应使用前检查 `isSucc && sucessed`
- 资源加载回调中检查 `isValid`
- 快速失败并给出清晰的错误信息
- 不要信任外部数据（API 响应、用户输入、文件内容）

## 日志分层

按 MVC 分层使用正确的日志方法：

```typescript
// BLL / 工具类
oops.log.logBusiness("ReqBettingData → 下注成功");

// UI 组件
oops.log.logView("onClickBetArea → 点击下注区");

// 初始化 / 数据模型
oops.log.logModel("InitRes → 资源加载完成");
```

## 资源回调安全

```typescript
// 异步加载回调中，组件可能已被销毁
oops.res.load(url, (err, asset) => {
    if (sprite && sprite.isValid && sprite.node) {
        sprite.spriteFrame = asset;
    }
});
```

## 定时器清理

```typescript
// 原生定时器必须在 onDestroy 中清理
onDestroy() {
    if (this.timerGetResult) clearInterval(this.timerGetResult);
    if (this.timerReady) clearTimeout(this.timerReady);
    Tween.stopAllByTarget(this.node);
}
```

## 代码质量清单

完成工作前的检查：

- [ ] 代码可读且命名良好（遵循上表约定）
- [ ] 函数小于 50 行
- [ ] 文件聚焦且小于 800 行
- [ ] 无深层嵌套（不超过 4 层）
- [ ] 正确处理了错误（成功+失败双路径）
- [ ] 无硬编码值（使用常量或配置）
- [ ] 使用了不可变模式
- [ ] 异步回调中检查了 `isValid`
- [ ] 原生定时器在 `onDestroy` 中清理
- [ ] 日志使用了正确的分层方法
