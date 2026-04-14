import { LayerType, UIConfig } from "../../../../../extensions/oops-plugin-framework/assets/core/gui/layer/LayerManager";

/** 子游戏UIID - 从1000开始避免与主框架冲突 */
export enum SubUIID {
    /** 子游戏主界面 */
    SubGame = 1000,

    // TODO: 添加子游戏UI页面
    // Rule,
    // MyRecords,
    // Settlement,
}

/** 子游戏Bundle名称 - TODO: 修改为实际Bundle名 */
export const gameBundleName = "template_game";

/** 打开界面方式的配置数据 - TODO: 根据项目添加UI配置 */
export var SubUIConfigData: { [key: number]: UIConfig } = {
    // [SubUIID.Rule]: { layer: LayerType.PopUp, prefab: "prefab/panel/panelRule" },
    // [SubUIID.MyRecords]: { layer: LayerType.PopUp, prefab: "prefab/panel/panelMyRecords" },
    // [SubUIID.Settlement]: { layer: LayerType.UI, prefab: "prefab/panel/panelSettlement" },
};

// SubUIConfigData 自动加上bundle
for (let key in SubUIConfigData) {
    let config = SubUIConfigData[key];
    config.bundle = gameBundleName;
}
