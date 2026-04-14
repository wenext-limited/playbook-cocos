import { DEBUG } from "cc/env";

/** 游戏全局常量 - TODO: 根据项目修改 */
export class WGameConst {

    private static _WebDevMode: boolean = true;
    /** 是否为Web开发模式（仅DEBUG下生效） */
    static get WebDevMode() {
        return DEBUG && this._WebDevMode;
    }

    // TODO: 根据项目添加业务常量
    // static readonly keyXxx: string = 'key_xxx';
}
