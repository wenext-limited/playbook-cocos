#!/bin/bash

# Jenkins 打包子命令脚本
# 由 Claude 编排调用，不直接交互
#
# 子命令：
#   meta-all                            一次性输出所有静态元数据 (JSON)
#   list-games                          展示游戏列表（人类阅读）
#   list-apps                           展示 APP_NAME 列表（人类阅读）
#   list-branches <job> [--no-cache]    获取 Job 的分支列表（5 分钟 TTL 缓存）
#   discover-cocos-jobs                  拉取 Jenkins 当前 cocos-* Job（动态 fallback）
#   fetch-apps-remote                    拉取远程 APP_NAME 列表（动态 fallback）
#   check-resource-param <num[,num,..]> 本地查表批量输出资源参数名 (TSV: num\tparam)
#   job-name <num>                      根据编号输出 Job 名
#   app-param-name <num>                根据编号输出 APP_NAME 参数名
#   check-branches-batch <branch> <num1,num2,...>
#                                       并发校验分支是否存在于多个 Job (TSV: num\tjob\tOK|MISSING)
#                                       退出码 = MISSING 数量
#   trigger <job> <branch> <debug> <app_param_name> <app_value> [<resource_param_name> <resource_value>]
#                                       触发单个 Job 构建
#   trigger-batch <branch> <debug> <app_value> <resource_value> <num1,num2,...>
#                                       【并行】批量触发，附成功/失败统计与重试提示
#                                       退出码 = 失败 Job 数量

JENKINS_URL="http://10.86.20.10"
TOKEN="game123"
REMOTE_APP_LIST_URL="https://lama-dev1-1314119829.cos.ap-guangzhou.myqcloud.com/game-test/app_list.json"
GAME_COUNT=20
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/jenkins-build"
BRANCHES_CACHE_DIR="$CACHE_DIR/branches"
BRANCHES_TTL_SECONDS=300

# === 权威静态数据（SKILL.md 不再重复维护，仅引用此处） ===

GAME_JOBS=(
    ""
    "cocos-dragontiger"
    "cocos-fruit-lucky77-lite"
    "cocos-greedybox"
    "cocos-texasbull"
    "cocos-roulette"
    "cocos-teen-patti"
    "cocos-jackpot-slot"
    "cocos-rocketcrush"
    "cocos-match3-grid-slots"
    "cocos-mini-slots"
    "cocos-pyramid-slots"
    "cocos-lucky-soccer"
    "cocos-game-baloot"
    "cocos-game-carrom"
    "cocos-game-domino"
    "cocos-game-jackaroo"
    "cocos-game-ludo"
    "cocos-game-okey101"
    "cocos-game-uno"
    "unity-golden-luck"
)

GAME_CATEGORIES=(
    ""
    "概率游戏" "概率游戏" "概率游戏" "概率游戏" "概率游戏" "概率游戏"
    "概率游戏" "概率游戏" "概率游戏" "概率游戏" "概率游戏" "概率游戏"
    "回合游戏" "回合游戏" "回合游戏" "回合游戏" "回合游戏" "回合游戏" "回合游戏"
    "Unity 游戏"
)

APP_PARAM_NAMES=(
    ""
    "BUCKET_NAME" "APP_NAME" "BUCKET_NAME" "BUCKET_NAME" "BUCKET_NAME"
    "BUCKET_NAME" "BUCKET_NAME" "BUCKET_NAME" "BUCKET_NAME" "BUCKET_NAME"
    "APP_NAME" "BUCKET_NAME" "BUCKET_NAME" "BUCKET_NAME" "BUCKET_NAME"
    "BUCKET_NAME" "BUCKET_NAME" "BUCKET_NAME" "BUCKET_NAME" "BUCKET_NAME"
)

APP_NAMES=("fungo" "gmparty" "hayi" "hichat" "inchat" "lama" "lamajackaroo" "lamaludo" "null" "weparty" "wyak" "yoki")

