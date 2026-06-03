---
name: cocos-resource-cleanup
description: 检查 Cocos Creator 项目 resources 或自定义 Asset Bundle 目录资源是否被引用，并安全删除未使用资源及对应 .meta。当用户说“资源清理”、“检查资源引用”、“删未使用资源”、“fonts/ui 目录资源校验”、“检查 ab 包资源”时使用。
argument-hint: [资源目录路径]
allowed-tools: [Read, Bash, Grep, Glob]
---

# Cocos 资源引用检查与清理

用于检查 Cocos Creator 项目中资源目录下的资源是否仍被代码、预制体、场景、动画、材质、配置或动态加载路径引用，并在确认未使用后删除资源和对应 `.meta`。

检查范围不只限于 `assets/resources/**`，也包括自定义 Asset Bundle 目录，例如 `assets/bundles/**`、`assets/assetBundles/**`、`assets/game/**`、`assets/prank/**`、`assets/emoji/**`，以及任何 `.meta` 中配置了 bundle 的目录。

## 适用场景

用户要求：
- 检查某个资源目录下资源是否被引用
- 清理未使用字体、图片、prefab、ui、音效、动画资源
- 删除未使用资源时连带删除 `.meta`
- 判断资源是否可能被动态路径加载
- 检查 `resources` 之外的自定义 AB 包资源

典型路径：
- `assets/resources/fonts`
- `assets/resources/ui`
- `assets/resources/audio`
- `assets/resources/prefab`
- `assets/<自定义bundle>/...`
- `assets/bundles/<bundleName>/...`

## 核心原则

1. **先查引用，再删除**：不能只按文件名 grep 一次就判定未使用。
2. **动态引用优先保守**：如果资源名可能由拼接路径、配置表、bundle 加载、`resources.load` 或 `bundle.load` 动态构造得到，标记“疑似动态引用”，不要直接删。
3. **必须查 UUID**：Cocos 的 prefab、scene、anim、material 常通过 `.meta` 中 uuid 引用资源。
4. **同时识别所在加载域**：资源可能在 `resources`，也可能在自定义 Asset Bundle。相对路径要按对应加载域计算。
5. **文件和 `.meta` 成对处理**：确认删除时，资源文件和同名 `.meta` 一起删除。
6. **目录级 `.meta` 不随便删**：只删除被清空且明确不再需要的资源目录时，才考虑目录 `.meta`。
7. **用户指出某资源有用时，立即修正结果**：不要坚持已有扫描结论，应重新扩大搜索范围。

## 执行流程

### 1. 确认项目和目标目录

如果用户给了绝对路径，直接使用；否则在当前 Cocos 项目下定位资源目录和自定义 bundle 目录：

```bash
pwd
find assets -maxdepth 4 -type d \( -path '*/resources*' -o -path '*/bundle*' -o -path '*/Bundle*' -o -path '*/bundles*' -o -path '*/assetBundles*' \) | sort
```

同时查找 `.meta` 中配置了 bundle 的目录：

```bash
python3 - <<'PY'
import json, pathlib
for meta in pathlib.Path('assets').rglob('*.meta'):
    try:
        data=json.loads(meta.read_text())
    except Exception:
        continue
    importer=data.get('importer') or data.get('ver')
    user_data=data.get('userData') or {}
    is_bundle = data.get('isBundle') or user_data.get('isBundle') or user_data.get('bundleName') or data.get('bundleName')
    if is_bundle:
        print(meta.with_suffix(''))
PY
```

目标目录可以是：
- `assets/resources/**`
- 自定义 Asset Bundle 根目录或子目录
- 普通 `assets/**` 资源目录，但需要额外确认它是否被 bundle 或场景直接引用

### 2. 判断资源所在加载域

对每个目标目录先判断加载域：

| 目录类型 | 加载方式 | 相对路径计算 |
|----------|----------|--------------|
| `assets/resources/**` | `resources.load/loadDir` | 去掉 `assets/resources/` 和扩展名 |
| 自定义 Asset Bundle | `assetManager.loadBundle` 后 `bundle.load/loadDir` | 去掉 bundle 根目录和扩展名 |
| 普通 assets 资源 | prefab/scene/脚本直接引用 | 主要依赖 uuid 和显式路径 |

