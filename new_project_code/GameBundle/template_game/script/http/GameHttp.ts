import { ecs } from '../../../../../extensions/oops-plugin-framework/assets/libs/ecs/ECS';
import { HttpCallback, HttpRequest } from '../../../../../extensions/oops-plugin-framework/assets/libs/network/HttpRequest';
import { smc } from '../../../../script/game/common/ecs/SingletonModuleComp';
import { SubGameConfig } from '../config/SubGameConfig';
import { SubGameUtil } from '../util/SubGameUtil';

/** HTTP请求实体 - 封装带鉴权的HTTP请求 */
@ecs.register('GameHttp')
export class GameHttp extends ecs.Entity {

    protected init() { }

    private createHttp() {
        const http: HttpRequest = new HttpRequest();
        http.timeout = SubGameConfig.httpTimeout;
        http.server = SubGameUtil.getBaseUrl();

        http.addHeader('Content-Type', 'application/json');
        http.addHeader('Access-Control-Allow-Origin', '*');
        http.addHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
        http.addHeader('token', smc.initialize.getToken());
        http.addHeader('language_code', smc.initialize.getLangCode());

        http.addHeader('Region', smc.initialize.getRegion());
        http.addHeader('version_code', smc.initialize.getVersionCode());
        http.addHeader('platform', smc.initialize.getPlatform());
        http.addHeader('package_name', smc.initialize.getPackageName());
        http.addHeader('channel', smc.initialize.getChannel());

        return http;
    }

    destroy(): void {
        super.destroy();
    }

    httpGet(name: string, onComplete: HttpCallback, params: any = null) {
        const http = this.createHttp();
        http.get(name, onComplete, params);
    }

    httpPost(name: string, onComplete: HttpCallback, params: any = null, bParseParamString: boolean = true) {
        const http = this.createHttp();
        http.post(name, onComplete, params, bParseParamString);
    }
}
