import type { CoreConfig } from "../../config";
import type { FetchInit, FetchLike } from "../../http";
import type { LXNSCollectionItem, LXNSCollectionLists, LXNSCollectionType } from "./type";
import { resolveCoreConfig } from "../../config";

const responseKeys: Record<LXNSCollectionType, keyof LXNSCollectionLists> = {
    trophy: "trophies",
    icon: "icons",
    plate: "plates",
    frame: "frames",
};

/** A collection list that LXNS refused to serve or served in an unexpected shape. */
export class LXNSCollectionError extends Error {
    constructor(
        message: string,
        readonly kind: "http" | "malformed",
        readonly collectionType: LXNSCollectionType,
        /** The HTTP status; only for `kind: "http"`. */
        readonly status?: number
    ) {
        super(message);
        this.name = "LXNSCollectionError";
    }
}

export interface LXNSCollectionFetchOptions {
    config?: Pick<Partial<CoreConfig>, "lxnsBaseUrl">;
    /** Defaults to the global `fetch`. */
    fetch?: FetchLike;
    requestInit?: FetchInit;
}

async function fetchLXNSCollectionList(
    collectionType: LXNSCollectionType,
    options: LXNSCollectionFetchOptions
): Promise<LXNSCollectionItem[]> {
    const { lxnsBaseUrl } = resolveCoreConfig(options.config);
    const doFetch: FetchLike = options.fetch ?? fetch;
    const response = await doFetch(
        `${lxnsBaseUrl.replace(/\/+$/, "")}/api/v0/maimai/${collectionType}/list?required=true`,
        options.requestInit
    );
    if (!response.ok) {
        throw new LXNSCollectionError(
            `LXNS collection request failed for ${collectionType} (HTTP ${response.status})`,
            "http",
            collectionType,
            response.status
        );
    }

    const body = (await response.json()) as Partial<LXNSCollectionLists>;
    const items = body[responseKeys[collectionType]];
    if (!Array.isArray(items)) {
        throw new LXNSCollectionError(
            `LXNS collection response is malformed for ${collectionType}`,
            "malformed",
            collectionType
        );
    }
    return items;
}

/** Downloads the four public collection lists; rejects if any of them fails. */
export async function fetchLXNSCollections(
    options: LXNSCollectionFetchOptions = {}
): Promise<LXNSCollectionLists> {
    const [trophies, icons, plates, frames] = await Promise.all([
        fetchLXNSCollectionList("trophy", options),
        fetchLXNSCollectionList("icon", options),
        fetchLXNSCollectionList("plate", options),
        fetchLXNSCollectionList("frame", options),
    ]);

    return { trophies, icons, plates, frames };
}