如果目标目录属于 bundle 子目录，必须找到 bundle 根目录。判断方式：向上查找目录 `.meta` 中的 bundle 配置，或结合项目已有 `loadBundle('<bundleName>')` 的代码。

### 3. 枚举资源文件

排除 `.meta`、临时文件和隐藏文件：

```bash
find "<目标目录>" -type f \
  ! -name '*.meta' \
  ! -name '.DS_Store' \
  ! -path '*/.*' \
  | sort
```

对每个资源记录：
- 文件路径
- 文件名不含扩展名的 stem
- 加载域：`resources` / `<bundleName>` / 普通 assets
- 加载域相对路径，例如 `fonts/Montserrat-Regular-8` 或 `ui/common/cash`
- 对应 `.meta` 路径
- `.meta` 中 uuid

读取 uuid：

```bash
python3 - <<'PY'
import json, pathlib
for meta in pathlib.Path('<目标目录>').rglob('*.meta'):
    try:
        data=json.loads(meta.read_text())
    except Exception:
        continue
    uuid=data.get('uuid')
    if uuid:
        print(f'{meta}\t{uuid}')
PY
```

### 4. 按“uuid / 资源名 / 加载域相对路径”搜索引用

#### 4.1 搜索 uuid 引用

Cocos 序列化资源常引用 uuid。必须在 `assets/` 全量搜 uuid：

```bash
grep -RIn --exclude-dir=library --exclude-dir=temp --exclude-dir=build --exclude='*.meta' '<uuid>' assets 2>/dev/null
```

如果 uuid 出现在 `.prefab`、`.fire`、`.scene`、`.anim`、`.mtl`、`.effect`、`.json` 等文件中，判定为“已引用”。

#### 4.2 搜索资源文件名

用 stem 搜索代码、配置和序列化文件：

```bash
grep -RIn --exclude-dir=library --exclude-dir=temp --exclude-dir=build \
  --include='*.ts' --include='*.js' --include='*.json' --include='*.prefab' --include='*.fire' --include='*.scene' --include='*.anim' \
  '<资源stem>' assets 2>/dev/null
```

注意：字体、图片、音效、AB 包资源常通过名字、路径片段或配置表间接引用。

#### 4.3 搜索加载域相对路径

如果资源路径是：
- `assets/resources/ui/common/cash.png`，搜索 `ui/common/cash`、`common/cash`、`cash`
- `assets/prank/emoji/smile.png`，且 `assets/prank` 是 bundle 根目录，搜索 `emoji/smile`、`smile`、bundle 名 `prank`

```bash
grep -RIn --exclude-dir=library --exclude-dir=temp --exclude-dir=build '<加载域相对路径无扩展名>' assets 2>/dev/null
```

### 5. 专门检查动态加载风险

在项目中搜索动态资源加载入口：

```bash
grep -RIn --exclude-dir=library --exclude-dir=temp --exclude-dir=build \
  -E 'resources\.load|resources\.loadDir|loadBundle|loadRemote|assetManager|Bundle|bundle\.load|bundle\.loadDir|SpriteFrame|font|Label' assets 2>/dev/null
```

重点看是否存在：
- `resources.load(...)` / `resources.loadDir(...)`
- `assetManager.loadBundle(...)`
- `bundle.load(...)` / `bundle.loadDir(...)`
- 自定义封装，如 `PrankMgr`、`EmojiMgr`、`AssetMgr`、`ResMgr`、`loadRes`、`loadPrefab`、`loadSpriteFrame`
- 字符串拼接路径，如 `"ui/" + name`、`${bundle}/${path}`
- 配置表驱动路径
- 多语言 / 多 App 差异化资源路径
- 根据货币、appName、coinType、活动名拼接资源
- 整目录加载：`loadDir('<目录相对路径>')`

如果命中目录级 `resources.loadDir('<目标目录相对路径>')` 或 `bundle.loadDir('<目标目录相对路径>')`，该目录下资源都不能直接删。

