import type { LXNSCollectionItem, LXNSCollectionLists, LXNSCollectionType } from "./type";

const COLLECTION_API_BASE_URL = "https://maimai.lxns.net/api/v0/maimai";

const responseKeys: Record<LXNSCollectionType, keyof LXNSCollectionLists> = {
    trophy: "trophies",
    icon: "icons",
    plate: "plates",
    frame: "frames",
};

async function fetchLXNSCollectionList(
    collectionType: LXNSCollectionType
): Promise<LXNSCollectionItem[]> {
    const response = await fetch(
        `${COLLECTION_API_BASE_URL}/${collectionType}/list?required=true`,
        { cache: "no-store" }
    );
    if (!response.ok) {
        throw new Error(
            `LXNS collection request failed for ${collectionType} (HTTP ${response.status})`
        );
    }

    const body = (await response.json()) as Partial<LXNSCollectionLists>;
    const items = body[responseKeys[collectionType]];
    if (!Array.isArray(items)) {
        throw new Error(`LXNS collection response is malformed for ${collectionType}`);
    }
    return items;
}

export async function fetchLXNSCollections(): Promise<LXNSCollectionLists> {
    const [trophies, icons, plates, frames] = await Promise.all([
        fetchLXNSCollectionList("trophy"),
        fetchLXNSCollectionList("icon"),
        fetchLXNSCollectionList("plate"),
        fetchLXNSCollectionList("frame"),
    ]);

    return { trophies, icons, plates, frames };
}
