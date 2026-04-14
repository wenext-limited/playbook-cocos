import { _decorator, Component, Prefab, instantiate, error } from 'cc';
const { ccclass, property } = _decorator;

/** 动态节点组件 - 运行时加载Prefab并挂载到当前节点 */
@ccclass('DynamicNodeComp')
export class DynamicNodeComp extends Component {
    @property({
        type: Prefab,
        tooltip: '要加载的Prefab资源'
    })
    public prefab: Prefab = null;

    protected onLoad(): void {
        this.loadPrefab();
    }

    private loadPrefab(): void {
        if (!this.prefab) {
            error('DynamicNodeComp: Prefab is not set');
            return;
        }

        const instance = instantiate(this.prefab);
        if (!instance) {
            error('DynamicNodeComp: Failed to instantiate prefab');
            return;
        }

        instance.setParent(this.node);
    }
}
