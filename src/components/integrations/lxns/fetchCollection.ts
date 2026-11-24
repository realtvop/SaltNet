import type { LXNSCollectionLists } from "@core/integrations/lxns/type";
import {
    fetchLXNSCollections as fetchLXNSCollectionsCore,
    LXNSCollectionError,
} from "@core/integrations/lxns/fetchCollection";

function restoreWebError(error: unknown): never {
    if (error instanceof LXNSCollectionError) {
        throw new Error(error.message);
    }
    throw error;
}

export function fetchLXNSCollections(): Promise<LXNSCollectionLists> {
    return fetchLXNSCollectionsCore({ requestInit: { cache: "no-store" } }).catch(restoreWebError);
}
