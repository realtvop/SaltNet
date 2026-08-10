import localForage from "localforage";
import { reactive, ref } from "vue";
import { fetchLXNSCollections } from "@/components/integrations/lxns";
import type {
    LXNSCollectionItem,
    LXNSCollectionLists,
    LXNSCollectionRequired,
} from "@/components/integrations/lxns";
import {
    type Character,
    type CollectionRequired,
    CollectionKind,
    type Frame,
    type Icon,
    type Partner,
    type Plate,
    type Title,
    TitleColor,
    type VersionPlate,
    type VersionPlateCategory,
} from "./type";
import additionalCollections from "./additionalCollections.json";

const COLLECTION_CACHE_KEY = "saltnet_collection_cache_lxns_v1";

type CachedCollectionData = LXNSCollectionLists & {
    cachedAt: number;
    metadataUpdatedAt: number;
};

export const icons = reactive<Icon[]>([]);
export const plates = reactive<Plate[]>([]);
export const frames = reactive<Frame[]>([]);
export const titles = reactive<Title[]>([]);

export const characters: Character[] = additionalCollections.characters.map(character => ({
    id: character.id,
    name: character.name,
    genre: character.genre,
    updateTime: character.updateTime,
}));

export const genres = reactive({
    icons: [] as string[],
    plates: [] as string[],
    frames: [] as string[],
    titles: [] as string[],
    characters: [...additionalCollections.genres.characters],
});

export const versionPlateCategories = ["極", "将", "神", "舞舞"] as const;
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
let collectionDataPromise: Promise<boolean> | null = null;

function normalizeTitleColor(color: string | null | undefined): TitleColor {
    const normalized = color?.toLowerCase();
    return (
        Object.values(TitleColor).find(value => value.toLowerCase() === normalized) ??
        TitleColor.Normal
    );
}

function mapRequirements(
    requirements: LXNSCollectionRequired[] | null | undefined
): CollectionRequired[] | undefined {
    if (!requirements?.length) return undefined;

    return requirements.map(requirement => ({
        difficulties: requirement.difficulties ? [...requirement.difficulties] : undefined,
        rate: requirement.rate,
        fc: requirement.fc,
        fs: requirement.fs,
        songs: requirement.songs?.map(song => ({
            id: song.id,
            title: song.title,
            type: song.type,
            completed: song.completed,
            completedDifficulties: song.completed_difficulties
                ? [...song.completed_difficulties]
                : undefined,
        })),
        completed: requirement.completed,
    }));
}

function mapCollectionBase(item: LXNSCollectionItem) {
    return {
        id: item.id,
        name: item.name,
        genre: item.genre ?? "",
        description: item.description ?? "",
        required: mapRequirements(item.required),
    };
}

function getVersionPlateCategory(name: string): VersionPlateCategory | null {
    if (name.endsWith("舞舞")) return "舞舞";
    if (name.endsWith("極")) return "極";
    if (name.endsWith("将")) return "将";
    if (name.endsWith("神")) return "神";
    return null;
}

function uniqueGenres(collections: { genre?: string }[]): string[] {
    return [...new Set(collections.map(item => item.genre).filter(Boolean) as string[])];
}

function applyCollectionData(data: LXNSCollectionLists, updatedAt: number): void {
    const nextIcons: Icon[] = data.icons.map(item => ({
        ...mapCollectionBase(item),
        type: CollectionKind.Icon,
    }));
    const nextPlates: Plate[] = data.plates.map(item => ({
        ...mapCollectionBase(item),
        type: CollectionKind.Plate,
    }));
    const nextFrames: Frame[] = data.frames.map(item => ({
        ...mapCollectionBase(item),
        type: CollectionKind.Frame,
    }));
    const nextTitles: Title[] = data.trophies.map(item => ({
        ...mapCollectionBase(item),
        type: CollectionKind.Title,
        color: normalizeTitleColor(item.color),
    }));

    icons.splice(0, icons.length, ...nextIcons);
    plates.splice(0, plates.length, ...nextPlates);
    frames.splice(0, frames.length, ...nextFrames);
    titles.splice(0, titles.length, ...nextTitles);

    genres.icons.splice(0, genres.icons.length, ...uniqueGenres(nextIcons));
    genres.plates.splice(0, genres.plates.length, ...uniqueGenres(nextPlates));
    genres.frames.splice(0, genres.frames.length, ...uniqueGenres(nextFrames));
    genres.titles.splice(0, genres.titles.length, ...uniqueGenres(nextTitles));

    for (const category of versionPlateCategories) {
        const matchingPlates = nextPlates
            .map(plate => ({ plate, category: getVersionPlateCategory(plate.name) }))
            .filter(
                (entry): entry is { plate: Plate; category: VersionPlateCategory } =>
                    entry.category === category && Boolean(entry.plate.required?.length)
            )
            .map(({ plate, category: plateCategory }) => ({
                ...plate,
                category: plateCategory,
            }));
        versionPlates[category].splice(0, versionPlates[category].length, ...matchingPlates);
    }

    collectionDataLoaded = true;
    collectionDataUpdatedAt.value = updatedAt;
}

