import type { LXNSCollectionLists } from "@core/integrations/lxns/type";
import { fetchLXNSCollections as fetchLXNSCollectionsCore } from "@core/integrations/lxns/fetchCollection";

export function fetchLXNSCollections(): Promise<LXNSCollectionLists> {
    return fetchLXNSCollectionsCore({ requestInit: { cache: "no-store" } });
}
