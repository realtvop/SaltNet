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
    SALTMETA_NEXT_COMPACTED_VERSION,
    type SaltMetaMusicMetadataNextCompacted,
} from "./saltmeta";
import { snackbar } from "mdui";
import { checkForUpdate } from "@/components/app/checkForUpdate";

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

        if (compacted.version !== SALTMETA_NEXT_COMPACTED_VERSION) {
            console.error(
                `SaltMeta next compacted version mismatch. Expected: ${SALTMETA_NEXT_COMPACTED_VERSION}, Got: ${compacted.version}`
            );
            snackbar({
                message: "曲目数据版本不一致，请尝试升级应用",
                placement: "bottom",
                autoCloseDelay: 0,
                action: "立即升级",
                onActionClick: () => {
                    checkForUpdate();
                },
            });
            return null;
        }

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
