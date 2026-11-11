/**
 * Making sure the catalog is there, current and readable before a command uses it (design 2.3).
 * A command says which of the two downloaded sources it reads (the songs and charts, or the
 * collections); only those are looked at, and each one is in one of these states:
 *
 * - fresh: stored, built by this version of the CLI and younger than `metadata.maxAgeHours`. It is
 *   read as it is.
 * - built by another version (`CATALOG_BUILDER` differs): the rows are rebuilt from the raw
 *   snapshot in `cache/` without the network, keeping the time of the original download. Without a
 *   usable snapshot the rows count as missing.
 * - stale: stored but too old. It is downloaded again; when that fails (or `--offline` forbids it,
 *   or another process is already at it) the stored rows are used and the result carries a
 *   `STALE_METADATA` warning.
 * - missing: nothing usable. It is downloaded; when that fails the command fails with the reason,
 *   with `OFFLINE_NO_CACHE` when `--offline` forbids it and `SYNC_IN_PROGRESS` when another
 *   process is downloading (nothing waits for it).
 */
import type { SaltMetaMusicMetadataNextCompacted } from "@core/music/saltmeta";
import type { Warning } from "../output/warning";
import type { LoadedCollections, LoadedMusic } from "./load";
import type { RefreshDeps } from "./refresh";
import type { DownloadedSource, MetaState } from "./store";
import { isLXNSCollectionLists } from "@core/collection/map";
import { SALTMETA_NEXT_COMPACTED_VERSION } from "@core/music/saltmeta";
import { CliError } from "../errors";
import { formatLocalTime } from "../util/time";
import { loadCollections, loadMusic } from "./load";
import { buildCatalog, refreshBusyError, refreshCatalog, SOURCE_LABELS } from "./refresh";
import { readSnapshot } from "./snapshots";
import { ensureStaticData } from "./static";
import { CATALOG_BUILDER, readMetaState, replaceCollections, replaceMusic } from "./store";

/** What a command can ask for: the songs, charts and versions, or the collections. */
export type MetadataKind = "catalog" | "collections";

const SOURCE_OF_KIND: Readonly<Record<MetadataKind, DownloadedSource>> = {
    catalog: "saltmeta",
    collections: "lxns-collections",
};

export const HOUR_MS = 3_600_000;

export interface EnsureDeps extends Omit<RefreshDeps, "sources"> {
    /** `--offline`: nothing is downloaded, whatever the age of what is stored. */
    offline: boolean;
}

interface LoadedMetadata {
    catalog: LoadedMusic;
    collections: LoadedCollections;
}

export type EnsuredMetadata<K extends MetadataKind> = Pick<LoadedMetadata, K> & {
    /** A `STALE_METADATA` for each source that is out of date and could not be refreshed. */
    readonly warnings: readonly Warning[];
    /** When each source asked for was downloaded, for `meta.dataAsOf`. */
    readonly dataAsOf: Readonly<Record<K, string>>;
};

/** Where one source stands, as far as this command is concerned. */
interface Standing {
    readonly source: DownloadedSource;
    /** When the usable rows were downloaded; undefined when there are none. */
    fetchedAt: number | undefined;
    /** A download is due: the rows are too old, or not there. */
    due: boolean;
}

/** Whether something fetched at `fetchedAt` (epoch milliseconds) is due for a download. */
export function isExpired(fetchedAt: number, now: Date, maxAgeHours: number): boolean {
    return now.getTime() - fetchedAt >= maxAgeHours * HOUR_MS;
}

function isSaltMetaDocument(value: unknown): value is SaltMetaMusicMetadataNextCompacted {
    if (typeof value !== "object" || value === null) return false;
    const document = value as Record<string, unknown>;
    return (
        document.version === SALTMETA_NEXT_COMPACTED_VERSION &&
        Array.isArray(document.musics) &&
        Array.isArray(document.versions)
    );
}

/**
 * What it takes to write a source's rows again from its snapshot, or undefined when there is no
 * snapshot or it is no good (the same checks a download goes through). Nothing is written yet.
 */
function planRebuild(
    deps: EnsureDeps,
    source: DownloadedSource,
    fetchedAt: number
): (() => void) | undefined {
    const snapshot = readSnapshot(deps.paths, source);
    try {
        if (source === "saltmeta") {
            if (!isSaltMetaDocument(snapshot)) return undefined;
            const build = buildCatalog(snapshot);
            const upstreamVersion = String(snapshot.version);
            return () => void replaceMusic(deps.store, build, { fetchedAt, upstreamVersion });
        }
        if (!isLXNSCollectionLists(snapshot)) return undefined;
        const { trophies, icons, plates, frames } = snapshot;
        if (trophies.length + icons.length + plates.length + frames.length === 0) return undefined;
        return () => void replaceCollections(deps.store, snapshot, { fetchedAt });
    } catch {
        return undefined;
    }
}

/**
 * Rebuilds the rows another version of the CLI left from the snapshot of the same download. True
 * when the rows are now this version's; false when there was nothing to rebuild them from.
 */
function rebuild(deps: EnsureDeps, source: DownloadedSource, old: MetaState): boolean {
    deps.log(`${SOURCE_LABELS[source]}是别的版本的 saltnet 存的，正在用 cache/ 里的原始文件重建`);
    const write = planRebuild(deps, source, old.fetchedAt);
    if (!write) {
        deps.log(`cache/ 里没有能用的${SOURCE_LABELS[source]}原始文件`);
        return false;
    }
    deps.store.transaction(() => {
        // Another process may have rebuilt or downloaded it meanwhile; its rows are newer.
        if (readMetaState(deps.store, source)?.builder === CATALOG_BUILDER) return;
        write();
    });
    return true;
}

