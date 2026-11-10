import type { EnsureDeps } from "../../src/catalog/ensure";
import type { RuntimePaths } from "../../src/runtime/paths";
import type { Store } from "../../src/store/store";
import type { RecordedRequest, Route } from "../mockHttp";
import { rmSync, writeFileSync } from "node:fs";
import process from "node:process";
import { mapLXNSCollections } from "@core/collection/map";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { buildSaltMetaMusicList } from "@core/music/fetch";
import { SALTMETA_NEXT_COMPACTED_VERSION } from "@core/music/saltmeta";
import { afterEach, describe, expect, it } from "vitest";
import { ensureMetadata } from "../../src/catalog/ensure";
import { METADATA_LOCK } from "../../src/catalog/refresh";
import { snapshotPath } from "../../src/catalog/snapshots";
import { CATALOG_BUILDER, readMetaState } from "../../src/catalog/store";
import { CliError } from "../../src/errors";
import { loadConfig } from "../../src/runtime/config";
import { createHttp } from "../../src/runtime/http";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import { formatLocalTime } from "../../src/util/time";
import { jsonResponse, mockFetch } from "../mockHttp";
import { useTempHome } from "../tempHome";

const META_URL = "https://meta.test/saltmeta.json";
const LXNS_URL = "https://lxns.test";
const HOUR = 3_600_000;
const NOW = new Date("2026-11-11T01:00:00Z");
const ago = (hours: number): Date => new Date(NOW.getTime() - hours * HOUR);
const ALL = ["catalog", "collections"] as const;

function listUrl(kind: "trophy" | "icon" | "plate" | "frame"): string {
    return `${LXNS_URL}/api/v0/maimai/${kind}/list?required=true`;
}

const LIST_URLS = (["trophy", "icon", "plate", "frame"] as const).map(listUrl);

/** The network as it should be: every address a refresh asks for, answered with the fixtures. */
function routes(overrides: Record<string, Route> = {}): Record<string, Route> {
    const lists = getFixtureLXNSCollections();
    return {
        [META_URL]: jsonResponse(getFixtureSaltMetaCompacted()),
        [listUrl("trophy")]: jsonResponse({ trophies: lists.trophies }),
        [listUrl("icon")]: jsonResponse({ icons: lists.icons }),
        [listUrl("plate")]: jsonResponse({ plates: lists.plates }),
        [listUrl("frame")]: jsonResponse({ frames: lists.frames }),
        ...overrides,
    };
}

function refusedConnection(): never {
    throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {
            code: "ECONNREFUSED",
        }),
    });
}

const makeHome = useTempHome();
const opened: Store[] = [];

afterEach(() => {
    for (const store of opened.splice(0)) store.close();
});

interface Call {
    deps: EnsureDeps;
    /** What this call asked the network for. */
    requests: RecordedRequest[];
}

/** A data directory with its database, and a way to make the dependencies of one call. */
function createEnv(env: Record<string, string> = {}) {
    const paths: RuntimePaths = makeHome();
    const store = openStore(paths);
    opened.push(store);
    const config = loadConfig(paths, {
        env: {
            SALTNET_HOME: paths.home,
            SALTNET_SALTMETA_URL: META_URL,
            SALTNET_LXNS_BASE_URL: LXNS_URL,
            ...env,
        },
        version: "9.9.9",
    }).values;

    function call(
        options: { now?: Date; offline?: boolean; network?: Record<string, Route> } = {}
    ): Call {
        const fetch = mockFetch(options.network ?? routes());
        return {
            requests: fetch.requests,
            deps: {
                store,
                paths,
                config,
                http: createHttp({ fetch, userAgent: "saltnet-cli/9.9.9", timeoutMs: 1000 }),
                now: () => options.now ?? NOW,
                log: () => {},
                offline: options.offline ?? false,
            },
        };
    }

    /** Fills the store as if both sources had been downloaded `at`. */
    async function prime(at: Date): Promise<void> {
        await ensureMetadata(call({ now: at }).deps, ALL);
    }

    return { paths, store, call, prime };
}

const urls = (requests: RecordedRequest[]): string[] => requests.map(request => request.url).sort();

