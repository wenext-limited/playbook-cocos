---
name: check-game-feature-coverage
description: 查询某个功能代码在各APP中的版本覆盖情况。当用户说"查功能覆盖"、"哪个APP有这个功能"、"功能版本覆盖"、"feature coverage"时使用此 skill。执行前先让用户选择单个项目目录，或选择一个项目父目录用于批量扫描。
argument-hint: [功能关键词或文件名] [--project <项目目录> | --parent <项目父目录>]
allowed-tools: [Read, Bash, Grep, Glob, AskUserQuestion]
---

# 游戏功能版本覆盖率查询

根据用户给出的功能关键词/文件名，自动完成以下流程：
1. 先让用户选择扫描范围：单个项目目录，或一个包含多个项目的父目录
2. 在选定范围内搜索该功能代码
3. 找到每个命中项目 main 分支上该功能最早合入 commit 对应的 version.txt 版本号
4. 从飞书知识库"游戏版本管理（分APP）"读取各 APP 的线上游戏版本
5. 对比输出覆盖率表格

## 输入规则

### 1. 先确定扫描范围

如果用户没有显式传入 `--project <项目目录>` 或 `--parent <项目父目录>`，必须先用 `AskUserQuestion` 让用户二选一：
- **单个项目**：只检查一个项目根目录
- **项目父目录**：扫描一个父目录下一层所有项目目录

如果用户只口头说了"查某个功能有没有"但没有给路径，不要默认写死 `~/cocos-game/`，也不要直接让用户手填；应先自动发现候选目录，再让用户点选。只有候选里没有合适项时，才让用户通过 `Other` 输入自定义路径。

### 2. 候选目录发现规则

在让用户点选前，先用 `Bash` 发现候选：

- **单个项目候选**：优先收集看起来像项目根目录的路径（通常包含 `assets/`）
- **父目录候选**：优先收集其下一层包含多个项目目录的路径
- 候选来源按优先级：
  1. 用户消息里明确提到的路径
  2. 当前工作目录及其上一级目录附近
  3. 本机上常用的游戏项目聚合目录（仅在真实存在时加入候选，不要凭空假设）

候选不要铺太多，优先保留最像目标的 2~4 个，用 `AskUserQuestion` 展示；选项标题用目录名，description 里带完整路径，避免同名目录选错。用户也可以通过 `Other` 自定义输入。

### 3. 路径校验

拿到路径后先校验：
- `--project`：路径必须存在，且看起来是项目根目录（通常包含 `assets/`）
- `--parent`：路径必须存在，且其下一层至少能列出候选项目目录

若路径无效，明确报错并让用户重新选择，不要静默回退到其他默认目录。

## 知识库信息

- 知识库 space_id: `7293040445717954564`
- 根节点 token: `L3AhwVHkui5MwMkXj7bcUQO9noe`

APP 子节点不要在 skill 中写死。执行时必须根据根节点动态读取当前 APP 列表和对应的 `node_token`，再继续后续步骤。

## 执行步骤

### 第一步：确定项目列表

#### 1.1 先让用户选择“单个项目”还是“项目父目录”

如果参数里没有显式传 `--project` 或 `--parent`，先用 `AskUserQuestion` 让用户选择扫描模式。

#### 1.2 自动发现候选目录并让用户点选

根据上一步选择的模式，先自动发现候选，再让用户选择：

##### 情况 A：用户选择单个项目

先找候选项目目录，例如：

```bash
find <候选搜索根目录> -mindepth 1 -maxdepth 2 -type d -name assets -print
```

拿到结果后，转换成项目根目录列表，只保留最相关的 2~4 个候选，用 `AskUserQuestion` 展示，例如：
- <项目A目录名>
- <项目B目录名>
- <项目C目录名>
- Other（用户手填）

用户选中后，再校验：

```bash
project_dir="<用户选择的项目目录>"
if [ ! -d "$project_dir/assets" ]; then
  echo "invalid project: $project_dir"
fi
```

##### 情况 B：用户选择项目父目录

先找候选父目录，例如：

```bash
find <候选搜索根目录> -mindepth 0 -maxdepth 2 -type d
```

然后筛出“下一层包含多个项目目录，且这些项目目录通常带 `assets/`”的父目录，只保留最相关的 2~4 个候选，用 `AskUserQuestion` 展示，例如：
- ~/cocos-game
- ~/game-projects
- ~/workspace/cocos
- Other（用户手填）

用户选中后，再校验并列出项目：

```bash
parent_dir="<用户选择的项目父目录>"
find "$parent_dir" -mindepth 1 -maxdepth 1 -type d
```

优先把包含 `assets/` 的目录视为候选项目目录。

#### 1.3 候选为空时的回退策略

如果自动发现不到合适候选，再让用户通过 `Other` 或补充消息手填路径；不要在没有候选时擅自选一个默认目录。

### 第二步：在候选项目中搜索功能代码

在候选项目目录中 grep 搜索用户给出的关键词，排除 `temp/`、`build/`、`node_modules/` 目录：

```bash
for dir in <候选项目目录列表>; do
  name=$(basename "$dir")
  result=$(grep -rl "关键词" "$dir/assets/" --include="*.ts" --include="*.js" 2>/dev/null | head -1)
  if [ -n "$result" ]; then
    echo "YES | $name | $result"
  else
    echo "NO  | $name"
  fi
done
```

对于匹配的项目，记录项目名和涉及的源码文件。

### 第三步：查找功能最早合入 main 的版本号

对每个匹配的项目，找到该功能核心文件最早合入 main 的 commit，然后查看该 commit 时的 version.txt：

```bash
cd <项目目录>
# 找到功能核心文件（如 RemoteSpriteFrameManager.ts）最早添加的 commit
git log --oneline origin/main --diff-filter=A -- <核心文件路径> | tail -1
# 查看该 commit 时的 version.txt
git show <commit_hash>:build-templates/web-mobile/version.txt
```

