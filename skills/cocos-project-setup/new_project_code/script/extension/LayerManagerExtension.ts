import { UIConfig } from "../../../extensions/oops-plugin-framework/assets/core/gui/layer/LayerManager";
import { oops } from '../../../extensions/oops-plugin-framework/assets/core/Oops';

/** UI层级管理扩展 - 用于子游戏动态注册UI配置 */
export class LayerManagerExtension {
    
    static ExpandGuiConfig(configs: { [key: number]: UIConfig }): void {
        for (const key in configs) {
            const keyNumber: number = key as unknown as number;
            if (configs.hasOwnProperty(keyNumber)) {
                const config: UIConfig = configs[keyNumber];
                oops.gui.setConfig(keyNumber, config);
            }
        }
    }
}
