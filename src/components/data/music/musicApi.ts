/**
 * Music API Module
 * Fetches music data from SaltNet database API
 */

import type { MaimaidxRegion } from "@/components/data/user/database/type";
import type { Music, MusicInfo, Chart, ChartInfo, SavedMusicList } from "./type";
import { ChartType, type MusicGenre, type MusicOrigin } from "../maiTypes";

const DB_API_URL = import.meta.env.VITE_DB_URL;

// Types matching the SaltNet database API response
export interface SaltNetChartNotes {
    tap: number | null;
    hold: number | null;
    slide: number | null;
    touch: number | null;
    break: number | null;
}

export interface SaltNetChart {
    versions: Record<"jp" | "ex" | "cn", string>;
    type: "std" | "dx" | "utage";
    difficulty: "basic" | "advanced" | "expert" | "master" | "remaster" | "utage";
    level: string;
    internalLevel: number;
    charter: string | null;
    notes: SaltNetChartNotes;
}

export interface SaltNetMusic {
    id: number;
    title: string;
    artist: string;
    category: string;
    bpm: number | null;
    aliases?: { cn: string[] };
    charts: SaltNetChart[];
}

/**
 * Fetch music list from SaltNet database API
 */
export async function fetchMusicList(): Promise<SaltNetMusic[] | null> {
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/maimaidx/list/music`, {
            method: "GET",
        });

        if (!resp.ok) {
            console.error("Failed to fetch music list:", resp.status);
            return null;
        }

        const data = (await resp.json()) as SaltNetMusic[];
        return data;
    } catch (error) {
        console.error("Error fetching music list:", error);
        return null;
    }
}

// Version types
export interface SaltNetVersion {
    id: number;
    name: string;
    word: string[] | null;
    releaseDate: string;
    region: "jp" | "ex" | "cn";
}

export interface LatestVersions {
    jp: SaltNetVersion | null;
    ex: SaltNetVersion | null;
    cn: SaltNetVersion | null;
}

/**
 * Fetch latest versions for each region from SaltNet database API
 */
export async function fetchVersionLatests(): Promise<LatestVersions | null> {
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/maimaidx/list/version/latests`, {
            method: "GET",
        });

        if (!resp.ok) {
            console.error("Failed to fetch version latests:", resp.status);
            return null;
        }

        const data = (await resp.json()) as LatestVersions;
        return data;
    } catch (error) {
        console.error("Error fetching version latests:", error);
        return null;
    }
}

/**
 * Check if a chart is available in the specified region
 */
export function isChartAvailableInRegion(chart: SaltNetChart, region: MaimaidxRegion): boolean {
    const versionString = chart.versions[region];
    return versionString !== undefined && versionString !== "";
}

/**
 * Filter music list to only include songs/charts available in the specified region
 */
export function filterMusicByRegion(
    musicList: SaltNetMusic[],
    region: MaimaidxRegion
): SaltNetMusic[] {
    return musicList
        .map(music => ({
            ...music,
            charts: music.charts.filter(chart => isChartAvailableInRegion(chart, region)),
        }))
        .filter(music => music.charts.length > 0);
}

/**
 * Map SaltNet difficulty string to grade index
 */
function getDifficultyGrade(difficulty: SaltNetChart["difficulty"]): number {
    const gradeMap: Record<SaltNetChart["difficulty"], number> = {
        basic: 0,
        advanced: 1,
        expert: 2,
        master: 3,
        remaster: 4,
        utage: 10,
    };
    return gradeMap[difficulty] ?? 3;
}

/**
 * Map SaltNet chart type to ChartType enum
 */
function getChartType(type: SaltNetChart["type"]): ChartType {
    if (type === "dx") return ChartType.Deluxe;
    return ChartType.Standard;
}

/**
 * Convert SaltNet music list to internal SavedMusicList format
 */
export function convertSaltNetMusicList(
    data: SaltNetMusic[],
    region: MaimaidxRegion,
    latestVersionName?: string
): SavedMusicList {
    const musicList: Record<number, Music> = {};
    const chartList: Record<number, Chart> = {};

    for (const item of data) {
        // Get chart type from first chart (all charts of same song have same type)
        const firstChart = item.charts[0];
        const chartType = firstChart ? getChartType(firstChart.type) : ChartType.Standard;

        // Add 1e4 offset for DX type songs
        const id = item.id + (chartType === ChartType.Deluxe ? 1e4 : 0);

        // Get version info from region
        const versionInfo = firstChart?.versions[region] || "";

        const musicInfo: MusicInfo = {
            id,
            title: item.title,
            aliases: item.aliases?.cn,
            artist: item.artist,
            genre: item.category as unknown as MusicGenre,
            bpm: item.bpm ?? 0,
            from: versionInfo as unknown as MusicOrigin,
            // Determine if song is "new" by checking if its version matches the latest version
            isNew: latestVersionName ? versionInfo === latestVersionName : false,
            type: chartType,
        };

        const music: Music = {
            id,
            info: musicInfo,
            charts: [],
        };

        for (const saltChart of item.charts) {
            const grade = getDifficultyGrade(saltChart.difficulty);
            // Generate unique chart ID: musicId * 10 + grade
            const chartId = id * 10 + grade;

            // Calculate deluxe score max from notes
            const notes = saltChart.notes;
            const totalNotes =
                (notes.tap ?? 0) +
                (notes.hold ?? 0) +
                (notes.slide ?? 0) +
                (notes.touch ?? 0) +
                (notes.break ?? 0);

            const chartInfo: ChartInfo = {
                notes: [
                    notes.tap ?? 0,
                    notes.hold ?? 0,
                    notes.slide ?? 0,
                    notes.touch ?? 0,
                    notes.break ?? 0,
                ],
                charter: saltChart.charter ?? "",
                level: saltChart.level,
                grade,
                constant: saltChart.internalLevel,
                deluxeScoreMax: totalNotes * 3,
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
