/** WGame全局游戏事件 - 子游戏可继承扩展 */
export enum WGameEvent {
    /** 游戏服务器连接成功 */
    GameServerConnected = "WGame.GameServerConnected",
    /** 登陆成功 */
    LoginSuccess = "WGame.LoginSuccess",
    /** 拉取游戏信息 */
    OnGetGameViewRet = "WGame.OnGetGameViewRet",
    /** 进入初始化资源系统 */
    OnEnterInitResSystem = 'OnEnterInitResSystem',
    /** app同步来的游戏音效状态 */
    OnAsyncSound = "WGame.OnAsyncSound",
}
