/**
 * Music API Module
 * Fetches music data from SaltMeta next metadata.
 */

import type { MusicMetadataState, SavedMusicList } from "./type";
import {
    convertSaltMetaNextCompactedToNormal,
    convertSaltMetaNextToSavedMusicList,
    getSaltMetaCnVersionPlates,
    getSaltMetaCnVersions,
    SALTMETA_NEXT_COMPACTED_URL,
    type SaltMetaMusicMetadataNextCompacted,
} from "./saltmeta";

export type SaltMetaMusicListResult = {
    music: SavedMusicList;
    metadata: MusicMetadataState;
};

export async function fetchSaltMetaMusicList(): Promise<SaltMetaMusicListResult | null> {
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
        const music = convertSaltMetaNextToSavedMusicList(metadata);
        return {
            music,
            metadata: {
                cnVersions: getSaltMetaCnVersions(metadata, music),
                cnVersionPlates: getSaltMetaCnVersionPlates(metadata, music),
            },
        };
    } catch (error) {
        console.error("Error fetching SaltMeta music list:", error);
        return null;
    }
}
