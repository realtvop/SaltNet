import type { CoreConfig } from "../../config";
import type { FetchLike } from "../../http";
import type { DivingFishFullRecord } from "../diving-fish/type";
import type { LXNSResponse, LXNSScore, LXNSUploadScore } from "./type";
import { resolveCoreConfig } from "../../config";
import { ComboStatus, SyncStatus } from "../../mai/types";

/**
 * An error returned by the LXNS player API.
 */
export class LXNSPlayerApiError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
        this.name = "LXNSPlayerApiError";
    }
}

/**
 * Options for LXNS player API requests.
 */
export interface LXNSPlayerApiOptions {
    config?: Pick<Partial<CoreConfig>, "lxnsBaseUrl">;
    fetch?: FetchLike;
}

/**
 * Calls the LXNS player API for the authenticated user.
 */
export async function requestLXNSPlayerApi<T>(
    auth: { accessToken: string; tokenType: string },
    endpoint: string | undefined,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
    options: LXNSPlayerApiOptions = {}
): Promise<T> {
    const { lxnsBaseUrl } = resolveCoreConfig(options.config);
    const doFetch: FetchLike = options.fetch ?? fetch;
    const base = lxnsBaseUrl.replace(/\/+$/, "");
    // The endpoint is written as given, as the web app wrote it.
    const path = endpoint ? `/${endpoint}` : "";
    const url = `${base}/api/v0/user/maimai/player${path}`;

    const response = await doFetch(url, {
        method: init?.method,
        headers: {
            ...init?.headers,
            Authorization: `${auth.tokenType} ${auth.accessToken}`,
        },
        body: init?.body,
    });

    const body = (await response.json()) as LXNSResponse<T>;
    if (!response.ok || !body || !(body as { success?: unknown }).success) {
        throw new LXNSPlayerApiError(
            `LXNS API request failed (HTTP ${response.status})`,
            response.status
        );
    }

    return body.data as T;
}

/**
 * Converts an LXNS score to the Diving Fish full record format.
 */
export function convertLXNSScore(score: LXNSScore): DivingFishFullRecord {
    return {
        song_id: score.id + (score.type === "dx" ? 1_0000 : 0),
        level_index: score.level_index,
        level: score.level,
        level_label: `${score.level}${score.level_index}`,
        type: {
            standard: "SD",
            dx: "DX",
        }[score.type] as "SD" | "DX",
        dxScore: score.dx_score,
        ds: 0, // LXNS does not provide ds
        fc: score.fc ?? ComboStatus.None,
        fs: score.fs ?? SyncStatus.None,
        achievements: score.achievements,
        ra: Math.floor(score.dx_rating),
        rate: score.rate,
        title: score.song_name,
    };
}

/**
 * Converts a Diving Fish full record to the LXNS upload score format.
 */
export function convertToLXNSUploadScore(record: DivingFishFullRecord): LXNSUploadScore {
    const isDX = record.song_id > 1_0000 && record.song_id < 10_0000;
    const isUtage = record.song_id > 10_0000;
    const rawId = isDX ? record.song_id - 1_0000 : record.song_id;

    return {
        id: rawId,
        type: isDX ? "dx" : isUtage ? "utage" : "standard",
        level_index: isUtage ? 0 : record.level_index,
        achievements: record.achievements,
        fc: record.fc || null,
        fs: record.fs || null,
        dx_score: record.dxScore,
    };
}
