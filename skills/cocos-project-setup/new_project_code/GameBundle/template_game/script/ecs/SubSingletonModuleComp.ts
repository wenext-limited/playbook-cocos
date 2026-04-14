import { ecs } from "../../../../../extensions/oops-plugin-framework/assets/libs/ecs/ECS";
import { SubGame } from '../subgame/SubGame';
import { GameHttp } from "../http/GameHttp";

/** 子游戏单例业务模块 */
@ecs.register('SubSingletonModule')
export class SubSingletonModuleComp extends ecs.Comp {
    subGame: SubGame = null;
    gameHttp: GameHttp = null;

    init() {
        this.subGame = ecs.getEntity<SubGame>(SubGame);
        this.gameHttp = ecs.getEntity<GameHttp>(GameHttp);
    }

    reset() { }
}

export var sub_smc: SubSingletonModuleComp = ecs.getSingleton(SubSingletonModuleComp);