# 资源动态参数本地表（索引 0 占位，1-20 对应游戏编号）
RESOURCE_PARAM_NAMES=(
    ""
    ""                    # 1  cocos-dragontiger
    ""                    # 2  cocos-fruit-lucky77-lite
    "RESOURCE_DYNAMTIC"   # 3  cocos-greedybox
    ""                    # 4  cocos-texasbull
    ""                    # 5  cocos-roulette
    ""                    # 6  cocos-teen-patti
    "RESOURCE_DYNAMTIC"   # 7  cocos-jackpot-slot
    ""                    # 8  cocos-rocketcrush
    ""                    # 9  cocos-match3-grid-slots
    "RESOURCE_DYNAMTIC"   # 10 cocos-mini-slots
    ""                    # 11 cocos-pyramid-slots
    "RESOURCE_DYNAMTIC"   # 12 cocos-lucky-soccer
    ""                    # 13 cocos-game-baloot
    ""                    # 14 cocos-game-carrom
    ""                    # 15 cocos-game-domino
    ""                    # 16 cocos-game-jackaroo
    ""                    # 17 cocos-game-ludo
    ""                    # 18 cocos-game-okey101
    ""                    # 19 cocos-game-uno
    ""                    # 20 unity-golden-luck
)

# === 子命令实现 ===

cmd_meta_all() {
    # 一次性输出所有静态元数据，Claude 调一次即可拿全
    local games_arr="["
    local i
    for i in $(seq 1 "$GAME_COUNT"); do
        if [ "$i" -gt 1 ]; then
            games_arr+=","
        fi
        games_arr+=$(printf '{"num":%d,"job":"%s","category":"%s","app_param":"%s","resource_param":"%s"}' \
            "$i" "${GAME_JOBS[$i]}" "${GAME_CATEGORIES[$i]}" "${APP_PARAM_NAMES[$i]}" "${RESOURCE_PARAM_NAMES[$i]}")
    done
    games_arr+="]"

    local apps_arr
    apps_arr=$(printf '%s\n' "${APP_NAMES[@]}" | jq -R . | jq -sc .)

    jq -n \
        --arg url "$JENKINS_URL" \
        --argjson games "$games_arr" \
        --argjson apps "$apps_arr" \
        '{jenkins_url:$url, games:$games, apps:$apps}'
}

cmd_list_games() {
    # 多列紧凑布局：概率/回合 3 列，Unity 单列
    echo "── 概率游戏 ──"
    _print_games_columns 1 12 3 26
    echo "── 回合游戏 ──"
    _print_games_columns 13 19 3 22
    echo "── Unity 游戏 ──"
    _print_games_columns 20 20 1 0
}

_print_games_columns() {
    local start="$1"
    local end="$2"
    local cols="$3"
    local width="$4"
    local i count=0
    for i in $(seq "$start" "$end"); do
        if [ "$cols" -eq 1 ]; then
            printf "  %2d) %s\n" "$i" "${GAME_JOBS[$i]}"
        else
            printf "  %2d) %-${width}s" "$i" "${GAME_JOBS[$i]}"
            count=$((count + 1))
            if [ "$count" -eq "$cols" ]; then
                echo ""
                count=0
            fi
        fi
    done
    if [ "$cols" -ne 1 ] && [ "$count" -ne 0 ]; then
        echo ""
    fi
}

cmd_list_apps() {
    for i in "${!APP_NAMES[@]}"; do
        printf "  %2d) %s\n" "$((i + 1))" "${APP_NAMES[$i]}"
    done
}

