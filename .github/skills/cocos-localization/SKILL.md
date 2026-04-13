---
name: cocos-localization
description: 实现多语言本地化时使用，包括语言文件组织、语言切换和文本动态替换。不适用于音频或图片的本地化。
tags: [cocos, localization, i18n, language]
inputs: [支持的语言列表, 文本键值]
outputs: [语言文件, 切换逻辑, 动态文本代码]
---

# 多语言本地化

## 概述

通过 OOPS 框架的 `oops.language` 模块和 Cocos Creator 的 `localization-editor` 插件实现文本多语言支持。

## 语言文件组织

```
language/
├── en.json           # 英语
├── zh.json           # 中文
├── pt.json           # 葡萄牙语
├── es.json           # 西班牙语
├── id.json           # 印尼语
└── ...
```

### 语言文件格式

```json
{
    "round": "Round ",
    "betting": "Betting",
    "settlement": "Settlement",
    "show_result": "Result",
    "ready": "Ready",
    "bet_success": "Bet placed!",
    "balance": "Balance: ",
    "jackpot": "JACKPOT",
    "rank_title": "Ranking",
    "my_records": "My Records"
}
```

## 语言初始化

在子游戏入口中设置语言：

```typescript
// SubGameEntry.ts
protected onLoad() {
    const langCode = smc.initialize.getLangCode();
    oops.language.setLanguage(langCode, () => {
        // 语言加载完成
    });
}
```

## 获取本地化文本

### 工具类封装

```typescript
export class GreedyBoxUtil {
    static getLangByID(key: string): string {
        return oops.language.getLangByID(key);
    }
}
```

### 在组件中使用

```typescript
onUpdateRound() {
    this._labRound.string = GreedyBoxUtil.getLangByID('round')
        + sub_smc.subGame.UserGameModel.getRoundNum();
}
```

## 多语言 UI 适配

### Label 自动本地化

通过 Cocos Creator 编辑器的 `localization-editor` 插件实现：

1. Label 节点添加本地化组件
2. 绑定对应的 key
3. 运行时自动替换文本

### 动态文本

代码中动态设置的文本通过 `getLangByID` 获取：

```typescript
// 拼接文本
this._labBalance.string = GreedyBoxUtil.getLangByID('balance') + coins;

// 条件文本
const stageText = GreedyBoxUtil.getLangByID(
    stage === EMGameStage.Betting ? 'betting' : 'settlement'
);
```

## 语言代码映射

| 代码 | 语言 |
|------|------|
| `en` | English |
| `zh` | 中文 |
| `pt` | Português |
| `es` | Español |
| `id` | Bahasa Indonesia |
| `ar` | العربية |

## 插件配置

在 `extensions/localization-editor/` 中配置：

- 支持的语言列表
- 默认语言
- 翻译导入/导出格式

## 清单

- [ ] 语言 JSON 文件已创建（每种语言一个文件）
- [ ] 所有用户可见文本都使用 key 引用
- [ ] 入口处调用 `setLanguage` 初始化
- [ ] 动态文本使用 `getLangByID` 获取
- [ ] Label 组件在编辑器中绑定本地化 key
- [ ] 新增文本时同步更新所有语言文件

## 相关技能

- `cocos-project-setup` — 项目初始化时的语言配置
- `cocos-ui-system` — UI 组件中的文本绑定
