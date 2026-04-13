import { oops } from "../../../../../extensions/oops-plugin-framework/assets/core/Oops";
import { AsyncQueue, NextFunction } from "../../../../../extensions/oops-plugin-framework/assets/libs/collection/AsyncQueue";
import { ecs } from "../../../../../extensions/oops-plugin-framework/assets/libs/ecs/ECS";
import { UIID } from "../../common/config/GameUIConfig";
import { Initialize } from "../Initialize";
import { LoadingViewComp } from "../view/LoadingViewComp";
import { WGameConfig, WGamePreloadType } from "../../common/config/WGameConfig";
import { WGameEvent } from "../../common/config/GameEvent";
import { smc } from "../../common/ecs/SingletonModuleComp";
import { InitGameComp } from "./InitGame";
import BundleConfig from '../../common/bundle/BundleConfig';
import { WGameConst } from "../../const/WGameConst";

/** 初始化游戏公共资源 */
@ecs.register('InitRes')
export class InitResComp extends ecs.Comp {
    reset() { }
}

export class InitResSystem extends ecs.ComblockSystem implements ecs.IEntityEnterSystem {
    filter(): ecs.IMatcher {
        return ecs.allOf(InitResComp);
    }

    entityEnter(e: Initialize): void {
        oops.message.on(WGameEvent.OnGetGameViewRet, this.onHandler, this);

        // 进入初始化，才能进行下一步
        oops.message.dispatchEvent(WGameEvent.OnEnterInitResSystem);

        if (WGameConst.WebDevMode) {
            oops.message.dispatchEvent(WGameEvent.OnGetGameViewRet);
        }

        oops.log.logModel(`InitRes, onGetGameViewRet, WGameConfig.preloadMode = ${WGameConfig.preloadMode}`);
        if (WGameConfig.preloadMode == WGamePreloadType.LoadCommon) {
            this.preloadResources(e);
        }
    }

    private onHandler(event: string, args: any) {
        switch (event) {
            case WGameEvent.OnGetGameViewRet:
                oops.log.logModel(`InitRes, onGetGameViewRet, args = ${args}`);
                smc.initialize.bInitGamePramGetted = true;
                this.preloadResources();
                this.checkInitCondition();
                break;
        }
    }

    private preloadResources(e?: Initialize) {
        e = e == undefined ? smc.initialize : e;

        oops.log.logModel(`InitRes, preloadResources`);

        if (e?.bCommonResLoaded) {
            oops.log.logModel(`InitRes, onGetGameViewRet, 已加载公共资源，无需重复加载`);
            return;
        }

        var queue: AsyncQueue = new AsyncQueue();
        this.loadBundle(queue);
        this.loadCommon(queue);

        queue.complete = async () => {
            e.bCommonResLoaded = true;
            oops.log.logModel(`InitRes, onGetGameViewRet, 加载公共资源完成`);
            this.checkInitCondition();
        };

        queue.play();
    }

    private checkInitCondition() {
        oops.log.logModel(`InitRes, checkInitCondition, bCommonResLoaded = ${smc.initialize.bCommonResLoaded}, bInitGamePramGetted = ${smc.initialize.bInitGamePramGetted}`);

        if (smc.initialize.bCommonResLoaded && smc.initialize.bInitGamePramGetted) {
            this.afterLoad();
        }
    }

    private afterLoad() {
        var initGameComp = smc.initialize.get<InitGameComp>(InitGameComp);

        // 设置语言
        oops.storage.set("language", initGameComp.langCode);

        var queue: AsyncQueue = new AsyncQueue();

        // 加载子游戏
        this.loadSubGame(queue, initGameComp.gameName);

        // 加载自定义资源
        this.loadCustom(queue);
        // 加载多语言包
        this.loadLanguage(queue);

        // 加载游戏内容
        this.onComplete(queue, smc.initialize);

        queue.play();
    }

    /** 加载远程资源配置 */
    private loadBundle(queue: AsyncQueue) {
        queue.push(async (next: NextFunction, params: any, args: any) => {
            oops.res.defaultBundleName = oops.config.game.bundleName;
            await oops.res.loadBundle(oops.config.game.bundleName);
            next();
        });
    }

    /** 加载自定义内容（可选） */
    private loadCustom(queue: AsyncQueue) {
        queue.push(async (next: NextFunction, params: any, args: any) => {
            oops.res.load("language/font/" + oops.language.current, next);
        });
    }

    /** 加载语言包（可选） */
    private loadLanguage(queue: AsyncQueue) {
        queue.push((next: NextFunction, params: any, args: any) => {
            let lan = oops.storage.get("language");
            if (lan == null) {
                lan = "en";
                oops.storage.set("language", lan);
            }
            oops.language.setLanguage(lan, next);
        });
    }

    /** 加载公共资源（必备） */
    private loadCommon(queue: AsyncQueue) {
        queue.push((next: NextFunction, params: any, args: any) => {
            oops.res.loadDir("common", next);
        });
    }

    /** 加载子游戏Bundle */
    private loadSubGame(queue: AsyncQueue, gameName: string) {
        queue.push(async (next: NextFunction, params: any, args: any) => {
            oops.res.defaultBundleName = oops.config.game.bundleName;

            const gameBundleName = BundleConfig.instance.getGameBundleName(gameName);
            oops.log.logBusiness(`game->bundle : ${gameName} --> ${gameBundleName}`);
            await oops.res.loadBundle(gameBundleName);

            oops.gui.getConfig(UIID.SubGame).bundle = gameBundleName;
            next();
        });
    }

    /** 加载完成进入游戏内容 */
    private onComplete(queue: AsyncQueue, e: Initialize) {
        queue.complete = async () => {
            // 方式一：直接打开子游戏
            oops.gui.open(UIID.SubGame);

            // 方式二：通过Loading界面打开
            // var node = await oops.gui.openAsync(UIID.Loading);
            // if (node) e.add(node.getComponent(LoadingViewComp) as ecs.Comp);

            e.remove(InitResComp);
        };
    }
}
