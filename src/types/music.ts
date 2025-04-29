import type { MusicDataResponse } from "@/divingfish/type";
import type { MusicOrigin, ChartType, MusicGenre } from "./maiTypes";

export interface Music {
    title: string;
    artist: string;
    genre: MusicGenre;
    bpm: number;
    from: MusicOrigin;
    isNew: boolean;

    type: ChartType;
    id: number;

    charts: Chart[];
}

export interface Chart {
    music: Music;

    id: number;

    notes: [number, number, number, number];
    charter: string;
    level: string;
    grade: number;
    ds: number;
}

export type MusicList = Record<number, Music>;
export type ChartList = Record<number, Chart>;

export interface SavedMusicList {
    musicList: MusicList;
    chartList: ChartList;
}

export function convertDFMusicList(data: MusicDataResponse): SavedMusicList {
    const musicList: MusicList = {};
    const chartList: ChartList = {};

    for (const item of data) {
        const id = Number(item.id);
        const music: Music = {
            title: item.basic_info.title,
            artist: item.basic_info.artist,
            genre: item.basic_info.genre,
            bpm: item.basic_info.bpm,
            from: item.basic_info.from,
            isNew: item.basic_info.is_new,

            type: item.type,
            id,

            charts: [],
        };

        for (const dfChart of item.charts) {
            const index = item.charts.indexOf(dfChart);
            const chartId = item.cids[index];

            const chart: Chart = {
                music: music,

                id: chartId,
                grade: item.charts.indexOf(dfChart),

                notes: dfChart.notes,
                charter: dfChart.charter,
                level: item.level[index],
                ds: item.ds[index],
            };

            music.charts.push(chart);
            chartList[chartId] = chart;
        }

        musicList[Number(item.id)] = music;
    }

    return {
        musicList,
        chartList,
    };
}