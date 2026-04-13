import { ecs } from "../../../../extensions/oops-plugin-framework/assets/libs/ecs/ECS";
import { InitResComp, InitResSystem } from "./bll/InitRes";
import { InitGameComp } from "./bll/InitGame";

/**
 * 游戏进入初始化模块
 * 1、热更新
 * 2、加载默认资源
 */
@ecs.register('Initialize')
export class Initialize extends ecs.Entity {
    InitRes!: InitResComp;
    InitGame!: InitGameComp;

    public bCommonResLoaded: boolean = false;
    public bInitGamePramGetted: boolean = false;

    protected init() {
        this.add(InitGameComp);
        this.add(InitResComp);
    }

    public getBaseUrl(): string {
        return this.InitGame?.baseUrl || "";
    }

    public getToken(): string {
        return this.InitGame?.token || "";
    }

    public getLangCode(): string {
        return this.InitGame?.langCode || "en";
    }

    public getSchemeHost(): string {
        return this.InitGame?.schemeHost || "";
    }

    public getAppName(): string {
        return this.InitGame?.appName || "";
    }

    public isShowGameHeader(): boolean {
        return this.InitGame?.showGameHeader;
    }

    public getRegion(): string {
        return this.InitGame?.region || "";
    }

    public getVersionCode(): string {
        return this.InitGame?.versionCode || "1";
    }

    public getPackageName(): string {
        return this.InitGame?.package_name || "";
    }

    public getChannel(): string {
        return this.InitGame?.channel || "";
    }

    public getPlatform(): string {
        return this.InitGame?.platrom || "";
    }
}

export class EcsInitializeSystem extends ecs.System {
    constructor() {
        super();
        this.add(new InitResSystem());
    }
}