cmd_discover_cocos_jobs() {
    local tmp_file
    tmp_file=$(mktemp)
    local http_code
    http_code=$(curl -g -sS -o "$tmp_file" -w "%{http_code}" --max-time 15 "${JENKINS_URL}/api/json?tree=jobs[name]")
    local curl_status=$?

    if [ $curl_status -ne 0 ] || [ "$http_code" != "200" ]; then
        rm -f "$tmp_file"
        if [ $curl_status -ne 0 ]; then
            echo "ERROR: 无法连接 Jenkins Jobs API" >&2
        else
            echo "ERROR: Jenkins Jobs API 返回 HTTP $http_code" >&2
        fi
        return 1
    fi

    if command -v jq >/dev/null 2>&1; then
        jq -r '[.jobs[]?.name | select(startswith("cocos-"))] | sort | .[]' "$tmp_file" 2>/dev/null
    else
        python3 - "$tmp_file" <<'PY'
import json, sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception as exc:
    print(f"ERROR: Jenkins Jobs API 返回内容不是有效 JSON: {exc}", file=sys.stderr)
    sys.exit(1)

for name in sorted(j.get("name", "") for j in data.get("jobs", [])):
    if name.startswith("cocos-"):
        print(name)
PY
    fi

    local parse_status=${PIPESTATUS[0]:-0}
    rm -f "$tmp_file"
    return "$parse_status"
}

cmd_fetch_apps_remote() {
    local tmp_file
    tmp_file=$(mktemp)
    local http_code
    http_code=$(curl -sS -o "$tmp_file" -w "%{http_code}" --max-time 15 "$REMOTE_APP_LIST_URL")
    local curl_status=$?

    if [ $curl_status -ne 0 ] || [ "$http_code" != "200" ]; then
        rm -f "$tmp_file"
        if [ $curl_status -ne 0 ]; then
            echo "ERROR: 无法连接远程 APP 列表" >&2
        else
            echo "ERROR: 远程 APP 列表返回 HTTP $http_code" >&2
        fi
        return 1
    fi

    if command -v jq >/dev/null 2>&1; then
        jq -r '[.BUCKET_NAME[]? | select(. != "null")] | sort | .[]' "$tmp_file" 2>/dev/null
    else
        python3 - "$tmp_file" <<'PY'
import json, sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception as exc:
    print(f"ERROR: 远程 APP 列表返回内容不是有效 JSON: {exc}", file=sys.stderr)
    sys.exit(1)

for name in sorted(data.get("BUCKET_NAME", [])):
    if name != "null":
        print(name)
PY
    fi

    local parse_status=${PIPESTATUS[0]:-0}
    rm -f "$tmp_file"
    return "$parse_status"
}

cmd_job_name() {
    local num="$1"
    if [[ ! "$num" =~ ^[0-9]+$ ]] || [ "$num" -lt 1 ] || [ "$num" -gt "$GAME_COUNT" ]; then
        echo "ERROR: 无效游戏编号: $num" >&2
        return 1
    fi
    echo "${GAME_JOBS[$num]}"
}

cmd_app_param_name() {
    local num="$1"
    if [[ ! "$num" =~ ^[0-9]+$ ]] || [ "$num" -lt 1 ] || [ "$num" -gt "$GAME_COUNT" ]; then
        echo "ERROR: 无效游戏编号: $num" >&2
        return 1
    fi
    echo "${APP_PARAM_NAMES[$num]}"
}

# 文件 mtime 兼容封装（macOS 用 stat -f %m，Linux 用 stat -c %Y）
_file_mtime() {
    local f="$1"
    stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null
}

