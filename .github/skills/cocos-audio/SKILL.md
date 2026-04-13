---
name: cocos-audio
description: 管理游戏音频时使用，包括背景音乐播放/暂停/恢复、音效播放、音量控制和前后台切换处理。不适用于音频文件制作或编辑。
tags: [cocos, audio, sound, music]
inputs: [音频文件路径, 播放类型]
outputs: [音频管理器, 播放控制代码]
---

# 音频管理

## 概述

通过单例 `SoundManager` 集中管理游戏的背景音乐和音效播放。音频实际通过原生桥（appCross）或 Cocos 音频系统播放。

## SoundManager 实现

```typescript
export enum EMSoundType {
    Sound = 0,    // 短音效
    Music = 1,    // 背景音乐
}

class SoundManager {
    private _soundHistoryMap: Map<string, boolean>;
    private _backgroundMusic: string;
    private _canPlaySound: boolean = true;

    set canPlaySound(value: boolean) {
        this._canPlaySound = value;
    }

    constructor() {
        this._soundHistoryMap = new Map();
    }

    // 播放音效
    public PlaySound(soundName: string, soundType: EMSoundType = EMSoundType.Sound, nLoop: number = 0) {
        if (this._canPlaySound) {
            // 通过 Cocos AudioSource 或原生桥播放
            appCross.g2pp.playSound(soundName, soundType, nLoop);
            if (soundType === EMSoundType.Sound) {
                this._soundHistoryMap.set(soundName, true);
            }
        }
    }

    // 播放背景音乐（自动停止之前的BGM）
    public PlayBackgroundMusic(soundName: string) {
        if (this._backgroundMusic && this._backgroundMusic !== soundName) {
            this.StopSound(this._backgroundMusic);
        }
        this._backgroundMusic = soundName;
        this.PlaySound(soundName, EMSoundType.Music, -1);
    }

    // 停止指定音效
    public StopSound(soundName: string) {
        appCross.g2pp.stopSound(soundName);
    }

    // 停止所有音频
    public StopAllSoundAndMusic() {
        for (let [soundName] of this._soundHistoryMap.entries()) {
            this.StopSound(soundName);
        }
        this._soundHistoryMap.clear();
        if (this._backgroundMusic) {
            this.StopSound(this._backgroundMusic);
        }
    }

    // 恢复背景音乐
    public ResumeBackGroundMusic() {
        if (this._backgroundMusic) {
            this.PlayBackgroundMusic(this._backgroundMusic);
        }
    }
}

// 导出单例
export const soundManager = new SoundManager();
```

## 音频资源定义

```typescript
// data/AudioClips.ts
export class AudioClips {
    static BGM = "audio/bgm";
    static open_combo = "audio/open_combo";
    static bet_success = "audio/bet_success";
    static win = "audio/win";
    static box_open = "audio/box_open";
}
```

## 使用方式

### 播放背景音乐（在子游戏入口）

```typescript
protected onLoad() {
    soundManager.PlayBackgroundMusic(AudioClips.BGM);
}
```

### 播放音效

```typescript
// 播放一次音效
soundManager.PlaySound(AudioClips.bet_success);

// 播放循环音效
soundManager.PlaySound(AudioClips.open_combo, EMSoundType.Sound, -1);
```

### 前后台切换处理

```typescript
game.on(Game.EVENT_SHOW, () => {
    soundManager.canPlaySound = true;
    soundManager.ResumeBackGroundMusic();
});

game.on(Game.EVENT_HIDE, () => {
    soundManager.canPlaySound = false;
    soundManager.StopAllSoundAndMusic();
});
```

## 音频文件组织

```
audio/
├── bgm.mp3           # 背景音乐（循环）
├── bet_success.mp3   # 下注成功
├── box_open.mp3      # 开箱
├── win.mp3           # 中奖
└── open_combo.mp3    # 连击
```

## 清单

- [ ] SoundManager 单例已定义
- [ ] AudioClips 常量类已创建
- [ ] 背景音乐在入口处播放
- [ ] 前后台切换时正确暂停/恢复
- [ ] 所有音效路径与资源文件对应

## 相关技能

- `cocos-scene-management` — 子游戏入口中的音频初始化
- `cocos-asset-management` — 音频资源加载
