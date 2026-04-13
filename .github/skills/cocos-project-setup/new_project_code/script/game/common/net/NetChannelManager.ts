import { oops } from "../../../../../extensions/oops-plugin-framework/assets/core/Oops";
import { NetData } from "../../../../../extensions/oops-plugin-framework/assets/libs/network/NetInterface";
import { NetProtocolPako } from "../../../../../extensions/oops-plugin-framework/assets/libs/network/NetProtocolPako";
import { WebSock } from "../../../../../extensions/oops-plugin-framework/assets/libs/network/WebSock";
import { netConfig } from "./NetConfig";
import { NetGameTips } from "./NetGameTips";
import { NetNodeGame } from "./NetNodeGame";

export enum NetChannelType {
    /** 游戏服务器 */
    Game = 0,
}

/** 游戏服务器心跳协议 */
class GameProtocol extends NetProtocolPako {
    /** 心跳协议 */
    getHearbeat(): NetData {
        return `{"action":"LoginAction","method":"heart","data":"null","isCompress":false,"channelid":${netConfig.channelid},"callback":"LoginAction_heart"}`;
    }
}

/** 网络通道管理器 */
export class NetChannelManager {
    public game!: NetNodeGame;

    /** 创建游戏服务器 */
    gameCreate() {
        this.game = new NetNodeGame();
        this.game.init(new WebSock(), new GameProtocol(), new NetGameTips());
        oops.tcp.setNetNode(this.game, NetChannelType.Game);
    }

    /** 连接游戏服务器 */
    gameConnect() {
        oops.tcp.connect({
            url: `ws://${netConfig.gameIp}:${netConfig.gamePort}`,
            autoReconnect: 0
        }, NetChannelType.Game);
    }

    /** 断开游戏服务器 */
    gameClose() {
        oops.tcp.close(undefined, undefined, NetChannelType.Game);
    }
}

export var netChannel = new NetChannelManager();
