import type { DetailedData, User } from "@core/user/type";
import type { RuntimePaths } from "../../src/runtime/paths";
import type { RecordedRequest, Route } from "../mockHttp";
import { Buffer } from "node:buffer";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isUtageGrade } from "@core/chart/difficulty";
import { describe, expect, it } from "vitest";
import { createRegistry } from "../../src/commands";
import { readCredentials, stageCredentials } from "../../src/runtime/credentials";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import { readRuns } from "../../src/sync/journal";
import { readScoreEvents, readUsers } from "../../src/users/repository";
import { commandIn, LXNS_URL, NOW, routes } from "../commandRun";
import { expectConforms } from "../dataSchema";
import { jsonResponse, textResponse } from "../mockHttp";
import {
    allFixtureRecords,
    b50User,
    recordOf,
    scoreEvent,
    seedScoreUsers,
    user,
} from "../scoreUsers";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();
const registry = createRegistry();
const syncSchema = registry.find("sync")!.spec.dataSchema!;

const FAKE_DF_TOKEN = "FAKE-DF-TOKEN-0001";
const FAKE_LXNS_TOKEN = "FAKE-LXNS-JWT-TOKEN-0001";
const DF_RECORDS_URL = "https://www.diving-fish.com/api/maimaidxprober/player/records";
const DF_QUERY_URL = "https://www.diving-fish.com/api/maimaidxprober/query/player";
const LXNS_PLAYER_URL = `${LXNS_URL}/api/v0/user/maimai/player`;
const LXNS_SCORES_URL = `${LXNS_URL}/api/v0/user/maimai/player/scores`;
const SALTNET_API_URL = "https://api.test";
const SALTNET_DF_URL = `${SALTNET_API_URL}/updateUserFromDF`;

function makeFakeJwt(id: number, name: string, expSeconds: number): string {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ id, name, exp: expSeconds })).toString(
        "base64url"
    );
    return `${header}.${payload}.FAKE_SIG`;
}

function seedCredentials(
    paths: RuntimePaths,
    users: Record<
        string,
        {
            divingFishImportToken?: string | null;
            lxnsAuthorization?: {
                accessToken: string;
                tokenType: string;
                expiresAt?: number | null;
                refreshToken?: string;
                scope?: string;
            } | null;
            lxnsAccountId?: number | null;
            lxnsIssuedAt?: number | null;
        }
    >
): void {
    const staged = stageCredentials(paths, { version: 1, users });
    staged.commit();
}

function sampleUser(uid: string, name: string): User {
    const u = user(uid, name, {
        rating: 14000,
        updateTime: 1_000_000,
    });
    u.divingFish = { name: "df-player", importToken: null };
    u.lxns = { id: 1001, name: "lxns-player", auth: null };
    return u;
}

function readAllFiles(dir: string): { content: string; path: string }[] {
    const results: { content: string; path: string }[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...readAllFiles(fullPath));
        } else if (entry.isFile()) {
            results.push({ content: readFileSync(fullPath).toString("utf8"), path: fullPath });
        }
    }
    return results;
}

