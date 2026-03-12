/** 游戏资源路径工具 */
export class GameResPath {
    /** 游戏配置路径 */
    static getConfigPath(relative_path: string) {
        return "config/game/" + relative_path;
    }

    // TODO: 根据项目需要添加更多资源路径方法
}
