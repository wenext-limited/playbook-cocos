import { sp } from "cc";

/** Spine动画工具类 */
export class SpineUtil {

    /**
     * 播放spine动画
     * @param spine  spine对象
     * @param animation 动画名称，null时清除动画
     * @param loop 是否循环
     */
    static playAnim(spine: sp.Skeleton, animation: string, loop: boolean = false) {
        if (spine && spine.isValid) {
            spine.enabled = (animation != null);
            spine.loop = loop;
            spine.animation = animation;
        }
    }

    static stopAnim(spine: sp.Skeleton) {
        if (spine && spine.isValid) {
            spine.clearAnimation();
            spine.enabled = false;
        }
    }
}
