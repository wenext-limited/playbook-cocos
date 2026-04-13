# 技能目录

本文件是 playbook-cocos 技能覆盖的索引。

## 按前缀分组

### `cocos-`

以 `cocos-` 为前缀的技能聚焦 Cocos Creator 引擎通用能力。

- `cocos-project-setup/`
  新建 Cocos Creator 游戏项目时使用。推荐从 `new_project_code/` 模板拷贝基础代码快速搭建，也支持手动创建。包括脚手架搭建、初始化配置、入口类编写、插件安装、子游戏模板定制。

- `cocos-scene-management/`
  需要管理场景切换、Asset Bundle 懒加载、子游戏入口时使用。

- `cocos-ui-system/`
  构建 UI 层级系统、弹窗管理、Panel 配置表时使用。

- `cocos-animation/`
  实现动画效果时使用。包括 Tween 补间、Spine 骨骼、状态机动画、变速曲线、预回调模式、Easing 缓动。

- `cocos-audio/`
  管理游戏音频时使用。包括背景音乐、音效播放/暂停/恢复、音量控制。

- `cocos-network/`
  实现网络通信时使用。包括 HTTP 请求封装、WebSocket 长连接、协议定义、错误处理。

- `cocos-asset-management/`
  动态加载和管理游戏资源时使用。包括 Sprite 加载、UUID 缓存、对象池、预加载、资源释放。

- `cocos-2d-game-loop/`
  实现 2D 游戏核心循环时使用。包括阶段状态机、倒计时系统、回合管理、游戏流程控制。

- `cocos-localization/`
  实现多语言本地化时使用。包括语言文件组织、语言切换、文本动态替换。

- `cocos-coin-animation/`
  实现贝塞尔曲线飞币动画时使用。包括 FlyChips 实体架构、多方向飞行路径、三次贝塞尔插值、对象池复用。

- `cocos-data-persistence/`
  实现数据持久化时使用。包括三层存储架构、前缀隔离、内存缓存策略。

### `oops-`

以 `oops-` 为前缀的技能聚焦 OOPS Plugin Framework 的用法。

- `oops-framework/`
  初始化 OOPS 框架或了解其核心 API 时使用。包括 Root 基类、12 个 oops 子模块 API、框架初始化流程。

- `oops-ecs-pattern/`
  实现 ECS 三层架构（Model/BLL/View）时使用。包括实体定义、组件注册、系统编写、数据流设计。

- `oops-event-system/`
  使用 OOPS 事件系统进行模块间通信时使用。包括事件定义规范、注册/注销生命周期、事件派发模式。

- `oops-mvvm-binding/`
  实现 MVVM 响应式数据绑定时使用。包括 VMKey 定义、VM.add/remove、vm.setValue/getValue、oops.mvvm.add View 级 VM。

### `ts-`

以 `ts-` 为前缀的技能聚焦 TypeScript 语言级别的可复用指导。

- `ts-common-patterns/`
  TypeScript 通用工具模式。包括 Toast 系统、EasingMethod 枚举、数字滚动、RTL 适配、富文本图集、Inspector 属性模式。
