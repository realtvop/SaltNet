import type {
    Frame,
    Icon,
    Plate,
    Title,
    VersionPlate,
    VersionPlateCategory,
} from "@core/collection/type";
import type { LXNSCollectionLists } from "@/components/integrations/lxns";
import {
    isLXNSCollectionLists,
    mapLXNSCollections,
    versionPlateCategories,
} from "@core/collection/map";
import { characterGenres } from "@core/collection/static";
import localForage from "localforage";
import { reactive, ref } from "vue";
import { fetchLXNSCollections } from "@/components/integrations/lxns";
import { updateRelatedCollectionsIndex } from "./relatedCollections";

export { characters, partners } from "@core/collection/static";
export { versionPlateCategories };

const COLLECTION_CACHE_KEY = "saltnet_collection_cache_lxns_v1";

type CachedCollectionData = LXNSCollectionLists & {
    cachedAt: number;
    metadataUpdatedAt: number;
};

type CollectionDataLoadResult = {
    loaded: boolean;
    source: "cache" | "memory" | "network" | "unavailable";
};

export const icons = reactive<Icon[]>([]);
export const plates = reactive<Plate[]>([]);
export const frames = reactive<Frame[]>([]);
export const titles = reactive<Title[]>([]);

export const genres = reactive({
    icons: [] as string[],
    plates: [] as string[],
    frames: [] as string[],
    titles: [] as string[],
    characters: [...characterGenres],
});

export const versionPlates = reactive<Record<VersionPlateCategory, VersionPlate[]>>({
    極: [],
    将: [],
    神: [],
    舞舞: [],
});

export const isCollectionDataLoading = ref(true);
export const collectionDataError = ref<string | null>(null);
export const collectionDataUpdatedAt = ref<number | null>(null);

let collectionDataLoaded = false;
let collectionDataPromise: Promise<CollectionDataLoadResult> | null = null;

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isCachedCollectionData(value: unknown): value is CachedCollectionData {
    if (!isLXNSCollectionLists(value)) return false;

    const { cachedAt, metadataUpdatedAt } = value as Partial<CachedCollectionData>;
    return isFiniteNumber(cachedAt) && isFiniteNumber(metadataUpdatedAt);
}

function applyCollectionData(data: LXNSCollectionLists, updatedAt: number): void {
    const mapped = mapLXNSCollections(data);

    icons.splice(0, icons.length, ...mapped.icons);
    plates.splice(0, plates.length, ...mapped.plates);
    frames.splice(0, frames.length, ...mapped.frames);
    titles.splice(0, titles.length, ...mapped.titles);

    updateRelatedCollectionsIndex([
        ...mapped.plates,
        ...mapped.titles,
        ...mapped.icons,
        ...mapped.frames,
    ]);

    genres.icons.splice(0, genres.icons.length, ...mapped.genres.icons);
    genres.plates.splice(0, genres.plates.length, ...mapped.genres.plates);
    genres.frames.splice(0, genres.frames.length, ...mapped.genres.frames);
    genres.titles.splice(0, genres.titles.length, ...mapped.genres.titles);

    for (const category of versionPlateCategories) {
        versionPlates[category].splice(
            0,
            versionPlates[category].length,
            ...mapped.versionPlates[category]
        );
    }

    collectionDataLoaded = true;
    collectionDataUpdatedAt.value = updatedAt;
}

async function loadFromCache(): Promise<CachedCollectionData | null> {
    try {
        const cached = await localForage.getItem<unknown>(COLLECTION_CACHE_KEY);
        return isCachedCollectionData(cached) ? cached : null;
    } catch (error) {
        console.error("Failed to load collection cache:", error);
        return null;
    }
}

async function saveToCache(data: LXNSCollectionLists, metadataUpdatedAt: number): Promise<void> {
    try {
        await localForage.setItem<CachedCollectionData>(COLLECTION_CACHE_KEY, {
            ...data,
            metadataUpdatedAt,
            cachedAt: Date.now(),
        });
    } catch (error) {
        console.error("Failed to save collection cache:", error);
    }
}

async function loadCollectionData(
    forceRefresh: boolean = false
): Promise<CollectionDataLoadResult> {
    if (collectionDataLoaded && !forceRefresh) {
        isCollectionDataLoading.value = false;
        return { loaded: true, source: "memory" };
    }

    if (!forceRefresh) {
        const cached = await loadFromCache();
        if (cached) {
            try {
                applyCollectionData(cached, cached.metadataUpdatedAt);
                collectionDataError.value = null;
                isCollectionDataLoading.value = false;
                return { loaded: true, source: "cache" };
            } catch (error) {
                console.error("Failed to apply collection cache:", error);
            }
        }
    }

    isCollectionDataLoading.value = !collectionDataLoaded;
    let loadedFromNetwork = false;
    try {
        const data = await fetchLXNSCollections();
        const metadataUpdatedAt = Date.now();
        applyCollectionData(data, metadataUpdatedAt);
        loadedFromNetwork = true;
        collectionDataError.value = null;
        void saveToCache(data, metadataUpdatedAt);
    } catch (error) {
        console.error("Failed to fetch LXNS collections:", error);
        collectionDataError.value = "收藏品数据加载失败，请稍后重试";
    } finally {
        isCollectionDataLoading.value = false;
    }

    if (!collectionDataLoaded && forceRefresh) {
        const cached = await loadFromCache();
        if (cached) {
            try {
                applyCollectionData(cached, cached.metadataUpdatedAt);
            } catch (error) {
                console.error("Failed to apply collection cache:", error);
            }
        }
    }

    return {
        loaded: collectionDataLoaded,
        source: loadedFromNetwork ? "network" : "unavailable",
    };
}

async function getCollectionDataResult(forceRefresh: boolean): Promise<CollectionDataLoadResult> {
    if (!forceRefresh && collectionDataLoaded) {
        return { loaded: true, source: "memory" };
    }
    if (collectionDataPromise) return collectionDataPromise;

    const promise = loadCollectionData(forceRefresh);
    collectionDataPromise = promise;
    try {
        return await promise;
    } finally {
        if (collectionDataPromise === promise) collectionDataPromise = null;
        isCollectionDataLoading.value = false;
    }
}

export async function getCollectionDataAsync(): Promise<boolean> {
    return (await getCollectionDataResult(false)).loaded;
}

export async function initializeCollectionData(): Promise<void> {
    const result = await getCollectionDataResult(false);
    if (result.source === "cache") void refreshCollectionData();
}

export async function refreshCollectionData(): Promise<boolean> {
    return (await getCollectionDataResult(true)).loaded;
}
