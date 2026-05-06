---
name: cocos-js-error-fix
description: "诊断 App Cocos JS 错误根因：查询 ClickHouse Top 1 错误完整堆栈 → 解析帧分类 → 从飞书 Wiki 读取最新发布版本 → 拉取对应 release 分支源码 → 双轨搜索（业务代码 + Cocos 引擎文档）→ 输出根因分析与修复建议"
argument-hint: "<app名> <游戏名> [时间范围，如：最近1天/最近3天/最近7天，默认最近1天]"
allowed-tools:
  - Bash
  - AskUserQuestion
  - mcp__cocos-rag__search_cocos_docs
  - mcp__cocos-rag__search_cocos_source
---

<objective>
自动化诊断 App 上报的 Cocos JS 报错根因。无需 source map，通过函数名 + 关键词搜索定位业务代码与引擎代码，给出可执行的修复建议。
</objective>

<clickhouse_config>
HOST=cc-t4nnjid28p401lh59-ck-l8.clickhouseserver.singapore.rds.aliyuncs.com
PORT=8123
USER=clickhouse_read
PASSWORD=!NQ%mifU%U%oh48wD&U3
</clickhouse_config>

<game_type_source>
GameType 定义从 GitHub 实时拉取：
```bash
gh api repos/wenext-limited/cocos-game-wsdk/contents/assets/Const.ts --jq '.content' | base64 -d
```
解析 `static GameType = { ... }` 块，提取 KEY: NUMBER 映射及注释中文别名。
</game_type_source>

<repo_config>
配置文件：`~/.config/cocos-diagnose/game-repos.json`

结构示例：
```json
{
  "_wiki": {
    "space_id": "7293040445717954564",
    "root_token": "L3AhwVHkui5MwMkXj7bcUQO9noe",
    "app_nodes": {
      "fungo": "NlLvwBbyTifSXLkCXglcUzJonWh"
    }
  },
  "lucky_soccer": {
    "repo": "cocos-game-lucky-soccer",
    "wiki_sheet_token": "UaJwsbk87h2F2ktIHVfcYuhXnNb"
  }
}
```

版本管理规范：
- 游戏版本通过飞书 Wiki 管理，路径：版本管理根节点 → App 子节点 → 游戏 sheet
- 每个游戏 sheet 有 android / ios 两个 tab
- android tab 列顺序：版本(A)、versionCode(B)、minClientVersion(C)、changeList(D)、resourceUrl(E)
- 取 versionCode 最大的行对应版本号，GitHub 分支名为 `release/{version}`（如 `release/1.0.15`）
- 源码缓存目录：`/tmp/cocos-game-source/{game_dir}/`（单目录，按分支 checkout 切换，节省磁盘）
</repo_config>

<process>

## 1. 检查依赖并拉取 GameType 映射

检查 `gh` CLI 是否已安装：
```bash
gh --version 2>/dev/null || echo "GH_NOT_FOUND"
```

若输出 `GH_NOT_FOUND`，按平台提示安装方式后**终止**：

```
❌ 未检测到 gh CLI，请先安装：

  macOS：
    brew install gh

  Windows（任选其一）：
    # winget（Windows 10/11 自带）
    winget install --id GitHub.cli

    # Scoop
    scoop install gh

    # Chocolatey
    choco install gh

    # 或直接下载安装包：
    https://github.com/cli/cli/releases/latest
    （下载 gh_x.x.x_windows_amd64.msi）

安装完成后执行 `gh auth login` 完成授权，再重新运行本命令。
```

拉取 GameType（复用 cocos-js-error 逻辑，解析出 name→id 映射及中文别名）。

## 2. 解析参数 & 交互确认

从 $ARGUMENTS 解析参数，规则如下：

- **app 名**（必填）：未提供则用 AskUserQuestion 要求用户输入，不得跳过
- **游戏名**（必填）：未提供则用 AskUserQuestion 要求用户输入，不得跳过
- **时间范围**（可选）：未提供时默认 `最近1天`，无需询问用户，直接使用默认值

时间范围解析规则：`最近N天` → `INTERVAL N DAY`，`最近N小时` → `INTERVAL N HOUR`。

## 3. 查询 Top 1 错误完整堆栈

确认参数后，用 Python 执行 ClickHouse 查询，取次数最多的 1 条错误，**获取完整 err_msg（不截断）**：

