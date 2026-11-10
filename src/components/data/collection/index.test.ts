import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LXNSCollectionLists } from "@/components/integrations/lxns";
import additionalCollections from "@core/collection/additionalCollections.json";
import { CollectionKind, TitleColor } from "@core/collection/type";
import { ComboStatus, RankRate, SyncStatus } from "@core/mai/types";

const mocks = vi.hoisted(() => ({
    fetchLXNSCollections: vi.fn(),
    getItem: vi.fn(),
    setItem: vi.fn(),
}));

vi.mock("localforage", () => ({
    default: {
        getItem: mocks.getItem,
        setItem: mocks.setItem,
    },
}));

vi.mock("@/components/integrations/lxns", () => ({
    fetchLXNSCollections: mocks.fetchLXNSCollections,
}));

function makeCollectionData(name: string): LXNSCollectionLists {
    return {
        trophies: [{ id: 1, name: `${name}-trophy` }],
        icons: [{ id: 2, name: `${name}-icon` }],
        plates: [{ id: 3, name: `${name}-plate` }],
        frames: [{ id: 4, name: `${name}-frame` }],
    };
}

function makeCachedCollectionData(name: string) {
    return {
        ...makeCollectionData(name),
        cachedAt: 100,
        metadataUpdatedAt: 90,
    };
}

async function importCollectionModule() {
    return import("./index");
}

beforeEach(() => {
    vi.resetModules();
    mocks.fetchLXNSCollections.mockReset();
    mocks.getItem.mockReset();
    mocks.setItem.mockReset();
    mocks.setItem.mockResolvedValue(undefined);
});

describe("collection data initialization", () => {
    it.each([
        ["malformed", { trophies: [], icons: [], plates: [], cachedAt: 100 }],
        ["legacy", { data: makeCollectionData("legacy"), cachedAt: 100 }],
    ])("ignores a %s cache snapshot and loads from the network", async (_label, cached) => {
        mocks.getItem.mockResolvedValue(cached);
        mocks.fetchLXNSCollections.mockResolvedValue(makeCollectionData("network"));
        const collection = await importCollectionModule();

        await expect(collection.getCollectionDataAsync()).resolves.toBe(true);

        expect(mocks.fetchLXNSCollections).toHaveBeenCalledTimes(1);
        expect(collection.icons.map(item => item.name)).toEqual(["network-icon"]);
        expect(collection.collectionDataError.value).toBeNull();
        expect(collection.isCollectionDataLoading.value).toBe(false);
    });

    it("clears the shared load after failure so a later call can retry", async () => {
        mocks.getItem.mockResolvedValue(null);
        mocks.fetchLXNSCollections
            .mockRejectedValueOnce(new Error("temporary failure"))
            .mockResolvedValueOnce(makeCollectionData("retry"));
        const collection = await importCollectionModule();

        await expect(collection.getCollectionDataAsync()).resolves.toBe(false);
        expect(collection.collectionDataError.value).toBe("收藏品数据加载失败，请稍后重试");
        expect(collection.isCollectionDataLoading.value).toBe(false);

        await expect(collection.getCollectionDataAsync()).resolves.toBe(true);
        expect(mocks.fetchLXNSCollections).toHaveBeenCalledTimes(2);
        expect(collection.icons.map(item => item.name)).toEqual(["retry-icon"]);
        expect(collection.collectionDataError.value).toBeNull();
        expect(collection.isCollectionDataLoading.value).toBe(false);
    });

    it("downloads only once when initialization has no cache", async () => {
        mocks.getItem.mockResolvedValue(null);
        mocks.fetchLXNSCollections.mockResolvedValue(makeCollectionData("network"));
        const collection = await importCollectionModule();

        await collection.initializeCollectionData();
        await Promise.resolve();

        expect(mocks.fetchLXNSCollections).toHaveBeenCalledTimes(1);
        expect(collection.icons.map(item => item.name)).toEqual(["network-icon"]);
    });

    it("applies a valid cache before refreshing it in the background", async () => {
        let resolveRefresh!: (data: LXNSCollectionLists) => void;
        const refresh = new Promise<LXNSCollectionLists>(resolve => {
            resolveRefresh = resolve;
        });
        mocks.getItem.mockResolvedValue(makeCachedCollectionData("cache"));
        mocks.fetchLXNSCollections.mockReturnValue(refresh);
        const collection = await importCollectionModule();

        await collection.initializeCollectionData();

        expect(mocks.fetchLXNSCollections).toHaveBeenCalledTimes(1);
        expect(collection.icons.map(item => item.name)).toEqual(["cache-icon"]);
        expect(collection.collectionDataUpdatedAt.value).toBe(90);
        expect(collection.isCollectionDataLoading.value).toBe(false);

        resolveRefresh(makeCollectionData("refresh"));
        await expect(collection.refreshCollectionData()).resolves.toBe(true);
        expect(mocks.fetchLXNSCollections).toHaveBeenCalledTimes(1);
        expect(collection.icons.map(item => item.name)).toEqual(["refresh-icon"]);
    });
});