cmd_list_branches() {
    local job="$1"
    local force_flag="${2:-}"

    if [ -z "$job" ]; then
        echo "ERROR: 缺少 job 参数" >&2
        return 1
    fi

    mkdir -p "$BRANCHES_CACHE_DIR"
    local cache_file="$BRANCHES_CACHE_DIR/${job}.txt"

    # 1. 缓存命中（5 分钟 TTL）
    if [ "$force_flag" != "--no-cache" ] && [ -f "$cache_file" ]; then
        local now mtime age
        now=$(date +%s)
        mtime=$(_file_mtime "$cache_file")
        if [ -n "$mtime" ]; then
            age=$((now - mtime))
            if [ "$age" -lt "$BRANCHES_TTL_SECONDS" ]; then
                cat "$cache_file"
                return 0
            fi
        fi
    fi

    # 2. 拉取 Jenkins API
    local tmp_file
    tmp_file=$(mktemp)
    local http_code
    http_code=$(curl -sS -o "$tmp_file" -w "%{http_code}" --max-time 15 "${JENKINS_URL}/job/${job}/api/json")
    local curl_status=$?

    if [ $curl_status -ne 0 ] || [ "$http_code" != "200" ]; then
        rm -f "$tmp_file"
        # 网络异常时若有过期缓存则降级使用
        if [ -f "$cache_file" ]; then
            echo "WARN: Jenkins 不可达 (curl=$curl_status http=$http_code)，使用过期缓存" >&2
            cat "$cache_file"
            return 0
        fi
        if [ $curl_status -ne 0 ]; then
            echo "ERROR: 无法连接 Jenkins API" >&2
        else
            echo "ERROR: Jenkins API 返回 HTTP $http_code" >&2
        fi
        return 1
    fi

    # 3. 解析（优先 jq，fallback python3）
    local result
    if command -v jq >/dev/null 2>&1; then
        result=$(jq -r '
            [ .actions[]?.parameterDefinitions[]?
              | select(.name=="BRANCH")
              | .allValueItems.values[]?.name
              | select(test("HEAD")|not)
              | sub("^origin/";"")
            ] | .[]
        ' "$tmp_file" 2>/dev/null)
    else
        result=$(python3 - "$tmp_file" <<'PY'
import json, sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception as exc:
    print(f"ERROR: Jenkins API 返回内容不是有效 JSON: {exc}", file=sys.stderr)
    sys.exit(1)

for action in data.get("actions", []):
    for param in action.get("parameterDefinitions", []):
        if param.get("name") == "BRANCH":
            for value in param.get("allValueItems", {}).get("values", []):
                name = value.get("name", "")
                if "HEAD" not in name:
                    print(name.replace("origin/", "", 1))
PY
)
    fi
    rm -f "$tmp_file"

    if [ -z "$result" ]; then
        echo "ERROR: Jenkins Job 未找到 BRANCH 参数或分支为空" >&2
        return 2
    fi

    # 4. 写缓存并输出
    echo "$result" > "$cache_file"
    echo "$result"
}

cmd_check_resource_param() {
    # 支持 csv 批量查询：输出 TSV `num<TAB>param`
    local nums_csv="$1"
    if [ -z "$nums_csv" ]; then
        echo "ERROR: 缺少游戏编号" >&2
        return 1
    fi

    IFS=',' read -r -a nums <<< "$nums_csv"
    for num in "${nums[@]}"; do
        if [[ ! "$num" =~ ^[0-9]+$ ]] || [ "$num" -lt 1 ] || [ "$num" -gt "$GAME_COUNT" ]; then
            echo "ERROR: 无效游戏编号: $num" >&2
            return 1
        fi
        printf "%s\t%s\n" "$num" "${RESOURCE_PARAM_NAMES[$num]}"
    done
}

cmd_check_branches_batch() {
    # 并发校验分支是否存在于每个 Job，输出 TSV `num<TAB>job<TAB>OK|MISSING`
    local branch="$1"
    local nums_csv="$2"
    if [ -z "$branch" ] || [ -z "$nums_csv" ]; then
        echo "ERROR: 用法 check-branches-batch <branch> <num1,num2,...>" >&2
        return 1
    fi

    IFS=',' read -r -a nums <<< "$nums_csv"
    local tmp_dir
    tmp_dir=$(mktemp -d)

    for num in "${nums[@]}"; do
        (
            local job="${GAME_JOBS[$num]}"
            if [ -z "$job" ]; then
                printf "%s\t%s\tINVALID\n" "$num" "(none)" > "$tmp_dir/$num.out"
                exit 0
            fi
            local branches
            branches=$(cmd_list_branches "$job" 2>/dev/null)
            if [ $? -ne 0 ] || [ -z "$branches" ]; then
                printf "%s\t%s\tUNREACHABLE\n" "$num" "$job" > "$tmp_dir/$num.out"
                exit 0
            fi
            if printf '%s\n' "$branches" | grep -Fxq "$branch"; then
                printf "%s\t%s\tOK\n" "$num" "$job" > "$tmp_dir/$num.out"
            else
                printf "%s\t%s\tMISSING\n" "$num" "$job" > "$tmp_dir/$num.out"
            fi
        ) &
    done
    wait

    local missing=0
    for num in "${nums[@]}"; do
        if [ -f "$tmp_dir/$num.out" ]; then
            local line
            line=$(cat "$tmp_dir/$num.out")
            echo "$line"
            case "$line" in
                *"	MISSING"|*"	UNREACHABLE"|*"	INVALID")
                    missing=$((missing + 1))
                    ;;
            esac
        fi
    done

    rm -rf "$tmp_dir"
    return "$missing"
}

