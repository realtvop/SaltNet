/**
 * Refreshing the catalog (design 2.3): download the SaltMeta document and the four LXNS collection
 * lists, check them, keep the raw documents in `cache/` and replace the stored rows.
 *
 * The two sources are independent. When one fails, its old rows stay and the other is still
 * updated, so the caller gets an outcome for each. Nothing is replaced unless the new data passed
 * the checks: an empty or unreadable answer must never wipe a good catalog.
 */
import type { FetchLike } from "@core/http";
import type { LXNSCollectionLists } from "@core/integrations/lxns/type";
import type { MergedDuplicateMusic } from "@core/music/duplicates";
import type { SaltMetaFetchFailure } from "@core/music/fetch";
import type { ConfigValues } from "../runtime/config";
import type { RuntimePaths } from "../runtime/paths";
import type { LockHolder } from "../store/locks";
import type { Store } from "../store/store";
import type { CollectionCounts, DownloadedSource } from "./store";
import { isLXNSCollectionLists } from "@core/collection/map";
import { fetchLXNSCollections, LXNSCollectionError } from "@core/integrations/lxns/fetchCollection";
import { buildSaltMetaMusicList, fetchSaltMetaCompacted } from "@core/music/fetch";
import { CliError } from "../errors";
import { toCoreConfig } from "../runtime/config";
import { upstreamStatusError } from "../runtime/http";
import { withLock } from "../store/locks";
import { toCliError } from "../toCliError";
import { writeSnapshot } from "./snapshots";
import { readMetaState, replaceCollections, replaceMusic } from "./store";

/** The lock a refresh holds, so two processes do not download and write at the same time. */
export const METADATA_LOCK = "metadata";

/** Longer than a refresh takes; a process that dies mid-way frees the lock by itself after this. */
export const METADATA_LOCK_TTL_MS = 120_000;

export const SOURCE_LABELS: Readonly<Record<DownloadedSource, string>> = {
    saltmeta: "曲库（SaltMeta）",
    "lxns-collections": "收藏品（落雪）",
};

export interface FailedOutcome {
    readonly source: DownloadedSource;
    readonly ok: false;
    readonly error: CliError;
    /** When the rows that are still stored were fetched; undefined when there are none. */
    readonly keptFetchedAt?: number;
}

export type SourceOutcome =
    | {
          readonly source: "saltmeta";
          readonly ok: true;
          /** Epoch milliseconds. */
          readonly fetchedAt: number;
          readonly songs: number;
          readonly charts: number;
          readonly versions: number;
          /** The upstream entries that were folded into one. */
          readonly merged: readonly MergedDuplicateMusic[];
      }
    | {
          readonly source: "lxns-collections";
          readonly ok: true;
          readonly fetchedAt: number;
          readonly counts: CollectionCounts;
      }
    | FailedOutcome;

export type RefreshResult =
    | { readonly refreshed: true; readonly outcomes: readonly SourceOutcome[] }
    | { readonly refreshed: false; readonly holder: LockHolder };

