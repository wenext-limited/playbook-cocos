#!/bin/bash

JENKINS_URL="http://10.86.20.10"
TOKEN="game123"

declare -A GAME_JOBS=(
    [1]="cocos-dragontiger"
    [2]="cocos-greedybox"
    [3]="cocos-texasbull"
    [4]="cocos-roulette"
    [5]="cocos-teen-patti"
    [6]="cocos-jackpot-slot"
    [7]="cocos-rocketcrush"
    [8]="cocos-match3-grid-slots"
    [9]="cocos-mini-slots"
    [10]="cocos-pyramid-slots"
    [11]="cocos-lucky-soccer"
    [12]="cocos-game-baloot"
    [13]="cocos-game-carrom"
    [14]="cocos-game-domino"
    [15]="cocos-game-jackaroo"
    [16]="cocos-game-ludo"
    [17]="cocos-game-okey101"
    [18]="cocos-game-uno"
    [19]="unity-golden-luck"
)
GAME_COUNT=19

declare -A GAME_HAS_RESOURCE_DYNAMIC=(
    [1]=false  [2]=true   [3]=false  [4]=false  [5]=false
    [6]=true   [7]=false  [8]=false  [9]=false  [10]=false
    [11]=true  [12]=false [13]=false [14]=false [15]=false
    [16]=false [17]=false [18]=false [19]=false
)

echo ""
echo "========================================="
echo "         Jenkins 打包触发脚本"
echo "========================================="

# ─────────────────────────────────────────
# 1. 选择游戏（多选）
# ─────────────────────────────────────────
echo ""
echo "【第 1 步】选择要打包的游戏（多个用空格分隔，如: 1 3 6）："
echo ""
echo "  ── 概率游戏 ──"
for i in $(seq 1 11); do
    printf "  %2d) %s\n" "$i" "${GAME_JOBS[$i]}"
done
echo ""
echo "  ── 回合游戏 ──"
for i in $(seq 12 18); do
    printf "  %2d) %s\n" "$i" "${GAME_JOBS[$i]}"
done
echo ""
echo "  ── Unity 游戏 ──"
printf "  %2d) %s\n" "19" "${GAME_JOBS[19]}"
echo ""

while true; do
    read -p "输入编号: " -a game_selections
    selected_jobs=()
    valid=true
    for num in "${game_selections[@]}"; do
        if ! [[ "$num" =~ ^[0-9]+$ ]] || [ "$num" -lt 1 ] || [ "$num" -gt $GAME_COUNT ]; then
            echo "无效编号: $num，请重新输入"
            valid=false
            break
        fi
        selected_jobs+=("${GAME_JOBS[$num]}")
    done
    if $valid && [ ${#selected_jobs[@]} -gt 0 ]; then
        break
    elif $valid; then
        echo "请至少选择一个游戏"
    fi
done

# ─────────────────────────────────────────
# 2. 从 Jenkins API 读取分支列表
# ─────────────────────────────────────────
echo ""
echo "【第 2 步】选择打包分支："
echo ""

first_job="${GAME_JOBS[${game_selections[0]}]}"
echo "  (从 Jenkins 读取 ${first_job} 分支列表...)"
echo ""

branches=($(curl -s "${JENKINS_URL}/job/${first_job}/api/json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for action in data.get('actions', []):
    for param in action.get('parameterDefinitions', []):
        if param.get('name') == 'BRANCH':
            values = param.get('allValueItems', {}).get('values', [])
            for v in values:
                name = v.get('name', '')
                if 'HEAD' not in name:
                    print(name.replace('origin/', ''))
" 2>/dev/null))

if [ ${#branches[@]} -eq 0 ]; then
    echo "  无法获取分支列表，请手动输入："
    read -p "分支名: " BRANCH
else
    select branch in "${branches[@]}"; do
        if [ -n "$branch" ]; then
            BRANCH="$branch"
            break
        else
            echo "请输入有效编号"
        fi
    done
fi

# ─────────────────────────────────────────
# 3. 选择 DEBUG 模式
# ─────────────────────────────────────────
echo ""
echo "【第 3 步】选择构建模式："
echo ""

select debug_opt in "true  — 调试包" "false — 生产包"; do
    case $REPLY in
        1) DEBUG=true;  break;;
        2) DEBUG=false; break;;
        *) echo "请输入 1 或 2";;
    esac
done

# ─────────────────────────────────────────
# 4. 选择目标应用（BUCKET_NAME）
# ─────────────────────────────────────────
echo ""
echo "【第 4 步】选择目标应用："
echo ""

bucket_names=("null" "ludo" "fungo" "inchat" "lama" "wyak" "yoki" "hichat" "weparty" "hayi" "gmparty")

select bucket in "${bucket_names[@]}"; do
    if [ -n "$bucket" ]; then
        BUCKET_NAME="$bucket"
        break
    else
        echo "请输入有效编号"
    fi
done

# ─────────────────────────────────────────
# 5. RESOURCE_DYNAMIC（按需）
# ─────────────────────────────────────────
RESOURCE_DYNAMIC=""
need_resource=false
for num in "${game_selections[@]}"; do
    if [ "${GAME_HAS_RESOURCE_DYNAMIC[$num]}" == "true" ]; then
        need_resource=true
        break
    fi
done

if $need_resource; then
    echo ""
    echo "【第 5 步】选择资源模式（RESOURCE_DYNAMIC）："
    echo ""
    select res_opt in "normal" "dynamic"; do
        case $REPLY in
            1) RESOURCE_DYNAMIC="normal";  break;;
            2) RESOURCE_DYNAMIC="dynamic"; break;;
            *) echo "请输入 1 或 2";;
        esac
    done
fi

# ─────────────────────────────────────────
# 6. 汇总确认
# ─────────────────────────────────────────
echo ""
echo "========================================="
echo "  即将触发 Jenkins 构建，请确认："
echo "========================================="
echo "  游戏列表  : ${selected_jobs[*]}"
echo "  分支      : $BRANCH"
echo "  DEBUG     : $DEBUG"
echo "  应用      : $BUCKET_NAME"
if $need_resource; then
    echo "  资源模式  : $RESOURCE_DYNAMIC"
fi
echo "========================================="
echo ""

read -p "确认触发？(y/n): " confirm

if [ "$confirm" == "y" ] || [ "$confirm" == "Y" ]; then
    echo ""
    for num in "${game_selections[@]}"; do
        JOB_NAME="${GAME_JOBS[$num]}"
        echo "正在触发: $JOB_NAME ..."

        PARAMS="token=${TOKEN}&BRANCH=${BRANCH}&DEBUG=${DEBUG}&BUCKET_NAME=${BUCKET_NAME}"
        if [ "${GAME_HAS_RESOURCE_DYNAMIC[$num]}" == "true" ] && [ -n "$RESOURCE_DYNAMIC" ]; then
            PARAMS="${PARAMS}&RESOURCE_DYNAMIC=${RESOURCE_DYNAMIC}"
        fi

        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
            "${JENKINS_URL}/job/${JOB_NAME}/buildWithParameters?${PARAMS}")

        if [ "$HTTP_CODE" == "201" ] || [ "$HTTP_CODE" == "200" ]; then
            echo "  ✅ 触发成功 → ${JENKINS_URL}/job/${JOB_NAME}/"
        else
            echo "  ❌ 触发失败，HTTP 状态码: $HTTP_CODE"
        fi
    done
    echo ""
    echo "全部处理完毕。"
else
    echo ""
    echo "已取消。"
fi
