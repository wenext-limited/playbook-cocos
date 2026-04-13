/** App相关配置工具类 - 每个APP独立 */
export class AppUtil {
    /** app名称 */
    static _appName: string = "";

    /** 通用榜单类型 */
    static totualRankType: string = '';

    static setTotualRankType(type: string) {
        this.totualRankType = type;
    }

    static getTotualRankType() {
        return this.totualRankType ? this.totualRankType : '8';
    }

    /** 当前本地时区偏移 */
    static regionTimeZone: number = 0;

    static setRegionTimeZone(timeZone: number) {
        this.regionTimeZone = timeZone;
    }

    static getRegionTimeZone() {
        return this.regionTimeZone ? this.regionTimeZone : 0;
    }

    /** 榜单是否使用当地时间 */
    static isRankLocalTime: boolean = false;

    static setIsRankLocalTime(beLocalTime: number) {
        this.isRankLocalTime = beLocalTime == 1;
    }

    static getIsRankLocalTime(): boolean {
        return this.isRankLocalTime;
    }

    static set appName(appName: string) {
        if (appName && appName.length > 0) {
            this._appName = appName.toLowerCase();
        }
    }

    static get appName() {
        return this._appName;
    }
}