describe("the first use", () => {
    it("downloads what the command reads and gives it back as the web app builds it", async () => {
        const env = createEnv();
        const { deps, requests } = env.call();

        const result = await ensureMetadata(deps, ALL);

        expect(result.catalog.music).toEqual(
            buildSaltMetaMusicList(getFixtureSaltMetaCompacted(), { mergeDuplicates: true }).music
        );
        expect(result.collections.collections).toEqual(
            mapLXNSCollections(getFixtureLXNSCollections())
        );
        expect(result.warnings).toEqual([]);
        expect(result.dataAsOf).toEqual({
            catalog: formatLocalTime(NOW),
            collections: formatLocalTime(NOW),
        });
        expect(urls(requests)).toEqual([META_URL, ...LIST_URLS].sort());
    });

    it("leaves the sources the command does not read alone", async () => {
        const env = createEnv();
        const { deps, requests } = env.call();

        const result = await ensureMetadata(deps, ["catalog"]);

        expect(urls(requests)).toEqual([META_URL]);
        expect(Object.keys(result).sort()).toEqual(["catalog", "dataAsOf", "warnings"]);
        expect(result.dataAsOf).toEqual({ catalog: formatLocalTime(NOW) });
        expect(readMetaState(env.store, "saltmeta")?.fetchedAt).toBe(NOW.getTime());
        expect(readMetaState(env.store, "lxns-collections")).toBeUndefined();
    });

    it("writes the static data, once", async () => {
        const env = createEnv();
        await ensureMetadata(env.call().deps, ["catalog"]);
        expect(readMetaState(env.store, "static")?.fetchedAt).toBe(NOW.getTime());

        await ensureMetadata(env.call({ now: ago(-1) }).deps, ["catalog"]);
        expect(readMetaState(env.store, "static")?.fetchedAt).toBe(NOW.getTime());
        const courses = env.store.db.prepare("SELECT count(*) AS n FROM courses").get() as {
            n: number;
        };
        expect(courses.n).toBeGreaterThan(0);
    });

    it("fails with the reason when nothing is stored and the download fails", async () => {
        const env = createEnv();
        const { deps } = env.call({ network: routes({ [META_URL]: refusedConnection }) });

        const failure = await ensureMetadata(deps, ["catalog"]).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(CliError);
        expect(failure).toMatchObject({ code: "NETWORK", retryable: true });
        expect((failure as CliError).message).toContain("曲库（SaltMeta）");
        expect(readMetaState(env.store, "saltmeta")).toBeUndefined();
    });

    it("reports a service that answers with an error as UPSTREAM_ERROR", async () => {
        const env = createEnv();
        const { deps } = env.call({ network: routes({ [META_URL]: jsonResponse({}, 503) }) });

        await expect(ensureMetadata(deps, ["catalog"])).rejects.toMatchObject({
            code: "UPSTREAM_ERROR",
            retryable: true,
        });
    });
});

describe("data that is fresh", () => {
    it("is read without asking the network", async () => {
        const env = createEnv();
        await env.prime(ago(23));
        const { deps, requests } = env.call();

        const result = await ensureMetadata(deps, ALL);

        expect(requests).toEqual([]);
        expect(result.warnings).toEqual([]);
        expect(result.dataAsOf).toEqual({
            catalog: formatLocalTime(ago(23)),
            collections: formatLocalTime(ago(23)),
        });
        expect(Object.keys(result.catalog.music.musicList)).toHaveLength(50);
    });

    it("is downloaded again once it is as old as metadata.maxAgeHours", async () => {
        const env = createEnv();
        await env.prime(ago(24));
        const { deps, requests } = env.call();

        const result = await ensureMetadata(deps, ["catalog"]);

        expect(urls(requests)).toEqual([META_URL]);
        expect(result.dataAsOf.catalog).toBe(formatLocalTime(NOW));
        expect(readMetaState(env.store, "saltmeta")?.fetchedAt).toBe(NOW.getTime());
    });

    it("follows metadata.maxAgeHours", async () => {
        const env = createEnv({ SALTNET_METADATA_MAX_AGE_HOURS: "48" });
        await env.prime(ago(30));
        const { deps, requests } = env.call();

        await ensureMetadata(deps, ALL);

        expect(requests).toEqual([]);
    });

    it("is downloaded every time when metadata.maxAgeHours is 0", async () => {
        const env = createEnv({ SALTNET_METADATA_MAX_AGE_HOURS: "0" });
        await env.prime(NOW);
        const { deps, requests } = env.call();

        await ensureMetadata(deps, ["collections"]);

        expect(urls(requests)).toEqual(LIST_URLS.slice().sort());
    });

    it("is not old when the clock was set back behind the time it was stored", async () => {
        const env = createEnv();
        await env.prime(ago(-24));
        const { deps, requests } = env.call();

        const result = await ensureMetadata(deps, ALL);

        expect(requests).toEqual([]);
        expect(result.warnings).toEqual([]);
    });
});

