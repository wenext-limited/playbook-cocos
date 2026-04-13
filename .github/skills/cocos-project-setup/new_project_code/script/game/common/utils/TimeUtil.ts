const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 1 * 60 * 60 * 1000;

/** 时间工具类 */
export class TimeUtil {

    /** 格式化日期 */
    static formatDate(date: Date, format: string, useUTC: boolean = false): string {
        const year: number = useUTC ? date.getUTCFullYear() : date.getFullYear();
        const month: number = useUTC ? date.getUTCMonth() + 1 : date.getMonth() + 1;
        const day: number = useUTC ? date.getUTCDate() : date.getDate();
        const hours: number = useUTC ? date.getUTCHours() : date.getHours();
        const minutes: number = useUTC ? date.getUTCMinutes() : date.getMinutes();
        const seconds: number = useUTC ? date.getUTCSeconds() : date.getSeconds();

        return format
            .replace('YY', year.toString())
            .replace('MM', (month < 10 ? '0' : '') + month)
            .replace('DD', (day < 10 ? '0' : '') + day)
            .replace('hh', (hours < 10 ? '0' : '') + hours)
            .replace('mm', (minutes < 10 ? '0' : '') + minutes)
            .replace('ss', (seconds < 10 ? '0' : '') + seconds);
    }

    /** 获取UTC格式日期 */
    static getUTCDate(format: string): string {
        return TimeUtil.formatDate(new Date(Date.now()), format, true);
    }

    /** 获取本地格式日期 */
    static getLocalDate(format: string): string {
        return TimeUtil.formatDate(new Date(Date.now()), format, false);
    }

    /** 获取带时区偏移的时间戳 */
    static getDateNumberByOffset(ts: number, offSetZoon: number, offsetDay: number): number {
        ts = ts + offsetDay * ONE_DAY_MS + offSetZoon * ONE_HOUR_MS;
        return ts;
    }
}
