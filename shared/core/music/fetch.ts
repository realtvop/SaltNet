import type { CoreConfig } from "../config";
import type { FetchInit, FetchLike } from "../http";
import type { SaltMetaMusicMetadataNextCompacted } from "./saltmeta";
import type { MusicMetadataState, SavedMusicList } from "./type";
import { resolveCoreConfig } from "../config";
import {
    convertSaltMetaNextCompactedToNormal,
    convertSaltMetaNextToSavedMusicList,
    getSaltMetaCnVersions,
    SALTMETA_NEXT_COMPACTED_VERSION,
} from "./saltmeta";

export interface SaltMetaMusicListResult {
    music: SavedMusicList;
    metadata: MusicMetadataState;
}

/** Why a SaltMeta download produced no data; callers decide how to report it. */
export type SaltMetaFetchFailure =
    | { kind: "http"; status: number }
    | { kind: "version"; expected: number; actual: number }
    | { kind: "error"; error: unknown };

export type SaltMetaFetchOutcome =
    | {
          ok: true;
          value: SaltMetaMusicListResult;
          /** The upstream document as downloaded, for callers that keep a raw snapshot. */
          compacted: SaltMetaMusicMetadataNextCompacted;
      }
    | { ok: false; failure: SaltMetaFetchFailure };

export interface SaltMetaFetchOptions {
    config?: Pick<Partial<CoreConfig>, "saltMetaUrl">;
    /** Defaults to the global `fetch`. */
    fetch?: FetchLike;
    requestInit?: FetchInit;
}

/**
 * Downloads and converts the compacted SaltMeta document. It never throws and has no side effects
 * besides the request: reporting, caching and state updates belong to the caller.
 */
export async function fetchSaltMetaMusicList(
    options: SaltMetaFetchOptions = {}
): Promise<SaltMetaFetchOutcome> {
    try {
        const { saltMetaUrl } = resolveCoreConfig(options.config);
        const doFetch: FetchLike = options.fetch ?? fetch;
        const resp = await doFetch(saltMetaUrl, options.requestInit);

        if (!resp.ok) {
            return { ok: false, failure: { kind: "http", status: resp.status } };
        }

        const compacted = (await resp.json()) as SaltMetaMusicMetadataNextCompacted;

        if (compacted.version !== SALTMETA_NEXT_COMPACTED_VERSION) {
            return {
                ok: false,
                failure: {
                    kind: "version",
                    expected: SALTMETA_NEXT_COMPACTED_VERSION,
                    actual: compacted.version,
                },
            };
        }

        const metadata = convertSaltMetaNextCompactedToNormal(compacted);
        const music = convertSaltMetaNextToSavedMusicList(metadata);
        return {
            ok: true,
            compacted,
            value: {
                music,
                metadata: {
                    cnVersions: getSaltMetaCnVersions(metadata, music),
                },
            },
        };
    } catch (error) {
        return { ok: false, failure: { kind: "error", error } };
    }
}