function inspect(deps: EnsureDeps, source: DownloadedSource, now: Date): Standing {
    let state = readMetaState(deps.store, source);
    if (state && state.builder !== CATALOG_BUILDER) {
        const rebuilt = rebuild(deps, source, state)
            ? readMetaState(deps.store, source)
            : undefined;
        state = rebuilt?.builder === CATALOG_BUILDER ? rebuilt : undefined;
    }
    if (!state) return { source, fetchedAt: undefined, due: true };
    return {
        source,
        fetchedAt: state.fetchedAt,
        due: isExpired(state.fetchedAt, now, deps.config.metadata.maxAgeHours),
    };
}

function labelsOf(standings: readonly Standing[]): string {
    return standings.map(standing => SOURCE_LABELS[standing.source]).join("、");
}

/** `STALE_METADATA` for a source whose stored rows are used although they are too old. */
function staleWarning(standing: Standing, now: Date, reason: string): Warning {
    const { source, fetchedAt = 0 } = standing;
    const hours = Math.floor((now.getTime() - fetchedAt) / HOUR_MS);
    return {
        code: "STALE_METADATA",
        message: `${SOURCE_LABELS[source]}已经 ${hours} 小时没更新（${formatLocalTime(new Date(fetchedAt))}），${reason}，这次用的是缓存`,
        fix: "saltnet refresh",
    };
}

/**
 * Downloads what is due. Returns the warnings for the sources that stayed stale; throws when a
 * source that has nothing stored could not be had.
 */
async function refreshDue(
    deps: EnsureDeps,
    due: readonly Standing[],
    now: Date
): Promise<Warning[]> {
    deps.log(`${labelsOf(due)}需要更新`);
    const result = await refreshCatalog({ ...deps, sources: due.map(standing => standing.source) });

    if (!result.refreshed) {
        const missing = due.filter(standing => standing.fetchedAt === undefined);
        if (missing.length > 0) {
            throw refreshBusyError(result.holder, `，而${labelsOf(missing)}这里还没有缓存`);
        }
        return due.map(standing =>
            staleWarning(standing, now, "另一个 saltnet 进程正在刷新，没有等它")
        );
    }

    const warnings: Warning[] = [];
    const failures: { standing: Standing; error: CliError }[] = [];
    result.outcomes.forEach((outcome, index) => {
        const standing = due[index];
        if (outcome.ok) {
            standing.fetchedAt = outcome.fetchedAt;
            standing.due = false;
        } else if (standing.fetchedAt === undefined) {
            failures.push({ standing, error: outcome.error });
        } else {
            warnings.push(staleWarning(standing, now, `刷新失败（${outcome.error.message}）`));
        }
    });

    const [first] = failures;
    if (first) {
        const lines = failures.map(
            ({ standing, error }) => `${SOURCE_LABELS[standing.source]}：${error.message}`
        );
        throw new CliError(first.error.code, `没有缓存，下载又失败了，${lines.join("；")}`, {
            retryable: first.error.retryable,
            fix: first.error.fix,
            extra: first.error.extra,
            cause: first.error,
        });
    }
    return warnings;
}

/**
 * Makes sure the sources a command reads are stored and current (or as current as they can be) and
 * returns them as the web app keeps them. See the top of this file for what happens in each state.
 */
export async function ensureMetadata<const K extends MetadataKind>(
    deps: EnsureDeps,
    kinds: readonly K[]
): Promise<EnsuredMetadata<K>> {
    const now = deps.now();
    ensureStaticData(deps.store, now);

    const wanted = [...new Set(kinds)];
    const standings = wanted.map(kind => inspect(deps, SOURCE_OF_KIND[kind], now));
    const due = standings.filter(standing => standing.due);
    const warnings: Warning[] = [];

    if (due.length > 0) {
        if (deps.offline) {
            const missing = due.filter(standing => standing.fetchedAt === undefined);
            if (missing.length > 0) {
                throw new CliError(
                    "OFFLINE_NO_CACHE",
                    `没有${labelsOf(missing)}的缓存，而 --offline 不能联网；去掉 --offline 运行一次 saltnet refresh`,
                    { fix: "saltnet refresh" }
                );
            }
            warnings.push(
                ...due.map(standing => staleWarning(standing, now, "--offline 不联网，没有刷新"))
            );
        } else {
            warnings.push(...(await refreshDue(deps, due, now)));
        }
    }

    const loaded: Partial<LoadedMetadata> = {};
    const dataAsOf: Partial<Record<MetadataKind, string>> = {};
    for (const kind of wanted) {
        const data = kind === "catalog" ? loadMusic(deps.store) : loadCollections(deps.store);
        if (!data) {
            // The rows were there a moment ago; only something that deleted them explains this.
            const label = SOURCE_LABELS[SOURCE_OF_KIND[kind]];
            throw new CliError("INTERNAL", `${label}刚才还在，现在读不到了`);
        }
        Object.assign(loaded, { [kind]: data });
        dataAsOf[kind] = formatLocalTime(new Date(data.fetchedAt));
    }
    // Every kind that was asked for is in `loaded` and `dataAsOf`, which the types cannot see.
    return { ...loaded, dataAsOf, warnings } as unknown as EnsuredMetadata<K>;
}