```python
import urllib.request, json, base64

host = "cc-t4nnjid28p401lh59-ck-l8.clickhouseserver.singapore.rds.aliyuncs.com"
port = 8123
user = "clickhouse_read"
password = "NQ%mifU%U%oh48wD&U3"

app_name = "{APP_NAME}"
game_type_id = {GAME_TYPE_ID}
interval_value = {INTERVAL_VALUE}
interval_unit = "{INTERVAL_UNIT}"

# 取次数最多的 1 条完整 err_msg（不截断）
query = f"""
SELECT
    count() AS cnt,
    JSONExtractString(event_value, 'err_msg') AS err_msg
FROM {app_name}.event_local_prod
WHERE event_time >= now() - INTERVAL {interval_value} {interval_unit}
  AND event_time <= now()
  AND action = 'cocos_js'
  AND event_id = 'js_error'
  AND JSONExtractUInt(event_value, 'gameType') = {game_type_id}
  AND position(JSONExtractString(event_value, 'err_msg'), '[JsError]: Script error. -') = 0
GROUP BY err_msg
ORDER BY cnt DESC
LIMIT 1
FORMAT JSON
"""

url = f"http://{host}:{port}/"
credentials = base64.b64encode(f"{user}:{password}".encode()).decode()
req = urllib.request.Request(url, data=query.encode("utf-8"), method="POST")
req.add_header("Authorization", f"Basic {credentials}")
resp = urllib.request.urlopen(req, timeout=30)
data = json.loads(resp.read().decode())
rows = data.get("data", [])

if not rows:
    print("NO_DATA")
else:
    row = rows[0]
    print(f"COUNT:{row['cnt']}")
    print(f"ERR_MSG_START")
    print(row['err_msg'])
    print(f"ERR_MSG_END")
```

若输出 `NO_DATA`，提示无数据并终止。

## 4. 解析堆栈帧

用 Python 解析上一步得到的 err_msg，提取结构化信息：

```python
import re, json

err_msg = """..."""  # 填入上一步获取的完整 err_msg

lines = err_msg.strip().split('\n')

# 第一行或前几行（非 at 开头）是错误消息
error_lines = []
stack_lines = []
for line in lines:
    line = line.strip()
    if line.startswith('at '):
        stack_lines.append(line)
    elif not stack_lines:
        error_lines.append(line)

error_message = ' '.join(error_lines)

# 解析堆栈帧
engine_frames = []   # cc.js 帧
business_frames = [] # 业务代码帧（非 cc.js）
game_dir = None

frame_pattern = re.compile(r'^at\s+(?:([\w.$]+(?:\.[\w.$]+)*)\s+\()?(.+?):(\d+):(\d+)\)?$')

for frame in stack_lines:
    m = frame_pattern.match(frame)
    if not m:
        continue
    func_name = m.group(1) or ''
    file_path = m.group(2) or ''

    if '/cc.js' in file_path:
        if func_name:
            engine_frames.append({'func': func_name, 'file': 'cc.js'})
    else:
        # 业务代码帧：提取游戏目录名
        assets_match = re.search(r'/assets/([\w-]+)/', file_path)
        if assets_match and not game_dir:
            game_dir = assets_match.group(1)
        # 提取文件名（去掉完整路径）
        file_name = file_path.split('/')[-1]
        business_frames.append({'func': func_name, 'file': file_name, 'full_path': file_path})

# 提取错误关键词（用于业务代码搜索）
# 从错误消息中提取有意义的标识符（驼峰、下划线词）
keywords = re.findall(r"'([^']+)'", error_message)  # 引号内的词
keywords += re.findall(r'\b([a-z][a-zA-Z0-9]{4,})\b', error_message)  # 驼峰词
keywords = list(dict.fromkeys(keywords))[:5]  # 去重，最多5个

result = {
    "error_message": error_message,
    "game_dir": game_dir,
    "engine_funcs": [f['func'] for f in engine_frames[:5] if f['func']],
    "business_frames": business_frames,
    "search_keywords": keywords
}
print(json.dumps(result, ensure_ascii=False, indent=2))
```

从输出中提取：
- `error_message`：错误消息文本
- `game_dir`：游戏目录名（如 `lucky_soccer`）
- `engine_funcs`：Cocos 引擎帧函数名列表（前5个）
- `search_keywords`：搜索关键词列表

## 5. 确定游戏 GitHub Repo 及发布版本

### 5a. 确定 repo 名

