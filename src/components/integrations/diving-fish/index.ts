import type { Music, MusicInfo, Chart, ChartInfo, ChartScore } from "@/components/data/music/type";
import type { DivingFishMusicChart, DivingFishResponse, MusicDataResponse } from "./type";

const API_BASE_URL = "https://www.diving-fish.com/api/maimaidxprober";

export async function fetchPlayerData(username: string): Promise<DivingFishResponse> {
    const requestBody = {
        username: username,
        b50: "1",
    };

    try {
        const response = await fetch(`${API_BASE_URL}/query/player`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("user not exists");
            }
            // 400: user not found, 403: privacy/consent
            const err = await response.json().catch(() => ({}));
            if (err && err.message) throw new Error(err.message);
            throw new Error(`Request failed with status code ${response.status}`);
        }
        const data: DivingFishResponse = await response.json();
        return data;
    } catch (error) {
        console.error("Error fetching player data:", error);
        throw error;
    }
}

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
                constant: item.ds[index],
                deluxeScoreMax: dfChart.notes.reduce((sum, count) => sum + count, 0) * 3,
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
