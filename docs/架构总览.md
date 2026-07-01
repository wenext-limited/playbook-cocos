# 架构总览

## 系统架构图

```
┌─────────────────────────────────────────────────────────┐
│                      Cocos Creator 3.x                  │
│  ┌───────────────────────────────────────────────────┐  │
│  │                    Main Scene                      │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │              Main.ts (Root)                  │  │  │
│  │  │  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │  │  │
│  │  │  │initEcs  │ │ initGui  │ │    run()    │  │  │  │
│  │  │  │System() │ │   ()     │ │             │  │  │  │
│  │  │  └────┬────┘ └────┬─────┘ └──────┬──────┘  │  │  │
│  │  └───────┼───────────┼──────────────┼──────────┘  │  │
│  └──────────┼───────────┼──────────────┼─────────────┘  │
│             │           │              │                 │
│             v           v              v                 │
│  ┌──────────────┐ ┌──────────┐ ┌──────────────────┐    │
│  │  ECS System  │ │LayerMgr  │ │ smc (全局单例)   │    │
│  │  Registration│ │  (GUI)   │ │                   │    │
│  └──────────────┘ └──────────┘ └──────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## ECS 三层架构

```
┌─────────────────────────────────────────────────────────┐
│                     Entity (实体)                        │
│  ┌──────────────────┐ ┌──────────────────────────────┐  │
│  │  Model 组件       │ │  BLL 组件 (按需添加/移除)     │  │
│  │  ┌──────────────┐ │ │  ┌────────────────────────┐ │  │
│  │  │UserGameModel │ │ │  │ ReqBettingDataComp     │ │  │
│  │  │BettingModel  │ │ │  │ UserGameDataComp       │ │  │
│  │  │CurrentResult │ │ │  │ CurrentResultDataComp  │ │  │
│  │  │  Model       │ │ │  └────────────────────────┘ │  │
│  │  │GameRecords   │ │ │                              │  │
│  │  │  Model       │ │ │  对应 System:                │  │
│  │  └──────────────┘ │ │  ┌────────────────────────┐ │  │
│  │                    │ │  │ ReqBettingDataSystem   │ │  │
│  │  数据存储 + Getter │ │  │ UserGameDataSystem     │ │  │
│  │  deal...() 处理数据│ │  │ CurrentResultDataSys   │ │  │
│  │                    │ │  └────────────────────────┘ │  │
│  └──────────────────┘ └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          │ oops.message.dispatchEvent()
                          v
┌─────────────────────────────────────────────────────────┐
│                    View 层 (Component)                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │NodeGameMain  │ │PanelRule     │ │PanelHistory      │ │
│  │Component     │ │Component     │ │Component         │ │
│  │              │ │              │ │                   │ │
│  │ addEvent()   │ │ onEnable()   │ │ onEnable()       │ │
│  │ removeEvent()│ │ onDisable()  │ │ onDisable()      │ │
│  │ onDestroy()  │ │              │ │                   │ │
│  └──────────────┘ └──────────────┘ └──────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 数据流

```
用户操作 (View)
    │
    │ sub_smc.subGame.reqBetting(coins, option)
    v
Entity 业务方法
    │
    │ this.add(ReqBettingDataComp)
    v
BLL System (entityEnter)
    │
    │ sub_smc.gameHttp.httpPost(url, callback, data)
    v
HTTP 请求 (GameHttp Entity)
    │
    │ HttpRequest → 服务器
    v
服务器响应
    │
    │ callback(HttpReturn)
    v
BLL System (callback)
    │
    ├─ e.UserGameModel.dealMyBetSuccess(data)  → 更新 Model
    │
    ├─ oops.message.dispatchEvent(OnMyBettingSuccess)  → 派发事件
    │
    └─ e.remove(ReqBettingDataComp)  → 清理 BLL 组件
        │
        │ 事件分发
        v
View (事件处理器)
    │
    └─ 更新 UI 显示
```

