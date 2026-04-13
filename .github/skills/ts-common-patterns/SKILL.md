---
name: ts-common-patterns
description: TypeScript 通用工具类和常用模式，包括 Toast 提示、数字滚动动画、缓动函数封装、阿拉伯语适配和富文本管理。不适用于框架级核心 API。
tags: [typescript, utility, toast, easing, adapter]
inputs: [功能需求, 目标平台]
outputs: [工具类代码, 组件代码, 适配方案]
---

# TypeScript 通用模式

## Toast 提示系统

### DelegateComponent 参数传递

OOPS GUI 系统通过 `DelegateComponent` 向动态打开的 UI 传参：

```typescript
// 调用方：打开 Toast 并传参
oops.gui.open(SubUIID.TipToast, '下注成功');
oops.gui.open(SubUIID.TipRecharge);
```

### Toast 组件实现

```typescript
import { DelegateComponent } from 'path/to/oops-framework/core/gui/layer/DelegateComponent';

@ccclass('tipToast')
export class tipToast extends Component {
    private _labelContent: Label;

    start() {
        // 通过 DelegateComponent 获取传入参数
        const comp = this.node.getComponent(DelegateComponent);
        this._labelContent = this.node.getChildByPath('nodeLayer/labelContent').getComponent(Label);
        this._labelContent.string = comp.vp.params || 'err';

        // 自适应高度
        this._labelContent.updateRenderData(true);
        const tsfLabel = this._labelContent.getComponent(UITransform);
        this.node.getChildByName('nodeLayer').getComponent(UITransform).height = tsfLabel.height;

        // 自动消失
        oops.timer.scheduleOnce(() => {
            oops.gui.removeByNode(this.node, true);
        }, 1);
    }
}
```

### Toast 设计要点

- **参数传递**：`oops.gui.open(UIID, params)` → `DelegateComponent.vp.params`
- **自动销毁**：`oops.timer.scheduleOnce` + `oops.gui.removeByNode`
- **注册层级**：使用 `LayerType.Notify` 避免阻断交互

## 缓动函数封装（EasingMethod）

```typescript
import { easing } from "cc";

export enum EasingMethod {
    LINEAR, CONSTANT,
    QUAD_IN, QUAD_OUT, QUAD_IN_OUT, QUAD_OUT_IN,
    CUBIC_IN, CUBIC_OUT, CUBIC_IN_OUT, CUBIC_OUT_IN,
    QUART_IN, QUART_OUT, QUART_IN_OUT, QUART_OUT_IN,
    SINE_IN, SINE_OUT, SINE_IN_OUT,
    EXPO_IN, EXPO_OUT, EXPO_IN_OUT,
    ELASTIC_IN, ELASTIC_OUT, ELASTIC_IN_OUT,
    BACK_IN, BACK_OUT, BACK_IN_OUT,
    BOUNCE_IN, BOUNCE_OUT, BOUNCE_IN_OUT,
    SMOOTH, FADE,
}

// 枚举 → 函数映射
const easingMethodFnMap: Record<EasingMethod, (k: number) => number> = {
    [EasingMethod.LINEAR]: easing.linear,
    [EasingMethod.QUAD_IN]: easing.quadIn,
    [EasingMethod.QUAD_OUT]: easing.quadOut,
    // ...完整映射
};

export function getEasingFn(method: EasingMethod): (k: number) => number {
    return easingMethodFnMap[method] ?? easing.linear;
}
```

### 使用场景

```typescript
// Inspector 中配置缓动类型
@property({ type: Enum(EasingMethod) })
flyCoinEasing: EasingMethod = EasingMethod.QUAD_IN;

// Tween 中使用
tween(obj).to(duration, target, {
    easing: getEasingFn(this.flyCoinEasing),
}).start();
```

## 数字滚动动画（NumberScroller）

数字从旧值平滑滚动到新值的视觉效果：

