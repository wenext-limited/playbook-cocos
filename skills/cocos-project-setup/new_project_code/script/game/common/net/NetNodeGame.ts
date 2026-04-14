import { CallbackObject, IRequestProtocol } from "../../../../../extensions/oops-plugin-framework/assets/libs/network/NetInterface";
import { NetNode } from "../../../../../extensions/oops-plugin-framework/assets/libs/network/NetNode";
import { netConfig } from "./NetConfig";

/** 网络节点扩展 - WebSocket请求封装 */
export class NetNodeGame extends NetNode {
    private isCompress: boolean = false;

    public req(action: string, method: string, data: any, rspObject: CallbackObject, showTips: boolean = true, force: boolean = false) {
        let protocol: IRequestProtocol = {
            cmd: action,
            data: JSON.stringify(data),
            isCompress: this.isCompress,
            channelid: netConfig.channelid
        }
        return this.request(protocol, rspObject, showTips, force);
    }

    public reqUnique(action: string, method: string, data: any, rspObject: CallbackObject, showTips: boolean = true, force: boolean = false): boolean {
        let protocol: IRequestProtocol = {
            cmd: action,
            data: JSON.stringify(data),
            isCompress: this.isCompress,
            channelid: netConfig.channelid
        }
        return super.requestUnique(protocol, rspObject, showTips, force);
    }
}