### 6. 自定义 AB 包额外检查

目标目录在自定义 AB 包内时，额外检查：

1. bundle 是否整体被加载：

```bash
grep -RIn --exclude-dir=library --exclude-dir=temp --exclude-dir=build '<bundleName>' assets 2>/dev/null
```

2. bundle 内是否按目录批量加载：

```bash
grep -RIn --exclude-dir=library --exclude-dir=temp --exclude-dir=build -E 'loadDir\(|bundle\.loadDir' assets 2>/dev/null
```

3. bundle 路径是否来自配置：

```bash
grep -RIn --exclude-dir=library --exclude-dir=temp --exclude-dir=build '<资源stem>\|<相对目录名>\|<bundleName>' assets/resources assets 2>/dev/null
```

4. 是否有构建插件或离线包脚本引用该目录：

```bash
find . -maxdepth 4 -type f \( -name '*.js' -o -name '*.ts' -o -name '*.json' -o -name '*.sh' \) \
  ! -path './library/*' ! -path './temp/*' ! -path './build/*' \
  -print0 | xargs -0 grep -n '<bundleName>\|<目标目录名>' 2>/dev/null
```

如果 bundle 是离线动态包、远端包、构建后由 native/shell 加载，不能只看 `assets/` 代码引用，需标记为“疑似动态引用”。

### 7. 分类输出结果

按以下三类输出：

| 资源 | 加载域 | 判定 | 证据 | 处理 |
|------|--------|------|------|------|
| xxx.png | resources | 已引用 | uuid 命中 xxx.prefab | 保留 |
| yyy.png | prank bundle | 疑似动态引用 | bundle.loadDir 加载 emoji 目录 | 保留，需人工确认 |
| zzz.png | resources | 未发现引用 | uuid/name/path 均未命中 | 可删除 |

判定标准：
- **已引用**：uuid / 明确路径 / 明确文件名任一命中真实使用点。
- **疑似动态引用**：没有直接命中，但存在动态路径、目录加载、配置驱动、名称拼接、离线包/远端包/构建插件引用可能。
- **未发现引用**：uuid、stem、加载域相对路径全无命中，且无动态加载风险。

### 8. 删除前复核

删除前必须列出将删除的文件清单：

```text
将删除：
- assets/.../xxx.png
- assets/.../xxx.png.meta
```

如果用户只是要求“帮我一起删掉”，可以直接删除“未发现引用”的资源；但“疑似动态引用”必须保留并说明原因。

删除命令用明确文件路径，不用目录级通配：

```bash
rm "assets/.../xxx.png" "assets/.../xxx.png.meta"
```

如果环境要求避免破坏性命令，改用 `rm` 前先询问用户确认。

### 9. 删除后检查

删除后做最小验证：

```bash
git status --short
```

如项目有资源索引、自动生成文件或构建产物要求，再按项目已有流程执行；不要主动扩大到完整构建，除非用户要求。

## 常见误判点

- 只搜 `.ts` 会漏掉 prefab / scene / anim 的 uuid 引用。
- 只搜资源名会漏掉 uuid 引用。
- 只搜 uuid 会漏掉运行时 `resources.load('xxx')` 或 `bundle.load('xxx')`。
- 只检查 `resources` 会漏掉自定义 AB 包。
- `game_coin`、`cash` 这类通用资源常被配置或动态路径使用，不能轻易判未使用。
- 字体资源可能挂在 Label 组件或 prefab 的 `font` 字段里，优先查 uuid。
- `resources/ui` 和自定义 bundle 的 `ui` 目录动态使用概率高，必须检查 `loadDir`、`bundle.loadDir` 和路径拼接。
- 离线动态包、远端包、构建插件引用的资源，可能不会在运行时代码里直接出现资源名。

## 输出要求

最终回复用户时：
1. 说明检查范围和加载域（resources / 哪个 bundle / 普通 assets）。
2. 表格列出“已引用 / 疑似动态引用 / 可删除”。
3. 如果删除了，列出删除的资源和 `.meta`。
4. 如果没验证，明确说明未运行构建或编辑器验证。