describe("data that is stale", () => {
    it("is replaced when the download works", async () => {
        const env = createEnv();
        await env.prime(ago(30));
        const { deps, requests } = env.call();

        const result = await ensureMetadata(deps, ALL);

        expect(urls(requests)).toEqual([META_URL, ...LIST_URLS].sort());
        expect(result.warnings).toEqual([]);
        expect(result.dataAsOf.catalog).toBe(formatLocalTime(NOW));
        expect(result.dataAsOf.collections).toBe(formatLocalTime(NOW));
    });

    it("is used with a warning when the download fails", async () => {
        const env = createEnv();
        await env.prime(ago(30));
        const { deps } = env.call({ network: routes({ [META_URL]: refusedConnection }) });

        const result = await ensureMetadata(deps, ["catalog"]);

        expect(result.dataAsOf.catalog).toBe(formatLocalTime(ago(30)));
        expect(Object.keys(result.catalog.music.musicList)).toHaveLength(50);
        expect(result.warnings).toHaveLength(1);
        const [warning] = result.warnings;
        expect(warning).toMatchObject({ code: "STALE_METADATA", fix: "saltnet refresh" });
        expect(warning.message).toContain("曲库（SaltMeta）");
        expect(warning.message).toContain("30 小时");
        expect(warning.message).toContain(formatLocalTime(ago(30)));
        expect(warning.message).toContain("刷新失败");
        // What was stored is still there, untouched.
        expect(readMetaState(env.store, "saltmeta")?.fetchedAt).toBe(ago(30).getTime());
    });

    it("lets a source that works be refreshed when the other one fails", async () => {
        const env = createEnv();
        await env.prime(ago(30));
        const { deps } = env.call({ network: routes({ [META_URL]: jsonResponse({}, 503) }) });

        const result = await ensureMetadata(deps, ALL);

        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].message).toContain("曲库（SaltMeta）");
        expect(result.dataAsOf.catalog).toBe(formatLocalTime(ago(30)));
        expect(result.dataAsOf.collections).toBe(formatLocalTime(NOW));
    });

    it("fails the command when a source that has nothing stored cannot be had", async () => {
        const env = createEnv();
        await ensureMetadata(env.call({ now: ago(30) }).deps, ["collections"]);
        const { deps } = env.call({ network: routes({ [META_URL]: refusedConnection }) });

        await expect(ensureMetadata(deps, ALL)).rejects.toMatchObject({ code: "NETWORK" });

        // The source that could be downloaded was kept all the same.
        expect(readMetaState(env.store, "lxns-collections")?.fetchedAt).toBe(NOW.getTime());
        expect(readMetaState(env.store, "saltmeta")).toBeUndefined();
    });
});

