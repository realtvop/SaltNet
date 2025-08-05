import type { ChartStats } from "@/components/integrations/diving-fish/type";
import type {
    MusicOrigin,
    ChartType,
    MusicGenre,
    ComboStatus,
    SyncStatus,
    RankRate,
} from "./maiTypes";

export interface Music {
    id: number;
    info: MusicInfo;

    charts: Chart[];
}
export interface MusicInfo {
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

export interface ChartInfo {
    notes: [number, number, number, number];
    charter: string;
    level: string;
    grade: number;
    constant: number;
    deluxeScoreMax: number;
    stat?: ChartStats;
}
export interface ChartScore {
    rankRate: RankRate;
    achievements: number | null; // 已小数化

    comboStatus: ComboStatus;
    syncStatus: SyncStatus;

    deluxeScore: number;

    deluxeRating: number; // 单曲rating

    index?: {
        all: ChartIndex;
        difficult: ChartIndex;
        queried?: ChartIndex;
    };
}
export interface ChartIndex {
    index: number; // 索引
    total: number; // 总数
}

export interface SavedMusicList {
    musicList: Record<number, Music>;
    chartList: Record<number, Chart>;
}

// 用户成绩类型
export interface UserChartScore {
    achievements: number | null;
    fc: string | null;
    fs: string | null;
    rate: string | null;
}
