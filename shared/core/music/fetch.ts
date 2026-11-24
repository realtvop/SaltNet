import type { CoreConfig } from "../config";
import type { FetchInit, FetchLike } from "../http";
import type { MergedDuplicateMusic } from "./duplicates";
import type { SaltMetaMusicMetadataNextCompacted } from "./saltmeta";
import type { MusicMetadataState, SavedMusicList } from "./type";
import { resolveCoreConfig } from "../config";
import { mergeDuplicateMusics } from "./duplicates";
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

export type SaltMetaCompactedOutcome =
    | { ok: true; compacted: SaltMetaMusicMetadataNextCompacted }
    | { ok: false; failure: SaltMetaFetchFailure };

export interface SaltMetaFetchOptions {
    config?: Pick<Partial<CoreConfig>, "saltMetaUrl">;
    /** Defaults to the global `fetch`. */
    fetch?: FetchLike;
    requestInit?: FetchInit;
}

export interface SaltMetaBuildOptions {
    /**
     * Fold the songs that upstream lists twice into one entry (see `mergeDuplicateMusics`). The web
     * app leaves them as they are.
     */
    mergeDuplicates?: boolean;
}

export interface SaltMetaBuildResult extends SaltMetaMusicListResult {
    /** The songs that were folded together; empty unless `mergeDuplicates` was asked for. */
    merged: MergedDuplicateMusic[];
}

/**
 * Downloads the compacted SaltMeta document and checks its format version, without converting it.
 * It never throws and has no side effects besides the request.
 */
export async function fetchSaltMetaCompacted(
    options: SaltMetaFetchOptions = {}
): Promise<SaltMetaCompactedOutcome> {
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

        return { ok: true, compacted };
    } catch (error) {
        return { ok: false, failure: { kind: "error", error } };
    }
}

/** Converts a compacted document to the music list and version metadata. It throws on bad data. */
export function buildSaltMetaMusicList(
    compacted: SaltMetaMusicMetadataNextCompacted,
    options: SaltMetaBuildOptions = {}
): SaltMetaBuildResult {
    const normal = convertSaltMetaNextCompactedToNormal(compacted);
    const { metadata, merged } = options.mergeDuplicates
        ? mergeDuplicateMusics(normal)
        : { metadata: normal, merged: [] };
    const music = convertSaltMetaNextToSavedMusicList(metadata);
    return {
        music,
        metadata: { cnVersions: getSaltMetaCnVersions(metadata, music) },
        merged,
    };
}

/**
 * Downloads and converts the compacted SaltMeta document. It never throws and has no side effects
 * besides the request: reporting, caching and state updates belong to the caller.
 */
export async function fetchSaltMetaMusicList(
    options: SaltMetaFetchOptions = {}
): Promise<SaltMetaFetchOutcome> {
    const downloaded = await fetchSaltMetaCompacted(options);
    if (!downloaded.ok) return downloaded;

    try {
        const { music, metadata } = buildSaltMetaMusicList(downloaded.compacted);
        return { ok: true, compacted: downloaded.compacted, value: { music, metadata } };
    } catch (error) {
        return { ok: false, failure: { kind: "error", error } };
    }
}
