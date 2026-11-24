import type { CoreConfig } from "../../config";
import type { FetchLike, FetchResponse } from "../../http";
import type { SavedMusicList } from "../../music/type";
import type {
    DivingFishB50,
    DivingFishErrorResponse,
    DivingFishFullRecord,
    DivingFishRecordsResponse,
    DivingFishResponse,
} from "./type";
import { resolveCoreConfig } from "../../config";
import { getSaltNetMusicIdForChartType } from "../../music/saltmeta";

/** An error returned by the Diving Fish API. */
export class DivingFishError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
        this.name = "DivingFishError";
    }
}

export interface DivingFishRequestOptions {
    config?: Pick<Partial<CoreConfig>, "divingFishBaseUrl">;
    /**
     * Defaults to the global `fetch`. An error it throws is passed on unchanged. Browsers never put a
     * header value into that error, but Node's `fetch` does for a value that cannot be sent (a token
     * with a line break, for example), so a caller on Node must check a token before it is sent.
     */
    fetch?: FetchLike;
}

const REDACTED = "[REDACTED]";

/**
 * `text` with every occurrence of `secret` replaced, repeated until none is left (a replacement can
 * join two pieces that spell the secret again). A secret no longer than the marker is not looked
 * for: it could be part of ordinary words or of the marker itself, and no real Import-Token is that
 * short.
 */
function redactSecret(text: string, secret: string | undefined): string {
    if (secret === undefined || secret.length <= REDACTED.length) return text;
    let result = text;
    // Every pass makes the text shorter, because the marker is shorter than the secret.
    while (result.includes(secret)) result = result.split(secret).join(REDACTED);
    return result;
}

async function extractErrorMessage(response: FetchResponse, importToken?: string): Promise<string> {
    const body: unknown = await response.json().catch(() => ({}));
    // Any truthy `message` is shown as text, as the web app always did (`new Error(err.message)`).
    const reported =
        body !== null && typeof body === "object"
            ? (body as Partial<Record<keyof DivingFishErrorResponse, unknown>>).message
            : undefined;
    const message = reported
        ? String(reported)
        : `Request failed with status code ${response.status}`;
    return redactSecret(message, importToken);
}

/** Queries player overview and B50 data from Diving Fish by username. */
export async function queryDivingFishPlayer(
    username: string,
    options: DivingFishRequestOptions = {}
): Promise<DivingFishResponse> {
    const { divingFishBaseUrl } = resolveCoreConfig(options.config);
    const doFetch: FetchLike = options.fetch ?? fetch;
    const base = divingFishBaseUrl.replace(/\/+$/, "");
    const response = await doFetch(`${base}/query/player`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, b50: "1" }),
    });

    if (!response.ok) {
        if (response.status === 404) {
            throw new DivingFishError("user not exists", 404);
        }
        const message = await extractErrorMessage(response);
        throw new DivingFishError(message, response.status);
    }

    return (await response.json()) as DivingFishResponse;
}

/** Fetches full player records from Diving Fish using an Import-Token. */
export async function fetchDivingFishRecords(
    importToken: string,
    options: DivingFishRequestOptions = {}
): Promise<DivingFishRecordsResponse> {
    const { divingFishBaseUrl } = resolveCoreConfig(options.config);
    const doFetch: FetchLike = options.fetch ?? fetch;
    const base = divingFishBaseUrl.replace(/\/+$/, "");
    const response = await doFetch(`${base}/player/records`, {
        method: "GET",
        headers: {
            "Import-Token": importToken,
        },
    });

    if (!response.ok) {
        const message = await extractErrorMessage(response, importToken);
        throw new DivingFishError(message, response.status);
    }

    return (await response.json()) as DivingFishRecordsResponse;
}

/**
 * Uploads player records to Diving Fish using an Import-Token.
 *
 * Returns the raw fetch response without checking its status: the web app reports success
 * regardless of status, while callers such as the CLI should inspect `ok` themselves.
 */
export async function uploadDivingFishRecords(
    importToken: string,
    records: DivingFishFullRecord[],
    options: DivingFishRequestOptions = {}
): Promise<FetchResponse> {
    const { divingFishBaseUrl } = resolveCoreConfig(options.config);
    const doFetch: FetchLike = options.fetch ?? fetch;
    const base = divingFishBaseUrl.replace(/\/+$/, "");
    return doFetch(`${base}/player/update_records`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Import-Token": importToken,
        },
        body: JSON.stringify(records),
    });
}

/**
 * Builds the Diving Fish Best 50 (DX 15 and SD 35) from a list of records and catalog music data.
 * Records are partitioned into new (DX) and old (SD) categories and sorted descending by rating.
 */
export function buildDivingFishB50(
    records: DivingFishFullRecord[],
    musicList: SavedMusicList["musicList"] | undefined
): DivingFishB50 {
    const newScores: DivingFishFullRecord[] = [];
    const oldScores: DivingFishFullRecord[] = [];

    for (const record of records) {
        const musicId = getSaltNetMusicIdForChartType(record.song_id, record.type);
        const music = musicList?.[musicId];
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
