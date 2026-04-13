import { ecs } from '../../../../../extensions/oops-plugin-framework/assets/libs/ecs/ECS';

/**
 * 子游戏主实体模板
 * TODO: 按照 Model/BLL/View 三层模式添加组件
 */
@ecs.register('SubGame')
export class SubGame extends ecs.Entity {
    // 数据层 (Model)
    // ExampleModel!: ExampleModelComp;

    // 业务层 (BLL)
    // ExampleData!: ExampleDataComp;

    // 视图层 (View) - 通常在Prefab中挂载

    protected init() {
        // 注册常驻ECS组件
        // this.addComponents<ecs.Comp>(
        //     ExampleModelComp,
        // );
    }

    // TODO: 添加业务方法
    // getUserGameInfo() {
    //     this.add(ExampleDataComp);
    // }
}
