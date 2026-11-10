import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LXNSCollectionLists } from "@/components/integrations/lxns";

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
