/**
 * Music Data Module
 * Provides music and chart data from SaltMeta with persistent caching.
 */

import localForage from "localforage";
import type { SavedMusicList, CachedMusicData } from "./type";
import type { MaimaidxRegion } from "./type";
import { fetchSaltMetaMusicList } from "./musicApi";
import MusicSort from "./sort.json";

// Cache key for localForage
const MUSIC_CACHE_KEY = "saltnet_music_cache_saltmeta_next_cn_v1";

// Module-level state for loaded music data
let musicData: SavedMusicList | null = null;
let musicDataPromise: Promise<SavedMusicList | null> | null = null;
let currentRegion: MaimaidxRegion | null = null;

// Getter to access saltNetAccount from shared without circular import
let getSaltNetRegion: () => MaimaidxRegion = () => "cn";

/**
 * Load music data from cache
 */
async function loadFromCache(): Promise<CachedMusicData | null> {
    try {
        const cached = await localForage.getItem<CachedMusicData>(MUSIC_CACHE_KEY);
        return cached;
    } catch (error) {
        console.error("Failed to load music cache:", error);
        return null;
    }
}

/**
 * Save music data to cache
 */
async function saveToCache(data: SavedMusicList, region: string): Promise<void> {
    try {
        const cacheData: CachedMusicData = {
            musicList: data.musicList,
            chartList: data.chartList,
            region,
            cachedAt: Date.now(),
        };
        await localForage.setItem(MUSIC_CACHE_KEY, cacheData);
    } catch (error) {
        console.error("Failed to save music cache:", error);
    }
}

/**
 * Restore chart-to-music references after loading cached data.
 */
function restoreCachedMusicData(cached: CachedMusicData): SavedMusicList {
    const chartList: SavedMusicList["chartList"] = {};

    for (const musicId in cached.musicList) {
        const music = cached.musicList[musicId];
        for (const chart of music.charts) {
            chart.music = music;
            chartList[chart.id] = chart;
        }
    }

    return {
        musicList: cached.musicList,
        chartList,
    };
}

/**
 * Main function to load music data from SaltMeta, with cache fallback.
 */
async function loadMusicData(forceRefresh: boolean = false): Promise<SavedMusicList | null> {
    const region = getSaltNetRegion();
    if (musicData && currentRegion === region && !forceRefresh) {
        return musicData;
    }

    if (!forceRefresh) {
        const cached = await loadFromCache();
        if (cached && cached.region === region) {
            musicData = restoreCachedMusicData(cached);
            currentRegion = region;
            return musicData;
        }
    }

    const saltMetaData = await fetchSaltMetaMusicList();
    if (saltMetaData) {
        musicData = saltMetaData;
        currentRegion = region;
        saveToCache(saltMetaData, region);
    }

    if (!musicData && forceRefresh) {
        const cached = await loadFromCache();
        if (cached && cached.region === region) {
            musicData = restoreCachedMusicData(cached);
            currentRegion = region;
        }
    }

    return musicData;
}

/**
 * Get music data asynchronously
 * This ensures data is loaded before returning
 */
export async function getMusicInfoAsync(): Promise<SavedMusicList | null> {
    if (musicData && currentRegion === getSaltNetRegion()) {
        return musicData;
    }

    if (musicDataPromise) {
        return musicDataPromise;
    }

    musicDataPromise = loadMusicData();
    const result = await musicDataPromise;
    musicDataPromise = null;
    return result;
}

/**
 * Get music data synchronously (returns null if not yet loaded)
 */
export function getMusicInfoSync(): SavedMusicList | null {
    return musicData;
}

/**
 * Initialize music data loading
 * Call this on app startup to begin loading data
 */
export async function initializeMusicData(): Promise<void> {
    await getMusicInfoAsync();
    refreshMusicData().catch(() => {
        // Refresh failures keep the current in-memory/cache data.
    });
}

/**
 * Force refresh music data from API
 */
export async function refreshMusicData(): Promise<SavedMusicList | null> {
    musicDataPromise = loadMusicData(true);
    const result = await musicDataPromise;
    musicDataPromise = null;
    return result;
}

/**
 * Clear music data (useful when region changes)
 */
export function clearMusicData(): void {
    musicData = null;
    currentRegion = null;
}

// Re-export utilities
export { MusicSort };

export const maimaiVersionsCN = [
    "maimai",
    "maimai PLUS",
    "maimai GreeN",
    "maimai GreeN PLUS",
    "maimai ORANGE",
    "maimai ORANGE PLUS",
    "maimai PiNK",
    "maimai PiNK PLUS",
    "maimai MURASAKi",
    "maimai MURASAKi PLUS",
    "maimai MiLK",
    "maimai MiLK PLUS",
    "maimai FiNALE",
    "舞萌DX",
    "舞萌DX 2021",
    "舞萌DX 2022",
    "舞萌DX 2023",
    "舞萌DX 2024",
    "舞萌DX 2025",
    "舞萌DX 2026",
];