cmd_trigger() {
    local job="$1"
    local branch="$2"
    local debug="$3"
    local app_param_name="$4"
    local app_value="$5"
    local resource_param_name="$6"
    local resource_value="$7"

    if [ -z "$job" ] || [ -z "$branch" ] || [ -z "$debug" ]; then
        echo "ERROR: 缺少必需参数 (job/branch/debug)" >&2
        return 1
    fi

    local curl_args=(
        -sS
        -o /dev/null
        -w "%{http_code}"
        -G
        --max-time 30
        "${JENKINS_URL}/job/${job}/buildWithParameters"
        --data-urlencode "token=${TOKEN}"
        --data-urlencode "BRANCH=${branch}"
        --data-urlencode "DEBUG=${debug}"
    )

    if [ -n "$app_param_name" ] && [ -n "$app_value" ]; then
        curl_args+=(--data-urlencode "${app_param_name}=${app_value}")
    fi

    if [ -n "$resource_param_name" ] && [ -n "$resource_value" ]; then
        curl_args+=(--data-urlencode "${resource_param_name}=${resource_value}")
    fi

    local http_code
    http_code=$(curl "${curl_args[@]}")
    local curl_status=$?

    if [ $curl_status -ne 0 ]; then
        echo "[失败] $job: curl 执行失败"
        return 1
    fi

    if [ "$http_code" == "201" ] || [ "$http_code" == "200" ]; then
        echo "[成功] $job: ${JENKINS_URL}/job/${job}/"
        return 0
    fi

    echo "[失败] $job: HTTP $http_code"
    return 1
}

