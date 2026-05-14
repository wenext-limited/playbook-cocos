
import { _decorator, Component, Input, input, Label, Layout, Node, Sprite, Tween, tween, UITransform, Vec3 } from 'cc';
import { sub_smc } from '../ecs/SubSingletonModuleComp';
import { AppUtil } from '../util/AppUtil';
import { Utils } from '../util/Utils';
import { oops } from 'db://oops-framework/core/Oops';
const { ccclass, property } = _decorator;

enum EMStatus {
    Hide,
    Show,
}

@ccclass('CoinTokenInfoComp')
export class CoinTokenInfoComp extends Component {

    private _labelTokenNum: Label;
    private _spriteToken: Sprite;

    private _labelCoinNum: Label;
    private _spriteCoin: Sprite;

    private _status: EMStatus = EMStatus.Hide;

    private _nodeBlock: Node;

    layoutLucky: Layout;
    layoutCoins: Layout;
    layoutToken: Layout;
    layoutCoin: Layout;
    trfLucky: UITransform;
    trfCoins: UITransform
    layoutRoot: Layout;
    labelCoin: Label;

    maxSpace_x = 56;

    onLoad() {
        this._labelTokenNum = this.node.getChildByPath('layout/nodeluckyCoins/nodeToken/labelTokenNum').getComponent(Label);
        this._spriteToken = this.node.getChildByPath('layout/nodeluckyCoins/nodeToken/icon').getComponent(Sprite);

        this._labelCoinNum = this.node.getChildByPath('layout/nodeCoins/nodeCoin/labelCoinNum').getComponent(Label);
        this._spriteCoin = this.node.getChildByPath('layout/nodeCoins/nodeCoin/icon').getComponent(Sprite);

        this.layoutLucky = this.node.getChildByPath('layout/nodeluckyCoins').getComponent(Layout);
        this.layoutCoins = this.node.getChildByPath('layout/nodeCoins').getComponent(Layout);

        this.layoutToken = this.node.getChildByPath('layout/nodeluckyCoins/nodeToken').getComponent(Layout);
        this.layoutCoin = this.node.getChildByPath('layout/nodeCoins/nodeCoin').getComponent(Layout);
        this.labelCoin = this.node.getChildByPath('layout/nodeCoins/labelCoin').getComponent(Label);
        this.labelCoin.string = oops.language.getLangByID(AppUtil.getCurrencyNameKey());

        this.trfLucky = this.layoutLucky.node.getComponent(UITransform);
        this.trfCoins = this.layoutCoins.node.getComponent(UITransform);
        this.layoutRoot = this.node.getChildByPath('layout').getComponent(Layout);

        this.node.active = false;

        this._nodeBlock = this.node.getChildByName('nodeBlock');
        this._nodeBlock.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    private onTouchEnd() {
        this.closeTokenInfo();
    }

    protected onEnable(): void {
        const nCoinTokenNum = sub_smc.subGame.UserGameModel.getMyCoinTokenNum();
        this._labelTokenNum.string = nCoinTokenNum.toString();
        Utils.setCoinSprite(this._spriteToken, AppUtil.getCoinIcon(true));

        const nCoinNum = sub_smc.subGame.UserGameModel.getMyCoinNum();
        this._labelCoinNum.string = nCoinNum.toString();
        Utils.setCoinSprite(this._spriteCoin, AppUtil.getCoinIcon(false));

        this.resetLayoutMode();
        this.onUpdateLayout();

        // 在下一帧调用 updateLayout 方法
        this.scheduleOnce(() => {
            this.updateLayout();
        }, 0.1);
    }

    updateLayout() {
        if (this.trfCoins.width > this.trfLucky.width) {
            let oldwidth = this.trfLucky.width;
            this.layoutLucky.resizeMode = Layout.ResizeMode.NONE;
            this.trfLucky.width = this.trfCoins.width;
            this.layoutLucky.spacingX = this.trfCoins.width - oldwidth + this.maxSpace_x;
        }
        else if (this.trfCoins.width < this.trfLucky.width) {
            let oldwidth = this.trfCoins.width;
            this.layoutCoins.resizeMode = Layout.ResizeMode.NONE;
            this.trfCoins.width = this.trfLucky.width;
            this.layoutCoins.spacingX = this.trfLucky.width - oldwidth + this.maxSpace_x;
        }
        this.onUpdateLayout();
    }

    resetLayoutMode() {
        this.layoutCoins.spacingX = this.maxSpace_x;
        this.layoutLucky.spacingX = this.maxSpace_x;
        this.layoutLucky.resizeMode = Layout.ResizeMode.CONTAINER;
        this.layoutCoins.resizeMode = Layout.ResizeMode.CONTAINER;
        this.layoutToken.resizeMode = Layout.ResizeMode.CONTAINER;
        this.layoutCoin.resizeMode = Layout.ResizeMode.CONTAINER;
        this.layoutRoot.resizeMode = Layout.ResizeMode.CONTAINER;
    }

    onUpdateLayout() {
        this.layoutCoin.updateLayout(true);
        this.layoutToken.updateLayout(true);
        this.layoutLucky.updateLayout(true);
        this.layoutCoins.updateLayout(true);
        this.layoutRoot.updateLayout(true);
    }

    public onClickTokenBtn() {
        if (this._status == EMStatus.Hide) {
            this.showCoinTokenInfo();
        } else if (this._status == EMStatus.Show) {
            this.closeTokenInfo();
        }
    }

    private showCoinTokenInfo() {
        this._status = EMStatus.Show;
        Tween.stopAllByTarget(this.node);
        this.node.active = true;
        this._nodeBlock.active = true;

        // 打开时的缩放动画
        tween(this.node)
            .call(() => {
                this.node.setScale(Vec3.ZERO);
            })
            .to(0.15, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    private closeTokenInfo() {
        this._status = EMStatus.Hide;
        Tween.stopAllByTarget(this.node);
        this._nodeBlock.active = false;

        tween(this.node)
            .to(0.15, { scale: Vec3.ZERO })
            .call(() => {
                this.node.active = false;
            })
            .start();
    }

    protected onDisable(): void {
        Tween.stopAllByTarget(this.node);
    }

}

