---
name: lark-workload-reporting
version: 1.0.0
description: "根据姓名、年月和工时分配表链接，通过 lark-cli 读取飞书周报与表头 APP，分析指定成员在各 APP 的投入比例并只输出 app+比例。当用户要按周报估算某人某月各 APP 投入占比时使用。"
argument-hint: "[姓名] [日期] [工时分配表链接]"
metadata:
  requires:
    bins: ["lark-cli"]
---

# 按周报分析人员 APP 投入占比

> **前置条件：** 先确认 `lark-cli` 可用，并了解 wiki / sheets 的 token 解析、`--as bot` 的优先使用规则，以及权限不足时的处理方式。
>
> 默认优先使用本机已配置好的 app 认证，并优先尝试 `--as bot`。如果 bot 权限不足，再按实际缺失 scope 处理，不要先重复询问是否使用 bot 认证。

使用 `lark-cli` 从飞书工时分配表和周会父目录中读取数据，分析指定人员在指定年月里对各 APP 的投入比例，并最终 **只输出 `app 比例`**。

## 适用场景

当用户提供以下三个必填输入时使用：

1. **姓名**
2. **日期**（必须包含 **年、月**，例如 `2026年5月`、`2026-05`、`2026/05`）
3. **工时分配表链接**

## 输入模板（强烈建议直接照抄）

调用这个 Skill 时，优先要求用户按下面格式提供输入：

```text
姓名：<姓名>
日期：<YYYY年M月>
工时分配表链接：<飞书链接>
```

示例：

```text
姓名：王光伟
日期：2026年5月
工时分配表链接：https://fikvmzrrhfl.feishu.cn/wiki/NOMbwqMmViTV0pkOM2ecCWYcnJ7?fromScene=spaceOverview&sheet=GBDYSj
```

也允许用户用一行自然语言表达，只要能明确解析出这 3 个字段即可，例如：

```text
王光伟 2026年5月 https://fikvmzrrhfl.feishu.cn/wiki/NOMbwqMmViTV0pkOM2ecCWYcnJ7?fromScene=spaceOverview&sheet=GBDYSj
```

如果用户像下面这样只输入一句问题：

```text
为什么没有显示输出项
```

则视为**无有效输入**，必须停止，并明确提示缺少：
- 姓名
- 日期（年月）
- 工时分配表链接

## 强制输入校验

三个输入都是必须项，缺一不可。

- 缺少姓名：停止并要求补充姓名
- 缺少日期：停止并要求补充日期
- 日期里没有明确的年、月：停止并要求补充到“年月”粒度
- 缺少工时分配表链接：停止并要求补充链接

**禁止猜测输入。**

## 默认认证约定

在这台机器上使用 `lark-cli` 时，默认优先使用本机已配置好的 app 认证，并优先尝试 `--as bot`。

如果 bot 权限不足，再依据缺失的 scope 或 console 提示处理，不要直接对 bot 使用 `auth login`。

## 固定数据源

### 周报父目录（固定）

```text
https://fikvmzrrhfl.feishu.cn/wiki/JAFEwKgpgiy3Ugk1gkicPpqRnnc
```

### 工时分配表（动态）

由用户输入，可能是：
- `/wiki/<token>` 链接
- `/sheets/<token>` 链接

## 总体流程

1. 先读工时分配表第一行，识别有几个 APP
2. 从固定周报父目录中找出目标年月的周报
3. 提取指定姓名在这些周报中的工作内容
4. 按 APP 归因并归一化为 100%
5. **最终只输出每个 app + 比例**

---

## Step 1：读取工时分配表第一行并识别 APP

### 1.1 解析工时分配表链接

#### 如果是 wiki 链接

先提取 wiki token，例如：

```text
https://fikvmzrrhfl.feishu.cn/wiki/NOMbwqMmViTV0pkOM2ecCWYcnJ7?sheet=GBDYSj
```

token 为：

```text
NOMbwqMmViTV0pkOM2ecCWYcnJ7
```

然后查询真实对象：

```bash
lark-cli wiki spaces get_node \
  --params '{"token":"<WIKI_TOKEN>"}' \
  --as bot
```

从返回结果中提取：

- `obj_type`
- `obj_token`
- `title`

要求：
- `obj_type` 必须是 `sheet`
- `obj_token` 作为后续 spreadsheet token

#### 如果是 sheets 链接

可直接从 URL 中提取 spreadsheet token。

### 1.2 读取 spreadsheet 信息

```bash
lark-cli sheets +info \
  --spreadsheet-token <SPREADSHEET_TOKEN> \
  --as bot
```

从返回结果中获取：
- 全部 sheet 列表
- 每个 sheet 的 `sheet_id`
- 每个 sheet 的标题，例如 `2026年5月`

### 1.3 优先选择与输入年月匹配的 sheet

优先规则：

