import type { RuntimePaths } from "../../src/runtime/paths";
import type { Route } from "../mockHttp";
import process from "node:process";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { describe, expect, it } from "vitest";
import { METADATA_LOCK } from "../../src/catalog/refresh";
import { readSnapshot } from "../../src/catalog/snapshots";
import { createRegistry } from "../../src/commands";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import { formatLocalTime } from "../../src/util/time";
import { createHarness, run } from "../harness";
import { jsonResponse, mockFetch, textResponse } from "../mockHttp";
import { useTempHome } from "../tempHome";

const META_URL = "https://meta.test/saltmeta.json";
const LXNS_URL = "https://lxns.test";
const NOW = new Date("2026-11-11T01:00:00Z");
const EARLIER = new Date("2026-11-10T01:00:00Z");
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

function listUrl(kind: "trophy" | "icon" | "plate" | "frame"): string {
    return `${LXNS_URL}/api/v0/maimai/${kind}/list?required=true`;
}

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

interface SourceReport {
    source: string;
    ok: boolean;
    fetchedAt: string;
    keptFetchedAt: string | null;
    songs: number;
    charts: number;
    versions: number;
    mergedDuplicates: { id: number }[];
    counts: Record<string, number>;
    error: { code: string; message: string; retryable: boolean };
}

/** What a command prints. A test reads only the parts that the case it checks has. */
interface Envelope {
    v: number;
    ok: boolean;
    command: string;
    data: { sources: SourceReport[] };
    error: {
        code: string;
        message: string;
        retryable: boolean;
        sources: SourceReport[];
        holder: { pid: number; since: string };
    };
}

interface Outcome {
    code: number;
    json: Envelope;
    stderr: string;
    requests: ReturnType<typeof mockFetch>["requests"];
}

/** Runs `saltnet refresh ...` in `paths` against the given network, at the given time. */
async function refresh(
    paths: RuntimePaths,
    network: Record<string, Route>,
    options: { now?: Date; env?: Record<string, string>; args?: string[] } = {}
): Promise<Outcome> {
    const fetch = mockFetch(network);
    const harness = createHarness({
        env: {
            SALTNET_HOME: paths.home,
            SALTNET_SALTMETA_URL: META_URL,
            SALTNET_LXNS_BASE_URL: LXNS_URL,
            ...options.env,
        },
        fetch,
        now: options.now ?? NOW,
    });
    const code = await run(createRegistry(), harness, "refresh", ...(options.args ?? []));
    return {
        code,
        json: JSON.parse(harness.stdout()),
        stderr: harness.stderr(),
        requests: fetch.requests,
    };
}

/** Looks into the database the command left behind. */
function inspect<T>(paths: RuntimePaths, look: (db: ReturnType<typeof openStore>["db"]) => T): T {
    const store = openStore(paths);
    try {
        return look(store.db);
    } finally {
        store.close();
    }
}

