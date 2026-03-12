import { HttpReturn } from "../../../../../extensions/oops-plugin-framework/assets/libs/network/HttpRequest";
import { smc } from "../../../../script/game/common/ecs/SingletonModuleComp";
import { sub_smc } from "../ecs/SubSingletonModuleComp";
import { oops } from "../../../../../extensions/oops-plugin-framework/assets/core/Oops";
import { sp, Sprite, SpriteFrame } from "cc";

/** 子游戏通用工具类 */
export class SubGameUtil {

    static _loadSpriteFramePool: Map<string, SpriteFrame> = new Map<string, SpriteFrame>();

    static getBaseUrl(): string {
        return smc.initialize.getBaseUrl();
    }

    static getFullUrl(deepLink: string) {
        return SubGameUtil.getBaseUrl() + deepLink;
    }

    static HttpGet(url: string, cb: (data: HttpReturn) => void) {
        sub_smc.gameHttp.httpGet(url, (data: HttpReturn) => {
            cb && cb(data);
        });
    }

    static HttpPost(url: string, cb: (data: HttpReturn) => void) {
        sub_smc.gameHttp.httpPost(url, (data: HttpReturn) => {
            cb && cb(data);
        });
    }

    /**
     * 设置精灵的精灵帧
     * @param sprite  精灵对象
     * @param url     精灵帧图像路径
     * @param callback 加载完成回调
     */
    static setSpriteFrame(sprite: Sprite, url: string, callback?: Function) {
        url += "/spriteFrame";

        oops.res.load(url, (err: Error | null, sp: SpriteFrame) => {
            if (err || sp == null) {
                oops.log.logBusiness(`setSpriteFrame - err = ${err}`);
                callback && callback(false);
                return;
            }

            if (sprite && sprite.isValid && sprite.node) {
                sprite.spriteFrame = sp;
                callback && callback(true);
            }
        });
    }

    /**
     * 设置精灵帧（带缓存池）
     * @param sprite  精灵对象
     * @param url     精灵帧图像路径
     * @param callback 加载完成回调
     */
    static setSpriteFrameStorage(sprite: Sprite, url: string, callback?: Function) {
        url += "/spriteFrame";

        if (this._loadSpriteFramePool.has(url)) {
            let spriteFrame: SpriteFrame = this._loadSpriteFramePool.get(url);
            if (sprite && sprite.isValid && sprite.node && spriteFrame != null) {
                sprite.spriteFrame = spriteFrame;
                callback && callback(true);
            }
        } else {
            oops.res.load(url, (err: Error | null, sp: SpriteFrame) => {
                if (err || sp == null) {
                    oops.log.logBusiness(`setSpriteFrame - err = ${err}`);
                    callback && callback(false);
                    return;
                }

                if (sprite && sprite.isValid && sprite.node) {
                    this._loadSpriteFramePool.set(url, sp);
                    sprite.spriteFrame = sp;
                    sp.addRef();
                    callback && callback(true);
                }
            });
        }
    }

    /** 设置Skeleton数据 */
    static setSkeletonData(skeletal: sp.Skeleton, url: string, callback?: Function) {
        oops.res.load(url, sp.SkeletonData, (err, skedata: sp.SkeletonData) => {
            if (err || skedata == null) {
                oops.log.logBusiness(`setSkeletonData - err = ${err}`);
                callback && callback(false);
                return;
            }

            if (skeletal != null && skeletal.isValid && skeletal.node) {
                skeletal.skeletonData = skedata;
                skeletal.clearTrack(0);
                skeletal.clearAnimation();
                skeletal.setAnimation(0, 'animation', false);
                callback && callback(true);
            }
        });
    }
}
