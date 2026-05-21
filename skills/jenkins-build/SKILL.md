---
name: jenkins-build
description: 触发 Jenkins 打包概率游戏项目。当用户说"打包"、"Jenkins 打包"、"触发构建"、"build"时使用此 skill。
argument-hint: [可选：游戏名]
allowed-tools: Bash
---

Jenkins 地址：`http://10.86.20.10`，token：`game123`

## 游戏列表

### 概率游戏

| # | Jenkins Job | RESOURCE_DYNAMIC |
|---|-------------|-----------------|
| 1 | cocos-dragontiger | 否 |
| 2 | cocos-greedybox | **是** |
| 3 | cocos-texasbull | 否 |
| 4 | cocos-roulette | 否 |
| 5 | cocos-teen-patti | 否 |
| 6 | cocos-jackpot-slot | **是** |
| 7 | cocos-rocketcrush | 否 |
| 8 | cocos-match3-grid-slots | 否 |
| 9 | cocos-mini-slots | 否 |
| 10 | cocos-pyramid-slots | 否 |
| 11 | cocos-lucky-soccer | **是** |

### 回合游戏

| # | Jenkins Job | RESOURCE_DYNAMIC |
|---|-------------|-----------------|
| 12 | cocos-game-baloot | 否 |
| 13 | cocos-game-carrom | 否 |
| 14 | cocos-game-domino | 否 |
| 15 | cocos-game-jackaroo | 否 |
| 16 | cocos-game-ludo | 否 |
| 17 | cocos-game-okey101 | 否 |
| 18 | cocos-game-uno | 否 |

### Unity 游戏

| # | Jenkins Job | RESOURCE_DYNAMIC |
|---|-------------|-----------------|
| 19 | unity-golden-luck | 否 |

## 对话流程（按顺序执行）

**Step 1 — 选游戏**  
展示上表（分三组），询问用户选哪些游戏（多选，输入序号如 `1 3 5`，或 `all`）。

**Step 2 — 选分支**  
用 Bash 从 Jenkins API 读取第一个选中游戏的分支列表：
```
curl -s "http://10.86.20.10/job/<JOB>/api/json"
```
解析 `actions[].parameterDefinitions[]` 中 `name == BRANCH` 的 `allValueItems.values`，去掉含 `HEAD` 的行，去掉 `origin/` 前缀后展示列表让用户选择。若 API 无结果则让用户手动输入分支名。

**Step 3 — 选 DEBUG**  
展示选项让用户输入序号：`1. true` / `2. false`

**Step 4 — 选 BUCKET_NAME**  
展示选项让用户输入序号：`1. null` / `2. ludo` / `3. fungo` / `4. inchat` / `5. lama` / `6. wyak` / `7. yoki` / `8. hichat` / `9. weparty` / `10. hayi` / `11. gmparty`

**Step 5 — RESOURCE_DYNAMIC（按需）**  
仅当选中的游戏里**有**标记「是」的游戏时才询问，展示选项让用户输入序号：`1. normal` / `2. dynamic`

**Step 6 — 汇总确认**  
列出所有参数，询问用户是否确认打包。

**Step 7 — 触发构建**  
用户确认后，对每个选中游戏执行 curl（有 RESOURCE_DYNAMIC 的游戏附加该参数）：
```
curl -s -o /dev/null -w "%{http_code}" \
  "http://10.86.20.10/job/<JOB>/buildWithParameters?token=game123&BRANCH=<branch>&DEBUG=<debug>&BUCKET_NAME=<bucket>"
```
返回 `201` 表示成功，逐一打印结果。
