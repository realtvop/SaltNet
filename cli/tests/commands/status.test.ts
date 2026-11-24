import type { User } from "@core/user/type";
import type { PrintedOutput } from "../commandRun";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCredentials } from "../../src/runtime/credentials";
import { MIGRATIONS } from "../../src/store/migrations";
import { openStore } from "../../src/store/store";
import { saveUser } from "../../src/users/repository";
import { splitCommandLine } from "../../src/util/shell";
import { formatLocalTime } from "../../src/util/time";
import { commandIn, NOW } from "../commandRun";
import { parsePrintedCommand } from "../printedCommand";
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
    users: {
        staleDays: number;
        items: {
            index: number;
            uid: string;
            name: string;
            scoresUpdatedAt: string | null;
            scoresState: string;
            credentials: {
                divingFish: string;
                lxns: string;
                lxnsRefreshExpiresAt: string | null;
            };
        }[];
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

function makeStatusUser(uid: string, name: string, lxnsId?: number | null): User {
    return {
        uid,
        remark: name,
        divingFish: { name: `fish-${uid}`, importToken: null },
        ...(lxnsId === undefined ? {} : { lxns: { id: lxnsId, name: `lxns-${name}`, auth: null } }),
        inGame: { id: 100, name: `game-${uid}`, enabled: true, useFastUpdate: true },
        settings: { manuallyUpdate: false },
        data: { updateTime: null, name: null, rating: null },
    };
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
            users: { staleDays: 3, items: [] },
            mergedDuplicates: [],
        });
        expect(res.json.meta).toEqual({ dataAsOf: {} });

        expect(Object.keys(res.json.data)).toEqual([
            "version",
            "home",
            "database",
            "metadata",
            "users",
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

    it("reports user credential state for every combination, emits warnings for expiring and expired, and leaks no tokens", async () => {
        const paths = makeHome();
        const store = openStore(paths);

        const nowMs = new Date("2026-03-01T12:00:00+08:00").getTime();
        const testNow = new Date(nowMs);

        // 30 days = 2592000000 ms
        const lifetimeMs = 30 * 24 * 60 * 60 * 1000;

        // u1: valid (> 3 days left, e.g. issued 10 days ago, 20 days left)
        const u1Issued = nowMs - 10 * 24 * 60 * 60 * 1000;
        const u1Expires = u1Issued + lifetimeMs;
        saveUser(store, makeStatusUser("u1", "Alice", 1001));

        // u2: expiring (< 3 days left, e.g. issued 28 days ago, 2 days left)
        const u2Issued = nowMs - 28 * 24 * 60 * 60 * 1000;
        const u2Expires = u2Issued + lifetimeMs;
        saveUser(store, makeStatusUser("u2", "Bob", 1002));

        // u3: expired (issued 31 days ago, expired 1 day ago)
        const u3Issued = nowMs - 31 * 24 * 60 * 60 * 1000;
        const u3Expires = u3Issued + lifetimeMs;
        saveUser(store, makeStatusUser("u3", "Charlie", 1003));

        // u4: unknown (has valid authorization for account, but no lxnsIssuedAt)
        saveUser(store, makeStatusUser("u4", "Dave", 1004));

        // u5: missing (has user in db with lxnsId 1005, but credentials has authorization for 9999)
        saveUser(store, makeStatusUser("u5", "Eve", 1005));

        // u6: missing (no credentials entry at all)
        saveUser(store, makeStatusUser("u6", "Frank", 1006));

        store.close();

        const fakeDfToken1 = "FAKE-DF-IMPORT-TOKEN-0001";
        const fakeDfToken4 = "FAKE-DF-IMPORT-TOKEN-0004";
        const fakeAccessToken = "FAKE-LXNS-ACCESS-TOKEN-0001";
        const fakeRefreshToken = "FAKE-LXNS-REFRESH-TOKEN-0001";

        const creds = {
            version: 1,
            users: {
                u1: {
                    divingFishImportToken: fakeDfToken1,
                    lxnsAuthorization: {
                        accessToken: fakeAccessToken,
                        refreshToken: fakeRefreshToken,
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: u1Issued,
                },
                u2: {
                    divingFishImportToken: "", // empty string -> missing
                    lxnsAuthorization: {
                        accessToken: fakeAccessToken,
                        refreshToken: fakeRefreshToken,
                    },
                    lxnsAccountId: 1002,
                    lxnsIssuedAt: u2Issued,
                },
                u3: {
                    divingFishImportToken: null, // null -> missing
                    lxnsAuthorization: {
                        accessToken: fakeAccessToken,
                        refreshToken: fakeRefreshToken,
                    },
                    lxnsAccountId: 1003,
                    lxnsIssuedAt: u3Issued,
                },
                u4: {
                    divingFishImportToken: fakeDfToken4,
                    lxnsAuthorization: {
                        accessToken: fakeAccessToken,
                        refreshToken: fakeRefreshToken,
                    },
                    lxnsAccountId: 1004,
                    // no lxnsIssuedAt
                },
                u5: {
                    lxnsAuthorization: {
                        accessToken: fakeAccessToken,
                        refreshToken: fakeRefreshToken,
                    },
                    lxnsAccountId: 9999, // Mismatched account
                    lxnsIssuedAt: u1Issued,
                },
            },
        };

        writeFileSync(paths.credentials, `${JSON.stringify(creds, null, 2)}\n`, "utf8");

        const res = await statusIn(paths, [], { now: testNow });
        expect(res.code).toBe(0);

        // Check user credential states
        const items = res.json.data.users.items;
        expect(items.length).toBe(6);

        // u1: valid, divingFish: present
        expect(items[0].uid).toBe("u1");
        expect(items[0].credentials).toEqual({
            divingFish: "present",
            lxns: "valid",
            lxnsRefreshExpiresAt: formatLocalTime(new Date(u1Expires)),
        });

        // u2: expiring, divingFish: missing
        expect(items[1].uid).toBe("u2");
        expect(items[1].credentials).toEqual({
            divingFish: "missing",
            lxns: "expiring",
            lxnsRefreshExpiresAt: formatLocalTime(new Date(u2Expires)),
        });

        // u3: expired, divingFish: missing
        expect(items[2].uid).toBe("u3");
        expect(items[2].credentials).toEqual({
            divingFish: "missing",
            lxns: "expired",
            lxnsRefreshExpiresAt: formatLocalTime(new Date(u3Expires)),
        });

        // u4: unknown, divingFish: present
        expect(items[3].uid).toBe("u4");
        expect(items[3].credentials).toEqual({
            divingFish: "present",
            lxns: "unknown",
            lxnsRefreshExpiresAt: null,
        });

        // u5: missing (account mismatch), divingFish: missing
        expect(items[4].uid).toBe("u5");
        expect(items[4].credentials).toEqual({
            divingFish: "missing",
            lxns: "missing",
            lxnsRefreshExpiresAt: null,
        });

        // u6: missing, divingFish: missing
        expect(items[5].uid).toBe("u6");
        expect(items[5].credentials).toEqual({
            divingFish: "missing",
            lxns: "missing",
            lxnsRefreshExpiresAt: null,
        });

        // Verify warnings: exactly 2 warnings for u2 and u3
        const warnings = res.json.warnings;
        expect(warnings.length).toBe(2);

        expect(warnings[0].code).toBe("LXNS_EXPIRING");
        expect(warnings[0].message).toContain("Bob");
        expect(warnings[0].message).toContain(formatLocalTime(new Date(u2Expires)));
        expect(warnings[0].fix).toBe("saltnet user bind u2 lxns");

        expect(warnings[1].code).toBe("LXNS_EXPIRING");
        expect(warnings[1].message).toContain("Charlie");
        expect(warnings[1].message).toContain(formatLocalTime(new Date(u3Expires)));
        expect(warnings[1].fix).toBe("saltnet user bind u3 lxns");

        // Verify no secrets appear in output
        expect(res.stdout).not.toContain(fakeDfToken1);
        expect(res.stdout).not.toContain(fakeDfToken4);
        expect(res.stdout).not.toContain(fakeAccessToken);
        expect(res.stdout).not.toContain(fakeRefreshToken);
    });

    it("fails with INTERNAL and fix when credentials.json is corrupt", async () => {
        const paths = makeHome();
        mkdirSync(paths.home, { recursive: true });
        writeFileSync(paths.credentials, "{ invalid json", "utf8");

        const res = await commandIn(paths, "status", []);
        expect(res.code).toBe(1);
        expect(res.json.error.code).toBe("INTERNAL");
        expect(res.json.error.fix).toBe(
            `检查 ${paths.credentials}；修不好时可以把它移走，再重新绑定水鱼和落雪`
        );
    });

    it("names default user with 0 in LXNS_EXPIRING warning fix", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        saveUser(store, makeStatusUser("u0", "Alice", 1000));
        store.close();

        const testNow = new Date("2026-06-01T12:00:00Z");
        // Issued 29 days ago (expires in 1 day < 3 days warn days -> expiring)
        const issued = testNow.getTime() - 29 * 24 * 60 * 60 * 1000;
        const creds = {
            version: 1,
            users: {
                u0: {
                    lxnsAuthorization: {
                        accessToken: "FAKE-TOKEN",
                        refreshToken: "FAKE-REFRESH",
                    },
                    lxnsAccountId: 1000,
                    lxnsIssuedAt: issued,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(creds, null, 2)}\n`, "utf8");

        const res = await statusIn(paths, [], { now: testNow });
        expect(res.code).toBe(0);
        expect(res.json.warnings.length).toBe(1);
        expect(res.json.warnings[0].code).toBe("LXNS_EXPIRING");
        expect(res.json.warnings[0].fix).toBe("saltnet user bind 0 lxns");
    });

    it("prints an LXNS_EXPIRING fix that runs as printed for a uid that starts with -", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        saveUser(store, makeStatusUser("u0", "Alice", 1000));
        saveUser(store, makeStatusUser("-u1 dash", "Bob", 1001));
        store.close();

        const testNow = new Date("2026-06-01T12:00:00Z");
        const issued = testNow.getTime() - 29 * 24 * 60 * 60 * 1000;
        const creds = {
            version: 1,
            users: {
                "-u1 dash": {
                    lxnsAuthorization: { accessToken: "FAKE-TOKEN", refreshToken: "FAKE-REFRESH" },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: issued,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(creds, null, 2)}\n`, "utf8");

        const res = await statusIn(paths, [], { now: testNow });
        expect(res.json.warnings).toHaveLength(1);
        expect(res.json.warnings[0].fix).toBe("saltnet user bind -- '-u1 dash' lxns");
        expect(parsePrintedCommand(res.json.warnings[0].fix)).toMatchObject({
            command: "user bind",
            positionals: { user: "-u1 dash", source: "lxns" },
        });
    });

    it("respects lxns.refreshTokenDays changed via environment variable or config.json", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        saveUser(store, makeStatusUser("u1", "Alice", 1001));
        store.close();

        const testNow = new Date("2026-06-01T12:00:00Z");
        // Issued 15 days ago: under default 30 days, valid (15 days left).
        const issued = testNow.getTime() - 15 * 24 * 60 * 60 * 1000;
        const creds = {
            version: 1,
            users: {
                u1: {
                    lxnsAuthorization: {
                        accessToken: "FAKE-TOKEN",
                        refreshToken: "FAKE-REFRESH",
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: issued,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(creds, null, 2)}\n`, "utf8");

        // Default 30 days: valid
        const resDefault = await statusIn(paths, [], { now: testNow });
        expect(resDefault.json.data.users.items[0].credentials.lxns).toBe("valid");

        // Change refreshTokenDays to 10 via env var: 15 days ago is now expired
        const resEnv = await statusIn(paths, [], {
            now: testNow,
            env: { SALTNET_LXNS_REFRESH_TOKEN_DAYS: "10" },
        });
        expect(resEnv.json.data.users.items[0].credentials.lxns).toBe("expired");

        // Change refreshTokenDays to 10 via config.json
        writeFileSync(paths.config, JSON.stringify({ lxns: { refreshTokenDays: 10 } }), "utf8");
        const resFile = await statusIn(paths, [], { now: testNow });
        expect(resFile.json.data.users.items[0].credentials.lxns).toBe("expired");
    });

    it("respects lxns.expiringWarnDays changed via environment variable or config.json", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        saveUser(store, makeStatusUser("u1", "Alice", 1001));
        store.close();

        const testNow = new Date("2026-06-01T12:00:00Z");
        // Issued 25 days ago (5 days left out of 30): under default 3 warn days, valid.
        const issued = testNow.getTime() - 25 * 24 * 60 * 60 * 1000;
        const creds = {
            version: 1,
            users: {
                u1: {
                    lxnsAuthorization: {
                        accessToken: "FAKE-TOKEN",
                        refreshToken: "FAKE-REFRESH",
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: issued,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(creds, null, 2)}\n`, "utf8");

        // Default 3 warn days: valid, no warning
        const resDefault = await statusIn(paths, [], { now: testNow });
        expect(resDefault.json.data.users.items[0].credentials.lxns).toBe("valid");
        expect(resDefault.json.warnings).toHaveLength(0);

        // Change expiringWarnDays to 7 via env var: 5 days left < 7 -> expiring
        const resEnv = await statusIn(paths, [], {
            now: testNow,
            env: { SALTNET_LXNS_EXPIRING_WARN_DAYS: "7" },
        });
        expect(resEnv.json.data.users.items[0].credentials.lxns).toBe("expiring");
        expect(resEnv.json.warnings.length).toBe(1);
        expect(resEnv.json.warnings[0].code).toBe("LXNS_EXPIRING");

        // Change expiringWarnDays to 7 via config.json
        writeFileSync(paths.config, JSON.stringify({ lxns: { expiringWarnDays: 7 } }), "utf8");
        const resFile = await statusIn(paths, [], { now: testNow });
        expect(resFile.json.data.users.items[0].credentials.lxns).toBe("expiring");
        expect(resFile.json.warnings.length).toBe(1);
        expect(resFile.json.warnings[0].code).toBe("LXNS_EXPIRING");
    });
});

it.each(["2", "uid:2"])("uses exact uid references in the status fix for %s", async uid => {
    const paths = makeHome();
    const store = openStore(paths);
    saveUser(store, makeStatusUser("default", "Alice"));
    saveUser(store, makeStatusUser(uid, "Bob", 1001));
    saveUser(store, makeStatusUser("other", "Charlie"));
    store.close();

    writeFileSync(
        paths.credentials,
        JSON.stringify({
            version: 1,
            users: {
                [uid]: {
                    lxnsAuthorization: {
                        accessToken: "fake-expiring-access",
                        refreshToken: "fake-expiring-refresh",
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: NOW.getTime() - 29 * 86_400_000,
                },
            },
        })
    );
    const status = await statusIn(paths, []);
    const fix = status.json.warnings.find(warning => warning.code === "LXNS_EXPIRING")?.fix;
    expect(parsePrintedCommand(fix).positionals.user).toBe(`uid:${uid}`);
    const started = await commandIn(paths, "user", splitCommandLine(fix!).slice(2), {
        env: {
            SALTNET_LXNS_CLIENT_ID: "fake-client",
            SALTNET_LXNS_REDIRECT_URI: "https://callback.test",
        },
    });
    expect(started.code).toBe(0);
    expect(Object.values(readCredentials(paths).pendingLxnsAuthorizations ?? {})).toMatchObject([
        { userUid: uid },
    ]);
    expect(
        (await commandIn(paths, "rating", ["--user", `uid:${uid}`])).json.meta.user
    ).toMatchObject({ uid, index: 1 });
    expect((await commandIn(paths, "rating", ["--user", "2"])).json.meta.user).toMatchObject({
        uid: "other",
        index: 2,
    });
    expect((await commandIn(paths, "rating", ["--user", "uid:missing"])).json.error.code).toBe(
        "NOT_FOUND"
    );
});
