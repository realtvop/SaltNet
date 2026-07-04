/**
 * Music Data Module
 * Provides music and chart data from SaltMeta with persistent caching.
 */

import localForage from "localforage";
import { reactive, ref } from "vue";
import { updateSaltMetaVersionPlates } from "@/components/data/collection";
import type { SavedMusicList, CachedMusicData, MusicMetadataState } from "./type";
import type { MaimaidxRegion } from "./type";
import { fetchSaltMetaMusicList } from "./musicApi";
import MusicSort from "./sort.json";

// Cache key for localForage
const MUSIC_CACHE_KEY = "saltnet_music_cache_saltmeta_next_cn_v4";

// Module-level state for loaded music data
let musicData: SavedMusicList | null = null;
let musicMetadataState: MusicMetadataState | null = null;
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
            metadata: musicMetadataState ?? undefined,
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

function applyMusicMetadata(metadata: MusicMetadataState | null, data: SavedMusicList): void {
    musicMetadataState = metadata;
    maimaiVersionsCN.splice(
        0,
        maimaiVersionsCN.length,
        ...(metadata?.cnVersions ?? []).map(v => v.name)
    );
    updateSaltMetaVersionPlates(metadata?.cnVersionPlates ?? metadata?.cnVersions ?? [], data);
}

/**
 * Main function to load music data from SaltMeta, with cache fallback.
 */
async function loadMusicData(forceRefresh: boolean = false): Promise<SavedMusicList | null> {
    const region = getSaltNetRegion();
    if (musicData && currentRegion === region && !forceRefresh) {
        isMusicDataLoading.value = false;
        return musicData;
    }

    if (!forceRefresh) {
        const cached = await loadFromCache();
        if (cached && cached.region === region) {
            musicData = restoreCachedMusicData(cached);
            applyMusicMetadata(cached.metadata ?? null, musicData);
            currentRegion = region;
            isMusicDataLoading.value = false;
            return musicData;
        }
    }

    if (musicData) {
        isMusicDataLoading.value = false;
    } else {
        isMusicDataLoading.value = true;
    }

    try {
        const saltMetaData = await fetchSaltMetaMusicList();
        if (saltMetaData) {
            musicData = saltMetaData.music;
            applyMusicMetadata(saltMetaData.metadata, musicData);
            currentRegion = region;
            saveToCache(saltMetaData.music, region);
        }
    } finally {
        isMusicDataLoading.value = false;
    }

    if (!musicData && forceRefresh) {
        const cached = await loadFromCache();
        if (cached && cached.region === region) {
            musicData = restoreCachedMusicData(cached);
            applyMusicMetadata(cached.metadata ?? null, musicData);
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
    musicMetadataState = null;
    maimaiVersionsCN.splice(0, maimaiVersionsCN.length);
    currentRegion = null;
    isMusicDataLoading.value = true;
}

// Re-export utilities
export { MusicSort };

export const maimaiVersionsCN = reactive<string[]>([]);
export const isMusicDataLoading = ref<boolean>(true);
