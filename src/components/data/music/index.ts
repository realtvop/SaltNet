/**
 * Music Data Module
 * Provides music and chart data from SaltNet database with caching
 */

import localForage from "localforage";
import type { SavedMusicList, CachedMusicData } from "./type";
import type { MaimaidxRegion } from "@/components/data/user/database/type";
import {
    fetchMusicList,
    fetchVersionLatests,
    filterMusicByRegion,
    convertSaltNetMusicList,
} from "./musicApi";
import MusicSort from "./sort.json";

// Cache key for localForage
const MUSIC_CACHE_KEY = "saltnet_music_cache";

// Module-level state for loaded music data
let musicData: SavedMusicList | null = null;
let musicDataPromise: Promise<SavedMusicList | null> | null = null;
let currentRegion: MaimaidxRegion | null = null;

// Getter to access saltNetAccount from shared without circular import
let getSaltNetRegion: () => MaimaidxRegion = () => "cn";

/**
 * Set the region getter function (called from shared.ts to avoid circular import)
 */
export function setRegionGetter(getter: () => MaimaidxRegion): void {
    getSaltNetRegion = getter;
}

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
 * Load music data from API and update cache
 */
async function fetchAndConvertMusicData(region: MaimaidxRegion): Promise<SavedMusicList | null> {
    // Fetch music list and version info in parallel
    const [rawData, versionLatests] = await Promise.all([
        fetchMusicList(),
        fetchVersionLatests(),
    ]);

    if (!rawData) return null;

    // Get the latest version name for this region
    const latestVersionName = versionLatests?.[region]?.name;

    const filteredData = filterMusicByRegion(rawData, region);
    const converted = convertSaltNetMusicList(filteredData, region, latestVersionName);

    // Save to cache in background
    saveToCache(converted, region);

    return converted;
}

/**
 * Main function to load music data with caching strategy:
 * 1. Return cached data immediately if available and region matches
 * 2. Fetch fresh data from API in background
 * 3. Update cache and module state with fresh data
 */
async function loadMusicData(forceRefresh: boolean = false): Promise<SavedMusicList | null> {
    const region = getSaltNetRegion();

    // Check if we already have data for this region
    if (musicData && currentRegion === region && !forceRefresh) {
        // Start background refresh
        fetchAndConvertMusicData(region).then(freshData => {
            if (freshData) {
                musicData = freshData;
            }
        });
        return musicData;
    }

    // Try to load from cache first
    const cached = await loadFromCache();
    if (cached && cached.region === region && !forceRefresh) {
        // Restore circular references (chartList items lose their music reference in JSON)
        for (const musicId in cached.musicList) {
            const music = cached.musicList[musicId];
            for (const chart of music.charts) {
                chart.music = music;
                cached.chartList[chart.id] = chart;
            }
        }

        musicData = {
            musicList: cached.musicList,
            chartList: cached.chartList,
        };
        currentRegion = region;

        // Start background refresh
        fetchAndConvertMusicData(region).then(freshData => {
            if (freshData) {
                musicData = freshData;
            }
        });

        return musicData;
    }

    // No cache or region mismatch - fetch from API
    const freshData = await fetchAndConvertMusicData(region);
    if (freshData) {
        musicData = freshData;
        currentRegion = region;
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
];
