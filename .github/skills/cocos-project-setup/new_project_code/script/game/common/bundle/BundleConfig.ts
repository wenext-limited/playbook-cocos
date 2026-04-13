/** Bundle资源包配置 - 在此注册游戏名到bundle名的映射 */
export default class BundleConfig {
	private static _instance: BundleConfig = null!;
	private _gameBundleNameMap: Map<string, string> = new Map();

	constructor() {
		this.initGameBundleName();
	}

	static get instance(): BundleConfig {
		return (BundleConfig._instance ? BundleConfig._instance : (BundleConfig._instance = new BundleConfig()));
	}
	
	public getGameBundleName(gamekey: string): string {
		return this._gameBundleNameMap.get(gamekey);
	}

	/** TODO: 注册你的游戏名到bundle名的映射 */
	private initGameBundleName() {
		// this._gameBundleNameMap.set("your_game_name", "your_game_bundle");
	}
	
	// TODO: 按项目需要定义bundle内的资源路径
	BundleName = {
 		game: {
 			prefab: {
 				// "prefab_name": 'prefab/prefab_name', 
 			},
 			sound: {
 				// "sound_name": 'sound/sound_name', 
 			},
 			texture: {
 				// "texture_name": 'texture/texture_name', 
 			},
 		}
	}
}
