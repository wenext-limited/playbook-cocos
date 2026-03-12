/** 网络配置 */
class NetConfig {
    public gameIp: string = "127.0.0.1";
    public gamePort: string = "8080";
    public dbid!: number;
    public sdkUid!: string;
    public serverId!: number;
    public sessionKey!: string;
    public channelid!: number;
}

export var netConfig = new NetConfig();
