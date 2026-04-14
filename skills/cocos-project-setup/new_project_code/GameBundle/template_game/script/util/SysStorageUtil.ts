import { sys } from 'cc';

/** 带前缀的本地存储工具类 - 避免多子游戏存储key冲突 */
export class SysStorageUtil {
    private static _prefix = '';

    static setPrefix(prefix: string) {
        this._prefix = prefix;
    }

    static setPrefixByGame(gameName: string) {
        this._prefix = `${gameName}_`;
    }

    static setItem(key: string, value: string) {
        sys.localStorage.setItem(`${this._prefix}${key}`, value);
    }

    static getItem(key: string) {
        return sys.localStorage.getItem(`${this._prefix}${key}`);
    }
}
