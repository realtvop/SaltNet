/**
 * Music API Module
 * Fetches music data from local JSON
 */

import type { SavedMusicList } from "./type";
import type { ChartStats, MusicDataResponse } from "@/components/integrations/diving-fish/type";
import { convertDFMusicList } from "@/components/integrations/diving-fish";
import { getChartStatsIdentity } from "@/components/data/chart/chartIdentity";
import localForage from "localforage";

let localChartStatsMapPromise: Promise<Map<string, ChartStats> | null> | null = null;
const LOCAL_CHART_STATS_CACHE_KEY = "localChartStatsCacheV1";

type LocalChartStatsCache = {
    verBuildTime: number;
    entries: Array<[string, ChartStats]>;
};

async function getLocalChartStatsMap(): Promise<Map<string, ChartStats> | null> {
    if (localChartStatsMapPromise) return localChartStatsMapPromise;

    localChartStatsMapPromise = (async () => {
        const currentBuildTime = Number.parseInt(window.spec?.currentVersionBuildTime || "0", 10);
        try {
            const cached = await localForage.getItem<LocalChartStatsCache>(
                LOCAL_CHART_STATS_CACHE_KEY
            );
            if (
                cached &&
                cached.verBuildTime === currentBuildTime &&
                Array.isArray(cached.entries)
            ) {
                return new Map(cached.entries);
            }
        } catch (error) {
            console.error("Failed to load local chart stats cache:", error);
        }

        const localData = await fetchLocalMusicList();
        if (!localData) return null;

        const statsMap = new Map<string, ChartStats>();
        for (const chart of Object.values(localData.chartList)) {
            if (!chart.info.stat) continue;
            statsMap.set(getChartStatsIdentity(chart), chart.info.stat);
        }

        const cacheToSave: LocalChartStatsCache = {
            verBuildTime: currentBuildTime,
            entries: Array.from(statsMap.entries()),
        };
        localForage.setItem(LOCAL_CHART_STATS_CACHE_KEY, cacheToSave).catch(error => {
            console.error("Failed to save local chart stats cache:", error);
        });

        return statsMap;
    })();

    return localChartStatsMapPromise;
}

export async function enrichWithLocalChartStats(data: SavedMusicList): Promise<void> {
    const statsMap = await getLocalChartStatsMap();
    if (!statsMap) return;

    for (const chart of Object.values(data.chartList)) {
        if (chart.info.stat) continue;
        const stat = statsMap.get(getChartStatsIdentity(chart));
        if (!stat) continue;
        chart.info.stat = stat;
    }
}

/**
 * Fetch music data from local JSON file
 */
export async function fetchLocalMusicList(): Promise<SavedMusicList | null> {
    try {
        const resp = await fetch("/charts.json", {
            cache: "no-store",
        });

        if (!resp.ok) {
            console.error("Failed to fetch local music list:", resp.status);
            return null;
        }

        const data = (await resp.json()) as { data: MusicDataResponse };
        return convertDFMusicList(data.data);
    } catch (error) {
        console.error("Error fetching local music list:", error);
        return null;
    }
}
