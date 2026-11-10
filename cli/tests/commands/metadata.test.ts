import type { RuntimePaths } from "../../src/runtime/paths";
import type { Route } from "../mockHttp";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { describe, expect, it } from "vitest";
import { useMetadata } from "../../src/commands/metadata";
import { buildRegistry, defineCommand } from "../../src/commands/registry";
import { formatLocalTime } from "../../src/util/time";
import { createHarness, run } from "../harness";
import { jsonResponse, mockFetch } from "../mockHttp";
import { useTempHome } from "../tempHome";

const META_URL = "https://meta.test/saltmeta.json";
const LXNS_URL = "https://lxns.test";
const HOUR = 3_600_000;
const NOW = new Date("2026-11-11T01:00:00Z");
const ago = (hours: number): Date => new Date(NOW.getTime() - hours * HOUR);

/** A command that reads the catalog and reports what it got, the way real commands will. */
const probe = defineCommand(
    {
        name: "probe",
        summary: "reads the songs",
        category: "catalog",
        effect: "none",
        output: "object",
    },
    async (args, ctx) => {
        const metadata = await useMetadata(args, ctx, ["catalog"]);
        return {
            data: { songs: Object.keys(metadata.catalog.music.musicList).length },
            meta: { dataAsOf: metadata.dataAsOf },
            warnings: metadata.warnings,
        };
    }
);

const registry = buildRegistry({ commands: [probe] });

function routes(overrides: Record<string, Route> = {}): Record<string, Route> {
    const lists = getFixtureLXNSCollections();
    const list = (kind: string) => `${LXNS_URL}/api/v0/maimai/${kind}/list?required=true`;
    return {
        [META_URL]: jsonResponse(getFixtureSaltMetaCompacted()),
        [list("trophy")]: jsonResponse({ trophies: lists.trophies }),
        [list("icon")]: jsonResponse({ icons: lists.icons }),
        [list("plate")]: jsonResponse({ plates: lists.plates }),
        [list("frame")]: jsonResponse({ frames: lists.frames }),
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

interface Printed {
    ok: boolean;
    command: string;
    data: { songs: number };
    meta: { dataAsOf: { catalog: string } };
    warnings: { code: string; message: string; fix?: string }[];
    error: { code: string; message: string; fix?: string; retryable: boolean };
}

/** Runs `saltnet probe ...` in `paths`, at `now`, against the given network. */
async function probeIn(
    paths: RuntimePaths,
    options: { now?: Date; network?: Record<string, Route>; args?: string[] } = {}
) {
    const fetch = mockFetch(options.network ?? routes());
    const harness = createHarness({
        env: {
            SALTNET_HOME: paths.home,
            SALTNET_SALTMETA_URL: META_URL,
            SALTNET_LXNS_BASE_URL: LXNS_URL,
        },
        fetch,
        now: options.now ?? NOW,
    });
    const code = await run(registry, harness, "probe", ...(options.args ?? []));
    return { code, json: JSON.parse(harness.stdout()) as Printed, requests: fetch.requests };
}

describe("a command that reads the catalog", () => {
    it("gets it downloaded on first use, with the time it is from in meta.dataAsOf", async () => {
        const paths = makeHome();

        const { code, json, requests } = await probeIn(paths);

        expect(code).toBe(0);
        expect(json).toMatchObject({
            v: 1,
            ok: true,
            command: "probe",
            data: { songs: 50 },
            meta: { dataAsOf: { catalog: formatLocalTime(NOW) } },
            warnings: [],
        });
        expect(requests.map(request => request.url)).toEqual([META_URL]);
    });

    it("reads what is stored without asking the network while it is fresh", async () => {
        const paths = makeHome();
        await probeIn(paths, { now: ago(2) });

        const { json, requests } = await probeIn(paths);

        expect(requests).toEqual([]);
        expect(json.data.songs).toBe(50);
        expect(json.meta.dataAsOf.catalog).toBe(formatLocalTime(ago(2)));
        expect(json.warnings).toEqual([]);
    });

    it("refreshes what is stale before reading it", async () => {
        const paths = makeHome();
        await probeIn(paths, { now: ago(30) });

        const { json, requests } = await probeIn(paths);

        expect(requests.map(request => request.url)).toEqual([META_URL]);
        expect(json.meta.dataAsOf.catalog).toBe(formatLocalTime(NOW));
        expect(json.warnings).toEqual([]);
    });

    it("carries a warning in its result when the refresh fails", async () => {
        const paths = makeHome();
        await probeIn(paths, { now: ago(30) });

        const { code, json } = await probeIn(paths, {
            network: routes({ [META_URL]: refusedConnection }),
        });

        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expect(json.meta.dataAsOf.catalog).toBe(formatLocalTime(ago(30)));
        expect(json.warnings).toHaveLength(1);
        expect(json.warnings[0]).toMatchObject({ code: "STALE_METADATA", fix: "saltnet refresh" });
    });

    it("fails with NETWORK when nothing is stored and the download fails", async () => {
        const paths = makeHome();

        const { code, json } = await probeIn(paths, {
            network: routes({ [META_URL]: refusedConnection }),
        });

        expect(code).toBe(5);
        expect(json).toMatchObject({ ok: false, command: "probe", error: { code: "NETWORK" } });
    });
});

describe("--offline", () => {
    it("is OFFLINE_NO_CACHE on a fresh data directory, without touching the network", async () => {
        const paths = makeHome();

        const { code, json, requests } = await probeIn(paths, { args: ["--offline"] });

        expect(code).toBe(5);
        expect(json).toMatchObject({
            ok: false,
            error: { code: "OFFLINE_NO_CACHE", fix: "saltnet refresh", retryable: false },
        });
        expect(requests).toEqual([]);
    });

    it("uses stale data and warns", async () => {
        const paths = makeHome();
        await probeIn(paths, { now: ago(30) });

        const { code, json, requests } = await probeIn(paths, { args: ["--offline"] });

        expect(code).toBe(0);
        expect(requests).toEqual([]);
        expect(json.data.songs).toBe(50);
        expect(json.warnings.map(warning => warning.code)).toEqual(["STALE_METADATA"]);
        expect(json.warnings[0].message).toContain("--offline");
    });

    it("says nothing when the data is fresh", async () => {
        const paths = makeHome();
        await probeIn(paths, { now: ago(1) });

        const { json, requests } = await probeIn(paths, { args: ["--offline"] });

        expect(requests).toEqual([]);
        expect(json.warnings).toEqual([]);
    });
});