```typescript
@ccclass('NumberScroller')
export class NumberScroller extends Component {
    private _label: Label;
    private _currentValue: number = 0;
    private _targetValue: number = 0;
    private _duration: number = 0.5;
    private _elapsed: number = 0;
    private _startValue: number = 0;
    private _isScrolling: boolean = false;

    scrollTo(value: number, duration: number = 0.5) {
        this._startValue = this._currentValue;
        this._targetValue = value;
        this._duration = duration;
        this._elapsed = 0;
        this._isScrolling = true;
    }

    update(dt: number) {
        if (!this._isScrolling) return;

        this._elapsed += dt;
        const progress = Math.min(this._elapsed / this._duration, 1);

        // 缓动插值
        const eased = easing.quadOut(progress);
        this._currentValue = this._startValue + (this._targetValue - this._startValue) * eased;

        this._label.string = Math.floor(this._currentValue).toString();

        if (progress >= 1) {
            this._isScrolling = false;
            this._currentValue = this._targetValue;
            this._label.string = this._targetValue.toString();
        }
    }
}
```

## 阿拉伯语文本适配（RTL）

阿拉伯语是从右到左（RTL）的语言，需特殊处理：

```typescript
export class ArabicAdapter {
    // 检查是否为 RTL 语言
    static isRTL(): boolean {
        const lang = oops.language.getCurrentLanguage();
        return lang === 'ar' || lang === 'he';
    }

    // 镜像布局
    static adaptLayout(node: Node) {
        if (this.isRTL()) {
            node.setScale(-1, 1, 1);  // 水平翻转
        }
    }

    // 文本方向适配
    static adaptLabel(label: Label) {
        if (this.isRTL()) {
            label.horizontalAlign = Label.HorizontalAlign.RIGHT;
        }
    }
}
```

## 富文本图集管理

将常用图标（金币、代币）内嵌到 RichText 中：

```typescript
@ccclass('RichTextAtlasManager')
export class RichTextAtlasManager extends Component {
    // 管理 RichText 的 SpriteAtlas 图集
    private _atlas: SpriteAtlas;

    init(atlas: SpriteAtlas) {
        this._atlas = atlas;
    }

    // 构造带图标的富文本
    static coinText(amount: number): string {
        return `<img src='coin'/> ${amount}`;
    }

    static tokenText(amount: number): string {
        return `<img src='token'/> ${amount}`;
    }
}
```

## 工具类设计模式

### 静态方法类（无状态）

```typescript
export class SubGameUtil {
    // HTTP 封装
    static httpGet(url: string, callback: Function, params?: any) {
        sub_smc.gameHttp.httpGet(url, callback, params);
    }

    static httpPost(url: string, callback: Function, data?: string) {
        sub_smc.gameHttp.httpPost(url, callback, data);
    }

    // 计算当前阶段
    static calcCurStage(leftTime: number): StageResult { ... }

    // 语言包装
    static getLangByID(key: string): string {
        return oops.language.getLangByID(key) || key;
    }
}
```

### 命名规范

| 方法类型 | 前缀 | 示例 |
|---------|------|------|
| HTTP 请求 | `http` | `httpGet()`, `httpPost()` |
| 数据计算 | `calc` | `calcCurStage()` |
| UI 设置 | `set` | `setSpriteFrame()`, `setSkeletonData()` |
| 数据获取 | `get` | `getLangByID()`, `getBaseUrl()` |
| 格式转换 | `format` | `formatCoinNum()`, `formatTime()` |
| 判断检查 | `is`/`has` | `isRTL()`, `hasData()` |

## 常用 Inspector 属性模式

```typescript
// 范围滑块
@property({ range: [0, 1, 0.01], slide: true })
factor: number = 0.5;

// 枚举下拉
@property({ type: Enum(MyEnum) })
type: MyEnum = MyEnum.Default;

// Prefab 引用
@property(Prefab) prefab: Prefab = null!;

// 节点引用
@property(Node) targetNode: Node = null!;

// 组件引用
@property(Label) label: Label = null!;
```

## 相关技能

- `cocos-ui-system` — UI 层管理与面板模式
- `cocos-animation` — 基础动画系统
- `cocos-localization` — 多语言与阿拉伯语支持