# 并行触发多个 Job 构建
# 用法: trigger-batch <branch> <debug> <app_value> <resource_value> <num1,num2,...>
cmd_trigger_batch() {
    local branch="$1"
    local debug="$2"
    local app_value="$3"
    local resource_value="$4"
    local nums_csv="$5"

    if [ -z "$branch" ] || [ -z "$debug" ] || [ -z "$nums_csv" ]; then
        echo "ERROR: 缺少必需参数 (branch/debug/nums)" >&2
        echo "用法: trigger-batch <branch> <debug> <app_value> <resource_value> <num1,num2,...>" >&2
        return 1
    fi

    # 1. 解析编号列表
    IFS=',' read -r -a nums <<< "$nums_csv"
    local jobs_count=${#nums[@]}
    local tmp_dir
    tmp_dir=$(mktemp -d)

    # 2. 并行触发：每个 Job 后台 curl，结果写入临时文件
    for num in "${nums[@]}"; do
        (
            local job="${GAME_JOBS[$num]}"
            local app_param_name="${APP_PARAM_NAMES[$num]}"
            local resource_param_name="${RESOURCE_PARAM_NAMES[$num]}"

            local curl_args=(
                -sS
                -o /dev/null
                -w "%{http_code}"
                -G
                --max-time 30
                "${JENKINS_URL}/job/${job}/buildWithParameters"
                --data-urlencode "token=${TOKEN}"
                --data-urlencode "BRANCH=${branch}"
                --data-urlencode "DEBUG=${debug}"
            )

            if [ -n "$app_param_name" ] && [ -n "$app_value" ]; then
                curl_args+=(--data-urlencode "${app_param_name}=${app_value}")
            fi

            if [ -n "$resource_param_name" ] && [ -n "$resource_value" ]; then
                curl_args+=(--data-urlencode "${resource_param_name}=${resource_value}")
            fi

            local http_code
            http_code=$(curl "${curl_args[@]}")
            local curl_status=$?

            if [ $curl_status -ne 0 ]; then
                echo "[失败] $job: curl 执行失败" > "$tmp_dir/$num.out"
            elif [ "$http_code" == "201" ] || [ "$http_code" == "200" ]; then
                echo "[成功] $job: ${JENKINS_URL}/job/${job}/" > "$tmp_dir/$num.out"
            else
                echo "[失败] $job: HTTP $http_code" > "$tmp_dir/$num.out"
            fi
        ) &
    done
    wait

    # 3. 汇总输出 + 失败统计
    local success=0
    local failed=0
    local failed_nums=()
    local failed_jobs=()
    for num in "${nums[@]}"; do
        if [ -f "$tmp_dir/$num.out" ]; then
            local content
            content=$(cat "$tmp_dir/$num.out")
            echo "$content"
            if [[ "$content" == "[失败]"* ]]; then
                failed=$((failed + 1))
                failed_nums+=("$num")
                failed_jobs+=("${GAME_JOBS[$num]}")
            else
                success=$((success + 1))
            fi
        fi
    done
    rm -rf "$tmp_dir"

    echo ""
    echo "──────────────────────────"
    echo "构建汇总：✅ 成功 $success / ❌ 失败 $failed / 总计 $jobs_count"

    if [ "$failed" -gt 0 ]; then
        local failed_csv
        failed_csv=$(IFS=,; echo "${failed_nums[*]}")
        local app_arg="${app_value:-\"\"}"
        local res_arg="${resource_value:-\"\"}"
        echo ""
        echo "失败 Job: ${failed_jobs[*]}"
        echo "重试命令:"
        echo "  bash ${BASH_SOURCE[0]} trigger-batch $branch $debug $app_arg $res_arg $failed_csv"
        return "$failed"
    fi
    return 0
}

# === 入口分发 ===

main() {
    local sub="$1"
    shift || true

    case "$sub" in
        meta-all)              cmd_meta_all ;;
        list-games)            cmd_list_games ;;
        list-apps)             cmd_list_apps ;;
        list-branches)         cmd_list_branches "$@" ;;
        discover-cocos-jobs)   cmd_discover_cocos_jobs ;;
        fetch-apps-remote)     cmd_fetch_apps_remote ;;
        check-resource-param)  cmd_check_resource_param "$@" ;;
        check-branches-batch)  cmd_check_branches_batch "$@" ;;
        job-name)              cmd_job_name "$@" ;;
        app-param-name)        cmd_app_param_name "$@" ;;
        trigger)               cmd_trigger "$@" ;;
        trigger-batch)         cmd_trigger_batch "$@" ;;
        *)
            echo "用法: $0 <子命令> [参数...]" >&2
            echo "子命令: meta-all | list-games | list-apps | list-branches | discover-cocos-jobs | fetch-apps-remote | check-resource-param | check-branches-batch | job-name | app-param-name | trigger | trigger-batch" >&2
            return 1
            ;;
    esac
}

main "$@"
