import type { PrintedOutput } from "../commandRun";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "../../src/store/migrations";
import { openStore } from "../../src/store/store";
import { formatLocalTime } from "../../src/util/time";
import { commandIn, NOW } from "../commandRun";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

interface StatusCatalog {
    source: string;
    label: string;
    state: string;
    fetchedAt: string | null;
    ageHours: number | null;
    upstreamVersion: string | null;
    counts: Record<string, number> | null;
}

interface StatusData {
    version: string;
    home: string;
    database: {
        exists: boolean;
        schemaVersion: number | null;
    };
    metadata: {
        maxAgeHours: number;
        catalog: StatusCatalog;
        collections: StatusCatalog;
    };
    mergedDuplicates: { id: number; title: string; mergedTitles: string[] }[];
}

interface StatusOutput extends Omit<PrintedOutput, "data"> {
    data: StatusData;
    meta: {
        dataAsOf: Record<string, string>;
    };
}

interface Printed<Output> {
    code: number;
    json: Output;
    stdout: string;
    requests: { url: string }[];
}

async function statusIn(
    paths: ReturnType<typeof makeHome>,
    args: string[] = [],
    options?: Parameters<typeof commandIn>[3]
) {
    const res = await commandIn(paths, "status", args, options);
    return res as unknown as Printed<StatusOutput>;
}