## 单例架构

```
┌──────────────────────────────────────┐
│            smc (全局单例)             │
│  SingletonModuleComp                 │
│  ┌────────────────────────────────┐  │
│  │ account: Account              │  │
│  │ initialize: Initialize        │  │
│  └────────────────────────────────┘  │
│                                      │
│  通过 ecs.getSingleton() 在全局使用  │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│         sub_smc (子游戏单例)          │
│  SubSingletonModuleComp             │
│  ┌────────────────────────────────┐  │
│  │ gameHttp: GameHttp            │  │
│  │ subGame: SubGame              │  │
│  └────────────────────────────────┘  │
│                                      │
│  子游戏 SubGameEntry.init() 中创建   │
│  子游戏退出时销毁                    │
└──────────────────────────────────────┘
```

## Bundle 架构

```
assets/
├── script/           # 公共脚本（非 Bundle）
│   ├── game/         # 主游戏逻辑
│   └── common/       # 通用工具
│
├── GameBundle/        # 子游戏合集（Bundle 容器）
│   ├── greedy/        # 子游戏 Bundle
│   │   ├── script/
│   │   │   ├── common/     # 子游戏工具类
│   │   │   ├── config/     # 配置
│   │   │   ├── entry/      # 入口
│   │   │   │   ├── SubGameEntry.ts    # Bundle 入口
│   │   │   │   ├── SubGameUIConfig.ts # UI 配置
│   │   │   │   └── SubGameEvent.ts    # 事件定义
│   │   │   ├── model/      # ECS Model
│   │   │   ├── bll/        # ECS BLL
│   │   │   └── view/       # UI 组件
│   │   ├── prefab/         # UI Prefab
│   │   ├── anim/           # 动画资源
│   │   └── spine/          # Spine 资源
│   └── other_game/   # 其他子游戏...
│
├── resources/         # 动态加载资源
│   └── language/      # 多语言文件
│
└── ui/                # 公共 UI Prefab
```

## 游戏状态机

```
                 ┌──────────┐
         ┌──────│  Betting  │<──────┐
         │      │  (下注)   │       │
         │      └──────────┘       │
         │           │              │
         │     倒计时结束            │
         │           │              │
         │           v              │
         │      ┌──────────┐       │
 超时重置 │      │ Waiting  │       │ 结算完成
         │      │  (等待)   │       │
         │      └──────────┘       │
         │           │              │
         │      开奖结果到达         │
         │           │              │
         │           v              │
         │      ┌──────────┐       │
         └──────│Settlement│───────┘
                │  (结算)   │
                └──────────┘
```

### 阶段时间配置

```typescript
const StageTimeCfg = [
    { stage: EMGameStage.Betting,    time: 30 },  // 下注 30s
    { stage: EMGameStage.Waiting,    time: 5 },   // 等待 5s
    { stage: EMGameStage.Settlement, time: 10 },  // 结算 10s
];
// 总周期: 45s
```

## UI 层级

```
Canvas
 ├── UIGame      (游戏主界面 — 常驻)
 ├── UINotify    (消息通知 — 叠加)
 ├── UIDialog    (弹窗面板 — 模态)
 └── UISystem    (系统级 — 最高层)
```

## 网络架构

```
┌───────────┐      ┌──────────────────┐      ┌──────────┐
│ BLL System│ ──── │   GameHttp       │ ──── │  Server  │
│           │      │ (Entity wrapping │      │          │
│entityEnter│      │  HttpRequest)    │      │ REST API │
└───────────┘      └──────────────────┘      └──────────┘
        │                                           │
        │           HttpReturn { isSucc, res }      │
        │<──────────────────────────────────────────│
        │
        ├── 成功: Model.deal...() + dispatchEvent
        └── 失败: UI 提示 (TipToast)
```

## MVVM 响应式绑定

项目使用两种 MVVM 模式并存：

