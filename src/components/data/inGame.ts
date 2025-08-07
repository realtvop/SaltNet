// In-Game Data
import { CollectionKind } from "./collection/type";

export enum Level {
    Basic,
    Advanced,
    Expert,
    Master,
    ReMaster,
}
export enum ComboStatus {
    None,
    FC,
    FCP,
    AP,
    APP,
}
export enum SyncStatus {
    None,
    Sync,
    FS,
    FSP,
    FDX,
    FDXP,
}

export interface SongInfo {
    musicId: number;
    level: Level;
    playCount: number;
    achievement: number;
    comboStatus: ComboStatus;
    syncStatus: SyncStatus;
    deluxscoreMax: number;
    scoreRank: number;
}
export interface UserMusic {
    UserMusicDetailList: SongInfo[];
    length: number;
}
export interface MusicAllResponse {
    userId: number;
    length: number;
    nextIndex: number;
    userMusicList: UserMusic[];
}

export interface UserItem {
    itemKind: CollectionKind;
    itemId: number;
    stock: 0 | 1;
    isValid: boolean;
}

export interface UserInfo {
    lastDataVersion: string;
    lastRomVersion: string;
    banState: number;
    iconId: number;
    totalAwake: number;
    dispRate: number; // rating 显示 这什么几把命名
}
