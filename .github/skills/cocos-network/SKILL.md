---
name: cocos-network
description: 实现网络通信时使用，包括 HTTP 请求封装、WebSocket 长连接、协议定义和回调处理。
tags: [cocos, network, http, websocket, api, protocol]
inputs: [API端点, 请求参数, 响应类型, 通信类型]
outputs: [HTTP封装类, WebSocket管理, 协议定义, 请求回调]
---

# 网络通信

## 概述

项目支持两种网络通信方式：
- **HTTP 请求**：基于 OOPS HttpRequest，用于 REST API 调用（下注、查询、排行榜等）
- **WebSocket 长连接**：基于 oops.tcp，用于实时推送（游戏状态同步等）

## GameHttp 实体

```typescript
import { ecs } from 'path/to/oops-framework/libs/ecs/ECS';
import { HttpCallback, HttpRequest } from 'path/to/oops-framework/libs/network/HttpRequest';
import { smc } from 'global/ecs/SingletonModuleComp';
import { SubGameConfig } from '../config/SubGameConfig';
import { SubGameUtil } from '../util/SubGameUtil';

@ecs.register('GameHttp')
export class GameHttp extends ecs.Entity {

    protected init() { }

    private createHttp() {
        const http: HttpRequest = new HttpRequest();
        http.timeout = SubGameConfig.httpTimeout;   // 超时时间（毫秒）
        http.server = SubGameUtil.getBaseUrl();       // 基础 URL

        // 公共请求头
        http.addHeader('Content-Type', 'application/json');
        http.addHeader('token', smc.initialize.getToken());
        http.addHeader('language_code', smc.initialize.getLangCode());
        http.addHeader('Region', smc.initialize.getRegion());
        http.addHeader('version_code', smc.initialize.getVersionCode());
        http.addHeader('platform', smc.initialize.getPlatform());
        http.addHeader('package_name', smc.initialize.getPackageName());
        http.addHeader('channel', smc.initialize.getChannel());

        return http;
    }

    httpGet(name: string, onComplete: HttpCallback, params: any = null) {
        const http = this.createHttp();
        http.get(name, onComplete, params);
    }

    httpPost(name: string, onComplete: HttpCallback, params: any = null, bParseParamString: boolean = true) {
        const http = this.createHttp();
        http.post(name, onComplete, params, bParseParamString);
    }
}
```

## API 端点定义

```typescript
// config/SubGameConfig.ts
export class DeeplinkUrls {
    static betting = '/lucky_game/greedy_box/add';
    static userGameInfo = '/lucky_game/greedy_box/user_game_info';
    static currentResult = '/lucky_game/greedy_box/current_result';
    static dashboard = '/lucky_game/greedy_box/dashboard';
    static records = '/lucky_game/greedy_box/records';
    static rankBoard = '/rankboard/get';
}
```

## 协议类型定义

```typescript
// net/Protocal.ts

// 请求类型
export class ReqBettingData {
    coinsNum: number;
    option: number;
    roomId: string;
    roundNum: number;
}

// 响应基础格式
export interface BaseResponse {
    code: number;
    message: string;
    data: any;
    sucessed: boolean;
    messageParams: any[];
    toastSeconds: number;
}

// 业务响应类型
export interface CurrentResultData {
    roundNum: number;
    drawInfoJson: string;
    gameInfoJson: string;
    addAmount: number;
}
```

## BLL 系统中的网络请求

BLL（Business Logic Layer）组件负责发起请求和处理响应：

```typescript
@ecs.register('SubGame')
export class ReqBettingDataSystem extends ecs.ComblockSystem
    implements ecs.IEntityEnterSystem {

    filter(): ecs.IMatcher {
        return ecs.allOf(ReqBettingDataComp);
    }

    entityEnter(e: SubGame) {
        const comp = e.get(ReqBettingDataComp);
        const reqData = new ReqBettingData();
        reqData.coinsNum = comp.coinsNum;
        reqData.option = comp.option;
        reqData.roomId = comp.roomId;
        reqData.roundNum = comp.roundNum;

        const strReq = JSON.stringify(reqData);

        sub_smc.gameHttp.httpPost(DeeplinkUrls.betting, (data: HttpReturn) => {
            if (data.isSucc && data.res.sucessed) {
                // 成功：更新 Model
                e.BettingModel.dealMyBetSuccess(reqData);
                // 派发事件通知 View
                oops.message.dispatchEvent(SubGameEvent.OnMyBettingSuccess, reqData);
            } else {
                // 失败处理
                oops.gui.open(SubUIID.TipToast, data.res?.message || "请求失败");
            }
            // 移除 BLL 组件（标记请求完成）
            e.remove(ReqBettingDataComp);
        }, strReq);
    }
}
```