describe("collection data mapping", () => {
    function makeMappingFixture(): LXNSCollectionLists {
        return {
            trophies: [
                {
                    id: 1,
                    name: "称号一",
                    color: "GOLD",
                    genre: "称号类A",
                    description: "说明一",
                    required: [
                        {
                            difficulties: [3, 4],
                            rate: RankRate.sssp,
                            songs: [
                                {
                                    id: 11,
                                    title: "曲一",
                                    type: "dx",
                                    completed: true,
                                    completed_difficulties: [3],
                                },
                                { id: 12, title: "曲二", type: "standard" },
                            ],
                            completed: false,
                        },
                    ],
                },
                {
                    id: 2,
                    name: "称号二",
                    color: "unknown",
                    genre: null,
                    description: null,
                    required: [],
                },
                { id: 3, name: "称号三" },
            ],
            icons: [
                { id: 10, name: "头像一", genre: "头像类", color: null },
                { id: 11, name: "头像二", genre: "头像类" },
            ],
            plates: [
                {
                    id: 20,
                    name: "熊極",
                    genre: "旧框",
                    required: [
                        {
                            difficulties: [0, 1, 2, 3],
                            fc: ComboStatus.FullCombo,
                            songs: [{ id: 21, title: "曲三", type: "standard" }],
                        },
                    ],
                },
                { id: 21, name: "熊将", genre: "旧框", required: [] },
                {
                    id: 22,
                    name: "華神",
                    genre: "新框",
                    required: [{ fs: SyncStatus.FullSync, difficulties: [3] }],
                },
                { id: 23, name: "覇者舞舞", required: [{ rate: RankRate.sss }] },
                { id: 24, name: "桜花", genre: "新框", required: [{ rate: RankRate.s }] },
            ],
            frames: [{ id: 30, name: "背景一", genre: "背景类", description: "背景说明" }],
        };
    }

    async function loadMappingFixture() {
        mocks.getItem.mockResolvedValue(null);
        mocks.fetchLXNSCollections.mockResolvedValue(makeMappingFixture());
        const collection = await importCollectionModule();
        await expect(collection.getCollectionDataAsync()).resolves.toBe(true);
        return collection;
    }

    it("maps LXNS items to typed collections with normalized fields", async () => {
        const collection = await loadMappingFixture();

        expect([...collection.titles]).toEqual([
            {
                id: 1,
                name: "称号一",
                genre: "称号类A",
                description: "说明一",
                type: CollectionKind.Title,
                color: TitleColor.Gold,
                required: [
                    {
                        difficulties: [3, 4],
                        rate: RankRate.sssp,
                        songs: [
                            {
                                id: 11,
                                title: "曲一",
                                type: "dx",
                                completed: true,
                                completedDifficulties: [3],
                            },
                            { id: 12, title: "曲二", type: "standard" },
                        ],
                        completed: false,
                    },
                ],
            },
            {
                id: 2,
                name: "称号二",
                genre: "",
                description: "",
                type: CollectionKind.Title,
                color: TitleColor.Normal,
            },
            {
                id: 3,
                name: "称号三",
                genre: "",
                description: "",
                type: CollectionKind.Title,
                color: TitleColor.Normal,
            },
        ]);
        expect(collection.titles[1]?.required).toBeUndefined();
        expect([...collection.icons]).toEqual([
            { id: 10, name: "头像一", genre: "头像类", description: "", type: CollectionKind.Icon },
            { id: 11, name: "头像二", genre: "头像类", description: "", type: CollectionKind.Icon },
        ]);
        expect([...collection.frames]).toEqual([
            {
                id: 30,
                name: "背景一",
                genre: "背景类",
                description: "背景说明",
                type: CollectionKind.Frame,
            },
        ]);
        expect(collection.plates.map(plate => [plate.id, plate.name, plate.type])).toEqual([
            [20, "熊極", CollectionKind.Plate],
            [21, "熊将", CollectionKind.Plate],
            [22, "華神", CollectionKind.Plate],
            [23, "覇者舞舞", CollectionKind.Plate],
            [24, "桜花", CollectionKind.Plate],
        ]);
        expect(collection.plates[0]?.required).toEqual([
            {
                difficulties: [0, 1, 2, 3],
                fc: ComboStatus.FullCombo,
                songs: [{ id: 21, title: "曲三", type: "standard" }],
            },
        ]);
        expect(collection.plates[1]?.required).toBeUndefined();
    });

    it("lists each genre once and keeps the static character data", async () => {
        const collection = await loadMappingFixture();

        expect({ ...collection.genres, characters: undefined }).toEqual({
            icons: ["头像类"],
            plates: ["旧框", "新框"],
            frames: ["背景类"],
            titles: ["称号类A"],
            characters: undefined,
        });
        expect(collection.genres.characters).toEqual(additionalCollections.genres.characters);
        expect(collection.characters).toEqual(additionalCollections.characters);
        expect(collection.characters[0]).toEqual({
            id: 101,
            name: "でらっくま",
            genre: "はじまりのちほー",
            updateTime: 210304,
        });
        expect(collection.partners[0]).toEqual({
            id: 1,
            name: "でらっくま",
            description: "",
            type: CollectionKind.Partner,
        });
        const partnerIds = new Set(collection.partners.map(partner => partner.id));
        expect(partnerIds.size).toBe(collection.partners.length);
        const partnerKinds = new Set(collection.partners.map(partner => partner.type));
        expect([...partnerKinds]).toEqual([CollectionKind.Partner]);
    });

    it("groups plates with requirements by version plate category", async () => {
        const collection = await loadMappingFixture();

        expect(collection.versionPlateCategories).toEqual(["極", "将", "神", "舞舞"]);
        expect(collection.versionPlates["極"].map(plate => plate.name)).toEqual(["熊極"]);
        expect(collection.versionPlates["将"]).toEqual([]);
        expect(collection.versionPlates["神"].map(plate => plate.name)).toEqual(["華神"]);
        expect(collection.versionPlates["舞舞"].map(plate => plate.name)).toEqual(["覇者舞舞"]);
        expect(collection.versionPlates["極"][0]).toEqual({
            ...collection.plates[0],
            category: "極",
        });
    });

    it("indexes the mapped collections by the charts they require", async () => {
        const collection = await loadMappingFixture();
        const related = await import("./relatedCollections");
        const makeChart = (musicId: number, grade: number) =>
            ({ id: musicId * 100 + grade, info: { grade }, music: { id: musicId } }) as never;

        const namesFor = (musicId: number, grade: number) =>
            related.getRelatedCollectionsForChart(makeChart(musicId, grade)).map(item => item.name);

        expect(namesFor(10011, 3)).toEqual(["称号一"]);
        expect(namesFor(10011, 2)).toEqual([]);
        expect(namesFor(21, 2)).toEqual(["熊極"]);
        expect(collection.collectionDataUpdatedAt.value).toEqual(expect.any(Number));
    });
});
