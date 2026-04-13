---
name: lark-ai-efficiency
version: 1.0.0
description: "向飞书电子表格「游戏AI提效量化」提交一条 AI 提效记录。当用户需要记录 AI 提效数据、提交 AI 工作量化、填写 AI 效率统计、AI量化统计、量化统计、提交提效记录、记录 AI 工单时使用。"
metadata:
  requires:
    bins: ["lark-cli"]
---

# AI 提效记录提交

> **前置条件：** 先阅读 [`../lark-shared/SKILL.md`](../lark-shared/SKILL.md) 了解认证和安全规则。

向表格 **游戏AI提效量化**（sheet：量化统计）追加一行记录。

## 表格信息

- **spreadsheet_token**: `YfqCs08y6hOAmBt2CrBcqMfXnvW`
- **sheet_id**: `ea09ca`
- **表格链接**: https://fikvmzrrhfl.feishu.cn/wiki/AGeLw73cbilCqIkR7DbcFTnpnDg

## 列结构

| 列 | 字段 | 类型 | 说明 |
|----|------|------|------|
| A | 工作内容 | 文本 | 必填，简述做了什么 |
| B | 工作类型 | 枚举 | 必填，见下方选项 |
| C | 人工预估耗费（H） | 数字 | 必填，如果用人工做需要多少小时 |
| D | AI实际耗时（H） | 数字 | 必填，用 AI 实际花了多少小时 |
| E | 提效倍率 | 数字 | **自动计算**，= round(C/D, 2)，勿让用户填 |
| F | 分享链接 | 文本 | 可选 |
| G | 备注 | 文本 | 可选 |

**工作类型选项**（B 列）：动态从「数据-工作类型」sheet 读取，见 Step 0。

## 操作流程

### Step 0：并行准备数据

**每次调用时**同时执行以下两个命令：

```bash
# 读取工作类型选项
lark-cli sheets +read \
  --spreadsheet-token "YfqCs08y6hOAmBt2CrBcqMfXnvW" \
  --range "dUsMYB!A1:A100" \
  --as user

# 获取当前提交人信息（open_id 用于 @mention）
lark-cli contact +get-user --as user
```

- 从 `values` 中提取非空项作为工作类型选项
- 记录用户的 `open_id` 和 `name`，追加时写入 @mention

### Step 1：收集信息

通过对话向用户依次询问（未提供时才问，已在消息中提供的直接使用）：

1. **工作内容**（必填）— 做了什么，一句话描述
2. **工作类型**（必填）— 展示 Step 0 读取到的选项供用户选择
3. **人工预估耗费（H）**（必填）— 如果不用 AI、纯人工需要多少小时
4. **AI实际耗时（H）**（必填）— 实际用 AI 辅助花了多少小时
5. **分享链接**（可选）— 可跳过
6. **备注**（可选）— 可跳过

### Step 2：计算提效倍率

```
提效倍率 = round(人工预估耗费 / AI实际耗时, 2)
```

在追加前自行计算，写入 E 列。

### Step 3：追加行（执行前告知用户）

使用原生 API 写入，A 列（工作内容）包含富文本 @mention：

```bash
lark-cli api POST /open-apis/sheets/v2/spreadsheets/YfqCs08y6hOAmBt2CrBcqMfXnvW/values_append \
  --as user \
  --data '{
    "valueRange": {
      "range": "ea09ca!A1:G1",
      "values": [[
        [
          {"type": "text", "text": "<工作内容> "},
          {"type": "mention", "text": "<提交人 open_id>", "textType": "openId", "notify": false, "grantReadPermission": false}
        ],
        "<工作类型>",
        <人工预估H>,
        <AI实际H>,
        <提效倍率>,
        <分享链接或null>,
        <备注或null>
      ]]
    }
  }'
```

**注意**：
- 数字列（C/D/E）直接写数字，不加引号
- 可选项为空时写 `null`（不加引号）
- `<提交人 open_id>` 来自 Step 0 的 `contact +get-user` 结果

### Step 4：返回确认

追加成功后，向用户展示：

```
✅ 已提交！

工作内容：xxx
工作类型：xxx
人工预估：xxH → AI实际：xxH
提效倍率：xx 倍

表格链接：https://fikvmzrrhfl.feishu.cn/wiki/AGeLw73cbilCqIkR7DbcFTnpnDg
```

## 权限

| 操作 | 所需 scope |
|------|-----------|
| 追加行 | `sheets:spreadsheet` |

如遇权限不足，执行：
```bash
lark-cli auth login --scope "sheets:spreadsheet"
```
