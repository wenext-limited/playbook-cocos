import { _decorator, Component, Game, game } from "cc";
const { ccclass } = _decorator;
import { oops } from "../../../../extensions/oops-plugin-framework/assets/core/Oops";
import { sub_smc } from "./ecs/SubSingletonModuleComp";
import { smc } from "../../../script/game/common/ecs/SingletonModuleComp";
import { LayerManagerExtension } from "../../../script/extension/LayerManagerExtension";
import { SubUIConfigData, SubUIID } from "./config/SubGameUIConfig";
import { appCross } from "db://wsdk/WSDK";
import { soundManager } from "../../../script/game/common/mgrs/SoundManager";

/** 子游戏入口组件 - 挂载在子游戏Prefab根节点 */
@ccclass("SubGameEntry")
export class SubGameEntry extends Component {
    protected onLoad(): void {
        // 注册子游戏UI配置到全局LayerManager
        this.expandGuiConfig();

        // 初始化ECS系统
        oops.ecs.init();

        // TODO: 播放背景音乐
        // soundManager.PlayBackgroundMusic("bgm");

        // 设置语言
        oops.language.setLanguage(smc.initialize.getLangCode(), function () { });

        // 网络恢复时刷新数据
        window && window.addEventListener("online", function (e) {
            // TODO: 重连后刷新游戏数据
            // sub_smc.subGame.refreshData();
        });

        game.on(Game.EVENT_SHOW, function () {
            soundManager.canPlaySound = true;
            soundManager.ResumeBackGroundMusic();
        });

        game.on(Game.EVENT_HIDE, function () {
            soundManager.canPlaySound = false;
            soundManager.StopAllSoundAndMusic();
        });

        // TODO: 打开需要常驻的UI
        // oops.gui.open(SubUIID.Xxx);
    }

    protected start(): void {
        // 初始化游戏业务单例模块
        sub_smc.init();

        oops.timer.scheduleOnce(() => {
            appCross.g2pp.onGameStart();
        }, 0.2);
    }

    private expandGuiConfig() {
        LayerManagerExtension.ExpandGuiConfig(SubUIConfigData);
    }
}
