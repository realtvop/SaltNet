import {
    buildDivingFishB50,
    DivingFishError,
    fetchDivingFishRecords,
    queryDivingFishPlayer,
} from "@core/integrations/diving-fish/client";
import type {
    DivingFishB50,
    DivingFishFullRecord,
    DivingFishRecordsResponse,
    DivingFishResponse,
} from "@core/integrations/diving-fish/type";
import {
    convertSaltMetaNextCompactedToNormal,
    convertSaltMetaNextToSavedMusicList,
    SALTMETA_NEXT_COMPACTED_URL,
    SALTMETA_NEXT_COMPACTED_VERSION,
    type SaltMetaMusicMetadataNextCompacted,
} from "@core/music/saltmeta";
import type { SavedMusicList } from "@core/music/type";

let musicDataPromise: Promise<SavedMusicList | null> | null = null;

async function fetchSaltMetaMusicData(): Promise<SavedMusicList | null> {
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
        return null;
    }

    return convertSaltMetaNextToSavedMusicList(convertSaltMetaNextCompactedToNormal(compacted));
}

async function getWorkerSafeMusicData(): Promise<SavedMusicList | null> {
    if (!musicDataPromise) {
        musicDataPromise = fetchSaltMetaMusicData().catch(error => {
            console.error("Error fetching SaltMeta music list:", error);
            return null;
        });
    }

    return musicDataPromise;
}

/** The web app has always thrown a plain `Error` here; users see it through `toString()`. */
function plainError(error: unknown): unknown {
    return error instanceof DivingFishError ? new Error(error.message) : error;
}

export async function fetchPlayerData(username: string): Promise<DivingFishResponse> {
    try {
        return await queryDivingFishPlayer(username);
    } catch (error) {
        const thrown = plainError(error);
        console.error("Error fetching player data:", thrown);
        throw thrown;
    }
}

export async function fetchPlayerRecordsByImportToken(
    importToken: string
): Promise<DivingFishRecordsResponse> {
    try {
        return await fetchDivingFishRecords(importToken);
    } catch (error) {
        throw plainError(error);
    }
}

export async function calculateB50FromRecords(
    records: DivingFishFullRecord[]
): Promise<DivingFishB50> {
    const musicInfo = await getWorkerSafeMusicData();
    return buildDivingFishB50(records, musicInfo?.musicList);
}