## 工具类简化调用

```typescript
export class SubGameUtil {
    static HttpGet(url: string, cb: (data: HttpReturn) => void) {
        sub_smc.gameHttp.httpGet(url, (data: HttpReturn) => {
            cb && cb(data);
        });
    }

    static HttpPost(url: string, cb: (data: HttpReturn) => void) {
        sub_smc.gameHttp.httpPost(url, (data: HttpReturn) => {
            cb && cb(data);
        });
    }
}
```

## 数据流

```
View 操作 → Entity.add(BLLComp) → ComblockSystem.entityEnter()
  → httpPost() → 回调处理
    → Model.dealXxx() → oops.message.dispatchEvent() → View 更新
```

## WebSocket 长连接

通过 `oops.tcp` 管理 WebSocket 连接，搭配 NetChannelManager 实现多通道管理。

### 架构

```
┌────────────────┐     ┌───────────────┐     ┌─────────────┐
│ NetChannelMgr  │────>│  oops.tcp     │────>│  WebSock    │
│ (通道管理)      │     │ (节点管理)     │     │ (WS 封装)   │
└────────────────┘     └───────────────┘     └─────────────┘
        │                                          │
        v                                          v
┌────────────────┐                          ┌─────────────┐
│ NetProtocolPako│                          │  WebSocket  │
│ (编解码+压缩)   │                          │  (原生)     │
└────────────────┘                          └─────────────┘
```

### 连接管理

```typescript
import { NetChannelType } from '../common/net/NetChannelManager';

// 初始化：设置网络节点
oops.tcp.setNetNode(this.game, NetChannelType.Game);

// 建立 WebSocket 连接
oops.tcp.connect({
    url: `ws://${host}:${port}`,
    autoReconnect: 0       // 0 = 不自动重连
}, NetChannelType.Game);

// 关闭连接
oops.tcp.close(undefined, undefined, NetChannelType.Game);
```

### 配套组件

| 组件 | 职责 |
|------|------|
| `WebSock` | WebSocket 底层封装，处理 open/close/message 事件 |
| `NetProtocolPako` | 协议数据编解码（Pako 压缩/解压） |
| `NetGameTips` | 网络状态 UI 提示（连接中/断开/重连） |
| `NetChannelManager` | 多通道管理，支持多个独立 WebSocket 连接 |

## 错误处理模式

### HTTP 请求错误

```typescript
sub_smc.gameHttp.httpPost(url, (data: HttpReturn) => {
    if (data.isSucc && data.res.sucessed) {
        // 成功路径
        e.Model.dealSuccess(data.res.data);
        oops.message.dispatchEvent(SuccessEvent);
    } else {
        // 失败路径：统一 Toast 提示
        const msg = data.res?.message || "网络请求失败";
        oops.gui.open(SubUIID.TipToast, msg);
    }
    // 无论成功失败，都移除 BLL 组件
    e.remove(BLLComp);
}, strReq);
```

### 响应数据安全检查

```typescript
// 始终校验响应结构
if (data.isSucc && data.res.sucessed) {
    const result = data.res.data;
    if (result && typeof result === 'object') {
        // 安全使用
    }
}
```

### 超时处理

```typescript
// GameHttp 中设置超时（毫秒）
http.timeout = SubGameConfig.httpTimeout;  // 默认 10000ms
```

## 清单

- [ ] GameHttp 实体已注册到子游戏单例
- [ ] API 端点集中定义在配置文件
- [ ] 请求/响应类型已定义
- [ ] 请求头包含必要的认证和设备信息
- [ ] 失败场景有 Toast 提示
- [ ] BLL 组件在请求完成后移除（`e.remove(Comp)`）
- [ ] HTTP 超时已配置
- [ ] WebSocket 连接在退出时正确关闭
- [ ] 响应数据使用前做有效性校验

## 相关技能

- `oops-ecs-pattern` — ECS 三层架构中的 BLL 层
- `oops-event-system` — 请求完成后的事件派发
- `oops-framework` — oops.tcp WebSocket API