读取配置文件：
```bash
cat ~/.config/cocos-diagnose/game-repos.json 2>/dev/null || echo "{}"
```

若 `{game_dir}.repo` 已有值，直接使用。

若没有，用 `gh` 探测并写入：
```bash
gh repo list wenext-limited --json name -L 300 --jq '.[].name' | grep -i "{GAME_DIR}" | head -5
```
若找到多个，用 AskUserQuestion 让用户确认。

### 5b. 从飞书 Wiki 读取最新发布版本（新增）

配置文件中 `{game_dir}.wiki_sheet_token` 存储游戏 sheet 的 token。

**若 wiki_sheet_token 已有**，直接读取：
```bash
# 先查 android tab 的 sheet_id
lark-cli api GET "/open-apis/sheets/v3/spreadsheets/{SHEET_TOKEN}/sheets/query" --as user \
  | python3 -c "import sys,json; d=json.load(sys.stdin); [print(s['sheet_id'], s['title']) for s in d['data']['sheets']]"

# 读取 android tab 全部数据
lark-cli api GET "/open-apis/sheets/v2/spreadsheets/{SHEET_TOKEN}/values/{ANDROID_SHEET_ID}" --as user
```

用 Python 取 versionCode 最大的行：
```python
import json, sys
d = json.load(sys.stdin)
rows = d['data']['valueRange']['values']
# rows[0]=标题行, rows[1]=字段名行, rows[2..]=数据行
data_rows = rows[2:]
latest = max(data_rows, key=lambda r: int(r[1]) if len(r) > 1 and str(r[1]).isdigit() else 0)
version = latest[0]   # 如 "1.0.15"
print(f"VERSION:{version}")
print(f"BRANCH:release/{version}")
```

**若 wiki_sheet_token 未有**，通过 wiki API 遍历查找：
```bash
# 从配置取 app 的 wiki 节点 token（_wiki.app_nodes.{app_name}）
# 列出该 app 下所有子节点，找标题匹配游戏名的 sheet
lark-cli api GET /open-apis/wiki/v2/spaces/7293040445717954564/nodes \
  --as user --params '{"parent_node_token":"{APP_NODE_TOKEN}","page_size":50}'
```
找到后将 `obj_token` 写入配置的 `wiki_sheet_token`，然后执行上面的读取逻辑。

**若 App 的 wiki 节点也未有**，通过根节点 `L3AhwVHkui5MwMkXj7bcUQO9noe` 遍历一层找到对应 App 节点，写入 `_wiki.app_nodes.{app_name}`。

确认版本后，用 Python 更新配置文件，写入 repo 名和 wiki_sheet_token：
```python
import json, os
config_path = os.path.expanduser("~/.config/cocos-diagnose/game-repos.json")
with open(config_path) as f:
    cfg = json.load(f)
cfg.setdefault("{GAME_DIR}", {})
cfg["{GAME_DIR}"]["repo"] = "{REPO_NAME}"
cfg["{GAME_DIR}"]["wiki_sheet_token"] = "{SHEET_TOKEN}"
with open(config_path, 'w') as f:
    json.dump(cfg, f, ensure_ascii=False, indent=2)
```

## 6. 拉取 Release 分支源码（单目录 + git checkout）

每个游戏只保留一个本地仓库目录，通过 `git fetch` + `git checkout` 切换到目标分支，节省磁盘空间：

```bash
GAME_DIR="{GAME_DIR}"
REPO_NAME="{REPO_NAME}"
VERSION="{VERSION}"          # 来自 Step 5b，如 1.0.15
BRANCH="release/${VERSION}"
REPO_DIR="/tmp/cocos-game-source/${GAME_DIR}"

if [ -d "$REPO_DIR/.git" ]; then
    # 仓库已存在，fetch 目标分支并 checkout
    echo "仓库已存在，切换到 ${BRANCH} ..."
    cd "$REPO_DIR"
    # 丢弃本地未提交改动（防止上次 fix 遗留的修改导致切换冲突）
    git checkout -- . 2>&1
    git clean -fd 2>&1
    git fetch origin "$BRANCH" --depth 1 2>&1
    git checkout -B "$BRANCH" "origin/$BRANCH" 2>&1
    echo "已切换到：$BRANCH"
else
    # 首次克隆
    echo "首次克隆 wenext-limited/${REPO_NAME} @ ${BRANCH} ..."
    gh repo clone "wenext-limited/${REPO_NAME}" "$REPO_DIR" -- --depth 1 --branch "$BRANCH" 2>&1
    echo "克隆完成"
fi

echo "--- 当前分支 ---"
cd "$REPO_DIR" && git branch --show-current
echo "--- 目录结构 ---"
ls "$REPO_DIR" 2>/dev/null | head -20
```

