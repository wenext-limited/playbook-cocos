import { _decorator, PageViewIndicator, Node, SpriteFrame, Sprite } from "cc";

const { ccclass, property } = _decorator;

/** 循环翻页指示器 - 配合 CirclePageView 使用 */
@ccclass(`CirculatePageViewIndicator`)
export default class CirculatePageViewIndicator extends PageViewIndicator {
    @property({ type: SpriteFrame, displayName: 'spriteGrayFrame', tooltip: "指示器灰色图片" })
    protected spriteGrayFrame: SpriteFrame | null = null;

    @property({ displayName: 'Circulate', tooltip: "是否循环" })
    public circulate = true;

    public _createIndicator() {
        const node = new Node();
        node.layer = this.node.layer;
        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = this.spriteGrayFrame;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        node.parent = this.node;
        node._uiProps.uiTransformComp!.setContentSize(this._cellSize);
        return node;
    }

    public _changedState() {
        const indicators = this._indicators;
        if (indicators.length == 0 || !this._pageView) { return; }
        let idx = this._pageView.curPageIdx;

        if (this.circulate) {
            idx--;
            if (idx == -1) {
                idx = this._pageView.getPages().length - 2;
            } else if (idx == this._pageView.getPages().length - 2) {
                idx = 0;
            }
        }

        if (idx >= indicators.length || idx < 0) { return; }

        for (let i = 0; i < indicators.length; ++i) {
            const node = indicators[i];
            if (!node._uiProps.uiComp) { continue; }
            node.getComponent(Sprite)!.spriteFrame = this.spriteGrayFrame;
        }

        if (indicators[idx]._uiProps.uiComp) {
            indicators[idx].getComponent(Sprite)!.spriteFrame = this.spriteFrame;
        }
    }

    public _refresh() {
        if (!this._pageView) { return; }
        const indicators = this._indicators;
        const pages = this._pageView.getPages();
        let pageSize = pages.length;
        if (this.circulate) {
            pageSize = pages.length - 2;
        }

        if (pageSize == indicators.length) { return; }

        let i = 0;
        if (pageSize > indicators.length) {
            for (i = 0; i < pageSize; ++i) {
                if (!indicators[i]) {
                    indicators[i] = this._createIndicator();
                }
            }
        } else {
            const count = indicators.length - pageSize;
            for (i = count; i > 0; --i) {
                const node = indicators[i - 1];
                this.node.removeChild(node);
                indicators.splice(i - 1, 1);
            }
        }
        if (this._layout && this._layout.enabledInHierarchy) {
            this._layout.updateLayout();
        }
        this._changedState();
    }
}