async function loadFromCache(): Promise<CachedCollectionData | null> {
    try {
        return await localForage.getItem<CachedCollectionData>(COLLECTION_CACHE_KEY);
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

async function loadCollectionData(forceRefresh: boolean = false): Promise<boolean> {
    if (collectionDataLoaded && !forceRefresh) {
        isCollectionDataLoading.value = false;
        return true;
    }

    if (!forceRefresh) {
        const cached = await loadFromCache();
        if (cached) {
            applyCollectionData(cached, cached.metadataUpdatedAt ?? cached.cachedAt);
            collectionDataError.value = null;
            isCollectionDataLoading.value = false;
            return true;
        }
    }

    isCollectionDataLoading.value = !collectionDataLoaded;
    try {
        const data = await fetchLXNSCollections();
        const metadataUpdatedAt = Date.now();
        applyCollectionData(data, metadataUpdatedAt);
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
            applyCollectionData(cached, cached.metadataUpdatedAt ?? cached.cachedAt);
        }
    }

    return collectionDataLoaded;
}

export async function getCollectionDataAsync(): Promise<boolean> {
    if (collectionDataLoaded) return true;
    if (collectionDataPromise) return collectionDataPromise;

    collectionDataPromise = loadCollectionData();
    const result = await collectionDataPromise;
    collectionDataPromise = null;
    return result;
}

export async function initializeCollectionData(): Promise<void> {
    await getCollectionDataAsync();
    void refreshCollectionData();
}

export async function refreshCollectionData(): Promise<boolean> {
    collectionDataPromise = loadCollectionData(true);
    const result = await collectionDataPromise;
    collectionDataPromise = null;
    return result;
}

export const partners: Partner[] = [
    { id: 1, name: "でらっくま", description: "", type: CollectionKind.Partner },
    { id: 11, name: "乙姫", description: "", type: CollectionKind.Partner },
    { id: 12, name: "ラズ", description: "", type: CollectionKind.Partner },
    { id: 13, name: "シフォン", description: "", type: CollectionKind.Partner },
    { id: 14, name: "ソルト", description: "", type: CollectionKind.Partner },
    { id: 15, name: "しゃま", description: "", type: CollectionKind.Partner },
    { id: 16, name: "みるく", description: "", type: CollectionKind.Partner },
    { id: 17, name: "らいむっくま＆れもんっくま", description: "", type: CollectionKind.Partner },
    { id: 18, name: "乙姫（すぷらっしゅ）", description: "", type: CollectionKind.Partner },
    { id: 19, name: "しゃま（ゆにばーす）", description: "", type: CollectionKind.Partner },
    { id: 20, name: "みるく（ゆにばーす）", description: "", type: CollectionKind.Partner },
    { id: 21, name: "ちびみるく", description: "", type: CollectionKind.Partner },
    { id: 22, name: "百合咲ミカ", description: "", type: CollectionKind.Partner },
    { id: 23, name: "ラズ（ふぇすてぃばる）", description: "", type: CollectionKind.Partner },
    { id: 24, name: "シフォン（ふぇすてぃばる）", description: "", type: CollectionKind.Partner },
    { id: 25, name: "ソルト（ふぇすてぃばる）", description: "", type: CollectionKind.Partner },
    { id: 26, name: "黒姫", description: "", type: CollectionKind.Partner },
    { id: 27, name: "ずんだもん", description: "", type: CollectionKind.Partner },
    { id: 28, name: "乙姫（ばでぃーず）", description: "", type: CollectionKind.Partner },
    {
        id: 29,
        name: "らいむっくま＆れもんっくま（ばでぃーず）",
        description: "",
        type: CollectionKind.Partner,
    },
    { id: 30, name: "ラズ（ばでぃーず）", description: "", type: CollectionKind.Partner },
    { id: 31, name: "ソルト（ぷりずむ）", description: "", type: CollectionKind.Partner },
];
