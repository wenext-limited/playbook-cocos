export enum WGamePreloadType {
    WaitInit = 0,     // 等待初始化参数后再加载资源
    LoadCommon = 1,   // 先加载Common资源，然后再等参数
}

/** 游戏启动配置 */
export class WGameConfig {
    static readonly preloadMode: WGamePreloadType = WGamePreloadType.WaitInit;
}
