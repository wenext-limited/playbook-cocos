---
name: cocos-protocol-flow-test
description: 当需要验证 Cocos Creator 游戏的全链路网络协议、测试游戏 HTTP 交互序列（如下注流程）、匹配上下行接口并生成综合连通性测试报告时使用本技能。
---

# Cocos 协议链路测试 (Cocos Protocol Flow Test)

## 概述
本技能指导您如何使用可复用的 Node.js 工具，对 Cocos Creator 游戏进行全链路 HTTP 交互的自动化测试和文档记录。本技能侧重于解析本地脚本文件（如 InitGame.ts 和 Protocal.ts），正确映射上行请求和下行响应的数据结构，执行隔离的测试，并最终生成清晰的测试用例流转报告。

## 何时使用

- 验证 Cocos Creator 游戏客户端与后端服务器之间的完整 HTTP 连通性。
- 构建全业务链路流程的自动化测试用例（例如：登录首页 -> 进入房间 -> 执行下注 -> 获取开奖结果）。
- 梳理并记录 TypeScript 协议定义文件（Protocal.ts）与实际服务器运行 API 的映射关系。
- 需要测试接口的响应状态并将测试情况输出为 Markdown 报告存档于 .opencode/skills/cocos-protocol-flow-test/reports/ 目录下。

## 工作流 (Workflow)

### 1. 提取基础网络配置信息
首先解析游戏初始化相关脚本参数，提取 #sym:baseUrl 和 #sym:token。
- 检索游戏的初始化装载脚本，例如 ssets/script/game/initialize/bll/InitGame.ts。
- 寻找包含访问域名的变量及接口请求的鉴权签名如 	his.baseUrl = '...' 或 	his.token = '...'。
- 如果缺失这些硬编码信息，务必首先提示用户输入 #sym:token，或者让用户手动提供测试用的 Token 等前提。

### 2. 提取业务协议 & 映射上行与下行数据
- 解析 API 接口 URL 定义列表（如：包含在 SubGameConfig.ts 中的 DeeplinkUrls 类）。
- 解析请求数据体及相关的 TypeScript 接口类型（例如 ssets/GameBundle/greedybox/script/net/Protocal.ts）。
- 明确以下关联关系：
  - **接口端点 (Endpoint)**：URL具体是什么（例如 lucky_game/greedy_box/add）？
  - **上行请求参数 (Request)**：例如 ReqBettingData 对象，需要实例化哪些字段（coinsNum, option 等）。
  - **下行响应报文 (Response)**：该接口相应的回包类型应该被反序列化什么对象，例如 UserGameInfoData 或 RspCurrentResultData。

### 3. 梳理网络发包与回包流程
梳理客户端网络框架的底层设计结构：
- 追踪查找真实触发网络异步发包的位置（如 sub_smc.gameHttp.httpPost 等）。
- 确认请求所使用的 Content-Type（一般为 pplication/json），发包的 HTTP 请求方法（一般基于 POST），以及 Token 的放置位置（通常是在 HTTP 请求头当中附带）。

### 4. 使用自动化协议测试工具 (Protocol Test Tool)
全链路专用的可复用测试工具库挂载于 .opencode/skills/cocos-protocol-flow-test/protocol-tool.js。
- 这是一个利用 NodeJS 原生 http 和 https 模块搭建的轻量化请求抓包引擎。
- 其核心为 ProtocolTestTool(baseUrl, token) 类及 .sendRequest(endpoint, payload) 异步方法，每次调用都能自动按时间线记录请求端点、网络延迟以及服务器返回状态码并缓存。
- 利用此工具，可以自由编排所需的连续 HTTP 请求测例。

### 5. 执行全链路测试
配置并完成您的业务流程测试脚本（例如 	est-greedybox-flow.js）后，打开终端并通过 Node 执行该脚本从而完成自动连通验证：
``bash
node .opencode/skills/cocos-protocol-flow-test/test-greedybox-flow.js
``
该脚本将会串联所有前置逻辑依序发起实际调用模拟客户端行为（比如 dashboard -> user_game_info -> dd -> current_result）。

### 6. 生成全链路结果报告
执行完成后，工具实例底层会自动调用 .generateReport() 方法。
该方法自动计算所有测试节点，并将通过/失败等情况生成汇总，导出对应的中文 Markdown 格式测试报告到 .opencode/skills/cocos-protocol-flow-test/reports/ 目录下。
之后请阅读和检查该报告内是否存在 HTTP 状态异常，字段丢包，或响应时延（Latency）过高等信息，并根据测试情况与用户进行反馈与交流。
