import { _decorator, Component, Label, Tween, tween, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

/** 数字滚动组件 - 带千分位格式化和缓动动画 */
@ccclass('NumberScroller')
export class NumberScroller extends Component {
    private _label: Label = null!;
    private _nowValue: number = 0;
    private _animObject = { value: 0 };

    onLoad() {
        this._label = this.node.getComponent(Label);
    }

    protected onDestroy(): void {
        Tween.stopAllByTarget(this._animObject);
        Tween.stopAllByTarget(this._label.node);
    }

    /** 千分位格式化 */
    private formatWithThousandSep(num: number, decimalPlaces: number = 0): string {
        const fixedNum = num.toFixed(decimalPlaces);
        const [integerPart, decimalPart] = fixedNum.split('.');
        const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return decimalPart ? `${formattedInteger}.${decimalPart}` : formattedInteger;
    }

    /** 直接设置数值 */
    public setValue(value: number) {
        this._label = this._label || this.node.getComponent(Label);
        if (value != null) {
            this._nowValue = value;
            if (this._label && this._label.isValid) {
                this._label.string = this.formatWithThousandSep(value);
            }
        }
    }

    /**
     * 动画化数字显示，从当前数字平滑过渡到目标数字
     * @param to 目标数字
     * @param duration 动画时长（秒）
     * @param withJumper 是否带跳动缩放效果
     */
    public animateNumber(to: number, duration: number = 0.5, withJumper: boolean = false) {
        if (!this._label) return;

        if (duration <= 0 || this._nowValue == to) {
            this._nowValue = to;
            if (this._label && this._label.isValid) {
                this._label.string = this.formatWithThousandSep(to);
            }
            return;
        }

        Tween.stopAllByTarget(this._animObject);
        Tween.stopAllByTarget(this._label.node);

        if (withJumper) {
            tween(this._label.node)
                .repeatForever(
                    tween()
                        .to(0.1, { scale: new Vec3(1.2, 1.2, 1.2) })
                        .to(0.1, { scale: new Vec3(1.0, 1.0, 1.0) })
                )
                .start();
        }

        let obj = this._animObject;
        obj.value = this._nowValue;
        tween(obj)
            .to(duration, { value: to }, {
                onUpdate: () => {
                    this._nowValue = obj.value;
                    if (this._label && this._label.isValid) {
                        this._label.string = this.formatWithThousandSep(obj.value);
                    }
                }
            })
            .call(() => {
                Tween.stopAllByTarget(this._label.node);
                this._nowValue = to;
            })
            .start();
    }
}