export interface RefreshDeps {
    store: Store;
    paths: RuntimePaths;
    config: ConfigValues;
    /** Downloads with its deadline already set. */
    http: FetchLike;
    now: () => Date;
    log: (message: string) => void;
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function saltMetaFailure(failure: SaltMetaFetchFailure, url: string): CliError {
    switch (failure.kind) {
        case "http":
            return upstreamStatusError(url, failure.status);
        case "version":
            return new CliError(
                "UPSTREAM_ERROR",
                `SaltMeta 的格式版本是 ${failure.actual}，这个 saltnet 只认识 ${failure.expected}；请升级 saltnet`
            );
        case "error":
            // The HTTP layer has already named a failed connection or an unreadable body.
            return failure.error instanceof CliError
                ? failure.error
                : new CliError(
                      "UPSTREAM_ERROR",
                      `SaltMeta 的内容无法解析：${describeError(failure.error)}`,
                      {
                          cause: failure.error,
                      }
                  );
    }
}

function collectionsFailure(error: unknown, baseUrl: string): CliError {
    if (error instanceof CliError) return error;
    if (error instanceof LXNSCollectionError) {
        return error.kind === "http"
            ? upstreamStatusError(baseUrl, error.status ?? 0)
            : new CliError("UPSTREAM_ERROR", `落雪的${error.collectionType}列表格式不对`, {
                  cause: error,
              });
    }
    return new CliError("UPSTREAM_ERROR", `落雪的收藏品列表无法解析：${describeError(error)}`, {
        cause: error,
    });
}

async function refreshMusic(deps: RefreshDeps): Promise<SourceOutcome> {
    const core = toCoreConfig(deps.config);
    deps.log(`正在下载${SOURCE_LABELS.saltmeta}`);
    const downloaded = await fetchSaltMetaCompacted({ config: core, fetch: deps.http });
    if (!downloaded.ok) throw saltMetaFailure(downloaded.failure, core.saltMetaUrl);

    let build;
    try {
        build = buildSaltMetaMusicList(downloaded.compacted, { mergeDuplicates: true });
    } catch (error) {
        throw new CliError("UPSTREAM_ERROR", `SaltMeta 的内容无法转换：${describeError(error)}`, {
            cause: error,
        });
    }
    if (Object.keys(build.music.musicList).length === 0) {
        throw new CliError("UPSTREAM_ERROR", "SaltMeta 里没有国服曲目，已有的曲库没有被替换");
    }

    writeSnapshot(deps.paths, "saltmeta", downloaded.compacted);
    const fetchedAt = deps.now().getTime();
    const counts = replaceMusic(deps.store, build, {
        fetchedAt,
        upstreamVersion: String(downloaded.compacted.version),
    });
    return { source: "saltmeta", ok: true, fetchedAt, ...counts, merged: build.merged };
}

async function refreshCollections(deps: RefreshDeps): Promise<SourceOutcome> {
    const core = toCoreConfig(deps.config);
    deps.log(`正在下载${SOURCE_LABELS["lxns-collections"]}`);
    let lists: LXNSCollectionLists;
    try {
        lists = await fetchLXNSCollections({ config: core, fetch: deps.http });
    } catch (error) {
        throw collectionsFailure(error, core.lxnsBaseUrl);
    }
    if (!isLXNSCollectionLists(lists)) {
        throw new CliError("UPSTREAM_ERROR", "落雪的收藏品列表格式不对，已有的收藏品没有被替换");
    }
    const total =
        lists.trophies.length + lists.icons.length + lists.plates.length + lists.frames.length;
    if (total === 0) {
        throw new CliError("UPSTREAM_ERROR", "落雪返回的收藏品列表是空的，已有的收藏品没有被替换");
    }

    writeSnapshot(deps.paths, "lxns-collections", lists);
    const fetchedAt = deps.now().getTime();
    const counts = replaceCollections(deps.store, lists, { fetchedAt });
    return { source: "lxns-collections", ok: true, fetchedAt, counts };
}

/** Runs one source and turns whatever goes wrong into its outcome, so the other still runs. */
async function attempt(
    source: DownloadedSource,
    deps: RefreshDeps,
    work: () => Promise<SourceOutcome>
): Promise<SourceOutcome> {
    try {
        return await work();
    } catch (error) {
        const kept = readMetaState(deps.store, source)?.fetchedAt;
        return {
            source,
            ok: false,
            error: toCliError(error),
            ...(kept === undefined ? {} : { keptFetchedAt: kept }),
        };
    }
}

/**
 * Downloads both sources and replaces what is stored. When another process is already refreshing,
 * nothing is downloaded and the holder of the lock comes back instead: a `refresh` command
 * refuses, a command that merely wants fresh data carries on with what is stored.
 */
export async function refreshCatalog(deps: RefreshDeps): Promise<RefreshResult> {
    const locked = await withLock(
        deps.store,
        METADATA_LOCK,
        { ttlMs: METADATA_LOCK_TTL_MS, now: () => deps.now().getTime() },
        () =>
            Promise.all([
                attempt("saltmeta", deps, () => refreshMusic(deps)),
                attempt("lxns-collections", deps, () => refreshCollections(deps)),
            ])
    );
    if (!locked.acquired) return { refreshed: false, holder: locked.holder };
    return { refreshed: true, outcomes: locked.value };
}
