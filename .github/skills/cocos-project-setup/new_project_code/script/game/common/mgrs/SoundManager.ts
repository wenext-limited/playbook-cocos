import { appCross } from "db://wsdk/WSDK";
import { smc } from "../ecs/SingletonModuleComp";
import { InitGameComp } from "../../initialize/bll/InitGame";

export enum EMSoundType {
    Sound = 0, // 短音效
    Music = 1, // 背景音乐
}

/** 音效管理器 - 封装音效播放/停止/开关控制 */
class SoundManager {

    private _soundHistoryMap: Map<string, boolean>;
    private _backgroundMusic: string;
    private _canPlaySound: boolean = true;

    set canPlaySound(value: boolean) {
        this._canPlaySound = value;
    }

    constructor() {
        this._soundHistoryMap = new Map<string, boolean>();
    }

    /** 
     * 播放音效
     * @param soundName 音效名
     * @param soundType 音效类型
     * @param nLoop 循环次数, -1: 无限循环
     */
    public PlaySound(soundName: string, soundType: EMSoundType = EMSoundType.Sound, nLoop: number = 0) {
        var initGameComp = smc.initialize.get<InitGameComp>(InitGameComp);
        if (initGameComp.soundOpen && this._canPlaySound) {
            appCross.g2pp.playSound(soundName, soundType, nLoop);

            if (soundType == EMSoundType.Sound) {
                this._soundHistoryMap.set(soundName, true);
            }
        }
    }

    /** 播放背景音乐 */
    public PlayBackgroundMusic(soundName: string) {
        if (this._backgroundMusic != null && this._backgroundMusic != soundName) {
            this.StopSound(this._backgroundMusic);
        }
        this._backgroundMusic = soundName;
        this.PlaySound(soundName, EMSoundType.Music, -1);
    }

    /** 停止音效 */
    public StopSound(soundName: string) {
        appCross.g2pp.stopSound(soundName);
    }

    /** 停止所有音效和音乐 */
    public StopAllSoundAndMusic() {
        for (let [soundName, isPlayed] of this._soundHistoryMap.entries()) {
            this.StopSound(soundName);
        }
        this._soundHistoryMap.clear();

        if (this._backgroundMusic) {
            this.StopSound(this._backgroundMusic);
        }
    }

    /** 恢复背景音乐 */
    public ResumeBackGroundMusic() {
        if (this._backgroundMusic) {
            this.PlayBackgroundMusic(this._backgroundMusic);
        }
    }

    /** 设置声音开关 */
    public SetSoundsOn(bIsOn: boolean) {
        appCross.g2pp.setSoundSwitch(bIsOn);
        this.changeSoundAndMusic(bIsOn);
    }

    /** 根据开关状态切换音效 */
    public changeSoundAndMusic(bIsOn: boolean) {
        if (bIsOn) {
            this.ResumeBackGroundMusic();
        } else {
            this.StopAllSoundAndMusic();
        }
    }
}

export var soundManager = new SoundManager();