若 fetch/checkout 失败（分支不存在），提示王总并询问是否改用最新可用分支或跳过业务代码搜索。

## 7. 双轨搜索

### 轨道 A：业务代码关键词搜索

在 tag 源码里搜索错误相关关键词（TypeScript 源文件）：

```bash
REPO_DIR="/tmp/cocos-game-source/{GAME_DIR}"
KEYWORDS="{KEYWORD1} {KEYWORD2} ..."  # 来自 Step 4 提取的 search_keywords

# 搜索 TypeScript 源码（排除编译产物目录）
for kw in $KEYWORDS; do
    echo "=== 搜索: $kw ==="
    grep -rn "$kw" "$REPO_DIR" \
        --include="*.ts" \
        --exclude-dir=node_modules \
        --exclude-dir=dist \
        --exclude-dir=build \
        -l 2>/dev/null | head -10
done

# 对找到的文件，提取相关行上下文（前后5行）
# 优先搜索 assets/ 目录下的业务代码
grep -rn "{PRIMARY_KEYWORD}" "$REPO_DIR/assets" \
    --include="*.ts" \
    -A 5 -B 5 2>/dev/null | head -60
```

### 轨道 B：Cocos 引擎函数搜索

对 Step 4 提取的引擎帧函数名，调用 cocos-rag MCP 工具：

**操作**：依次对 `engine_funcs` 列表中的函数名调用：
- `mcp__cocos-rag__search_cocos_source`，query 设为函数名，top_k=3
- `mcp__cocos-rag__search_cocos_docs`，query 设为错误消息关键词，top_k=3

## 8. 综合分析并输出诊断报告

整合以上所有信息，按以下格式输出完整诊断报告：

```
═══════════════════════════════════════════════════
  Cocos JS 错误诊断报告
  App: {APP_NAME} | 游戏: {GAME_NAME}({GAME_DIR})
  版本: {VERSION} | 时间范围: 最近 {N} {UNIT}
═══════════════════════════════════════════════════

【错误信息】
  {error_message}
  出现次数：{cnt} 次（最近 {N} 天/小时）

【堆栈分析】
  业务代码层：{game_dir}/index.js（编译产物，无 source map）
  Cocos 引擎层调用链：
    {engine_func_1} → {engine_func_2} → ...

【业务代码线索】
  在 {REPO_NAME} 源码中搜索到以下相关文件：
  - {file_path}:{line}
    {code_snippet}
  ...

【Cocos 引擎上下文】
  函数 {engine_func}：
    {cocos_rag_result}
  ...

【根因分析】
  {根因说明，结合错误消息、业务代码、引擎代码三方分析}

【修复建议】
  1. {建议一}
     ```typescript
     {修复代码片段}
     ```
  2. {建议二（如有）}

【参考资料】
  - Cocos 文档：{相关文档链接（来自 cocos-rag）}
═══════════════════════════════════════════════════
```

若业务代码搜索无结果，说明需要人工对照编译产物和源码；仍输出引擎层分析和通用修复建议。

## 9. 可选：自动修复并提交 PR

报告输出完毕后，用 AskUserQuestion 询问后续操作：

```
问题：是否基于诊断报告自动修复并提交 PR？
选项：
  - 跳过（仅查看报告）
  - 自动修复并提交 PR
```

若用户选择"自动修复并提交 PR"，执行以下流程：

### 9a. 准备 fix 分支

分支名规则：`feature/fix_js_error_{错误简介}`
- 错误简介从 Step 8【错误信息】提炼，取核心关键词，全小写，用 `_` 连接
- 示例：`feature/fix_js_error_cross_origin_texture`、`feature/fix_js_error_null_spriteframe`

