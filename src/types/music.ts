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
                deluxeScoreMax: dfChart.notes.reduce((sum, count) => sum + count, 0) * 3,
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
