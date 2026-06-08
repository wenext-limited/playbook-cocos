---
name: lark-weekly-meeting-email
version: 1.3.0
description: "用法：/lark-weekly-meeting-email [飞书周会文档链接]。参数必填；根据飞书周会文档链接生成游戏周会纪要 Markdown 和 AI 量化 HTML 附件。当用户提到周会纪要、周会邮件、生成周会、周报、周会 md、weekly meeting summary 时使用。"
argument-hint: "[飞书周会文档链接]"
metadata:
  requires:
    bins: ["lark-cli", "python3"]
---

# 游戏周会纪要 Markdown 生成

> **前置条件：** 先阅读 [`../lark-ai-efficiency/SKILL.md`](../lark-ai-efficiency/SKILL.md) 了解飞书表格操作和认证规则。

根据飞书周会文档 + AI 量化统计表格，生成格式规范的 `.md` 周会纪要到桌面，同时生成 AI 量化 HTML 报告附件，并在 Markdown 中保留链接。

## 常量

| 常量 | 值 |
|------|------|
| 量化表格 spreadsheet_token | `YfqCs08y6hOAmBt2CrBcqMfXnvW` |
| 量化表格 wiki 链接 | `https://fikvmzrrhfl.feishu.cn/wiki/AGeLw73cbilCqIkR7DbcFTnpnDg` |
| 输出目录 | `~/Desktop/` |

## 输入

用户需提供飞书周会文档链接，格式如：

```text
https://fikvmzrrhfl.feishu.cn/wiki/FfzkwPrjdiFIavkqSR1c6hkcnAh
```

## 输出

- `~/Desktop/游戏周会纪要 - YYYYMMDD.md`
- `~/Desktop/游戏周会纪要 - YYYYMMDD - AI量化.html`

## 操作流程

### Step 1：并行读取两个数据源

同时读取飞书周会文档和 AI 量化表格数据：

```bash
# 1a. 从 URL 提取 token，获取文档 node 信息
lark-cli api GET /open-apis/wiki/v2/spaces/get_node \
  --params '{"token":"<WIKI_TOKEN>"}'

# 1b. 获取量化表格的 sheet 列表
lark-cli api GET /open-apis/sheets/v3/spreadsheets/YfqCs08y6hOAmBt2CrBcqMfXnvW/sheets/query
```

从 1a 响应获取 `obj_token` 和标题中的日期，然后：

```bash
# 1c. 读取周会文档内容
lark-cli api GET /open-apis/docx/v1/documents/<OBJ_TOKEN>/raw_content

# 1d. 读取与周会日期匹配的最新周量化 sheet 数据
lark-cli api GET /open-apis/sheets/v2/spreadsheets/YfqCs08y6hOAmBt2CrBcqMfXnvW/values/<SHEET_ID>
```

**选 sheet 规则**：优先选择标题包含周会日期所在周范围的 sheet（例如周会 `2026.05.29` 对应 `量化统计-202.5.25-5.29`）；不要默认取 index 0 的汇总 sheet。

**解析 sheet 数据**：A 列包含 mention JSON 数组，需从中提取 `name`/`en_name` 字段作为成员姓名，`type=text` 的内容作为工作内容。B~D 列分别为工作类型、人工预估(H)、AI实际(H)。E 列为公式，跳过并在 Python 中自行计算倍率。

### Step 2：智能改写文档内容为 Markdown 正文

将飞书文档原始表格内容提炼重写为结构化 Markdown。改写规则：

1. **问题复盘与经验总结**：这一节只写「线上问题 / 事故 / 故障 / 客诉 / 发布后问题 / 生产环境问题」及其经验总结。
   - 不要把普通技术调研、工具建设、个人经验沉淀、方案研究写到这一节。
   - 如果飞书文档的一、问题经验总结里没有明确线上问题，必须写 `暂无。`。
   - `暂无。` 后面补一个单独的 `<br>`，不要把 `<br>` 放在标题下面。
   - 普通技术沉淀应归入「技术需求」「AI-Coding」或「技术优化」，不要误放在问题复盘。
2. **重要事项推进**：固定拆成四个子分区。
   - `#### 【APP】业务需求`：
     - 必须从原文中识别出具体 APP / 项目标签，并按 APP 分组整理。
     - 保留原文里的最新命名与大小写，不要自作主张归一化。例如：`【gmparty】`、`【ludo】`、`【yoki】`、`【wyak】`、`【Yoki】` 等都应按文档原样保留。
     - 不能丢失具体业务项；像 `【gmparty】domino优化改造` 这类条目必须单独保留，不能被笼统概括吞掉。
   - `#### 【技术需求】游戏技术建设`：
     - 归入游戏工程、客户端能力、分辨率、日志、性能、插件完善、稳定性等技术建设项。
   - `#### 【AI-Coding】工具与经验沉淀`：
     - 将 Skill 研发、工具链建设、工作流设计、AI 自动化、技术调研、方法论沉淀归入此节。
   - `#### 【技术优化】其他工程效能`：
     - 放置不完全属于 APP 业务、也不完全属于 AI-Coding 的通用工程优化项。