describe("status command", () => {
    it("reports fresh-directory status, does not create home or make requests, and checks key orders", async () => {
        const paths = makeHome();
        const res = await statusIn(paths);

        expect(res.code).toBe(0);
        expect(res.requests).toEqual([]);
        expect(existsSync(paths.home)).toBe(false);

        expect(res.json.data).toEqual({
            version: "9.9.9",
            home: paths.home,
            database: { exists: false, schemaVersion: null },
            metadata: {
                maxAgeHours: 24,
                catalog: {
                    source: "saltmeta",
                    label: "曲库（SaltMeta）",
                    state: "missing",
                    fetchedAt: null,
                    ageHours: null,
                    upstreamVersion: null,
                    counts: null,
                },
                collections: {
                    source: "lxns-collections",
                    label: "收藏品（落雪）",
                    state: "missing",
                    fetchedAt: null,
                    ageHours: null,
                    upstreamVersion: null,
                    counts: null,
                },
            },
            mergedDuplicates: [],
        });
        expect(res.json.meta).toEqual({ dataAsOf: {} });

        expect(Object.keys(res.json.data)).toEqual([
            "version",
            "home",
            "database",
            "metadata",
            "mergedDuplicates",
        ]);
        expect(Object.keys(res.json.data.metadata)).toEqual([
            "maxAgeHours",
            "catalog",
            "collections",
        ]);
        expect(Object.keys(res.json.data.metadata.catalog)).toEqual([
            "source",
            "label",
            "state",
            "fetchedAt",
            "ageHours",
            "upstreamVersion",
            "counts",
        ]);
        expect(Object.keys(res.json.data.database)).toEqual(["exists", "schemaVersion"]);
    });

    it("reports populated status after refresh, with repeated status matching exactly", async () => {
        const paths = makeHome();
        await commandIn(paths, "refresh", []);

        const expectedCatalog = {
            source: "saltmeta",
            label: "曲库（SaltMeta）",
            state: "fresh",
            fetchedAt: formatLocalTime(NOW),
            ageHours: 0,
            upstreamVersion: "1",
            counts: { songs: 50, charts: 183, versions: 20 },
        };
        const expectedCollections = {
            source: "lxns-collections",
            label: "收藏品（落雪）",
            state: "fresh",
            fetchedAt: formatLocalTime(NOW),
            ageHours: 0,
            upstreamVersion: null,
            counts: { title: 9, icon: 3, plate: 12, frame: 3 },
        };
        const expectedMerged = [
            {
                id: 100851,
                title: "[幸]犬日和。(はっぴー歌唱Ver)",
                mergedTitles: ["犬日和。(はっぴー歌唱Ver)"],
            },
            {
                id: 100998,
                title: "[宴]Oshama Scramble! (Cranky Remix)",
                mergedTitles: ["Oshama Scramble! (Cranky Remix)"],
            },
        ];

        const res1 = await statusIn(paths);
        expect(res1.code).toBe(0);
        expect(res1.requests).toEqual([]);
        expect(res1.json.data.database).toEqual({ exists: true, schemaVersion: MIGRATIONS.length });
        expect(res1.json.data.metadata.catalog).toEqual(expectedCatalog);
        expect(res1.json.data.metadata.collections).toEqual(expectedCollections);
        expect(res1.json.data.mergedDuplicates).toEqual(expectedMerged);
        expect(res1.json.meta.dataAsOf).toEqual({
            catalog: formatLocalTime(NOW),
            collections: formatLocalTime(NOW),
        });

        const res2 = await statusIn(paths);
        expect(res2.json).toEqual(res1.json);
    });

    it("calculates ageHours and transitions across stale boundaries", async () => {
        const paths = makeHome();
        await commandIn(paths, "refresh", []);

        // 90 minutes after NOW
        const res90m = await statusIn(paths, [], {
            now: new Date(NOW.getTime() + 90 * 60 * 1000),
        });
        expect(res90m.json.data.metadata.catalog.ageHours).toBe(1.5);
        expect(res90m.json.data.metadata.catalog.state).toBe("fresh");
        expect(res90m.json.data.metadata.collections.ageHours).toBe(1.5);
        expect(res90m.json.data.metadata.collections.state).toBe("fresh");

        // Exactly at NOW + 24 h: both stale, ageHours 24, meta.dataAsOf still download time, warnings []
        const res24h = await statusIn(paths, [], {
            now: new Date(NOW.getTime() + 24 * 3600 * 1000),
        });
        expect(res24h.json.data.metadata.catalog.state).toBe("stale");
        expect(res24h.json.data.metadata.catalog.ageHours).toBe(24);
        expect(res24h.json.data.metadata.collections.state).toBe("stale");
        expect(res24h.json.data.metadata.collections.ageHours).toBe(24);
        expect(res24h.json.meta.dataAsOf).toEqual({
            catalog: formatLocalTime(NOW),
            collections: formatLocalTime(NOW),
        });
        expect(res24h.json.warnings).toEqual([]);

        // NOW + 24 h - 1 s: fresh, ageHours 24
        const res24hMinus1s = await statusIn(paths, [], {
            now: new Date(NOW.getTime() + 24 * 3600 * 1000 - 1000),
        });
        expect(res24hMinus1s.json.data.metadata.catalog.state).toBe("fresh");
        expect(res24hMinus1s.json.data.metadata.catalog.ageHours).toBe(24);
        expect(res24hMinus1s.json.data.metadata.collections.state).toBe("fresh");

        // 1 hour before NOW: ageHours 0, fresh
        const resBefore = await statusIn(paths, [], {
            now: new Date(NOW.getTime() - 3600 * 1000),
        });
        expect(resBefore.json.data.metadata.catalog.ageHours).toBe(0);
        expect(resBefore.json.data.metadata.catalog.state).toBe("fresh");
    });

    it("respects SALTNET_METADATA_MAX_AGE_HOURS overrides", async () => {
        const paths = makeHome();
        await commandIn(paths, "refresh", []);

        // maxAgeHours = 1: fresh at NOW + 59 min, stale at NOW + 1 h
        const env1h = { SALTNET_METADATA_MAX_AGE_HOURS: "1" };
        const res59m = await statusIn(paths, [], {
            now: new Date(NOW.getTime() + 59 * 60 * 1000),
            env: env1h,
        });
        expect(res59m.json.data.metadata.maxAgeHours).toBe(1);
        expect(res59m.json.data.metadata.catalog.state).toBe("fresh");

        const res1h = await statusIn(paths, [], {
            now: new Date(NOW.getTime() + 60 * 60 * 1000),
            env: env1h,
        });
        expect(res1h.json.data.metadata.catalog.state).toBe("stale");

        // maxAgeHours = 0: stale at NOW
        const res0h = await statusIn(paths, [], {
            now: NOW,
            env: { SALTNET_METADATA_MAX_AGE_HOURS: "0" },
        });
        expect(res0h.json.data.metadata.maxAgeHours).toBe(0);
        expect(res0h.json.data.metadata.catalog.state).toBe("stale");
        expect(res0h.json.data.metadata.collections.state).toBe("stale");
    });

    it("handles other-version builder and deleted rows in database", async () => {
        const paths = makeHome();
        await commandIn(paths, "refresh", []);

        // Change builder of catalog row
        const store1 = openStore(paths);
        store1.db
            .prepare("UPDATE meta_state SET builder = ? WHERE source = ?")
            .run("catalog-0/old", "saltmeta");
        store1.close();

        const resOther = await statusIn(paths);
        expect(resOther.json.data.metadata.catalog.state).toBe("other-version");
        expect(resOther.json.data.metadata.catalog.fetchedAt).toBe(formatLocalTime(NOW));
        expect(resOther.json.data.metadata.catalog.counts).toEqual({
            songs: 50,
            charts: 183,
            versions: 20,
        });
        expect(resOther.json.data.metadata.collections.state).toBe("fresh");

        // Delete collections row
        const store2 = openStore(paths);
        store2.db.prepare("DELETE FROM meta_state WHERE source = 'lxns-collections'").run();
        store2.close();

        const resDeleted = await statusIn(paths);
        expect(resDeleted.json.data.metadata.collections.state).toBe("missing");
        expect(resDeleted.json.meta.dataAsOf).toEqual({
            catalog: formatLocalTime(NOW),
        });
    });

    it("handles database file existing with empty tables, and config-set only home", async () => {
        // Case 1: database file exists with empty tables
        const pathsDb = makeHome();
        const store = openStore(pathsDb);
        store.close();

        const resDb = await statusIn(pathsDb);
        expect(resDb.json.data.database).toEqual({
            exists: true,
            schemaVersion: MIGRATIONS.length,
        });
        expect(resDb.json.data.metadata.catalog.state).toBe("missing");
        expect(resDb.json.data.metadata.collections.state).toBe("missing");
        expect(resDb.json.meta.dataAsOf).toEqual({});

        // Case 2: home created only by config set has no database
        const pathsConfig = makeHome();
        await commandIn(pathsConfig, "config", ["set", "metadata.maxAgeHours", "12"]);
        const resConfig = await statusIn(pathsConfig);
        expect(resConfig.json.data.database).toEqual({ exists: false, schemaVersion: null });
    });

    it("status --offline gives the same data as without", async () => {
        const paths = makeHome();
        await commandIn(paths, "refresh", []);

        const resNormal = await statusIn(paths);
        const resOffline = await statusIn(paths, ["--offline"]);
        expect(resOffline.json.data).toEqual(resNormal.json.data);
    });

    it("renders text format with expected headers", async () => {
        const paths = makeHome();
        await commandIn(paths, "refresh", []);

        const res = await commandIn(paths, "status", ["--format", "text"]);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain("database:");
        expect(res.stdout).toContain("state: fresh");
    });

    it("aborts on broken configuration with USAGE error and creates nothing", async () => {
        const paths = makeHome();
        const res = await statusIn(paths, [], {
            env: { SALTNET_METADATA_MAX_AGE_HOURS: "abc" },
        });

        expect(res.code).toBe(2);
        expect(res.json.error.code).toBe("USAGE");
        expect(res.json.error.message.startsWith("配置有错误，命令没有运行：")).toBe(true);
        expect(res.json.error.fix).toBe("saltnet config list");
        expect(existsSync(paths.home)).toBe(false);
    });

    it("renders indented JSON, four spaces to a level, for --pretty", async () => {
        const paths = makeHome();
        const res = await commandIn(paths, "status", ["--pretty"]);
        expect(res.code).toBe(0);
        // The envelope's own keys sit one level in, the keys of `data` two levels.
        expect(res.stdout).toContain('\n    "v": 1,');
        expect(res.stdout).toContain('\n        "version": "9.9.9",');
        expect(res.stdout.endsWith("}\n")).toBe(true);
    });
});
