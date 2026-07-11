import type { Music, MusicInfo, Chart, ChartInfo, ChartScore } from "@/components/data/music/type";
import type { DivingFishMusicChart, MusicDataResponse } from "./type";
import { isBanquetGenre, UTAGE_GRADE } from "@/components/data/chart/difficulty";
export {
    calculateB50FromRecords,
    fetchPlayerData,
    fetchPlayerRecordsByImportToken,
} from "./player";

export function convertDFMusicList(data: MusicDataResponse) {
    const musicList: Record<number, Music> = {};
    const chartList: Record<number, Chart> = {};

    for (const item of data) {
        const isBanquetMusic = isBanquetGenre(item.basic_info.genre);
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
            let deluxeScoreMax = 0;
            for (const n of dfChart.notes) deluxeScoreMax += n ?? 0;
            const chartInfo: ChartInfo = {
                notes: dfChart.notes,
                charter: dfChart.charter,
                level: item.level[index],
                grade: isBanquetMusic ? UTAGE_GRADE : index,
                constant: item.ds[index],
                deluxeScoreMax: deluxeScoreMax * 3,
                stat: dfChart.stats || undefined,
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

export function chartScoreFromDF(chart: DivingFishMusicChart): ChartScore {
    return {
        rankRate: chart.rate,
        achievements: chart.achievements,

        comboStatus: chart.fc,
        syncStatus: chart.fs,

        deluxeRating: chart.ra,
        deluxeScore: chart.dxScore,

        playCount: chart.play_count,
    };
}
