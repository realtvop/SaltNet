import type { MusicOrigin, ChartType, MusicGenre, ComboStatus, SyncStatus, RankRate } from "./maiTypes";

export interface Music {
    id: number;
    info: MusicInfo;

    charts: Chart[];
}
interface MusicInfo {
    id: number;
    title: string;

    aliases?: string[];

    artist: string;
    genre: MusicGenre;
    bpm: number;
    from: MusicOrigin;
    isNew: boolean;
    type: ChartType;
}

export interface Chart {
    id: number;
    info: ChartInfo;

    score?: ChartScore;

    music: Music;
}
interface ChartInfo {
    notes: [number, number, number, number];
    charter: string;
    level: string;
    grade: number;
    ds: number;
    deluxeScoreMax: number;
}
interface ChartScore {
    rankRate: RankRate;
    achievements: number;  // 已小数化

    comboStatus: ComboStatus;
    syncStatus: SyncStatus;

    deluxeScore: number;

    deluxeRating: number;  // 单曲rating
}