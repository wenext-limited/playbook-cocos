---
name: jenkins-cocos-build
description: "Trigger Jenkins remote builds for Cocos game projects via natural language. Parses user intent to fuzzy-match Jenkins job names, APP_NAME targets, branch, and debug mode, then fires the build after confirmation. Use this skill whenever the user mentions 构建游戏, 触发构建, 打包游戏, Jenkins 构建, cocos 构建, 远程构建, build game, trigger build, or wants to kick off a Cocos game build — even if they don't say 'Jenkins' explicitly."
---

# Jenkins Remote Build Trigger

Trigger Cocos game builds on Jenkins through natural language. The user says something like "构建龙虎斗测试包到 hayi" and this skill figures out all the parameters, confirms, and fires.

## Configuration

- **Jenkins URL**: `http://10.86.20.10`
- **Build Token**: `game123`
- **APP_NAME List**: `https://lama-dev1-1314119829.cos.ap-guangzhou.myqcloud.com/game-test/app_list.json`
- **Jenkins Jobs API**: `http://10.86.20.10/api/json?tree=jobs[name]`
- **Job Filter**: Only `cocos-` prefixed jobs

## Workflow

### Step 1: Fetch Available Options

On trigger, immediately fetch both lists in parallel using Bash:

```bash
curl -s "http://10.86.20.10/api/json?tree=jobs[name]" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for j in sorted(data['jobs'], key=lambda x: x['name']):
    if j['name'].startswith('cocos-'):
        print(j['name'])
"
```

```bash
curl -s "https://lama-dev1-1314119829.cos.ap-guangzhou.myqcloud.com/game-test/app_list.json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for n in sorted(data['BUCKET_NAME']):
    if n != 'null':
        print(n)
"
```

### Step 2: Parse User Intent

Extract parameters from the user's natural language input using these fuzzy matching rules:

#### JOB_NAME Matching

Match the user's keywords against the fetched `cocos-*` job list. Match strategies (try in order):

1. **Exact substring**: User says "pyramid-slots" → matches `cocos-pyramid-slots`
2. **Partial match**: User says "pyramid" → matches `cocos-pyramid-slots`
3. **Chinese name mapping** — common Chinese names for games:
   - 龙虎斗 / 龙虎 → `cocos-dragontiger`
   - 飞行棋 / ludo → `cocos-game-ludo`
   - 多米诺 / 骨牌 → `cocos-game-domino`
   - 卡罗姆 → `cocos-game-carrom`
   - UNO → `cocos-game-uno`
   - 轮盘 / 轮盘赌 → `cocos-roulette`
   - 老虎机 / slots → multiple matches (`cocos-mini-slots`, `cocos-pyramid-slots`, `cocos-jackpot-slot`) — ask user to pick
   - 贪吃蛇 / 贪婪盒子 → `cocos-greedybox`
   - 火箭 → `cocos-rocketcrush`
   - 德州 / 德扑 → `cocos-texasbull`
   - 三张牌 / teen patti → `cocos-teen-patti`
   - 幸运足球 → `cocos-lucky-soccer`
   - okey → `cocos-game-okey101`
   - baloot → `cocos-game-baloot`
   - jackaroo → `cocos-game-jackaroo`
   - match3 → `cocos-match3-grid-slots`
4. **Fuzzy/contains**: Any keyword the user said appears in a job name → candidate match
5. **Multiple matches**: If more than one job matches, show all candidates and ask user to pick
6. **Zero matches**: Show the full job list and ask user to pick

#### APP_NAME Matching

Look for patterns like "到 xxx", "发到 xxx", "部署到 xxx", "发布到 xxx", "on xxx", "to xxx" in the user's input. Then fuzzy match against the APP_NAME list:
- Partial match works: "fun" → `fungo`, "game" → `gameparty`, "we" → `weparty`

If APP_NAME is not mentioned in the user input, default to `null`. The `null` value means "no specific app target" and is a valid option in the Jenkins build. Still show it in the confirmation summary so the user can override if needed.

#### DEBUG Flag

Automatically set `DEBUG=true` if the user's input contains ANY of these keywords:
- 测试, 测试包, test, debug, 调试, dev包, 开发包

Otherwise default to `DEBUG=false`.

#### BRANCH

Parse branch from user input:
- "develop 分支", "dev", "开发分支" → `origin/develop`
- "main", "主分支", "正式" → `origin/main`
- "origin/xxx" or "xxx 分支" → use as-is
- Not mentioned → default `origin/main`

### Step 3: Confirm with User

After extracting all parameters, present a confirmation summary. Format:

```
Jenkins 构建确认：
  📦 Job:    cocos-dragontiger
  🎯 App:    hayi
  🌿 Branch: origin/main
  🔧 Debug:  false

确认触发构建？
```

Use the Question tool with options: "✅ 确认构建" and "❌ 取消".

If the user wants to change something, adjust the parameter and re-confirm.

### Step 4: Trigger Build

On confirmation, execute via Bash:

```bash
curl -s -o /dev/null -w "%{http_code}" "http://10.86.20.10/job/{JOB_NAME}/buildWithParameters?token=game123&BRANCH={BRANCH}&DEBUG={DEBUG}&APP_NAME={APP_NAME}"
```

- URL-encode JOB_NAME if it contains special characters (e.g. Chinese job names)
- HTTP 201 → "✅ 构建已触发！请在 Jenkins 查看进度：http://10.86.20.10/job/{JOB_NAME}/"
- Other status → report error with status code and response body

## Examples

**Example 1**: "构建龙虎斗"
→ Job: `cocos-dragontiger`, DEBUG: `false`, Branch: `origin/main`
→ APP_NAME not specified → ask user to pick

**Example 2**: "构建龙虎斗测试包"
→ Job: `cocos-dragontiger`, DEBUG: `true`, Branch: `origin/main`
→ APP_NAME not specified → ask user to pick

**Example 3**: "构建龙虎斗到 hayi"
→ Job: `cocos-dragontiger`, APP: `hayi`, DEBUG: `false`, Branch: `origin/main`
→ All params resolved → confirm and fire

**Example 4**: "打包 pyramid slots 到 wyak develop 分支 debug"
→ Job: `cocos-pyramid-slots`, APP: `wyak`, Branch: `origin/develop`, DEBUG: `true`
→ All params resolved → confirm and fire

**Example 5**: "构建老虎机"
→ Multiple matches: `cocos-mini-slots`, `cocos-pyramid-slots`, `cocos-jackpot-slot`
→ Ask user to pick which one

## Error Handling

- **Jenkins unreachable**: Report "❌ Jenkins (10.86.20.10) 连接失败，请检查网络"
- **COS unreachable**: Report warning, ask user to type APP_NAME manually
- **No job match**: Show full job list, let user pick
- **Ambiguous match**: Show all candidates, let user pick