```
┌──────────────────────────────────────────────────────────────┐
│                     Entity 级 MVVM                           │
│                                                              │
│  Model (ecs.Comp)                View (Component)            │
│  ┌────────────────────┐         ┌────────────────────────┐  │
│  │ UserGameModelComp  │         │ PanelSettlementComp    │  │
│  │                    │         │                         │  │
│  │ initMvvm() {      │ ──VM──> │ onEnable() {           │  │
│  │   VM.add(this,    │  Proxy  │   vm.setValue(key, val) │  │
│  │     'userModel')  │  监听   │   vm.getValue(key)      │  │
│  │ }                 │         │ }                        │  │
│  └────────────────────┘         └────────────────────────┘  │
│                                                              │
│  数据流: Model → Proxy 拦截 → director.emit → View 更新      │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                     View 级 MVVM                             │
│                                                              │
│  Component (View)                                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ NodeBetChipsComponent                                │   │
│  │                                                       │   │
│  │ onLoad() {                                           │   │
│  │   oops.mvvm.add(                                     │   │
│  │     { [VMKey.Path_MyChipsGear]: 0,                   │   │
│  │       [VMKey.Path_MyChipsNum]: 0 },                  │   │
│  │     VMKey.Tag_MyChips                                │   │
│  │   );                                                  │   │
│  │ }                                                     │   │
│  │                                                       │   │
│  │ 其他组件读取:                                         │   │
│  │   const vm = oops.mvvm.get(VMKey.Tag_MyChips);       │   │
│  │   vm.setValue(VMKey.Path_MyChipsGear, newGear);       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  数据流: oops.mvvm.add → Proxy ← get/setValue               │
└──────────────────────────────────────────────────────────────┘
```

## 动画链同步流程

多段动画的执行时序（以开奖流程为例）：

```
1. 开始转动
   │
   │ RunAnimationType.Run → update() 驱动 nextStep()
   │ SpeedUpTimeList: [0.15, 0.12, 0.1, 0.08, 0.06] → 加速
   │
   v
2. 服务器返回结果
   │
   │ CurrentResultData → 计算目标位置
   │ fixSingleStepNumber() → 确定总步数
   │
   v
3. 减速停止
   │
   │ RunAnimationType.SinglePrize / BigPrize
   │ SpeedDownTimeList: [0.08, 0.1, 0.12, 0.15, 0.2] → 减速
   │
   v
4. 开箱动画（Pre-Callback 模式）
   │
   │ _jackpotWinCallback = () => showResult()    ← 先设回调
   │ skeleton.setAnimation(0, 'open', false)      ← 再播动画
   │ skeleton.setCompleteListener → 触发回调       ← 动画完触发
   │
   v
5. 飞币动画
   │
   │ oops.message.dispatchEvent(CoinBankStartFly)
   │ FlyChips Entity → 计算路径 (4 方向)
   │ PanelCoinBankFly → 贝塞尔曲线 + Tween 驱动
   │ 对象池 getFreeCoin() / recycleCoin()
   │
   v
6. 结算 UI
   │
   │ oops.gui.open(SubUIID.Settlement)
   └→ 回到下注阶段
```

## oops 子模块使用频率分布

```
oops.message  ████████████████████████████████  60+ 处 (事件系统)
oops.log      ██████████████████████████        42+ 处 (分层日志)
oops.gui      ████████████████                  30+ 处 (UI 管理)
oops.language ████████████                      20+ 处 (多语言)
oops.res      ██████████                        15+ 处 (资源管理)
oops.timer    █████                              7  处 (定时器)
oops.mvvm     ████                               4  处 (视图模型)
oops.storage  ███                                3  处 (本地存储)
oops.tcp      ███                                3  处 (WebSocket)
oops.config   ███                                3  处 (配置)
oops.random   ███                                3  处 (随机数)
oops.ecs      ██                                 2  处 (ECS 入口)
```