```bash
REPO_DIR="/tmp/cocos-game-source/{GAME_DIR}"
REPO_NAME="{REPO_NAME}"

# 构造 branch 名：feature/fix_js_error_{错误简介}
# 错误简介由 Claude 根据 error_message 自动生成（英文小写，下划线分隔，不超过5词）
FIX_BRANCH="feature/fix_js_error_{ERROR_SLUG}"

cd "$REPO_DIR"

# 确保 remote 指向正确
git remote -v

# 从 origin/main 拉取最新
git fetch origin main --depth 1
git checkout -B "$FIX_BRANCH" FETCH_HEAD
echo "已创建分支：$FIX_BRANCH"
```

### 9b. 应用修复

根据 Step 8【修复建议】中的代码片段，直接修改对应源文件。

**修复约束（必须严格遵守）：**

**范围约束**
- 仅修改诊断报告中明确定位的文件和函数，不扩散改动
- 不引入新依赖，不大范围重构
- 每个改动最小化，只解决本次报错的根因
- 不得修改未在堆栈中出现的代码行

**语法约束（Cocos TypeScript 项目规范）**
- 禁止使用 `===` 或 `!==` 运算符，统一使用 `==` 和 `!=`
- 禁止引入 `any` 类型，如需通用类型使用 `unknown` 并做类型收窄

**Cocos 资源管理约束**
- 新创建的 `SpriteFrame`、`Texture2D` 等资源，若在 catch 块中未成功挂载，必须调用 `.destroy()` 释放，防止内存泄漏
- 不得在修复代码中新增事件监听，若新增必须在 `onDestroy` 中对应移除
- 异步回调中操作节点前，必须检查节点有效性（`sp && sp.isValid && sp.node`），此约束在修复代码中同样适用

**null/undefined 约束**
- 修复代码中所有新增的变量访问，必须有 null/undefined 判断或可选链 `?.`
- 数组访问必须有越界检查

**不确定性约束**
- 若修复依赖未在源码中找到的上下文，必须在 diff 展示时明确说明不确定性，不得假设实现

修改完成后，展示 diff 供王总确认：

```bash
cd "$REPO_DIR"
git diff --stat
git diff
```

### 9c. 提交并推送

确认 diff 无误后提交：

```bash
cd "$REPO_DIR"

# 暂存所有修改文件
git add -p   # 逐块确认，或 git add {修改的文件路径}

# 提交信息格式：fix: {错误类型简述} in {文件名}
COMMIT_MSG="fix: catch cross-origin SecurityError in {修改文件名}

Root cause: texSubImage2D rejects cross-origin tainted image loaded
via loadRemote in offline H5 (file:// origin) on Android WebView.
Add try-catch to fall back to default avatar on SecurityError.

Diagnosed by /cocos-js-error-fix — {APP_NAME}/{GAME_NAME} {VERSION}"

git commit -m "$COMMIT_MSG"

# 推送到远端
git push origin "$FIX_BRANCH"
echo "已推送：$FIX_BRANCH"
```

### 9d. 创建 PR

```bash
cd "$REPO_DIR"

gh pr create \
  --repo "wenext-limited/{REPO_NAME}" \
  --base main \
  --head "$FIX_BRANCH" \
  --title "fix: [{GAME_NAME}] {错误类型简述}" \
  --body "## 问题
$(Step 8 中的【错误信息】和出现次数)

## 根因
$(Step 8 中的【根因分析】)

## 修复
$(Step 8 中的【修复建议】，保留代码片段)

## 影响范围
- 文件：{修改的文件路径}
- 函数：{修改的函数名}
- 无新增依赖，仅加防御性 try-catch / 回退逻辑

---
> 由 /cocos-js-error-fix 自动诊断并生成 | App: {APP_NAME} | 版本: {VERSION}"
```

PR 创建完成后，将 PR 链接直接发送到对话中，格式如下：

```
PR 已创建：{PR_URL}
```

提示王总 review 后合并。

</process>

<success_criteria>
- [ ] ClickHouse 成功查询到 Top 1 错误完整堆栈
- [ ] 堆栈解析成功：提取出错误消息、游戏目录名、引擎帧函数名
- [ ] 游戏 repo 已确认（配置文件命中或探测后确认）
- [ ] 源码已拉取到本地缓存
- [ ] 业务代码搜索完成（有结果或明确说明未找到）
- [ ] cocos-rag 搜索引擎函数上下文完成
- [ ] 输出包含：根因分析 + 至少 1 条修复建议 + 代码片段
- [ ] （可选）fix 分支已创建并基于 origin/main
- [ ] （可选）修复已提交并推送至远端
- [ ] （可选）PR 已创建，包含根因说明和修复内容
</success_criteria>
