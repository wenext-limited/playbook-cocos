#!/usr/bin/env bash
# 将 info_token 模块从 skill 目录复制到目标项目
# 用法: bash copy_files.sh <目标项目绝对路径>

set -e

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DST="${1:?用法: bash copy_files.sh <目标项目绝对路径>}"

if [ ! -d "$DST" ]; then
    echo "错误：目标目录不存在: $DST"
    exit 1
fi

echo "=== info_token 模块迁移 ==="
echo "资源来源: $SKILL_DIR/assets"
echo "目标项目: $DST"
echo ""

# 复制单个文件（含 .meta），若目标已存在则跳过
copy_file() {
    local rel="$1"
    local src="$SKILL_DIR/assets/$rel"
    local dst="$DST/assets/$rel"
    mkdir -p "$(dirname "$dst")"
    if [ -f "$dst" ]; then
        echo "[跳过-已存在] $rel"
    else
        cp "$src" "$dst"
        echo "[复制] $rel"
    fi
    # .meta 始终覆盖，确保 UUID 一致
    if [ -f "${src}.meta" ]; then
        cp "${src}.meta" "${dst}.meta"
        echo "[复制] ${rel}.meta"
    fi
}

# 1. 预制体
echo "--- 预制体 ---"
copy_file "GameBundle/dragontiger/prefab/scene/info_token.prefab"

# 2. 脚本
echo ""
echo "--- 脚本 ---"
copy_file "GameBundle/dragontiger/script/component/CoinTokenInfoComp.ts"

# 3. coinToken 纹理（3张）
echo ""
echo "--- 纹理: coinToken ---"
for img in lucky_coin info_line info_bg; do
    copy_file "GameBundle/dragontiger/texture/coinToken/${img}.png"
done

# 4. icon_coin.png
echo ""
echo "--- 纹理: coin ---"
copy_file "GameBundle/dragontiger/texture/coin/icon_coin.png"

# 5. 字体
echo ""
echo "--- 字体 ---"
copy_file "GameBundle/dragontiger/fonts/Montserrat-Regular.ttf"

echo ""
echo "=== 复制完成 ==="
echo ""
echo "后续手动步骤："
echo "  1. 检查 CoinTokenInfoComp.ts 中的 import 路径是否与目标项目一致"
echo "  2. 确认目标项目已有 sub_smc / AppUtil / Utils / oops-plugin-framework"
echo "  3. 在编辑器中确保 btnTokenInfo 节点下已放置 info_token.prefab 实例"
echo "  4. 若 LanguageLabel 组件报 missing，手动重新绑定或删除后改代码设置文本"
echo "  5. 若 icon_coin.png 已跳过但 UUID 不一致，编辑器中手动重新指定 SpriteFrame"
