import { profiler, _decorator } from 'cc';
import { oops } from '../../extensions/oops-plugin-framework/assets/core/Oops';
import { Root } from '../../extensions/oops-plugin-framework/assets/core/Root';
import { ecs } from '../../extensions/oops-plugin-framework/assets/libs/ecs/ECS';
import { UIConfigData } from './game/common/config/GameUIConfig';
import { smc } from './game/common/ecs/SingletonModuleComp';
import { EcsInitializeSystem, Initialize } from './game/initialize/Initialize';
import { WsdkHandler } from './game/WsdkHandler/WsdkHandler';
import { WGameConst } from './game/const/WGameConst';

const { ccclass, property } = _decorator;

@ccclass('Main')
export class Main extends Root {
    constructor() {
        super();
        oops.log.logBusiness(`Main() - WebDevMode = ${WGameConst.WebDevMode}`);
    }

    start() {
        profiler.hideStats();
    }

    protected run() {
        smc.wsdkHandler = ecs.getEntity<WsdkHandler>(WsdkHandler);
        smc.initialize = ecs.getEntity<Initialize>(Initialize);
    }

    protected initGui() {
        oops.gui.init(UIConfigData);
    }

    protected initEcsSystem() {
        oops.ecs.add(new EcsInitializeSystem());
    }
}