3. **待启动 / 计划中**：保留明确未启动、待排期、暂缓、待开始类事项；如无则写 `暂无`。
4. **周会纪要文档目录**：保留本次周会 wiki 链接。
5. **AI量化**：Markdown 中只放简明摘要和 HTML 附件链接；完整统计、图表、明细写入 HTML 附件。

### Step 3：排版要求

- 以 **Typora 友好** 为优先目标，不追求纯通用 Markdown 的最简写法。
- `##`、`###`、`####` 标题上下都要空一行。
- `##`、`###`、`####` 标题后的正文前，补一个单独的 `<br>`。
- 每个 APP 分组标题使用 `#####`，例如 `##### 【gmparty】`，标题下面补一个单独的 `<br>`。
- 每个事项标题统一使用 `**◉ 事项名**`。
- 每个事项固定写成三行：
  - `**◉ 事项名**`
  - `**内容**：xxx`
  - `**进度**：xxx`
- `内容` 和 `进度` 前 **不要** 加 `-` 横线。
- 每个事项块结束后补一个单独的 `<br>`。
- `问题复盘与经验总结` 在无内容时写：
  - `暂无。`
  - 下一行单独写 `<br>`
- `周会纪要文档目录` 下直接放来源链接，不要把来源信息放在文档开头。
- `周会纪要文档目录` 标题下面不要直接跟 `<br>`；应先放来源链接，再在 `## 四、AI 量化` 前补一个单独的 `<br>`。
- `HTML 附件` 的链接前不要加 `-` 横线。
- 保持层级分明：章节 > 子章节 > 分组 > 事项。

## Markdown 输出模板

```md
# 游戏周会纪要 - YYYYMMDD

## 一、问题复盘与经验总结

暂无。
<br>

## 二、重要事项推进
<br>

### 1. 已完成 / 进行中
<br>

#### 【APP】业务需求
<br>

##### 【项目标签】
<br>

**◉ 事项标题**  
**内容**：xxx  
**进度**：xxx  
<br>

##### 【项目标签】
<br>

**◉ 事项标题**  
**内容**：xxx  
**进度**：xxx  
<br>

#### 【技术需求】游戏技术建设
<br>

**◉ 事项标题**  
**内容**：xxx  
**进度**：xxx  
<br>

#### 【AI-Coding】工具与经验沉淀
<br>

**◉ 事项标题**  
**内容**：xxx  
**进度**：xxx  
<br>

#### 【技术优化】其他工程效能
<br>

**◉ 事项标题**  
**内容**：xxx  
**进度**：xxx  
<br>

### 2. 待启动 / 计划中
<br>

**◉ 事项标题**  
**内容**：xxx  
**进度**：xxx  
<br>

## 三、周会纪要文档目录

来源：[周会-YYYY.MM.DD](<WIKI_URL>)  
AI 量化数据：[游戏AI提效量化](https://fikvmzrrhfl.feishu.cn/wiki/AGeLw73cbilCqIkR7DbcFTnpnDg)
<br>

## 四、AI 量化
<br>

### 1. 摘要
<br>

| 指标 | 数值 |
|---|---:|
| 团队成员 | N 人 |
| 提交记录 | N 条 |
| 人工预估总时长 | N H |
| AI 实际总时长 | N H |
| 累计节省工时 | N H |
| 节省比例 | N% |
| 团队平均提效倍率 | Nx |

### 2. HTML 附件
<br>

[游戏周会纪要 - YYYYMMDD - AI量化.html](./游戏周会纪要%20-%20YYYYMMDD%20-%20AI量化.html)
```

## AI 量化 HTML 附件要求

生成 `~/Desktop/游戏周会纪要 - YYYYMMDD - AI量化.html`，包含：

- 概览卡片：团队成员、提交记录、人工预估总时长、AI 实际总时长、累计节省工时、团队平均提效倍率。
- 成员汇总卡片或表格：记录数、人工预估、AI 实际、节省工时、综合提效倍率。
- 工作类型分布。
- 全量记录明细。
- 可以使用纯 HTML/CSS + 表格，也可以使用 Chart.js CDN；优先保证离线可读和数据完整。

## 保存

从文档标题（如 `周会-2026.05.29`）提取日期，转换为 `YYYYMMDD`，保存到：

```bash
~/Desktop/游戏周会纪要\ -\ YYYYMMDD.md
~/Desktop/游戏周会纪要\ -\ YYYYMMDD\ -\ AI量化.html
```

## 权限

| 操作 | 所需 scope |
|------|-----------|
| 读取 wiki 文档 | `wiki:wiki:readonly` |
| 读取 docx 文档 | `docx:document:readonly` |
| 读取 spreadsheet | `sheets:spreadsheet:readonly` |

如遇权限不足：

```bash
lark-cli auth login --scope "wiki:wiki:readonly" --scope "docx:document:readonly" --scope "sheets:spreadsheet:readonly"
```

## 注意事项

- 输出 Markdown + HTML 附件，不生成 `.eml`。
- E 列（提效倍率）是公式，读取时可能返回公式字符串，需在 Python 中自行计算 `round(人工预估/AI实际, 1)`。
- A 列内容可能是 list，也可能是 JSON 字符串；两种格式都要兼容。
- 过滤空行、说明行、无成员或无工作内容的行。
- 「问题复盘」必须严格限定线上问题；没有线上问题就写暂无，不能用普通技术调研凑内容。
