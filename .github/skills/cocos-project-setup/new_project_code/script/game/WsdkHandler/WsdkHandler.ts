import { ecs } from "../../../../extensions/oops-plugin-framework/assets/libs/ecs/ECS";
import { oops } from "../../../../extensions/oops-plugin-framework/assets/core/Oops";
import { wsdk, appCross, MsgApp2Game } from "db://wsdk/WSDK";
import { WGameEvent } from "../common/config/GameEvent";
import { smc } from "../common/ecs/SingletonModuleComp";
import { InitGameComp } from "../initialize/bll/InitGame";
import { reportAppToGame, reportSys } from "db://wsdk/WeNextReport";
import { Const } from "db://wsdk/Const";
import { NativeToGameOpType } from "db://wsdk/AppCross/Game2App";

@ecs.register('WsdkHandler')
export class WsdkHandler extends ecs.Entity {

    protected init() {
        this.addEvent();
    }

    private addEvent() {
        // 初始化资源进来
        oops.message.on(WGameEvent.OnEnterInitResSystem, this.onEnterInitResSystem, this);
        // 监听appcross消息
        oops.message.on(MsgApp2Game.onGetGameViewRet, this.onGetGameViewRet, this);
        // 监听app对游戏操作
        oops.message.on(MsgApp2Game.opGame, this.opGame, this);
    }

    onEnterInitResSystem() {
        // 设置appcross消息代理
        appCross.setEventDispatherProxy(oops.message.dispatchEvent.bind(oops.message));

        // wsdk调用初始化
        wsdk.setLogProxy(oops.log.logModel.bind(oops.log));
        wsdk.init();
    }

    onGetGameViewRet(event: string, data: object) {
        if (data == null) {
            oops.log.logModel("WsdkHandler, onGetGameViewRet, data==null");
            return;
        }

        const initGameComp = smc.initialize.get<InitGameComp>(InitGameComp);
        initGameComp.setDetailData(data['data']);

        // TODO: 根据项目修改GameType
        reportSys.init(data['data'], Const.GameType.GREEDYBOX);

        oops.message.dispatchEvent(WGameEvent.OnGetGameViewRet);

        reportAppToGame(MsgApp2Game.onGetGameViewRet);
    }

    opGame(event: string, data: object) {
        oops.log.logModel("WsdkHandler, opGame", JSON.stringify(data));
        const op = data["op"];

        switch (op) {
            case NativeToGameOpType.asyncSound:
                oops.message.dispatchEvent(WGameEvent.OnAsyncSound, data["data"]);
                break;
        }
    }
}
