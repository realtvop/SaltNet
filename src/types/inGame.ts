// In-Game Data

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
