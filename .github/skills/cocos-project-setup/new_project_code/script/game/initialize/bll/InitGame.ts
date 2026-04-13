import { Size } from "cc";
import { oops } from "../../../../../extensions/oops-plugin-framework/assets/core/Oops";
import { ecs } from "../../../../../extensions/oops-plugin-framework/assets/libs/ecs/ECS";
import { WGameConst } from "../../const/WGameConst";

/** 游戏初始化的参数 */
@ecs.register('InitGame')
export class InitGameComp extends ecs.Comp {
    appVersion: string = "";
    versionCode: string = "";
    platrom: string = "";
    gameName: string = ""; // TODO: 设置默认子游戏名称
    token: string = "";
    soundOpen: boolean = true;
    vibrateOpen: string = "";
    langCode: string = "en";
    viewSize: Size = new Size(0, 0);
    safeAreaPos: Size = new Size(0, 0);
    safeAreaSize: Size = new Size(0, 0);
    baseUrl: string = "";
    roomId: number = 0;
    schemeHost: string = "";
    appName: string = "";
    showGameHeader: boolean = false;
    region: string = '';
    package_name: string = '';
    channel: string = '';

    reset() { }

    constructor() {
        super();

        if (WGameConst.WebDevMode) {
            // TODO: 填写开发环境默认值
            this.baseUrl = '';
            this.token = '';
            this.package_name = '';
            this.versionCode = '';
            this.appName = '';
            this.region = '';

            this.token = this.getBrowserUrlParam("token") || this.token;
        }
    }

    private getBrowserUrlParam(key: string): string {
        var query = window.location.search.substring(1);
        var vars = query.split("&");
        for (var i = 0; i < vars.length; i++) {
            var pair = vars[i].split("=");
            if (pair[0] == key) {
                return pair[1];
            }
        }
        return null;
    }

    /** 设置初始化信息（从SDK回调数据中解析） */
    setDetailData(detail: any) {
        if (detail == undefined) {
            oops.log.logModel("InitGame, setDetailData, detail==null");
            return;
        }

        oops.log.logModel(`InitGame = ${JSON.stringify(detail)}`);

        this.soundOpen = detail['sound_open'];
        this.langCode = detail['lang_code'] || 'en';
        this.baseUrl = detail['baseUrl'];
        this.token = detail['token'];
        this.roomId = detail['room_id'] || 0;
        this.schemeHost = detail['scheme_host'] || '';
        this.appName = (detail['app_name'] || '').toLowerCase();
        this.showGameHeader = detail['show_game_header'] || false;

        this.region = detail['region'] || '';
        this.appVersion = detail['app_version'] || '';
        this.versionCode = detail['version_code'] || '';
        this.platrom = detail['platform'] || '';
        this.package_name = detail['package_name'] || '';
        this.channel = detail['app_channel'] || '';
    }
}
