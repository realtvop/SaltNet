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

// 兼容旧代码的扩展类型
export interface ChartExtended extends Chart {
    index?: string;
}

// 卡片组件专用数据结构，便于页面层提前转换，避免组件内部转换
export interface ChartCardData {
    song_id: number;
    title: string;
    ds: number;
    grade: number;
    level_index: number;
    type: string;
    achievements?: number;
    ra?: number | string;
    rate?: string;
    fc?: string;
    fs?: string;
    charter?: string;
    music?: Music; // 可选，便于详情弹窗展示
    [key: string]: any; // 兼容扩展
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
