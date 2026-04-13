import { ecs } from "../../../../../extensions/oops-plugin-framework/assets/libs/ecs/ECS";
import { Initialize } from "../../initialize/Initialize";
import { WsdkHandler } from "../../WsdkHandler/WsdkHandler";

/** 游戏全局单例业务模块 */
@ecs.register('SingletonModule')
export class SingletonModuleComp extends ecs.Comp {
    /** 游戏初始化模块 */
    initialize: Initialize = null!;
    /** SDK处理模块 */
    wsdkHandler: WsdkHandler = null!;

    reset() { }
}

export var smc: SingletonModuleComp = ecs.getSingleton(SingletonModuleComp);