describe("--offline", () => {
    it("uses stale data, with a warning, and never asks the network", async () => {
        const env = createEnv();
        await env.prime(ago(30));
        const { deps, requests } = env.call({ offline: true });

        const result = await ensureMetadata(deps, ALL);

        expect(requests).toEqual([]);
        expect(result.warnings.map(warning => warning.code)).toEqual([
            "STALE_METADATA",
            "STALE_METADATA",
        ]);
        expect(result.warnings[0].message).toContain("--offline");
        expect(result.warnings[0].message).toContain("曲库（SaltMeta）");
        expect(result.warnings[1].message).toContain("收藏品（落雪）");
        expect(result.dataAsOf.catalog).toBe(formatLocalTime(ago(30)));
    });

    it("has nothing to warn about when the data is fresh", async () => {
        const env = createEnv();
        await env.prime(ago(1));
        const { deps, requests } = env.call({ offline: true });

        const result = await ensureMetadata(deps, ALL);

        expect(requests).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    it("is OFFLINE_NO_CACHE when nothing is stored, naming what is missing", async () => {
        const env = createEnv();
        const { deps, requests } = env.call({ offline: true });

        const failure = await ensureMetadata(deps, ALL).catch((error: unknown) => error);

        expect(failure).toMatchObject({ code: "OFFLINE_NO_CACHE", fix: "saltnet refresh" });
        expect((failure as CliError).message).toContain("曲库（SaltMeta）、收藏品（落雪）");
        expect((failure as CliError).exitCode).toBe(5);
        expect(requests).toEqual([]);
    });

    it("names only the source that is missing", async () => {
        const env = createEnv();
        await ensureMetadata(env.call({ now: ago(1) }).deps, ["collections"]);
        const { deps } = env.call({ offline: true });

        const failure = await ensureMetadata(deps, ALL).catch((error: unknown) => error);

        expect((failure as CliError).message).toContain("曲库（SaltMeta）");
        expect((failure as CliError).message).not.toContain("收藏品");
    });
});

describe("while another process refreshes", () => {
    function hold(env: ReturnType<typeof createEnv>): void {
        const taken = acquireLock(env.store, METADATA_LOCK, {
            ttlMs: 60_000,
            now: () => NOW.getTime(),
        });
        expect(taken.acquired).toBe(true);
    }

    it("carries on with the stored data and says so", async () => {
        const env = createEnv();
        await env.prime(ago(30));
        hold(env);
        const { deps, requests } = env.call();

        const result = await ensureMetadata(deps, ["catalog"]);

        expect(requests).toEqual([]);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toMatchObject({ code: "STALE_METADATA" });
        expect(result.warnings[0].message).toContain("另一个 saltnet 进程");
    });

    it("is SYNC_IN_PROGRESS when there is nothing stored to carry on with", async () => {
        const env = createEnv();
        hold(env);
        const { deps, requests } = env.call();

        const failure = await ensureMetadata(deps, ["catalog"]).catch((error: unknown) => error);

        expect(failure).toMatchObject({ code: "SYNC_IN_PROGRESS", retryable: true });
        expect((failure as CliError).extra?.holder).toMatchObject({ pid: process.pid });
        expect(requests).toEqual([]);
    });

    it("does not need the lock when the data is fresh", async () => {
        const env = createEnv();
        await env.prime(ago(1));
        hold(env);
        const { deps } = env.call();

        const result = await ensureMetadata(deps, ALL);

        expect(result.warnings).toEqual([]);
    });
});

describe("rows built by another version of the CLI", () => {
    /** What an older CLI would have left: another builder, and rows that are not to be trusted. */
    function spoil(env: ReturnType<typeof createEnv>): void {
        env.store.db.exec(
            "UPDATE meta_state SET builder = 'catalog-0/search-0' WHERE source != 'static'"
        );
        env.store.db.exec("DELETE FROM charts");
        env.store.db.exec("DELETE FROM songs");
        env.store.db.exec(
            "DELETE FROM collections WHERE kind IN ('title', 'icon', 'plate', 'frame')"
        );
    }

    it("are rebuilt from the snapshots without the network, keeping the time of the download", async () => {
        const env = createEnv();
        await env.prime(ago(2));
        spoil(env);
        const { deps, requests } = env.call();

        const result = await ensureMetadata(deps, ALL);

        expect(requests).toEqual([]);
        expect(result.warnings).toEqual([]);
        expect(result.catalog.music).toEqual(
            buildSaltMetaMusicList(getFixtureSaltMetaCompacted(), { mergeDuplicates: true }).music
        );
        expect(result.collections.collections).toEqual(
            mapLXNSCollections(getFixtureLXNSCollections())
        );
        expect(result.dataAsOf).toEqual({
            catalog: formatLocalTime(ago(2)),
            collections: formatLocalTime(ago(2)),
        });
        expect(readMetaState(env.store, "saltmeta")).toMatchObject({
            builder: CATALOG_BUILDER,
            fetchedAt: ago(2).getTime(),
            upstreamVersion: String(getFixtureSaltMetaCompacted().version),
        });
        expect(readMetaState(env.store, "lxns-collections")?.builder).toBe(CATALOG_BUILDER);
    });

    it("are rebuilt even with --offline", async () => {
        const env = createEnv();
        await env.prime(ago(2));
        spoil(env);
        const { deps, requests } = env.call({ offline: true });

        const result = await ensureMetadata(deps, ["catalog"]);

        expect(requests).toEqual([]);
        expect(Object.keys(result.catalog.music.musicList)).toHaveLength(50);
    });

    it("are downloaded too when the rebuilt data is already stale", async () => {
        const env = createEnv();
        await env.prime(ago(30));
        spoil(env);
        const { deps, requests } = env.call();

        const result = await ensureMetadata(deps, ["catalog"]);

        expect(urls(requests)).toEqual([META_URL]);
        expect(result.dataAsOf.catalog).toBe(formatLocalTime(NOW));
    });

    it("are left to the download when the snapshot is missing", async () => {
        const env = createEnv();
        await env.prime(ago(2));
        spoil(env);
        rmSync(snapshotPath(env.paths, "saltmeta"));
        const { deps, requests } = env.call();

        const result = await ensureMetadata(deps, ["catalog"]);

        expect(urls(requests)).toEqual([META_URL]);
        expect(result.dataAsOf.catalog).toBe(formatLocalTime(NOW));
    });

    const document = (musics: unknown[]): string =>
        JSON.stringify({ version: SALTMETA_NEXT_COMPACTED_VERSION, musics, versions: [] });

    it.each([
        ["is not JSON", "not json at all"],
        ["is empty", JSON.stringify({})],
        ["has another format version", JSON.stringify({ version: 0, musics: [], versions: [] })],
        ["cannot be converted", document([null])],
        ["has no song", document([])],
    ])("count as missing when the snapshot %s", async (_name, content) => {
        const env = createEnv();
        await env.prime(ago(2));
        spoil(env);
        writeFileSync(snapshotPath(env.paths, "saltmeta"), content);

        await expect(
            ensureMetadata(env.call({ offline: true }).deps, ["catalog"])
        ).rejects.toMatchObject({
            code: "OFFLINE_NO_CACHE",
        });
        const { deps, requests } = env.call();
        const result = await ensureMetadata(deps, ["catalog"]);

        expect(urls(requests)).toEqual([META_URL]);
        expect(result.dataAsOf.catalog).toBe(formatLocalTime(NOW));
    });

    it("count as missing when the collections snapshot is no good", async () => {
        const env = createEnv();
        await env.prime(ago(2));
        spoil(env);
        writeFileSync(
            snapshotPath(env.paths, "lxns-collections"),
            JSON.stringify({ trophies: [], icons: [], plates: [], frames: [] })
        );

        await expect(
            ensureMetadata(env.call({ offline: true }).deps, ["collections"])
        ).rejects.toMatchObject({ code: "OFFLINE_NO_CACHE" });
    });

    it("keeps the rows of a newer process that rebuilt them meanwhile", async () => {
        const env = createEnv();
        await env.prime(ago(2));
        spoil(env);
        // A competing process finishes between the moment this one reads the snapshot and writes.
        const { deps } = env.call();
        const realTransaction = deps.store.transaction.bind(deps.store);
        let raced = false;
        const store: Store = {
            ...deps.store,
            transaction: work => {
                if (!raced) {
                    raced = true;
                    env.store.db
                        .prepare(
                            "UPDATE meta_state SET builder = ?, fetched_at = ? WHERE source = 'saltmeta'"
                        )
                        .run(CATALOG_BUILDER, NOW.getTime());
                }
                return realTransaction(work);
            },
        };

        const result = await ensureMetadata({ ...deps, store, offline: true }, ["catalog"]);

        // The newer rows were not overwritten with the older snapshot.
        expect(raced).toBe(true);
        expect(readMetaState(env.store, "saltmeta")?.fetchedAt).toBe(NOW.getTime());
        expect(result.dataAsOf.catalog).toBe(formatLocalTime(NOW));
    });
});