1. 优先匹配与输入年月同名/同义的 sheet，例如：
   - 输入 `2026年5月`，优先选 `2026年5月`
   - 输入 `2026-05`，也应匹配 `2026年5月`
2. 如果用户链接里显式包含 `sheet=<sheet_id>`，且该 sheet 的标题与输入年月一致，则优先使用该 sheet
3. 如果没有匹配到对应年月 sheet，再退回首个 sheet，但必须说明是回退策略

### 1.4 读取第一行表头

推荐读取前 2-3 行：

```bash
lark-cli sheets +read \
  --spreadsheet-token <SPREADSHEET_TOKEN> \
  --sheet-id <SHEET_ID> \
  --range A1:Z3 \
  --as bot \
  --value-render-option FormattedValue
```

从第一行提取 APP 列。

#### 列提取规则

- 跳过：`姓名`、`合计`、空列
- 保留其余列，按表头原始顺序输出/处理
- 例如：
  - `lama`
  - `wyak`
  - `weparty`
  - `ludo`
  - `gameparty`
  - `yoki`
  - `fungo`
  - `hichat`
  - `hayi`
  - `ludo-ksa`
  - `gameparty中东`

**不要写死 APP 列表，必须以表头实际读取结果为准。**

---

## Step 2：从固定父目录筛出目标年月周报

### 2.1 查询固定父目录节点

```bash
lark-cli wiki spaces get_node \
  --params '{"token":"JAFEwKgpgiy3Ugk1gkicPpqRnnc"}' \
  --as bot
```

从结果中拿到：
- `space_id`
- 父目录 token（即 `JAFEwKgpgiy3Ugk1gkicPpqRnnc`）

### 2.2 列出父目录子节点

```bash
lark-cli wiki nodes list \
  --params '{"space_id":"<SPACE_ID>","parent_node_token":"JAFEwKgpgiy3Ugk1gkicPpqRnnc"}' \
  --as bot \
  --page-all
```

### 2.3 按输入年月筛选周报标题

匹配标题示例：
- `周会-2026.05.29`
- `周会 - 2026.5.9`
- `周会-2026.05.09`

筛选规则：

1. 标题中必须能提取出具体日期
2. 日期必须属于输入的 `YYYY-MM`
3. 只保留该月周报
4. 忽略无关条目，例如：
   - `周会模版`
   - `2025年`
   - 其他月份周报

每个匹配结果都保留：
- `title`
- `obj_token`
- `url`

---

## Step 3：提取指定姓名在这些周报中的内容

对每篇筛出的周报，执行：

```bash
lark-cli docs +fetch \
  --doc <DOCX_TOKEN> \
  --as bot
```

### 提取范围

只提取该姓名在文档中的条目，重点看这两个部分：

1. `一、问题经验的总结`
2. `二、重要推进事项`

### 提取原则

- 只保留目标姓名对应的内容
- 不要把别人的条目算进去
- 同一个姓名下跨多行延续的内容，也要并入该人的记录
- 文档中的附件、图片、链接可忽略，关注文本工作内容本身

将该月所有周报里该姓名的内容合并成一个待分析集合。

---

## Step 4：按 APP 归因

把 Step 3 抽取出的所有内容，归因到 Step 1 读出来的 APP 表头集合中。

### 4.1 优先级 1：显式 APP 标签

如果文本里有明确标签，优先直接归因。

示例：
- `【wyak】`
- `[wyak]`
- `【Hayi】`
- `[ludo]`
- `[gmparty]`
- `【Yoki】`

### 4.2 优先级 2：正文关键词命中 APP 名称

如果正文中明确出现表头 APP 名称，也可直接归因。

例如正文里出现：
- `wyak`
- `ludo-ksa`
- `gameparty中东`

### 4.3 APP 别名映射

为了和工时表表头对齐，允许以下常见映射：

- `gmparty` -> `gameparty`
- `GmParty` / `GameParty` -> `gameparty`
- `Yoki` -> `yoki`
- `Hayi` -> `hayi`
- `Lama Ludo` / `lamaludo` -> 同时关联 `lama` 与 `ludo`

### 4.4 交叉项处理

像 `Lama Ludo` 这种同时涉及容器与游戏的描述，不要只算给一个。

处理规则：
- 若描述明确同时指向两个 APP/维度，则在这些目标之间分摊
- 没有更强证据时，默认均分

### 4.5 平台/AI/基础设施类工作

例如：
- AI workflow
- ts-graph
- code review skill
- Figma MCP 调研
- PRD 拆解方案
- 通用迁移工作流

这类工作如果**没有明确指向某个 APP**，按以下保守规则处理：

1. 先看该月该姓名是否有显式命中的 APP 集合
2. 如果有，则把这些“非 APP 特定工作”仅在这些已显式命中的 APP 中分摊
3. 如果完全没有显式 APP，则所有 APP 输出 `0%`，不要凭空硬分配