function counts(paths: RuntimePaths) {
    return inspect(paths, db => {
        const n = (table: string) =>
            (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
        return {
            songs: n("songs"),
            charts: n("charts"),
            versions: n("versions"),
            collections: n("collections"),
            locks: n("locks"),
        };
    });
}

/** One source's result, from a success and from a failure alike. */
function sourceOf(json: Envelope, name: string): SourceReport {
    const found = (json.ok ? json.data.sources : json.error.sources).find(
        report => report.source === name
    );
    if (!found) throw new Error(`the output has no result for ${name}`);
    return found;
}

describe("refresh", () => {
    it("downloads both sources and stores them", async () => {
        const paths = makeHome();
        const { code, json, requests } = await refresh(paths, routes());

        expect(code).toBe(0);
        expect(json).toMatchObject({ v: 1, ok: true, command: "refresh" });

        const [music, collections] = json.data.sources;
        expect(music).toMatchObject({
            source: "saltmeta",
            ok: true,
            songs: 50,
            charts: 183,
            versions: 20,
        });
        expect(music.fetchedAt).toMatch(TIME);
        expect(new Date(music.fetchedAt).getTime()).toBe(NOW.getTime());
        expect(music.mergedDuplicates.map((merged: { id: number }) => merged.id)).toEqual([
            100851, 100998,
        ]);
        expect(collections).toMatchObject({
            source: "lxns-collections",
            ok: true,
            counts: { trophy: 9, icon: 3, plate: 12, frame: 3 },
        });
        expect(new Date(collections.fetchedAt).getTime()).toBe(NOW.getTime());

        expect(counts(paths)).toEqual({
            songs: 50,
            charts: 183,
            versions: 20,
            collections: 27,
            locks: 0,
        });
        expect(requests.map(request => request.url).sort()).toEqual(
            [META_URL, ...(["trophy", "icon", "plate", "frame"] as const).map(listUrl)].sort()
        );
    });

    it("identifies itself with the user agent and keeps the raw documents in cache/", async () => {
        const paths = makeHome();
        const { requests } = await refresh(paths, routes());

        for (const request of requests) {
            expect(request.init?.headers).toMatchObject({ "User-Agent": "saltnet-cli/9.9.9" });
        }
        expect(readSnapshot(paths, "saltmeta")).toEqual(getFixtureSaltMetaCompacted());
        expect(readSnapshot(paths, "lxns-collections")).toEqual(getFixtureLXNSCollections());
    });

    it("can run again: it replaces the rows instead of adding to them", async () => {
        const paths = makeHome();
        await refresh(paths, routes(), { now: EARLIER });
        const second = await refresh(paths, routes(), { now: NOW });

        expect(second.code).toBe(0);
        expect(counts(paths)).toMatchObject({ songs: 50, charts: 183, collections: 27 });
        expect(new Date(sourceOf(second.json, "saltmeta").fetchedAt).getTime()).toBe(NOW.getTime());
    });

    it("refuses --offline before it touches the network or the disk", async () => {
        const paths = makeHome();
        const { code, json, requests } = await refresh(paths, routes(), { args: ["--offline"] });

        expect(code).toBe(2);
        expect(json.error).toMatchObject({ code: "USAGE" });
        expect(json.error.message).toContain("--offline");
        expect(requests).toEqual([]);
    });
});

describe("when one source fails", () => {
    it("still updates the other one, and says what happened to each", async () => {
        const paths = makeHome();
        const { code, json } = await refresh(
            paths,
            routes({ [META_URL]: textResponse("unavailable", 503) })
        );

        expect(code).toBe(5);
        expect(json.ok).toBe(false);
        expect(json.error).toMatchObject({ code: "UPSTREAM_ERROR", retryable: true });
        expect(json.error.message).toContain("曲库");
        expect(json.error.message).toContain("meta.test 返回了 HTTP 503");

        expect(sourceOf(json, "saltmeta")).toMatchObject({
            ok: false,
            error: { code: "UPSTREAM_ERROR", retryable: true },
            keptFetchedAt: null,
        });
        expect(sourceOf(json, "lxns-collections")).toMatchObject({ ok: true });
        expect(counts(paths)).toEqual({
            songs: 0,
            charts: 0,
            versions: 0,
            collections: 27,
            locks: 0,
        });
    });

    it("keeps the rows that were stored, and says when they are from", async () => {
        const paths = makeHome();
        await refresh(paths, routes(), { now: EARLIER });

        const { code, json } = await refresh(
            paths,
            routes({ [META_URL]: textResponse("gone", 404) }),
            { now: NOW }
        );

        expect(code).toBe(5);
        expect(json.error).toMatchObject({ code: "UPSTREAM_ERROR", retryable: false });
        expect(sourceOf(json, "saltmeta").keptFetchedAt).toBe(formatLocalTime(EARLIER));
        expect(new Date(sourceOf(json, "lxns-collections").fetchedAt).getTime()).toBe(
            NOW.getTime()
        );
        expect(counts(paths)).toMatchObject({ songs: 50, charts: 183, collections: 27 });
        expect(readSnapshot(paths, "saltmeta")).toEqual(getFixtureSaltMetaCompacted());
    });

    it("reports a connection that failed as NETWORK, naming only the host", async () => {
        const paths = makeHome();
        const { code, json } = await refresh(paths, routes({ [META_URL]: refusedConnection }));

        expect(code).toBe(5);
        expect(json.error).toMatchObject({ code: "NETWORK", retryable: true });
        expect(json.error.message).toContain("无法连接到 meta.test（ECONNREFUSED）");
        expect(json.error.message).not.toContain("saltmeta.json");
    });

    it("gives up on a request that outlasts metadata.timeoutMs", async () => {
        const paths = makeHome();
        const hang: Route = request =>
            new Promise((_resolve, reject) => {
                request.init?.signal?.addEventListener("abort", () =>
                    reject(request.init?.signal?.reason)
                );
            });
        const { code, json } = await refresh(paths, routes({ [META_URL]: hang }), {
            env: { SALTNET_METADATA_TIMEOUT_MS: "100" },
        });

        expect(code).toBe(5);
        expect(json.error).toMatchObject({ code: "NETWORK", retryable: true });
        expect(json.error.message).toContain("meta.test 超时（超过 100 毫秒 没有完成）");
        expect(sourceOf(json, "lxns-collections")).toMatchObject({ ok: true });
    });

    it("rejects a SaltMeta document of a format it does not know", async () => {
        const paths = makeHome();
        const { code, json } = await refresh(
            paths,
            routes({ [META_URL]: jsonResponse({ ...getFixtureSaltMetaCompacted(), version: 99 }) })
        );

        expect(code).toBe(5);
        expect(json.error).toMatchObject({ code: "UPSTREAM_ERROR", retryable: false });
        expect(json.error.message).toContain("格式版本是 99");
        expect(json.error.message).toContain("升级 saltnet");
        expect(counts(paths).songs).toBe(0);
    });

    it("rejects an answer that is not JSON", async () => {
        const paths = makeHome();
        const { code, json } = await refresh(
            paths,
            routes({ [META_URL]: textResponse("<html>maintenance</html>") })
        );

        expect(code).toBe(5);
        expect(json.error).toMatchObject({ code: "UPSTREAM_ERROR" });
        expect(json.error.message).toContain("meta.test 返回的内容不是合法的 JSON");
    });

    it("does not let a document without songs wipe the catalog", async () => {
        const paths = makeHome();
        await refresh(paths, routes(), { now: EARLIER });

        const empty = { ...getFixtureSaltMetaCompacted(), musics: [] };
        const { code, json } = await refresh(paths, routes({ [META_URL]: jsonResponse(empty) }));

        expect(code).toBe(5);
        expect(json.error.code).toBe("UPSTREAM_ERROR");
        expect(json.error.message).toContain("没有被替换");
        expect(counts(paths)).toMatchObject({ songs: 50, charts: 183 });
        expect(readSnapshot(paths, "saltmeta")).toEqual(getFixtureSaltMetaCompacted());
    });

    it("rejects a collection list that LXNS served in the wrong shape", async () => {
        const paths = makeHome();
        const { code, json } = await refresh(
            paths,
            routes({ [listUrl("plate")]: jsonResponse({ unexpected: [] }) })
        );

        expect(code).toBe(5);
        expect(json.error.code).toBe("UPSTREAM_ERROR");
        expect(json.error.message).toContain("收藏品");
        expect(sourceOf(json, "saltmeta")).toMatchObject({ ok: true });
        expect(counts(paths)).toMatchObject({ songs: 50, collections: 0 });
    });

    it("reports an LXNS list that answered with an error status", async () => {
        const paths = makeHome();
        const { code, json } = await refresh(
            paths,
            routes({ [listUrl("frame")]: textResponse("nope", 502) })
        );

        expect(code).toBe(5);
        expect(json.error).toMatchObject({ code: "UPSTREAM_ERROR", retryable: true });
        expect(json.error.message).toContain("lxns.test 返回了 HTTP 502");
    });

    it("does not let empty lists wipe the collections", async () => {
        const paths = makeHome();
        await refresh(paths, routes(), { now: EARLIER });

        const { code, json } = await refresh(
            paths,
            routes({
                [listUrl("trophy")]: jsonResponse({ trophies: [] }),
                [listUrl("icon")]: jsonResponse({ icons: [] }),
                [listUrl("plate")]: jsonResponse({ plates: [] }),
                [listUrl("frame")]: jsonResponse({ frames: [] }),
            }),
            { now: NOW }
        );

        expect(code).toBe(5);
        expect(json.error.message).toContain("是空的");
        expect(counts(paths).collections).toBe(27);
        expect(sourceOf(json, "lxns-collections").keptFetchedAt).toBe(formatLocalTime(EARLIER));
    });

    it("names both failures when both fail, and takes the code of the first", async () => {
        const paths = makeHome();
        const { code, json } = await refresh(
            paths,
            routes({
                [META_URL]: refusedConnection,
                [listUrl("icon")]: textResponse("nope", 500),
            })
        );

        expect(code).toBe(5);
        expect(json.error.code).toBe("NETWORK");
        expect(json.error.message).toContain("曲库（SaltMeta）：无法连接到 meta.test");
        expect(json.error.message).toContain("收藏品（落雪）：lxns.test 返回了 HTTP 500");
        expect(json.error.sources.map((source: { ok: boolean }) => source.ok)).toEqual([
            false,
            false,
        ]);
        expect(counts(paths)).toMatchObject({ songs: 0, collections: 0, locks: 0 });
    });
});

describe("the lock", () => {
    function hold(paths: RuntimePaths, at: Date, ttlMs: number) {
        const store = openStore(paths);
        const acquisition = acquireLock(store, METADATA_LOCK, { ttlMs, now: () => at.getTime() });
        expect(acquisition.acquired).toBe(true);
        return store;
    }

    it("makes a refresh refuse while another process is refreshing", async () => {
        const paths = makeHome();
        const other = hold(paths, NOW, 60_000);
        try {
            const { code, json, requests } = await refresh(paths, routes());

            expect(code).toBe(7);
            expect(json.error).toMatchObject({ code: "SYNC_IN_PROGRESS", retryable: true });
            expect(json.error.message).toContain(`pid ${process.pid}`);
            expect(json.error.holder).toEqual({ pid: process.pid, since: formatLocalTime(NOW) });
            expect(requests).toEqual([]);
        } finally {
            other.close();
        }
    });

    it("is taken over when its holder died and it expired", async () => {
        const paths = makeHome();
        hold(paths, EARLIER, 60_000).close();

        const { code } = await refresh(paths, routes());

        expect(code).toBe(0);
        expect(counts(paths)).toMatchObject({ songs: 50, locks: 0 });
    });

    it("is let go after a refresh that failed", async () => {
        const paths = makeHome();
        await refresh(paths, routes({ [META_URL]: refusedConnection }));
        expect(counts(paths).locks).toBe(0);
    });
});
