/**
 * Music API Module
 * Fetches music data from SaltMeta next metadata.
 */

import type { SavedMusicList } from "./type";
import {
    convertSaltMetaNextCompactedToNormal,
    convertSaltMetaNextToSavedMusicList,
    SALTMETA_NEXT_COMPACTED_URL,
    type SaltMetaMusicMetadataNextCompacted,
} from "./saltmeta";

export async function fetchSaltMetaMusicList(): Promise<SavedMusicList | null> {
    try {
        const resp = await fetch(SALTMETA_NEXT_COMPACTED_URL, {
            cache: "no-store",
        });

        if (!resp.ok) {
            console.error("Failed to fetch SaltMeta music list:", resp.status);
            return null;
        }

        const compacted = (await resp.json()) as SaltMetaMusicMetadataNextCompacted;
        const metadata = convertSaltMetaNextCompactedToNormal(compacted);
        return convertSaltMetaNextToSavedMusicList(metadata);
    } catch (error) {
        console.error("Error fetching SaltMeta music list:", error);
        return null;
    }
}
