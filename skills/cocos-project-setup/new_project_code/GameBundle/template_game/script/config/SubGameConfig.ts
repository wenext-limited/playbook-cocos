/** 子游戏配置 - TODO: 根据项目修改 */
export class SubGameConfig {
    static readonly httpTimeout: number = 5000;
    static readonly tipsShowTime: number = 800;

    // TODO: 添加游戏特定配置
}

/** API接口路径 - TODO: 根据项目修改 */
export class DeeplinkUrls {
    // TODO: 定义API路径
    // static readonly example: string = 'game/api/example';
}

/** VM数据绑定Key */
export class VMKey {
    // TODO: 定义ViewModel绑定的key
    // static readonly Path_MyCoin: string = 'myCoin';
}

/** 游戏阶段枚举 - TODO: 根据游戏流程定义 */
export enum EMGameStage {
    // Ready = 1,
    // Playing,
    // Settlement,
}

/** 游戏阶段对应时间配置 */
export let StageTimeCfg: { [key: number]: number } = {
    // [EMGameStage.Ready]: 5,
    // [EMGameStage.Playing]: 30,
    // [EMGameStage.Settlement]: 10,
};

export class StageResult {
    stage: EMGameStage;
    timeLeft: number;

    constructor(stage: EMGameStage, timeLeft: number) {
        this.stage = stage;
        this.timeLeft = timeLeft;
    }
}

/** 游戏活动类型标识 - TODO: 根据项目设置 */
export const activityGameType: string = 'template_game';