describe("saltnet sync", () => {
    it("rejects --offline as USAGE without network requests", async () => {
        const paths = makeHome();
        const result = await commandIn(paths, "sync", ["--offline"]);
        expect(result.code).toBe(2);
        expect(result.json.error.code).toBe("USAGE");
        expect(result.requests).toHaveLength(0);
    });

    it("fails with NOT_BOUND when user has no bound credentials or names", async () => {
        const paths = makeHome();
        const u = user("user-unbound", "Unbound Player");
        await seedScoreUsers(paths, [u]);
        const result = await commandIn(paths, "sync", []);
        expect(result.code).toBe(4);
        expect(result.json.error.code).toBe("NOT_BOUND");
        expect(result.json.error.fix).toContain("saltnet user bind");
    });

    it("syncs from lxns successfully, updating user, events, and sync_runs", async () => {
        const paths = makeHome();
        const u1 = sampleUser("user-lxns", "LXNS Player");
        const u2 = sampleUser("user-other", "Other Player");
        const { charts } = allFixtureRecords();
        const targetChart = charts.find(c => c.music.id < 100_000 && c.info.grade < 5)!;
        const oldRecord = recordOf(targetChart, 0);
        oldRecord.achievements = 98.0;
        oldRecord.dxScore = 500;
        u1.data = {
            ...u1.data,
            detailed: { [`${targetChart.music.id}-${targetChart.info.grade}`]: oldRecord },
        };
        await seedScoreUsers(paths, [u1, u2]);

        seedCredentials(paths, {
            "user-lxns": {
                lxnsAccountId: 1001,
                lxnsAuthorization: {
                    accessToken: FAKE_LXNS_TOKEN,
                    tokenType: "Bearer",
                    expiresAt: NOW.getTime() + 3_600_000,
                },
            },
        });

        const network: Record<string, Route> = {
            ...routes(),
            [LXNS_PLAYER_URL]: jsonResponse({
                success: true,
                code: 200,
                data: { name: "LXNS New Name", rating: 15234, friend_code: 9999 },
            }),
            [LXNS_SCORES_URL]: jsonResponse({
                success: true,
                code: 200,
                data: [
                    {
                        id:
                            targetChart.music.id < 100_000
                                ? targetChart.music.id % 10_000
                                : targetChart.music.id,
                        song_name: targetChart.music.info.title,
                        level: targetChart.info.level,
                        level_index: targetChart.info.grade,
                        achievements: 100.5,
                        fc: "fc",
                        fs: "sync",
                        dx_score: 1200,
                        dx_rating: 300,
                        dx_star: 3,
                        rate: "sss",
                        type: targetChart.music.info.type === "SD" ? "standard" : "dx",
                        upload_time: "2026-11-12T00:00:00Z",
                    },
                ],
            }),
        };

        const result = await commandIn(paths, "sync", ["--source", "lxns"], { network });
        expect(result.code).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(result.json.data.source).toBe("lxns");
        expect(result.json.data.mode).toBe("full");
        expect(result.json.data.rating.after).toBe(15234);
        expect(result.json.data.counts).toEqual({ charts: 1, added: 0, improved: 1 });
        expect(result.json.data.changes).toHaveLength(1);
        expect(result.json.data.changes[0].before).not.toBeNull();
        expect(result.json.data.changes[0].score.achievements).toBe(100.5);

        // Verify Schema
        expectConforms(syncSchema, result.json.data);

        // Verify stored user state
        const store = openStore(paths);
        try {
            const users = readUsers(store);
            const savedU1 = users.find(u => u.uid === "user-lxns")!;
            const savedU2 = users.find(u => u.uid === "user-other")!;

            expect(savedU1.divingFish?.importToken).toBeNull();
            expect(savedU1.lxns?.auth).toBeNull();
            expect(savedU1.data?.rating).toBe(15234);
            expect(savedU1.data?.name).toBe("LXNS New Name");

            // Untouched second user
            expect(savedU2.data?.rating).toBe(14000);

            // Rating history
            expect(savedU1.data?.ratingHistory).toBeDefined();
            expect(savedU1.data?.ratingHistory!.length).toBeGreaterThan(0);

            // Score events
            const events = readScoreEvents(store);
            const userEvents = events.filter(e => e.userUid === "user-lxns");
            expect(userEvents).toHaveLength(2);
            // Baseline event before first change of chart with no prior events
            expect(userEvents[0].kind).toBe("initial");
            expect(userEvents[0].state.achievements).toBe(98.0);
            // Update event
            expect(userEvents[1].kind).toBe("change");
            expect(userEvents[1].state.achievements).toBe(100.5);

            // Lock released
            const checkLock = acquireLock(store, "sync:user-lxns", { ttlMs: 60_000 });
            expect(checkLock.acquired).toBe(true);
            if (checkLock.acquired) {
                checkLock.lock.release();
            }

            // Journal row
            const runsResult = readRuns(store, { userUid: "user-lxns" });
            expect(runsResult.total).toBe(1);
            const run = runsResult.items[0];
            expect(run.outcome).toBe("ok");
            expect(run.source).toBe("lxns");
            expect(run.summary?.mode).toBe("full");
            expect(run.summary?.ratingAfter).toBe(15234);
            expect(run.summary?.improved).toBe(1);
        } finally {
            store.close();
        }

        // Token leak check
        expect(result.stdout).not.toContain(FAKE_LXNS_TOKEN);
        expect(result.stderr).not.toContain(FAKE_LXNS_TOKEN);
    });

    it("syncs from df-token successfully", async () => {
        const paths = makeHome();
        const u = sampleUser("user-df-token", "DF Token User");
        const { charts } = allFixtureRecords();
        const chart1 = charts[0];
        const rec = recordOf(chart1, 0);
        rec.achievements = 100.2;
        await seedScoreUsers(paths, [u]);

        seedCredentials(paths, {
            "user-df-token": {
                divingFishImportToken: FAKE_DF_TOKEN,
            },
        });

        const network: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: jsonResponse({
                message: "success",
                nickname: "DF Nickname",
                rating: 15000,
                records: [rec],
                username: "DF Nickname",
                additional_rating: 0,
                plate: null,
            }),
        };

        const result = await commandIn(paths, "sync", ["--source", "df-token"], { network });
        expect(result.code).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(result.json.data.source).toBe("df-token");
        expect(result.json.data.mode).toBe("full");
        expectConforms(syncSchema, result.json.data);

        // Journal and token leak
        const store = openStore(paths);
        try {
            const runsResult = readRuns(store, { userUid: "user-df-token" });
            expect(runsResult.total).toBe(1);
            expect(runsResult.items[0].outcome).toBe("ok");
        } finally {
            store.close();
        }

        expect(result.stdout).not.toContain(FAKE_DF_TOKEN);
        expect(result.stderr).not.toContain(FAKE_DF_TOKEN);
    });

    it("syncs from df-name with backend answer (mode: full)", async () => {
        const paths = makeHome();
        const u = sampleUser("user-df-name", "DF Name User");
        const { charts } = allFixtureRecords();
        const rec = recordOf(charts[0], 0);
        await seedScoreUsers(paths, [u]);

        const network: Record<string, Route> = {
            ...routes(),
            [SALTNET_DF_URL]: jsonResponse({
                userId: 9876,
                userName: "SaltDFPlayer",
                iconId: 1,
                rating: 15400,
                userMusicList: [],
                divingFishData: [rec],
                b50: {
                    sd: [rec],
                    dx: [],
                },
                isLogin: false,
                items: [],
                characters: [],
                info: {},
            }),
        };

        const result = await commandIn(paths, "sync", ["--source", "df-name"], {
            network,
            env: { SALTNET_API_URL },
        });

        expect(result.code).toBe(0);
        expect(result.json.data.source).toBe("df-name");
        expect(result.json.data.mode).toBe("full");
        expect(result.json.data.rating.after).toBe(15400);
        expectConforms(syncSchema, result.json.data);
    });

    it("syncs from df-name fallback to public B50 when backend fails (mode: public-b50, PUBLIC_B50_ONLY warning)", async () => {
        const paths = makeHome();
        const u = sampleUser("user-df-public", "DF Public User");
        const { charts } = allFixtureRecords();
        const rec = recordOf(charts[0], 0);
        u.data = {
            ...u.data,
            detailed: { [`${charts[0].music.id}-${charts[0].info.grade}`]: rec },
        };
        await seedScoreUsers(paths, [u]);

        const network: Record<string, Route> = {
            ...routes(),
            [SALTNET_DF_URL]: textResponse("Server Error", 500),
            [DF_QUERY_URL]: jsonResponse({
                additional_rating: 500,
                charts: {
                    sd: [rec],
                    dx: [],
                },
                nickname: "DF Public Name",
                plate: "",
                rating: 14888,
                user_data: null,
                user_id: 5432,
                username: "df-player",
            }),
        };

        const result = await commandIn(paths, "sync", ["--source", "df-name"], {
            network,
            env: { SALTNET_API_URL },
        });

        expect(result.code).toBe(0);
        expect(result.json.data.source).toBe("df-name");
        expect(result.json.data.mode).toBe("public-b50");
        expect(result.json.warnings.some(w => w.code === "PUBLIC_B50_ONLY")).toBe(true);

        // Detailed records from before are kept
        const store = openStore(paths);
        try {
            const saved = readUsers(store).find(u => u.uid === "user-df-public")!;
            expect(saved.data?.detailed).toBeDefined();
            expect(Object.keys(saved.data?.detailed || {})).toHaveLength(1);
        } finally {
            store.close();
        }

        expectConforms(syncSchema, result.json.data);
    });

    it("produces empty changes on first sync (no scores before)", async () => {
        const paths = makeHome();
        const u = user("user-first-sync", "First Sync Player");
        u.divingFish = { name: "df-first", importToken: null };
        await seedScoreUsers(paths, [u]);

        seedCredentials(paths, {
            "user-first-sync": {
                divingFishImportToken: FAKE_DF_TOKEN,
            },
        });

        const { charts } = allFixtureRecords();
        const rec = recordOf(charts[0], 0);

        const network: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: jsonResponse({
                message: "success",
                nickname: "First User",
                rating: 14000,
                records: [rec],
                username: "First User",
                additional_rating: 0,
                plate: null,
            }),
        };

        const result = await commandIn(paths, "sync", ["--source", "df-token"], { network });
        expect(result.code).toBe(0);
        expect(result.json.data.counts.charts).toBe(1);
        expect(result.json.data.counts.added).toBe(1);
        expect(result.json.data.changes).toHaveLength(0);
        expect(result.json.data.changesTotal).toBe(0);
        expectConforms(syncSchema, result.json.data);
    });

    it("fails with NOT_BOUND on refused DF token, records failed run and leaves user untouched", async () => {
        const paths = makeHome();
        const u = sampleUser("user-bad-token", "Bad Token Player");
        await seedScoreUsers(paths, [u]);

        seedCredentials(paths, {
            "user-bad-token": {
                divingFishImportToken: "BAD-TOKEN",
            },
        });

        const network: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: textResponse(
                JSON.stringify({ message: "Invalid import token" }),
                400
            ),
        };

        const result = await commandIn(paths, "sync", ["--source", "df-token"], { network });
        expect(result.code).toBe(4);
        expect(result.json.error.code).toBe("NOT_BOUND");
        // Other bound sources fix
        expect(result.json.error.fix).toContain("saltnet sync --source");

        const store = openStore(paths);
        try {
            const runs = readRuns(store, { userUid: "user-bad-token" });
            expect(runs.total).toBe(1);
            expect(runs.items[0].outcome).toBe("failed");
            expect(runs.items[0].errorCode).toBe("NOT_BOUND");
        } finally {
            store.close();
        }
    });

    it("fails with NOT_BOUND on refused LXNS token (401)", async () => {
        const paths = makeHome();
        const u = sampleUser("user-bad-lxns", "Bad LXNS Player");
        await seedScoreUsers(paths, [u]);

        seedCredentials(paths, {
            "user-bad-lxns": {
                lxnsAccountId: 1001,
                lxnsAuthorization: {
                    accessToken: "BAD-LXNS-TOKEN",
                    tokenType: "Bearer",
                    expiresAt: NOW.getTime() + 3_600_000,
                },
            },
        });

        const network: Record<string, Route> = {
            ...routes(),
            [LXNS_PLAYER_URL]: jsonResponse(
                { success: false, code: 401, message: "Unauthorized" },
                401
            ),
        };

        const result = await commandIn(paths, "sync", ["--source", "lxns"], { network });
        expect(result.code).toBe(4);
        expect(result.json.error.code).toBe("NOT_BOUND");
        expect(result.json.error.fix).toContain("saltnet sync --source df-name");

        const store = openStore(paths);
        try {
            const saved = readUsers(store).find(u => u.uid === "user-bad-lxns")!;
            expect(saved.data?.rating).toBe(14000);
            const events = readScoreEvents(store).filter(e => e.userUid === "user-bad-lxns");
            expect(events).toHaveLength(0);
            const runs = readRuns(store, { userUid: "user-bad-lxns" });
            expect(runs.total).toBe(1);
            expect(runs.items[0].outcome).toBe("failed");
            expect(runs.items[0].errorCode).toBe("NOT_BOUND");
        } finally {
            store.close();
        }
    });

    it("retries upstream 500 error once before failing as UPSTREAM_ERROR", async () => {
        const paths = makeHome();
        const u = sampleUser("user-retry", "Retry Player");
        await seedScoreUsers(paths, [u]);

        seedCredentials(paths, {
            "user-retry": {
                divingFishImportToken: FAKE_DF_TOKEN,
            },
        });

        const network: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: textResponse("Server Crash", 500),
        };

        const result = await commandIn(paths, "sync", ["--source", "df-token"], { network });
        expect(result.code).toBe(5);
        expect(result.json.error.code).toBe("UPSTREAM_ERROR");
        expect(result.json.error.retryable).toBe(true);
        expect(result.json.error.fix).toContain("saltnet sync --source df-name");

        const recordsReqs = result.requests.filter(r => r.url === DF_RECORDS_URL);
        expect(recordsReqs).toHaveLength(2);

        const store = openStore(paths);
        try {
            const saved = readUsers(store).find(u => u.uid === "user-retry")!;
            expect(saved.data?.rating).toBe(14000);
            const events = readScoreEvents(store).filter(e => e.userUid === "user-retry");
            expect(events).toHaveLength(0);
            const runs = readRuns(store, { userUid: "user-retry" });
            expect(runs.total).toBe(1);
            expect(runs.items[0].outcome).toBe("failed");
            expect(runs.items[0].errorCode).toBe("UPSTREAM_ERROR");
        } finally {
            store.close();
        }
    });

    it("fails with NETWORK on connection failure, retries once and leaves user untouched", async () => {
        const paths = makeHome();
        const u = sampleUser("user-net-fail", "Net Fail Player");
        await seedScoreUsers(paths, [u]);

        seedCredentials(paths, {
            "user-net-fail": {
                divingFishImportToken: FAKE_DF_TOKEN,
            },
        });

        const network: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: () => {
                const err = new TypeError("fetch failed");
                (err as unknown as { cause: { code: string } }).cause = { code: "ECONNREFUSED" };
                throw err;
            },
        };

        const result = await commandIn(paths, "sync", ["--source", "df-token"], { network });
        expect(result.code).toBe(5);
        expect(result.json.error.code).toBe("NETWORK");
        expect(result.json.error.retryable).toBe(true);
        expect(result.json.error.fix).toContain("saltnet sync --source df-name");

        const recordsReqs = result.requests.filter(r => r.url === DF_RECORDS_URL);
        expect(recordsReqs).toHaveLength(2);

        const store = openStore(paths);
        try {
            const saved = readUsers(store).find(u => u.uid === "user-net-fail")!;
            expect(saved.data?.rating).toBe(14000);
            const events = readScoreEvents(store).filter(e => e.userUid === "user-net-fail");
            expect(events).toHaveLength(0);
            const runs = readRuns(store, { userUid: "user-net-fail" });
            expect(runs.total).toBe(1);
            expect(runs.items[0].outcome).toBe("failed");
            expect(runs.items[0].errorCode).toBe("NETWORK");
        } finally {
            store.close();
        }
    });

    it("fails with LXNS_REAUTH_REQUIRED on expired LXNS token without making network requests", async () => {
        const paths = makeHome();
        const u = sampleUser("user-expired-lxns", "Expired LXNS Player");
        await seedScoreUsers(paths, [u]);

        seedCredentials(paths, {
            "user-expired-lxns": {
                lxnsAccountId: 1001,
                lxnsAuthorization: {
                    accessToken: FAKE_LXNS_TOKEN,
                    tokenType: "Bearer",
                    expiresAt: NOW.getTime() - 5000, // expired relative to NOW
                },
            },
        });

        const result = await commandIn(paths, "sync", ["--source", "lxns"]);
        expect(result.code).toBe(4);
        expect(result.json.error.code).toBe("LXNS_REAUTH_REQUIRED");
        expect(result.json.error.fix).toContain("saltnet user bind");
        // No request to LXNS
        expect(result.requests.some(r => r.url.includes("lxns"))).toBe(false);

        const store = openStore(paths);
        try {
            const runs = readRuns(store, { userUid: "user-expired-lxns" });
            expect(runs.total).toBe(1);
            expect(runs.items[0].outcome).toBe("failed");
            expect(runs.items[0].errorCode).toBe("LXNS_REAUTH_REQUIRED");
        } finally {
            store.close();
        }
    });

    it("refreshes expired access token with refresh token under sync lock before making score requests", async () => {
        const paths = makeHome();
        const u = sampleUser("user-refresh-lxns", "Refresh LXNS Player");
        const { charts } = allFixtureRecords();
        const targetChart = charts.find(c => c.music.id < 100_000 && c.info.grade < 5)!;
        const oldRecord = recordOf(targetChart, 0);
        oldRecord.achievements = 98.0;
        u.data = {
            ...u.data,
            detailed: { [`${targetChart.music.id}-${targetChart.info.grade}`]: oldRecord },
        };
        await seedScoreUsers(paths, [u]);

        const oldExp = Math.floor((NOW.getTime() - 10_000) / 1000);
        const newExp = Math.floor((NOW.getTime() + 3_600_000) / 1000);
        const expiredJwt = makeFakeJwt(1001, "lxns-player", oldExp);
        const newJwt = makeFakeJwt(1001, "lxns-player", newExp);
        const OLD_REFRESH_TOKEN = "FAKE-LXNS-REFRESH-0001";
        const NEW_REFRESH_TOKEN = "FAKE-LXNS-REFRESH-0002";

        seedCredentials(paths, {
            "user-refresh-lxns": {
                lxnsAccountId: 1001,
                lxnsAuthorization: {
                    accessToken: expiredJwt,
                    refreshToken: OLD_REFRESH_TOKEN,
                    tokenType: "Bearer",
                    expiresAt: NOW.getTime() - 10_000,
                },
                lxnsIssuedAt: NOW.getTime() - 500_000,
            },
        });

        const LXNS_TOKEN_URL = `${LXNS_URL}/api/v0/oauth/token`;
        const network: Record<string, Route> = {
            ...routes(),
            [LXNS_TOKEN_URL]: jsonResponse({
                access_token: newJwt,
                refresh_token: NEW_REFRESH_TOKEN,
                token_type: "Bearer",
                expires_in: 3600,
            }),
            [LXNS_PLAYER_URL]: jsonResponse({
                success: true,
                code: 200,
                data: { name: "LXNS Player", rating: 15000, friend_code: 1234 },
            }),
            [LXNS_SCORES_URL]: jsonResponse({
                success: true,
                code: 200,
                data: [
                    {
                        id:
                            targetChart.music.id < 100_000
                                ? targetChart.music.id % 10_000
                                : targetChart.music.id,
                        song_name: targetChart.music.info.title,
                        level: targetChart.info.level,
                        level_index: targetChart.info.grade,
                        achievements: 100.5,
                        fc: "fc",
                        fs: "sync",
                        dx_score: 1200,
                        dx_rating: 300,
                        dx_star: 3,
                        rate: "sss",
                        type: targetChart.music.info.type === "SD" ? "standard" : "dx",
                        upload_time: "2026-11-12T00:00:00Z",
                    },
                ],
            }),
        };

        const result = await commandIn(paths, "sync", ["--source", "lxns"], { network });
        expect(result.code).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(result.json.data.source).toBe("lxns");

        // Verify request order and count
        const tokenReqs = result.requests.filter(r => r.url === LXNS_TOKEN_URL);
        expect(tokenReqs).toHaveLength(1);
        expect((tokenReqs[0] as RecordedRequest).init?.method).toBe("POST");

        const scoreReqs = result.requests.filter(r => r.url === LXNS_SCORES_URL);
        expect(scoreReqs).toHaveLength(1);

        // Every LXNS player request goes out after the refresh, with the new access token.
        const tokenAt = result.requests.findIndex(r => r.url === LXNS_TOKEN_URL);
        const playerRequests = result.requests.filter(
            r => r.url === LXNS_PLAYER_URL || r.url === LXNS_SCORES_URL
        );
        expect(playerRequests.length).toBeGreaterThan(0);
        for (const request of playerRequests) {
            expect(result.requests.indexOf(request)).toBeGreaterThan(tokenAt);
            expect(new Headers(request.init?.headers).get("authorization")).toBe(
                `Bearer ${newJwt}`
            );
        }

        // Verify credentials on disk
        const creds = readCredentials(paths);
        const userCred = creds.users["user-refresh-lxns"];
        const lxnsAuth = userCred.lxnsAuthorization as
            | { accessToken?: string; refreshToken?: string }
            | undefined;
        expect(lxnsAuth?.accessToken).toBe(newJwt);
        expect(lxnsAuth?.refreshToken).toBe(NEW_REFRESH_TOKEN);
        expect(userCred.lxnsIssuedAt).toBe(NOW.getTime());

        // Verify no token leak
        expect(result.stdout).not.toContain(expiredJwt);
        expect(result.stdout).not.toContain(newJwt);
        expect(result.stdout).not.toContain(OLD_REFRESH_TOKEN);
        expect(result.stdout).not.toContain(NEW_REFRESH_TOKEN);
        expect(result.stderr).not.toContain(expiredJwt);
        expect(result.stderr).not.toContain(newJwt);
        expect(result.stderr).not.toContain(OLD_REFRESH_TOKEN);
        expect(result.stderr).not.toContain(NEW_REFRESH_TOKEN);
    });

    it("treats mismatched lxnsAccountId as not bound", async () => {
        const paths = makeHome();
        const u = sampleUser("user-mismatch", "Mismatch Player");
        u.lxns = { id: 1001, name: "lxns", auth: null };
        u.divingFish = { name: null };
        await seedScoreUsers(paths, [u]);

        seedCredentials(paths, {
            "user-mismatch": {
                lxnsAccountId: 9999, // different account id!
                lxnsAuthorization: {
                    accessToken: FAKE_LXNS_TOKEN,
                    tokenType: "Bearer",
                    expiresAt: NOW.getTime() + 3_600_000,
                },
            },
        });

        const result = await commandIn(paths, "sync", ["--source", "lxns"]);
        expect(result.code).toBe(4);
        expect(result.json.error.code).toBe("NOT_BOUND");
    });

    it("fails with SYNC_IN_PROGRESS when sync lock is held", async () => {
        const paths = makeHome();
        const u = sampleUser("user-locked", "Locked Player");
        await seedScoreUsers(paths, [u]);

        seedCredentials(paths, {
            "user-locked": {
                divingFishImportToken: FAKE_DF_TOKEN,
            },
        });

        const store = openStore(paths);
        const lock = acquireLock(store, "sync:user-locked", {
            ttlMs: 60_000,
        });
        expect(lock).not.toBeNull();
        store.close();

        const result = await commandIn(paths, "sync", ["--source", "df-token"]);
        expect(result.code).toBe(7);
        expect(result.json.error.code).toBe("SYNC_IN_PROGRESS");
        expect(result.requests).toHaveLength(0);

        // No journal row written when lock acquisition fails
        const storeCheck = openStore(paths);
        try {
            const runs = readRuns(storeCheck, { userUid: "user-locked" });
            expect(runs.total).toBe(0);
        } finally {
            storeCheck.close();
        }
    });

    it("fails with NOT_FOUND and records failed run when user is removed in flight", async () => {
        const paths = makeHome();
        const u = sampleUser("user-removed", "Removed Player");
        const { charts } = allFixtureRecords();
        const rec = recordOf(charts[0], 0);
        await seedScoreUsers(paths, [u]);

        seedCredentials(paths, {
            "user-removed": {
                divingFishImportToken: FAKE_DF_TOKEN,
            },
        });

        const network: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: () => {
                // Delete user from store while network request is in flight
                const s = openStore(paths);
                s.db.prepare("DELETE FROM users WHERE uid = ?").run("user-removed");
                s.close();
                return jsonResponse({
                    message: "success",
                    nickname: "Removed Nick",
                    rating: 15000,
                    records: [rec],
                    username: "Removed Nick",
                    additional_rating: 0,
                    plate: null,
                });
            },
        };

        const result = await commandIn(paths, "sync", ["--source", "df-token"], { network });
        expect(result.code).toBe(3);
        expect(result.json.error.code).toBe("NOT_FOUND");

        const store = openStore(paths);
        try {
            const runs = readRuns(store, { userUid: "user-removed" });
            expect(runs.total).toBe(1);
            expect(runs.items[0].outcome).toBe("failed");
            expect(runs.items[0].errorCode).toBe("NOT_FOUND");
        } finally {
            store.close();
        }
    });

    it("replaces the stored records as the web app does, also a record core cannot read", async () => {
        const paths = makeHome();
        const u = sampleUser("user-null-type", "Null Type Player");
        const { charts } = allFixtureRecords();
        const chart1 = charts[0];
        const chart2 = charts[1];
        const rec1 = recordOf(chart1, 0);
        // Put invalid raw record
        const invalidRec = { ...recordOf(chart2, 1), type: null as unknown as "DX" };
        u.data = {
            ...u.data,
            detailed: {
                [`${chart1.music.id}-${chart1.info.grade}`]: rec1,
                [`${chart2.music.id}-${chart2.info.grade}`]: invalidRec,
            },
        };
        await seedScoreUsers(paths, [u]);

        seedCredentials(paths, {
            "user-null-type": {
                divingFishImportToken: FAKE_DF_TOKEN,
            },
        });

        const network: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: jsonResponse({
                message: "success",
                nickname: "Null Type Nickname",
                rating: 14500,
                records: [rec1],
                username: "Null Type Nickname",
                additional_rating: 0,
                plate: null,
            }),
        };

        const result = await commandIn(paths, "sync", ["--source", "df-token"], { network });
        expect(result.code).toBe(0);
        expect(result.json.ok).toBe(true);

        const store = openStore(paths);
        try {
            const saved = readUsers(store).find(u => u.uid === "user-null-type")!;
            // The record core cannot read did not stop the sync, and the update replaced it with
            // the rest of the stored records, as the web app replaces them.
            expect(Object.keys(saved.data?.detailed ?? {})).toEqual([
                `${chart1.music.id}-${chart1.info.grade}`,
            ]);
        } finally {
            store.close();
        }
    });

    it("ensures no token appears in outputs, logs, sync_runs, or database/disk files except credentials.json after successful and failed sync", async () => {
        const paths = makeHome();
        const SECRET_TOKEN = "SECRET-SUPER-TOKEN-999999";
        const u = sampleUser("user-secret", "Secret Player");
        await seedScoreUsers(paths, [u]);

        seedCredentials(paths, {
            "user-secret": {
                divingFishImportToken: SECRET_TOKEN,
            },
        });

        const { charts } = allFixtureRecords();
        const rec = recordOf(charts[0], 0);

        const network: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: jsonResponse({
                message: "success",
                nickname: "Secret User",
                rating: 15000,
                records: [rec],
                username: "Secret User",
                additional_rating: 0,
                plate: null,
            }),
        };

        // 1. Successful sync with --verbose
        const successRes = await commandIn(paths, "sync", ["--source", "df-token", "--verbose"], {
            network,
        });
        expect(successRes.code).toBe(0);
        expect(successRes.stdout).not.toContain(SECRET_TOKEN);
        expect(successRes.stderr).not.toContain(SECRET_TOKEN);

        // 2. Failed sync with --verbose
        const failNetwork: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: textResponse("Server Down", 500),
        };
        const failRes = await commandIn(paths, "sync", ["--source", "df-token", "--verbose"], {
            network: failNetwork,
        });
        expect(failRes.code).toBe(5);
        expect(failRes.stdout).not.toContain(SECRET_TOKEN);
        expect(failRes.stderr).not.toContain(SECRET_TOKEN);

        // 3. Inspect sync_runs
        const store = openStore(paths);
        try {
            const runs = readRuns(store, { userUid: "user-secret" });
            expect(JSON.stringify(runs)).not.toContain(SECRET_TOKEN);
        } finally {
            store.close();
        }

        // 4. Inspect all files on disk in data directory except credentials.json
        const allFiles = readAllFiles(paths.home);
        expect(allFiles.length).toBeGreaterThan(0);
        for (const file of allFiles) {
            if (file.path.endsWith("credentials.json")) continue;
            expect(file.content).not.toContain(SECRET_TOKEN);
        }
    });

    it("places a utage change through the stored record links, not by the record key", async () => {
        const paths = makeHome();
        const u = sampleUser("user-utage", "Utage Player");
        const { charts } = allFixtureRecords();
        const utage = charts.find(chart => isUtageGrade(chart.info.grade))!;
        // Diving Fish numbers a utage record's level from 0, not by the chart's grade, so its
        // record key is not the chart key.
        const old = { ...recordOf(utage, 5), level_index: 0 };
        u.data = { ...u.data, detailed: { [`${utage.music.id}-0`]: old } };
        await seedScoreUsers(paths, [u]);
        seedCredentials(paths, { "user-utage": { divingFishImportToken: FAKE_DF_TOKEN } });

        const improved = { ...old, achievements: 101 };
        const network: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: jsonResponse({
                message: "success",
                nickname: "Utage Nickname",
                rating: 15000,
                records: [improved],
                username: "Utage Nickname",
                additional_rating: 0,
                plate: null,
            }),
        };
        const result = await commandIn(paths, "sync", ["--source", "df-token"], { network });
        expect(result.code).toBe(0);
        expect(result.json.data.missing).toBe(0);
        expect(result.json.data.changesTotal).toBe(1);
        expect(result.json.data.changes[0].chartKey).toBe(`${utage.music.id}-${utage.info.grade}`);
        expect(result.json.data.changes[0].score.achievements).toBe(101);
    });

    it("names a user other than the default one in every command it prints", async () => {
        const paths = makeHome();
        const second = sampleUser("user-second", "Second");
        second.inGame.enabled = true;
        await seedScoreUsers(paths, [sampleUser("user-first", "First"), second]);
        seedCredentials(paths, {
            "user-second": {
                divingFishImportToken: FAKE_DF_TOKEN,
                lxnsAuthorization: {
                    accessToken: FAKE_LXNS_TOKEN,
                    tokenType: "Bearer",
                    expiresAt: NOW.getTime() - 5000,
                },
                lxnsAccountId: 1001,
            },
        });

        const ingame = await commandIn(paths, "sync", ["--user", "1", "--source", "ingame"]);
        expect(ingame.json.error.code).toBe("QR_REQUIRED");
        expect(ingame.json.error.fix).toBe(
            "saltnet sync --user user-second --source ingame --qr -"
        );

        const lxns = await commandIn(paths, "sync", ["--user", "Second", "--source", "lxns"]);
        expect(lxns.json.error.code).toBe("LXNS_REAUTH_REQUIRED");
        expect(lxns.json.error.fix).toContain("saltnet user bind user-second lxns");
        expect(lxns.json.error.fix).toContain("saltnet sync --user user-second --source df-token");
    });

    it("reports rating.before as null when stored rating is not a safe integer", async () => {
        const paths = makeHome();
        const u = sampleUser("user-float-rating", "Float Rating User");
        u.data = { ...u.data, rating: 14000.5 };
        const { charts } = allFixtureRecords();
        const rec = recordOf(charts[0], 0);
        await seedScoreUsers(paths, [u]);
        seedCredentials(paths, { "user-float-rating": { divingFishImportToken: FAKE_DF_TOKEN } });

        const network: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: jsonResponse({
                message: "success",
                nickname: "DF Nickname",
                rating: 15000,
                records: [rec],
                username: "DF Nickname",
                additional_rating: 0,
                plate: null,
            }),
        };

        const result = await commandIn(paths, "sync", ["--source", "df-token"], { network });
        expect(result.code).toBe(0);
        expect(result.json.data.rating.before).toBeNull();
        expect(result.json.data.rating.after).toBe(15000);
    });

    it("counts both halves of public B50 in counts.charts", async () => {
        const paths = makeHome();
        const u = sampleUser("user-b50-count", "B50 Count User");
        const { charts } = allFixtureRecords();
        const rec1 = recordOf(charts[0], 0);
        const rec2 = recordOf(charts[1], 1);
        const rec3 = recordOf(charts[2], 2);
        await seedScoreUsers(paths, [u]);

        const network: Record<string, Route> = {
            ...routes(),
            [SALTNET_DF_URL]: textResponse("Server Error", 500),
            [DF_QUERY_URL]: jsonResponse({
                additional_rating: 0,
                charts: {
                    sd: [rec1, rec2],
                    dx: [rec3],
                },
                nickname: "Public Player",
                plate: "",
                rating: 14000,
                user_data: null,
                user_id: 1111,
                username: "df-player",
            }),
        };

        const result = await commandIn(paths, "sync", ["--source", "df-name"], {
            network,
            env: { SALTNET_API_URL },
        });
        expect(result.code).toBe(0);
        expect(result.json.data.mode).toBe("public-b50");
        expect(result.json.data.counts.charts).toBe(3);
    });

    it("assigns the newest stored event generation to new sync events", async () => {
        const paths = makeHome();
        const u = sampleUser("user-gen", "Generation User");
        const { charts } = allFixtureRecords();
        const chart1 = charts[0];
        const oldRec = recordOf(chart1, 0);
        oldRec.achievements = 95.0;
        u.data = {
            ...u.data,
            detailed: { [`${chart1.music.id}-${chart1.info.grade}`]: oldRec },
        };

        const event1 = scoreEvent("e1", "user-gen", `${chart1.music.id}-${chart1.info.grade}`, 1);
        event1.generationId = "gen-old";
        event1.observedAt = 1000;

        const event2 = scoreEvent("e2", "user-gen", `${chart1.music.id}-${chart1.info.grade}`, 1);
        event2.generationId = "gen-new";
        event2.observedAt = 2000;

        await seedScoreUsers(paths, [u], [event1, event2]);
        seedCredentials(paths, { "user-gen": { divingFishImportToken: FAKE_DF_TOKEN } });

        const improved = { ...oldRec, achievements: 99.0 };
        const network: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: jsonResponse({
                message: "success",
                nickname: "Gen Nickname",
                rating: 15000,
                records: [improved],
                username: "Gen Nickname",
                additional_rating: 0,
                plate: null,
            }),
        };

        const result = await commandIn(paths, "sync", ["--source", "df-token"], { network });
        expect(result.code).toBe(0);
        expect(result.json.data.counts.improved).toBe(1);

        const store = openStore(paths);
        try {
            const allEvents = readScoreEvents(store, "user-gen");
            const newEvents = allEvents.filter(e => e.id !== "e1" && e.id !== "e2");
            expect(newEvents.length).toBeGreaterThan(0);
            for (const ev of newEvents) {
                expect(ev.generationId).toBe("gen-new");
            }
        } finally {
            store.close();
        }
    });

    it("neither hands core nor merges a stored record core cannot look up", async () => {
        const paths = makeHome();
        const u = sampleUser("user-bad-rec", "Bad Rec User");
        const { charts } = allFixtureRecords();
        const chart1 = charts[0];
        const key = `${chart1.music.id}-${chart1.info.grade}`;
        // Stored under the key of the record that comes in. Its song_id survives storage as JSON,
        // and turning it into text or a number throws, so core must not see it.
        const badRec = { ...recordOf(chart1, 0), song_id: { toString: 1 }, play_count: 42 };
        u.data = {
            ...u.data,
            detailed: { [key]: badRec as unknown as DetailedData[string] },
        };
        await seedScoreUsers(paths, [u]);
        seedCredentials(paths, { "user-bad-rec": { divingFishImportToken: FAKE_DF_TOKEN } });

        const network: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: jsonResponse({
                message: "success",
                nickname: "Player",
                rating: 15000,
                // Diving Fish sends no play count, so a merge would take the stored one.
                records: [{ ...recordOf(chart1, 0), play_count: undefined }],
                username: "Player",
                additional_rating: 0,
                plate: null,
            }),
        };

        const result = await commandIn(paths, "sync", ["--source", "df-token"], { network });
        expect(result.code).toBe(0);

        const store = openStore(paths);
        try {
            const saved = readUsers(store).find(stored => stored.uid === "user-bad-rec")!;
            expect(saved.data.detailed?.[key]?.song_id).toBe(recordOf(chart1, 0).song_id);
            expect(saved.data.detailed?.[key]?.play_count).toBeUndefined();
        } finally {
            store.close();
        }
    });

    it("does not suggest --source lxns again when LXNS itself failed", async () => {
        const paths = makeHome();
        const u = sampleUser("user-both-sources", "Both Sources User");
        await seedScoreUsers(paths, [u]);
        seedCredentials(paths, {
            "user-both-sources": {
                divingFishImportToken: FAKE_DF_TOKEN,
                lxnsAccountId: 1001,
                lxnsAuthorization: {
                    accessToken: FAKE_LXNS_TOKEN,
                    tokenType: "Bearer",
                    expiresAt: NOW.getTime() + 3_600_000,
                },
            },
        });

        const network: Record<string, Route> = {
            ...routes(),
            [LXNS_PLAYER_URL]: textResponse("Internal Error", 500),
        };

        const result = await commandIn(paths, "sync", ["--source", "lxns"], { network });
        expect(result.code).toBe(5);
        expect(result.json.error.fix).toContain("saltnet sync --source df-token");
        expect(result.json.error.fix).not.toContain("saltnet sync --source lxns");
    });

    it("orders changes with equal rating differences by chart key ascending", async () => {
        const paths = makeHome();
        const u = sampleUser("user-equal-diff", "Equal Diff User");
        const { charts } = allFixtureRecords();
        const candidates = charts.filter(c => !isUtageGrade(c.info.grade));
        const chart1 = candidates[0];
        const chart2 = candidates[1];
        const key1 = `${chart1.music.id}-${chart1.info.grade}`;
        const key2 = `${chart2.music.id}-${chart2.info.grade}`;
        const [smallerKey, largerKey, chartSmall, chartLarge] =
            key1 < key2 ? [key1, key2, chart1, chart2] : [key2, key1, chart2, chart1];

        const oldSmall = recordOf(chartSmall, 0);
        oldSmall.achievements = 90.0;
        const oldLarge = recordOf(chartLarge, 1);
        oldLarge.achievements = 90.0;

        u.data = {
            ...u.data,
            detailed: {
                [smallerKey]: oldSmall,
                [largerKey]: oldLarge,
            },
        };
        await seedScoreUsers(paths, [u]);
        seedCredentials(paths, { "user-equal-diff": { divingFishImportToken: FAKE_DF_TOKEN } });

        const newSmall = { ...oldSmall, achievements: 95.0 };
        const newLarge = { ...oldLarge, achievements: 95.0 };

        const network: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: jsonResponse({
                message: "success",
                nickname: "Player",
                rating: 15000,
                records: [newLarge, newSmall],
                username: "Player",
                additional_rating: 0,
                plate: null,
            }),
        };

        const result = await commandIn(paths, "sync", ["--source", "df-token"], { network });
        expect(result.code).toBe(0);
        expect(result.json.data.changes).toHaveLength(2);
        expect(result.json.data.changes[0].chartKey).toBe(smallerKey);
        expect(result.json.data.changes[1].chartKey).toBe(largerKey);
    });

    it("caps changes at 20 while changesTotal counts all changes", async () => {
        const paths = makeHome();
        const u = sampleUser("user-many-changes", "Many Changes User");
        const { charts } = allFixtureRecords();
        const ordinaryCharts = charts.filter(c => !isUtageGrade(c.info.grade)).slice(0, 25);
        expect(ordinaryCharts.length).toBe(25);

        const detailed: DetailedData = {};
        const improvedRecords: unknown[] = [];
        for (let i = 0; i < ordinaryCharts.length; i++) {
            const chart = ordinaryCharts[i];
            const key = `${chart.music.id}-${chart.info.grade}`;
            const oldRec = recordOf(chart, i);
            oldRec.achievements = 90.0;
            detailed[key] = oldRec;
            improvedRecords.push({ ...oldRec, achievements: 95.0 });
        }

        u.data = { ...u.data, detailed };
        await seedScoreUsers(paths, [u]);
        seedCredentials(paths, { "user-many-changes": { divingFishImportToken: FAKE_DF_TOKEN } });

        const network: Record<string, Route> = {
            ...routes(),
            [DF_RECORDS_URL]: jsonResponse({
                message: "success",
                nickname: "Player",
                rating: 15000,
                records: improvedRecords,
                username: "Player",
                additional_rating: 0,
                plate: null,
            }),
        };

        const result = await commandIn(paths, "sync", ["--source", "df-token"], { network });
        expect(result.code).toBe(0);
        expect(result.json.data.changesTotal).toBe(25);
        expect(result.json.data.changes).toHaveLength(20);
    });

    it("places changes of a public-b50 sync through b50 snapshot record links with missing 0", async () => {
        const paths = makeHome();
        const u = b50User("user-b50-snapshot-links", "B50 Only User");
        u.divingFish = { name: "df-player", importToken: null };
        const b50Sd = (u.data.b50 as unknown as { sd: { achievements: number }[] }).sd;
        expect(b50Sd.length).toBeGreaterThan(0);
        const targetRec = b50Sd[0];
        targetRec.achievements = 90.0;
        await seedScoreUsers(paths, [u]);

        const improvedRec = { ...targetRec, achievements: 99.0 };
        const network: Record<string, Route> = {
            ...routes(),
            [SALTNET_DF_URL]: textResponse("Server Error", 500),
            [DF_QUERY_URL]: jsonResponse({
                additional_rating: 0,
                charts: {
                    sd: [improvedRec, ...b50Sd.slice(1)],
                    dx: (u.data.b50 as unknown as { dx: unknown[] }).dx,
                },
                nickname: "B50 Player",
                plate: "",
                rating: 15000,
                user_data: null,
                user_id: 2222,
                username: "df-player",
            }),
        };

        const result = await commandIn(paths, "sync", ["--source", "df-name"], {
            network,
            env: { SALTNET_API_URL },
        });
        expect(result.code).toBe(0);
        expect(result.json.data.mode).toBe("public-b50");
        expect(result.json.data.missing).toBe(0);
        expect(result.json.data.changesTotal).toBe(1);
        expect(result.json.data.changes[0].score.achievements).toBe(99.0);
    });
});
