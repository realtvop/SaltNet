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

// 结构转换器：将旧数据转换为新版结构
import type { MusicDataResponse } from "@/divingfish/type";
export function convertDFMusicList(data: MusicDataResponse) {
    const musicList: Record<number, Music> = {};
    const chartList: Record<number, Chart> = {};

    for (const item of data) {
        const id = Number(item.id);
        const musicInfo: MusicInfo = {
            id,
            title: item.basic_info.title,
            aliases: item.aliases,
            artist: item.basic_info.artist,
            genre: item.basic_info.genre,
            bpm: item.basic_info.bpm,
            from: item.basic_info.from,
            isNew: item.basic_info.is_new,
            type: item.type,
        };
        const music: Music = {
            id,
            info: musicInfo,
            charts: [],
        };

        for (const [index, dfChart] of item.charts.entries()) {
            const chartId = item.cids[index];
            const chartInfo: ChartInfo = {
                notes: dfChart.notes,
                charter: dfChart.charter,
                level: item.level[index],
                grade: index,
                ds: item.ds[index],
                deluxeScoreMax: dfChart.deluxe_score_max ?? 0,
            };
            const chart: Chart = {
                id: chartId,
                info: chartInfo,
                music: music,
            };
            music.charts.push(chart);
            chartList[chartId] = chart;
        }

        musicList[id] = music;
    }

    return {
        musicList,
        chartList,
    };
}