### 4.6 分摊建议

建议以“条目”为基本单位：

- 一条明确只对应 1 个 APP 的，100% 给该 APP
- 一条明确对应 2 个 APP 的，默认 50/50
- 一条平台型工作，如果当月该人显式命中过 N 个 APP，则均分到这 N 个 APP

如果某条内容的粒度明显更大，可按语义做轻微调整，但要保持一致性和可解释性。

---

## Step 5：汇总并归一化到 100%

### 5.1 汇总原始权重

把 Step 4 中每条内容的分配结果累加到各 APP。

### 5.2 归一化

将所有 APP 的累计权重归一化成百分比。

要求：
- 总和必须是 **100%**
- 未命中的 APP 也要输出，但比例为 `0%`
- 推荐优先输出整数百分比
- 如必须保留小数，可保留 1 位，但仍要保证总和 100%

### 5.3 四舍五入规则

如果 rounding 后总和不是 100%，用**最大余数法**修正，直到总和精确等于 100%。

---

## Step 6：最终输出格式（严格）

最终只输出一个 **ASCII 表格**，只包含两列：

- `APP`
- `比例`

例如：

```text
┌──────────────┬──────┐
│ APP          │ 比例 │
├──────────────┼──────┤
│ 1. lama      │ 16%  │
│ 2. wyak      │ 34%  │
│ 3. weparty   │ 2%   │
│ 4. ludo      │ 18%  │
│ 5. gameparty │ 10%  │
│ 6. yoki      │ 4%   │
│ 7. fungo     │ 1%   │
│ 8. hichat    │ 1%   │
│ 9. hayi      │ 10%  │
│ 10. ludo-ksa │ 4%   │
└──────────────┴──────┘
```

### 强制要求

- 只输出 ASCII 表格，不输出额外说明
- 表格固定两列：`APP`、`比例`
- 第一列显示：`序号. app名`
- 第二列显示：百分比
- 按工时表第一行的原始顺序输出
- 未命中的 APP 也要输出，比例为 `0%`
- 列宽可按实际最长 app 名自适应，但整体风格保持上例一致
- **不要输出**：
  - 分析过程
  - 解释说明
  - 命中证据
  - 合计
  - Markdown 表格
  - 多余标题

---

## 推荐命令模板

### A. 解析用户提供的 wiki 表格链接

```bash
lark-cli wiki spaces get_node \
  --params '{"token":"<WIKI_TOKEN>"}' \
  --as bot
```

### B. 读取 spreadsheet 信息

```bash
lark-cli sheets +info \
  --spreadsheet-token <SPREADSHEET_TOKEN> \
  --as bot
```

### C. 读取表头

```bash
lark-cli sheets +read \
  --spreadsheet-token <SPREADSHEET_TOKEN> \
  --sheet-id <SHEET_ID> \
  --range A1:Z3 \
  --as bot \
  --value-render-option FormattedValue
```

### D. 读取父目录子节点

```bash
lark-cli wiki nodes list \
  --params '{"space_id":"<SPACE_ID>","parent_node_token":"JAFEwKgpgiy3Ugk1gkicPpqRnnc"}' \
  --as bot \
  --page-all
```

### E. 读取单篇周报正文

```bash
lark-cli docs +fetch \
  --doc <DOCX_TOKEN> \
  --as bot
```

---

## 权限

| 操作 | 所需 scope |
|------|-----------|
| 读取 wiki 节点 | `wiki:wiki:readonly` 或相应 wiki read scope |
| 读取 docx 文档 | `docx:document:readonly` |
| 读取 spreadsheet | `sheets:spreadsheet:readonly` |

如果 bot 权限不足，按缺失 scope 处理，不要直接对 bot 使用 `auth login`。

---

## 常见错误处理

### 1. 表格链接解析后不是 sheet

说明用户给的不是电子表格链接，停止并提示用户提供工时分配表链接。

### 2. 找不到对应年月的 sheet

优先尝试：
- 从 sheet 标题匹配输入年月
- 如果链接里有 `sheet=<sheet_id>`，检查该 sheet 是否就是对应年月

仍找不到时，明确告知缺少对应月份 sheet，不要瞎猜。

### 3. 找不到对应月份周报

输出前先停止并说明：固定父目录中没有找到该年月周报。

### 4. 该姓名在该月周报中没有记录

则按表头顺序输出全部 APP，比例都为 `0%`。

### 5. 内容都是平台型工作且没有任何显式 APP

同样输出全部 APP 为 `0%`，不要无依据分配。

---

## 最终原则

1. **APP 集合永远来自工时表第一行，不要写死。**
2. **周报范围永远来自固定父目录 + 输入年月。**
3. **只分析指定姓名。**
4. **先显式命中，再关键词命中，最后才保守分摊。**
5. **最终只输出 `app + 比例`，不要有额外内容。**
