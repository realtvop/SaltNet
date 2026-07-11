import {
    convertSaltMetaNextCompactedToNormal,
    convertSaltMetaNextToSavedMusicList,
    getSaltNetMusicIdForChartType,
    SALTMETA_NEXT_COMPACTED_URL,
    SALTMETA_NEXT_COMPACTED_VERSION,
    type SaltMetaMusicMetadataNextCompacted,
} from "@/components/data/music/saltmeta";
import type { SavedMusicList } from "@/components/data/music/type";
import type {
    DivingFishB50,
    DivingFishFullRecord,
    DivingFishRecordsResponse,
    DivingFishResponse,
} from "./type";

const API_BASE_URL = "https://www.diving-fish.com/api/maimaidxprober";

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

export async function fetchPlayerData(username: string): Promise<DivingFishResponse> {
    const requestBody = {
        username: username,
        b50: "1",
    };

    try {
        const response = await fetch(`${API_BASE_URL}/query/player`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("user not exists");
            }
            // 400: user not found, 403: privacy/consent
            const err = await response.json().catch(() => ({}));
            if (err && err.message) throw new Error(err.message);
            throw new Error(`Request failed with status code ${response.status}`);
        }
        const data: DivingFishResponse = await response.json();
        return data;
    } catch (error) {
        console.error("Error fetching player data:", error);
        throw error;
    }
}

export async function fetchPlayerRecordsByImportToken(
    importToken: string
): Promise<DivingFishRecordsResponse> {
    const response = await fetch(`${API_BASE_URL}/player/records`, {
        method: "GET",
        headers: {
            "Import-Token": importToken,
        },
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (err && err.message) {
            throw new Error(err.message);
        }
        throw new Error(`Request failed with status code ${response.status}`);
    }

    return response.json();
}

export async function calculateB50FromRecords(
    records: DivingFishFullRecord[]
): Promise<DivingFishB50> {
    const musicInfo = await getWorkerSafeMusicData();
    const newScores: DivingFishFullRecord[] = [];
    const oldScores: DivingFishFullRecord[] = [];

    for (const record of records) {
        const musicId = getSaltNetMusicIdForChartType(record.song_id, record.type);
        const music = musicInfo?.musicList[musicId];
        if (music?.info?.isNew) {
            newScores.push(record);
        } else {
            oldScores.push(record);
        }
    }

    newScores.sort((a, b) => b.ra - a.ra);
    oldScores.sort((a, b) => b.ra - a.ra);

    return {
        dx: newScores.slice(0, 15),
        sd: oldScores.slice(0, 35),
    };
}
