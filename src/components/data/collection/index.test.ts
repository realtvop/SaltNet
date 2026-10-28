import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LXNSCollectionLists } from "@/components/integrations/lxns";
import { getVersionPlateTabs } from "./versionPlate";
import { CollectionKind, type VersionPlate, type VersionPlateCategory } from "./type";
import { ComboStatus } from "../maiTypes";

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

describe("version plate tabs", () => {
    function makePlate(name: string, category: VersionPlateCategory = "極"): VersionPlate {
        return {
            id: 1,
            type: CollectionKind.Plate,
            name,
            category,
            genre: "",
            description: "",
            required: [
                {
                    difficulties: [0, 1, 2, 3],
                    fc: ComboStatus.FullCombo,
                    songs: [{ id: 1, title: "Song", type: "dx" }],
                },
            ],
        };
    }

    it.each(["極", "将", "神", "舞舞"] as const)(
        "combines matching adjacent %s plates and retains the first selection value",
        category => {
            expect(
                getVersionPlateTabs([
                    makePlate(`熊${category}`, category),
                    makePlate(`華${category}`, category),
                ])
            ).toEqual([{ value: `熊${category}`, label: `熊華${category}` }]);
        }
    );

    it("keeps different requirements and non-adjacent matches in separate tabs", () => {
        const first = makePlate("熊極");
        const second = makePlate("爽極");
        second.required![0]!.songs![0]!.id = 2;
        expect(getVersionPlateTabs([first, second, makePlate("華極")])).toEqual([
            { value: "熊極", label: "熊極" },
            { value: "爽極", label: "爽極" },
            { value: "華極", label: "華極" },
        ]);
    });

    it("ignores song titles and progress when comparing requirements", () => {
        const first = makePlate("双極");
        const second = makePlate("宴極");
        second.required![0]!.difficulties!.reverse();
        second.required![0]!.completed = true;
        second.required![0]!.songs![0]!.title = "Updated title";
        second.required![0]!.songs![0]!.completed = true;
        expect(getVersionPlateTabs([first, second])).toEqual([{ value: "双極", label: "双宴極" }]);
    });

    it("does not combine missing requirements or different plate categories", () => {
        const first = makePlate("熊極");
        const second = makePlate("華極");
        first.required = [];
        second.required = [];
        expect(getVersionPlateTabs([first, second])).toHaveLength(2);
        expect(getVersionPlateTabs([makePlate("熊極"), makePlate("熊神", "神")])).toHaveLength(2);
        expect(getVersionPlateTabs([])).toEqual([]);
    });
});