从 version.txt JSON 中提取 `"version"` 字段值，即为该功能引入时的最低版本号。

**如果该 commit 时 version.txt 不存在**，则向更后的 commit 查找 version.txt 首次出现的版本号：
```bash
git log --oneline <commit_hash>..origin/main --diff-filter=A -- build-templates/web-mobile/version.txt | tail -1
# 然后查看该 commit 的 version.txt
```

**注意**：搜索 `--diff-filter=A` 时用核心文件（如管理器类），不用所有引用文件，避免因重构/重命名产生多个 commit。

### 第四步：通过飞书映射表精确读取 APP 和游戏版本

#### 4.1 先从根节点动态列出当前 APP 子节点

不要依赖 skill 里静态维护的 APP 表。每次执行时都先读取根节点的直接子节点，获取当前 APP 的 `title` 和 `node_token`：

```bash
lark-cli wiki nodes list --params '{"space_id":"7293040445717954564","parent_node_token":"L3AhwVHkui5MwMkXj7bcUQO9noe"}' --as user --page-all -q '.data.items[]|{title,node_token}'
```

后续所有 APP 遍历，都以这一步实际读到的结果为准。

#### 4.2 读取“游戏发版配置（线上）”中的准确映射关系

不要再根据项目目录名动态生成关键词去模糊匹配游戏表标题。优先把 `游戏发版配置（线上）` 这张表当作**唯一可信的映射来源**。

- 映射表 spreadsheet token：`XIDvwIqk9irs7MkclAmc6wdenfh`
- 这张表中**每个 APP 对应一个 sheet**，sheet 名与 APP 名一致（如 `Lama Ludo`、`Wyak`、`HiChat`）
- 每个 APP sheet 中：
  - A 列：准确游戏名
  - B 列：该游戏在对应 APP 知识库节点下的 `node_token`

先读取映射表的 sheet 列表，建立 `APP title -> sheet_id` 的对应关系：

```bash
lark-cli sheets +info --spreadsheet-token "XIDvwIqk9irs7MkclAmc6wdenfh" --as user
```

再读取当前 APP 对应 sheet 的 A、B 两列，建立 `游戏名 -> node_token` 的精确映射：

```bash
lark-cli sheets +read --spreadsheet-token "XIDvwIqk9irs7MkclAmc6wdenfh" --range "<sheet_id>!A1:B80" --as user
```

**匹配规则：**
- 项目目录名先归一化成游戏 key，例如：
  - `cocos-game-greedybox` -> `greedybox`
  - `cocos-game-roulette` -> `roulette`
  - `cocos-game-pyramid-slots` -> `pyramid-slots`
- 用这个游戏 key 去当前 APP 的映射 sheet 的 A 列做**精确匹配**
- 只有映射表里存在该游戏名，才继续查询该 APP 的线上版本
- 若映射表里没有该游戏名，则该 APP 该游戏直接记为 `-`，不要再按标题模糊猜测

#### 4.3 用映射表里的 `node_token` 反查实际游戏表格

对每个 APP，先列出其知识库子节点，获取每个节点的 `node_token`、`title`、`obj_token`：

```bash
lark-cli wiki nodes list --params '{"space_id":"7293040445717954564","parent_node_token":"<动态读取到的APP node_token>"}' --as user --page-all -q '.data.items[]|{node_token,title,obj_token}'
```

然后用 4.2 里映射表给出的 `node_token` 在这批子节点中做精确查找：

- 命中后，取该节点对应的 `obj_token` 作为实际游戏表格 token
- `title` 仅用于展示，不再作为匹配依据
- 若映射表给出的 `node_token` 在当前 APP 子节点里找不到，视为映射异常，输出时标记为 `-`，并明确提示“映射存在但节点未找到”

#### 4.4 读取精确命中的表格版本列

```bash
# 先获取 sheet_id
lark-cli sheets +info --spreadsheet-token "<obj_token>" --as user -q '.data.sheets.sheets[0].sheet_id'

# 读取版本列（A3:A30，前两行是表头）
lark-cli sheets +read --spreadsheet-token "<obj_token>" --range "<sheet_id>!A3:A30" --as user -q '.data.valueRange.values[][0]' | grep -v null
```

版本从新到旧排列，第一个值即为当前线上最新版本。

### 第五步：对比并输出表格

对每个有该功能的项目，比较：
- 功能最低版本 vs 各 APP 线上版本
- 如果 APP 线上版本 >= 功能最低版本 → ✅ 已包含
- 如果 APP 线上版本 < 功能最低版本 → ❌ 未包含
- 如果 APP 无该游戏 → -

输出格式：

| APP | 游戏1 (≥X.Y.Z) | 游戏2 (≥X.Y.Z) | ... |
|-----|----------------|----------------|-----|
| <APP名称> | 版本号 ✅/❌ | - | ... |
| ... | ... | ... | ... |

最后汇总需要关注的 APP 列表（即存在 ❌ 的）。

## 注意事项

- 飞书 API 需要用户身份（`--as user`），确保已 `lark-cli auth login`
- 某些 APP 可能没有某些游戏，用 `-` 表示
- 优先使用 `游戏发版配置（线上）` 中各 APP sheet 的 A/B 列映射关系作为唯一可信来源；不要再按游戏表标题做模糊匹配
- 如果映射表里存在游戏名，但对应 `node_token` 在该 APP 的知识库子节点中不存在，应视为映射异常，结果标记为 `-`，并在输出中说明
- 版本比较不能用简单字符串比较；应按 `major.minor.patch` 分段比较，避免 `1.1.2` 与 `1.0.36` 这类情况判断错误
