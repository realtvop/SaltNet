import type { LXNSAuth } from "@core/integrations/lxns/type";
import type { User } from "@core/user/type";
import type { RuntimePaths } from "../../src/runtime/paths";
import type { Route } from "../mockHttp";
import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CliError, exitCodeOf } from "../../src/errors";
import { loadConfig } from "../../src/runtime/config";
import { readCredentials } from "../../src/runtime/credentials";
import { createHttp } from "../../src/runtime/http";
import { openStore } from "../../src/store/store";
import { withSyncLock } from "../../src/sync/lock";
import { LXNS_ACCESS_MARGIN_MS, lxnsAccessToken } from "../../src/sync/lxnsToken";
import { readUser, saveUser } from "../../src/users/repository";
import { delayedRoute, jsonResponse, mockFetch, textResponse } from "../mockHttp";
import { parsePrintedCommand } from "../printedCommand";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

const FAKE_TOKENS = [
    "FAKE-LXNS-ACCESS-0001",
    "FAKE-LXNS-ACCESS-0002",
    "FAKE-LXNS-REFRESH-0001",
    "FAKE-LXNS-REFRESH-0002",
    "FAKE-LXNS-REFRESH-NEW",
    "FAKE-DIVING-FISH-IMPORT-TOKEN-001",
];

function assertNoSecrets(target: unknown): void {
    const text = typeof target === "string" ? target : JSON.stringify(target);
    for (const secret of FAKE_TOKENS) {
        expect(text).not.toContain(secret);
    }
}

function makeFakeJwt(id: number, name: string, expSeconds: number): string {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ id, name, exp: expSeconds })).toString(
        "base64url"
    );
    return `${header}.${payload}.FAKE_SIG`;
}

function makeUser(uid: string, lxnsId: number = 1001, lxnsName: string = "FakePlayer"): User {
    return {
        uid,
        remark: "TestUser",
        divingFish: { name: `fish-${uid}`, importToken: null },
        lxns: { id: lxnsId, name: lxnsName, auth: null },
        inGame: { id: 100, name: `game-${uid}`, enabled: true, useFastUpdate: true },
        settings: { manuallyUpdate: false },
        data: { updateTime: null, name: null, rating: null },
    };
}

function makeContext(
    paths: RuntimePaths,
    routes: Record<string, Route> = {},
    logLines: string[] = [],
    now: () => Date = () => new Date()
) {
    const config = loadConfig(paths);
    const fetch = mockFetch(routes);
    const log = (msg: string) => {
        logLines.push(msg);
        assertNoSecrets(msg);
    };
    return {
        ctx: {
            paths,
            config,
            http: (options?: { timeoutMs?: number; retry?: boolean; retryDelayMs?: number }) =>
                createHttp({
                    fetch,
                    userAgent: config.values.network.userAgent,
                    timeoutMs: options?.timeoutMs ?? config.values.network.timeoutMs,
                    timeoutKey: "network.timeoutMs",
                    retry: options?.retry,
                    retryDelayMs: options?.retryDelayMs,
                    log,
                }),
            log,
            io: {
                fetch,
                now,
                stdout: { write: () => {}, isTTY: false },
                stderr: { write: () => {}, isTTY: false },
                env: {},
                cwd: paths.home,
                readStdin: async () => "",
            },
        },
        fetch,
        logLines,
    };
}

function writeLxnsCredentials(
    paths: RuntimePaths,
    auth: { accessToken: string; refreshToken: string; expiresAt: number; issuedAt: number }
): void {
    const credentials = {
        version: 1 as const,
        users: {
            u1: {
                lxnsAuthorization: {
                    accessToken: auth.accessToken,
                    refreshToken: auth.refreshToken,
                    tokenType: "Bearer",
                    expiresAt: auth.expiresAt,
                },
                lxnsAccountId: 1001,
                lxnsIssuedAt: auth.issuedAt,
            },
        },
    };
    writeFileSync(paths.credentials, `${JSON.stringify(credentials, null, 2)}\n`, "utf8");
}

describe("lxnsToken constants", () => {
    it("exports standard time windows", () => {
        expect(LXNS_ACCESS_MARGIN_MS).toBe(60_000);
    });
});

describe("lxnsAccessToken", () => {
    it("returns a fresh access token without network request or modifying credentials", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        const freshJwt = makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs + 3600_000) / 1000));
        const initialCreds = {
            version: 1 as const,
            users: {
                u1: {
                    lxnsAuthorization: {
                        accessToken: freshJwt,
                        refreshToken: "FAKE-LXNS-REFRESH-0001",
                        tokenType: "Bearer",
                        expiresAt: nowMs + 3600_000,
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: nowMs - 1000,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(initialCreds, null, 2)}\n`, "utf8");
        const beforeBytes = readFileSync(paths.credentials);

        const { ctx, fetch } = makeContext(paths, {}, [], () => new Date(nowMs));
        const result = await withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
            lxnsAccessToken(ctx, store, handle, user)
        );

        expect(result.accessToken).toBe(freshJwt);
        expect(fetch.requests.length).toBe(0);
        expect(readFileSync(paths.credentials)).toEqual(beforeBytes);

        store.close();
    });

    it("refreshes an access token expiring in under a minute and records lxnsIssuedAt", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        // Expiring in 30 seconds (< 60s margin)
        const oldJwt = makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs + 30_000) / 1000));
        const newJwt = makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs + 3600_000) / 1000));

        const initialCreds = {
            version: 1 as const,
            users: {
                u1: {
                    lxnsAuthorization: {
                        accessToken: oldJwt,
                        refreshToken: "FAKE-LXNS-REFRESH-0001",
                        tokenType: "Bearer",
                        expiresAt: nowMs + 30_000,
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: nowMs - 500_000,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(initialCreds, null, 2)}\n`, "utf8");

        const tokenUrl = "https://maimai.lxns.net/api/v0/oauth/token";
        const logLines: string[] = [];
        const { ctx, fetch } = makeContext(
            paths,
            {
                [tokenUrl]: jsonResponse({
                    access_token: newJwt,
                    refresh_token: "FAKE-LXNS-REFRESH-0002",
                    token_type: "Bearer",
                    expires_in: 3600,
                }),
            },
            logLines,
            () => new Date(nowMs)
        );

        const result = await withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
            lxnsAccessToken(ctx, store, handle, user)
        );

        expect(result.accessToken).toBe(newJwt);
        expect(result.refreshToken).toBe("FAKE-LXNS-REFRESH-0002");
        expect(fetch.requests.length).toBe(1);
        expect(fetch.requests[0].url).toBe(tokenUrl);
        expect(fetch.requests[0].init?.method).toBe("POST");
        expect(fetch.requests[0].init?.body).toContain("grant_type=refresh_token");
        expect(fetch.requests[0].init?.body).toContain("refresh_token=FAKE-LXNS-REFRESH-0001");

        // Verify credentials file update
        const updatedCreds = readCredentials(paths);
        const userEntry = updatedCreds.users.u1;
        expect((userEntry.lxnsAuthorization as LXNSAuth).accessToken).toBe(newJwt);
        expect((userEntry.lxnsAuthorization as LXNSAuth).refreshToken).toBe(
            "FAKE-LXNS-REFRESH-0002"
        );
        expect(userEntry.lxnsIssuedAt).toBe(nowMs);
        expect(userEntry.lxnsAccountId).toBe(1001);

        // Stored user remains unchanged
        const storedUser = readUser(store, "u1");
        expect(storedUser?.lxns?.auth).toBeNull();
        expect(storedUser?.lxns?.id).toBe(1001);

        // Verify log line
        expect(logLines.some(l => l.includes("已刷新用户") && l.includes("落雪授权"))).toBe(true);

        store.close();
    });

    it("enforces the account rule: authorization for another LXNS id fails with NOT_BOUND", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        const initialCreds = {
            version: 1 as const,
            users: {
                u1: {
                    lxnsAuthorization: {
                        accessToken: makeFakeJwt(
                            9999,
                            "OtherPlayer",
                            Math.floor((nowMs + 3600_000) / 1000)
                        ),
                        refreshToken: "FAKE-LXNS-REFRESH-0001",
                        tokenType: "Bearer",
                        expiresAt: nowMs + 3600_000,
                    },
                    lxnsAccountId: 9999, // Mismatch with user's 1001
                    lxnsIssuedAt: nowMs,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(initialCreds, null, 2)}\n`, "utf8");

        const { ctx, fetch } = makeContext(paths, {}, [], () => new Date(nowMs));
        let caught: unknown;
        try {
            await withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
                lxnsAccessToken(ctx, store, handle, user)
            );
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(CliError);
        const err = caught as CliError;
        expect(err.code).toBe("NOT_BOUND");
        expect(exitCodeOf(err.code)).toBe(4);
        expect(err.message).toContain("TestUser");
        expect(err.fix).toBe("saltnet user bind 0 lxns");
        expect(fetch.requests.length).toBe(0);

        assertNoSecrets(err.message);
        assertNoSecrets(err.fix);

        store.close();
    });

    it("handles invalid_grant: removes authorization and issue time, throws LXNS_REAUTH_REQUIRED", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        const initialCreds = {
            version: 1 as const,
            users: {
                u1: {
                    divingFishImportToken: "FAKE-DIVING-FISH-IMPORT-TOKEN-001",
                    lxnsAuthorization: {
                        accessToken: makeFakeJwt(
                            1001,
                            "FakePlayer",
                            Math.floor((nowMs + 10_000) / 1000)
                        ),
                        refreshToken: "FAKE-LXNS-REFRESH-0001",
                        tokenType: "Bearer",
                        expiresAt: nowMs + 10_000,
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: nowMs - 1000,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(initialCreds, null, 2)}\n`, "utf8");

        const tokenUrl = "https://maimai.lxns.net/api/v0/oauth/token";
        const { ctx, fetch } = makeContext(
            paths,
            {
                [tokenUrl]: jsonResponse(
                    {
                        error: "invalid_grant",
                        error_description: "Refresh token is invalid or expired",
                    },
                    400
                ),
            },
            [],
            () => new Date(nowMs)
        );

        let caught: unknown;
        try {
            await withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
                lxnsAccessToken(ctx, store, handle, user)
            );
        } catch (error) {
            caught = error;
        }

        // The stored refresh token is still the one that failed: no second try with it.
        expect(fetch.requests.map(r => r.url)).toEqual([tokenUrl]);
        expect(caught).toBeInstanceOf(CliError);
        const err = caught as CliError;
        expect(err.code).toBe("LXNS_REAUTH_REQUIRED");
        expect(exitCodeOf(err.code)).toBe(4);
        expect(err.message).toContain("TestUser");
        expect(err.message).toMatch(/已失效或已被撤销/);
        expect(err.fix).toBe("saltnet user bind 0 lxns");

        assertNoSecrets(err.message);
        assertNoSecrets(err.fix);

        // Check credentials: lxnsAuthorization, lxnsIssuedAt, lxnsAccountId removed, DF kept
        const updatedCreds = readCredentials(paths);
        expect(updatedCreds.users.u1.divingFishImportToken).toBe(
            "FAKE-DIVING-FISH-IMPORT-TOKEN-001"
        );
        expect(updatedCreds.users.u1.lxnsAuthorization).toBeUndefined();
        expect(updatedCreds.users.u1.lxnsIssuedAt).toBeUndefined();
        expect(updatedCreds.users.u1.lxnsAccountId).toBeUndefined();

        // Stored user still has LXNS id and name
        const storedUser = readUser(store, "u1");
        expect(storedUser?.lxns?.id).toBe(1001);
        expect(storedUser?.lxns?.name).toBe("FakePlayer");

        store.close();
    });

    it("retries after invalid_grant when another writer replaced the authorization", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        const initialCreds = {
            version: 1 as const,
            users: {
                u1: {
                    lxnsAuthorization: {
                        accessToken: makeFakeJwt(
                            1001,
                            "FakePlayer",
                            Math.floor((nowMs + 10_000) / 1000)
                        ),
                        refreshToken: "FAKE-LXNS-REFRESH-0001",
                        tokenType: "Bearer",
                        expiresAt: nowMs + 10_000,
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: nowMs - 1000,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(initialCreds, null, 2)}\n`, "utf8");

        const freshJwt = makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs + 3600_000) / 1000));
        const tokenUrl = "https://maimai.lxns.net/api/v0/oauth/token";

        // Route simulates another process writing fresh tokens before responding with invalid_grant
        const { ctx, fetch } = makeContext(
            paths,
            {
                [tokenUrl]: () => {
                    const replacedCreds = {
                        version: 1 as const,
                        users: {
                            u1: {
                                lxnsAuthorization: {
                                    accessToken: freshJwt,
                                    refreshToken: "FAKE-LXNS-REFRESH-NEW",
                                    tokenType: "Bearer",
                                    expiresAt: nowMs + 3600_000,
                                },
                                lxnsAccountId: 1001,
                                lxnsIssuedAt: nowMs,
                            },
                        },
                    };
                    writeFileSync(
                        paths.credentials,
                        `${JSON.stringify(replacedCreds, null, 2)}\n`,
                        "utf8"
                    );
                    return jsonResponse(
                        {
                            error: "invalid_grant",
                            error_description: "Refresh token has been rotated",
                        },
                        400
                    );
                },
            },
            [],
            () => new Date(nowMs)
        );

        const result = await withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
            lxnsAccessToken(ctx, store, handle, user)
        );

        // Used and kept the replacement authorization
        expect(result.accessToken).toBe(freshJwt);
        expect(result.refreshToken).toBe("FAKE-LXNS-REFRESH-NEW");
        expect(fetch.requests.length).toBe(1);

        const currentCreds = readCredentials(paths);
        expect((currentCreds.users.u1.lxnsAuthorization as LXNSAuth).refreshToken).toBe(
            "FAKE-LXNS-REFRESH-NEW"
        );

        store.close();
    });

    it("handles identity change: removes authorization and throws LXNS_REAUTH_REQUIRED", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        const initialCreds = {
            version: 1 as const,
            users: {
                u1: {
                    lxnsAuthorization: {
                        accessToken: makeFakeJwt(
                            1001,
                            "FakePlayer",
                            Math.floor((nowMs + 10_000) / 1000)
                        ),
                        refreshToken: "FAKE-LXNS-REFRESH-0001",
                        tokenType: "Bearer",
                        expiresAt: nowMs + 10_000,
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: nowMs - 1000,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(initialCreds, null, 2)}\n`, "utf8");

        // Token endpoint returns a token for a DIFFERENT account id: 2002
        const differentJwt = makeFakeJwt(
            2002,
            "DifferentPlayer",
            Math.floor((nowMs + 3600_000) / 1000)
        );
        const tokenUrl = "https://maimai.lxns.net/api/v0/oauth/token";
        const { ctx } = makeContext(
            paths,
            {
                [tokenUrl]: jsonResponse({
                    access_token: differentJwt,
                    refresh_token: "FAKE-LXNS-REFRESH-0002",
                    token_type: "Bearer",
                    expires_in: 3600,
                }),
            },
            [],
            () => new Date(nowMs)
        );

        let caught: unknown;
        try {
            await withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
                lxnsAccessToken(ctx, store, handle, user)
            );
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(CliError);
        const err = caught as CliError;
        expect(err.code).toBe("LXNS_REAUTH_REQUIRED");
        expect(exitCodeOf(err.code)).toBe(4);
        expect(err.message).toContain("另一个落雪账号");
        expect(err.fix).toBe("saltnet user bind 0 lxns");

        assertNoSecrets(err.message);
        assertNoSecrets(err.fix);

        // Tokens removed
        const creds = readCredentials(paths);
        expect(creds.users.u1?.lxnsAuthorization).toBeUndefined();

        store.close();
    });

    it("passes through network failures and 500 without modifying credentials", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        const initialCreds = {
            version: 1 as const,
            users: {
                u1: {
                    lxnsAuthorization: {
                        accessToken: makeFakeJwt(
                            1001,
                            "FakePlayer",
                            Math.floor((nowMs + 10_000) / 1000)
                        ),
                        refreshToken: "FAKE-LXNS-REFRESH-0001",
                        tokenType: "Bearer",
                        expiresAt: nowMs + 10_000,
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: nowMs - 1000,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(initialCreds, null, 2)}\n`, "utf8");
        const beforeBytes = readFileSync(paths.credentials);

        const tokenUrl = "https://maimai.lxns.net/api/v0/oauth/token";

        // Case 1: 500 error
        const { ctx: ctx500 } = makeContext(
            paths,
            {
                [tokenUrl]: textResponse("Internal Error", 500),
            },
            [],
            () => new Date(nowMs)
        );

        await expect(
            withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
                lxnsAccessToken(ctx500, store, handle, user)
            )
        ).rejects.toThrowError(expect.objectContaining({ code: "UPSTREAM_ERROR" }));
        expect(readFileSync(paths.credentials)).toEqual(beforeBytes);

        // Case 2: network error
        const { ctx: ctxNet } = makeContext(
            paths,
            {
                [tokenUrl]: () => {
                    throw new Error("ECONNREFUSED");
                },
            },
            [],
            () => new Date(nowMs)
        );

        await expect(
            withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
                lxnsAccessToken(ctxNet, store, handle, user)
            )
        ).rejects.toThrowError(expect.objectContaining({ code: "NETWORK" }));
        expect(readFileSync(paths.credentials)).toEqual(beforeBytes);

        store.close();
    });

    it("does not retry failing token requests (sends exactly once)", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        const initialCreds = {
            version: 1 as const,
            users: {
                u1: {
                    lxnsAuthorization: {
                        accessToken: makeFakeJwt(
                            1001,
                            "FakePlayer",
                            Math.floor((nowMs + 10_000) / 1000)
                        ),
                        refreshToken: "FAKE-LXNS-REFRESH-0001",
                        tokenType: "Bearer",
                        expiresAt: nowMs + 10_000,
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: nowMs - 1000,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(initialCreds, null, 2)}\n`, "utf8");

        const tokenUrl = "https://maimai.lxns.net/api/v0/oauth/token";
        const { ctx, fetch } = makeContext(
            paths,
            {
                [tokenUrl]: textResponse("Server Error", 502),
            },
            [],
            () => new Date(nowMs)
        );

        await expect(
            withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
                lxnsAccessToken(ctx, store, handle, user)
            )
        ).rejects.toThrow();

        expect(fetch.requests.length).toBe(1);

        store.close();
    });

    it("coordinates two processes: concurrent refresh gets SYNC_IN_PROGRESS and sends nothing", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        const initialCreds = {
            version: 1 as const,
            users: {
                u1: {
                    lxnsAuthorization: {
                        accessToken: makeFakeJwt(
                            1001,
                            "FakePlayer",
                            Math.floor((nowMs + 10_000) / 1000)
                        ),
                        refreshToken: "FAKE-LXNS-REFRESH-0001",
                        tokenType: "Bearer",
                        expiresAt: nowMs + 10_000,
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: nowMs - 1000,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(initialCreds, null, 2)}\n`, "utf8");

        const newJwt = makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs + 3600_000) / 1000));
        const tokenUrl = "https://maimai.lxns.net/api/v0/oauth/token";
        const { ctx, fetch } = makeContext(
            paths,
            {
                [tokenUrl]: delayedRoute(
                    jsonResponse({
                        access_token: newJwt,
                        refresh_token: "FAKE-LXNS-REFRESH-0002",
                        token_type: "Bearer",
                        expires_in: 3600,
                    }),
                    100
                ),
            },
            [],
            () => new Date(nowMs)
        );

        // Process 1 enters withSyncLock and begins delayed refresh
        const proc1Promise = withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
            lxnsAccessToken(ctx, store, handle, user)
        );

        // Process 2 tries to take the lock while Process 1 is refreshing
        await expect(
            withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
                lxnsAccessToken(ctx, store, handle, user)
            )
        ).rejects.toThrowError(expect.objectContaining({ code: "SYNC_IN_PROGRESS" }));

        // Process 1 finishes successfully
        const auth1 = await proc1Promise;
        expect(auth1.accessToken).toBe(newJwt);
        expect(fetch.requests.length).toBe(1);

        // Process 3 runs afterwards: finds refreshed token and sends nothing
        const auth3 = await withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
            lxnsAccessToken(ctx, store, handle, user)
        );
        expect(auth3.accessToken).toBe(newJwt);
        expect(fetch.requests.length).toBe(1);

        store.close();
    });

    it("writes nothing if assertHeld fails before the write", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        const initialCreds = {
            version: 1 as const,
            users: {
                u1: {
                    lxnsAuthorization: {
                        accessToken: makeFakeJwt(
                            1001,
                            "FakePlayer",
                            Math.floor((nowMs + 10_000) / 1000)
                        ),
                        refreshToken: "FAKE-LXNS-REFRESH-0001",
                        tokenType: "Bearer",
                        expiresAt: nowMs + 10_000,
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: nowMs - 1000,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(initialCreds, null, 2)}\n`, "utf8");
        const beforeBytes = readFileSync(paths.credentials);

        const newJwt = makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs + 3600_000) / 1000));
        const tokenUrl = "https://maimai.lxns.net/api/v0/oauth/token";
        const { ctx } = makeContext(
            paths,
            {
                [tokenUrl]: jsonResponse({
                    access_token: newJwt,
                    refresh_token: "FAKE-LXNS-REFRESH-0002",
                    token_type: "Bearer",
                    expires_in: 3600,
                }),
            },
            [],
            () => new Date(nowMs)
        );

        await withSyncLock(store, { uid: "u1", name: "TestUser" }, async handle => {
            let callCount = 0;
            const originalAssertHeld = handle.assertHeld;
            handle.assertHeld = () => {
                callCount++;
                if (callCount > 1) {
                    throw new CliError("INTERNAL", "Lost lock");
                }
                originalAssertHeld();
            };

            await expect(lxnsAccessToken(ctx, store, handle, user)).rejects.toThrow("Lost lock");
        });

        expect(readFileSync(paths.credentials)).toEqual(beforeBytes);
        store.close();
    });

    it("leaves credentials unchanged and returns new authorization if stored entry was replaced meanwhile during refresh", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        const oldJwt = makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs + 10_000) / 1000));
        const newJwt = makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs + 3600_000) / 1000));
        const concurrentJwt = makeFakeJwt(
            1001,
            "FakePlayer",
            Math.floor((nowMs + 7200_000) / 1000)
        );

        const initialCreds = {
            version: 1 as const,
            users: {
                u1: {
                    lxnsAuthorization: {
                        accessToken: oldJwt,
                        refreshToken: "FAKE-LXNS-REFRESH-0001",
                        tokenType: "Bearer",
                        expiresAt: nowMs + 10_000,
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: nowMs - 1000,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(initialCreds, null, 2)}\n`, "utf8");

        const tokenUrl = "https://maimai.lxns.net/api/v0/oauth/token";
        const { ctx } = makeContext(
            paths,
            {
                [tokenUrl]: () => {
                    // Another writer replaced the entry meanwhile
                    const replacedCreds = {
                        version: 1 as const,
                        users: {
                            u1: {
                                lxnsAuthorization: {
                                    accessToken: concurrentJwt,
                                    refreshToken: "FAKE-LXNS-REFRESH-REPLACED",
                                    tokenType: "Bearer",
                                    expiresAt: nowMs + 7200_000,
                                },
                                lxnsAccountId: 1001,
                                lxnsIssuedAt: nowMs + 500,
                            },
                        },
                    };
                    writeFileSync(
                        paths.credentials,
                        `${JSON.stringify(replacedCreds, null, 2)}\n`,
                        "utf8"
                    );
                    return jsonResponse({
                        access_token: newJwt,
                        refresh_token: "FAKE-LXNS-REFRESH-NEW",
                        token_type: "Bearer",
                        expires_in: 3600,
                    });
                },
            },
            [],
            () => new Date(nowMs)
        );

        const result = await withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
            lxnsAccessToken(ctx, store, handle, user)
        );

        // Still returns the new authorization for this run
        expect(result.accessToken).toBe(newJwt);
        expect(result.refreshToken).toBe("FAKE-LXNS-REFRESH-NEW");

        // But credentials file was NOT overwritten with newJwt; it kept the replaced one
        const currentCreds = readCredentials(paths);
        expect((currentCreds.users.u1.lxnsAuthorization as LXNSAuth).accessToken).toBe(
            concurrentJwt
        );
        expect((currentCreds.users.u1.lxnsAuthorization as LXNSAuth).refreshToken).toBe(
            "FAKE-LXNS-REFRESH-REPLACED"
        );

        store.close();
    });

    it("leaves credentials unchanged and returns new authorization if stored entry was removed meanwhile during refresh", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        const oldJwt = makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs + 10_000) / 1000));
        const newJwt = makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs + 3600_000) / 1000));

        const initialCreds = {
            version: 1 as const,
            users: {
                u1: {
                    lxnsAuthorization: {
                        accessToken: oldJwt,
                        refreshToken: "FAKE-LXNS-REFRESH-0001",
                        tokenType: "Bearer",
                        expiresAt: nowMs + 10_000,
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: nowMs - 1000,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(initialCreds, null, 2)}\n`, "utf8");

        const tokenUrl = "https://maimai.lxns.net/api/v0/oauth/token";
        const { ctx } = makeContext(
            paths,
            {
                [tokenUrl]: () => {
                    // User unbind removed the credentials meanwhile
                    const emptyCreds = { version: 1 as const, users: {} };
                    writeFileSync(
                        paths.credentials,
                        `${JSON.stringify(emptyCreds, null, 2)}\n`,
                        "utf8"
                    );
                    return jsonResponse({
                        access_token: newJwt,
                        refresh_token: "FAKE-LXNS-REFRESH-NEW",
                        token_type: "Bearer",
                        expires_in: 3600,
                    });
                },
            },
            [],
            () => new Date(nowMs)
        );

        const result = await withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
            lxnsAccessToken(ctx, store, handle, user)
        );

        expect(result.accessToken).toBe(newJwt);
        expect(result.refreshToken).toBe("FAKE-LXNS-REFRESH-NEW");

        // Credentials file was NOT re-populated with the removed user
        const currentCreds = readCredentials(paths);
        expect(currentCreds.users.u1).toBeUndefined();

        store.close();
    });

    it("does not remove replaced authorization if invalid_grant or identity error occurs", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        const oldJwt = makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs + 10_000) / 1000));
        const concurrentJwt = makeFakeJwt(
            1001,
            "FakePlayer",
            Math.floor((nowMs + 7200_000) / 1000)
        );

        const initialCreds = {
            version: 1 as const,
            users: {
                u1: {
                    lxnsAuthorization: {
                        accessToken: oldJwt,
                        refreshToken: "FAKE-LXNS-REFRESH-0001",
                        tokenType: "Bearer",
                        expiresAt: nowMs + 10_000,
                    },
                    lxnsAccountId: 1001,
                    lxnsIssuedAt: nowMs - 1000,
                },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(initialCreds, null, 2)}\n`, "utf8");

        const differentJwt = makeFakeJwt(
            2002,
            "OtherPlayer",
            Math.floor((nowMs + 3600_000) / 1000)
        );
        const tokenUrl = "https://maimai.lxns.net/api/v0/oauth/token";
        const { ctx } = makeContext(
            paths,
            {
                [tokenUrl]: () => {
                    // Replaced by another writer
                    const replacedCreds = {
                        version: 1 as const,
                        users: {
                            u1: {
                                lxnsAuthorization: {
                                    accessToken: concurrentJwt,
                                    refreshToken: "FAKE-LXNS-REFRESH-REPLACED",
                                    tokenType: "Bearer",
                                    expiresAt: nowMs + 7200_000,
                                },
                                lxnsAccountId: 1001,
                                lxnsIssuedAt: nowMs + 500,
                            },
                        },
                    };
                    writeFileSync(
                        paths.credentials,
                        `${JSON.stringify(replacedCreds, null, 2)}\n`,
                        "utf8"
                    );
                    // Return identity change error
                    return jsonResponse({
                        access_token: differentJwt,
                        refresh_token: "FAKE-LXNS-REFRESH-NEW",
                        token_type: "Bearer",
                        expires_in: 3600,
                    });
                },
            },
            [],
            () => new Date(nowMs)
        );

        await expect(
            withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
                lxnsAccessToken(ctx, store, handle, user)
            )
        ).rejects.toThrowError(expect.objectContaining({ code: "LXNS_REAUTH_REQUIRED" }));

        // Replaced authorization survives because refreshToken did not match the failed one
        const currentCreds = readCredentials(paths);
        expect((currentCreds.users.u1.lxnsAuthorization as LXNSAuth).accessToken).toBe(
            concurrentJwt
        );
        expect((currentCreds.users.u1.lxnsAuthorization as LXNSAuth).refreshToken).toBe(
            "FAKE-LXNS-REFRESH-REPLACED"
        );

        store.close();
    });

    it("names the default user 0 in the fix", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        // Default user has index 0
        const defaultUser = makeUser("u0", 1001);
        saveUser(store, defaultUser);

        const nowMs = 1_000_000_000;
        // No credentials
        const { ctx } = makeContext(paths, {}, [], () => new Date(nowMs));

        let caught: unknown;
        try {
            await withSyncLock(store, { uid: "u0", name: "TestUser" }, handle =>
                lxnsAccessToken(ctx, store, handle, defaultUser)
            );
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(CliError);
        const err = caught as CliError;
        expect(err.code).toBe("NOT_BOUND");
        // For default user (index 0), fix must be "saltnet user bind 0 lxns"
        expect(err.fix).toBe("saltnet user bind 0 lxns");

        store.close();
    });

    it("names non-default user with quoted uid in fix", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const u0 = makeUser("u0", 1000);
        saveUser(store, u0);
        const u1 = makeUser("u1", 1001);
        saveUser(store, u1);

        const nowMs = 1_000_000_000;
        const { ctx } = makeContext(paths, {}, [], () => new Date(nowMs));

        let caught: unknown;
        try {
            await withSyncLock(store, { uid: "u1", name: "TestUser1" }, handle =>
                lxnsAccessToken(ctx, store, handle, u1)
            );
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(CliError);
        const err = caught as CliError;
        expect(err.code).toBe("NOT_BOUND");
        // For non-default user (index 1), fix must be "saltnet user bind u1 lxns"
        expect(err.fix).toBe("saltnet user bind u1 lxns");

        store.close();
    });

    it("prints a fix that runs as printed for a uid that starts with -", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        saveUser(store, makeUser("u0", 1000));
        const dash = makeUser("-u1 dash", 1001);
        saveUser(store, dash);
        const { ctx } = makeContext(paths, {}, [], () => new Date(1_000_000_000));

        let caught: unknown;
        try {
            await withSyncLock(store, { uid: "-u1 dash", name: "Dash" }, handle =>
                lxnsAccessToken(ctx, store, handle, dash)
            );
        } catch (error) {
            caught = error;
        }

        expect((caught as CliError).code).toBe("NOT_BOUND");
        expect(parsePrintedCommand((caught as CliError).fix)).toMatchObject({
            command: "user bind",
            positionals: { user: "-u1 dash", source: "lxns" },
        });
        store.close();
    });

    it("refreshes when the stored access token is empty even though it has not expired", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        const newJwt = makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs + 3600_000) / 1000));
        writeLxnsCredentials(paths, {
            accessToken: "",
            refreshToken: "FAKE-LXNS-REFRESH-0001",
            expiresAt: nowMs + 3600_000,
            issuedAt: nowMs - 1000,
        });

        const tokenUrl = "https://maimai.lxns.net/api/v0/oauth/token";
        const { ctx, fetch } = makeContext(
            paths,
            {
                [tokenUrl]: jsonResponse({
                    access_token: newJwt,
                    refresh_token: "FAKE-LXNS-REFRESH-0002",
                    token_type: "Bearer",
                    expires_in: 3600,
                }),
            },
            [],
            () => new Date(nowMs)
        );

        const result = await withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
            lxnsAccessToken(ctx, store, handle, user)
        );

        expect(fetch.requests.map(r => r.url)).toEqual([tokenUrl]);
        expect(result.accessToken).toBe(newJwt);

        store.close();
    });

    it("asks for a new authorization without a request when the refresh token is empty", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u1", 1001);
        saveUser(store, user);

        const nowMs = 1_000_000_000;
        writeLxnsCredentials(paths, {
            accessToken: makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs - 1000) / 1000)),
            refreshToken: "",
            expiresAt: nowMs - 1000,
            issuedAt: nowMs - 1000,
        });

        const { ctx, fetch } = makeContext(paths, {}, [], () => new Date(nowMs));

        let caught: unknown;
        try {
            await withSyncLock(store, { uid: "u1", name: "TestUser" }, handle =>
                lxnsAccessToken(ctx, store, handle, user)
            );
        } catch (error) {
            caught = error;
        }

        expect(fetch.requests.length).toBe(0);
        expect(caught).toBeInstanceOf(CliError);
        expect((caught as CliError).code).toBe("LXNS_REAUTH_REQUIRED");

        store.close();
    });

    it("refuses a sync lock handle that belongs to another user", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const u1 = makeUser("u1", 1001);
        saveUser(store, u1);
        saveUser(store, makeUser("u2", 1002));

        const nowMs = 1_000_000_000;
        const newJwt = makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs + 3600_000) / 1000));
        writeLxnsCredentials(paths, {
            accessToken: makeFakeJwt(1001, "FakePlayer", Math.floor((nowMs - 1000) / 1000)),
            refreshToken: "FAKE-LXNS-REFRESH-0001",
            expiresAt: nowMs - 1000,
            issuedAt: nowMs - 1000,
        });
        const beforeBytes = readFileSync(paths.credentials);

        const tokenUrl = "https://maimai.lxns.net/api/v0/oauth/token";
        const { ctx, fetch } = makeContext(
            paths,
            {
                [tokenUrl]: jsonResponse({
                    access_token: newJwt,
                    refresh_token: "FAKE-LXNS-REFRESH-0002",
                    token_type: "Bearer",
                    expires_in: 3600,
                }),
            },
            [],
            () => new Date(nowMs)
        );

        let caught: unknown;
        try {
            await withSyncLock(store, { uid: "u2", name: "TestUser" }, handle =>
                lxnsAccessToken(ctx, store, handle, u1)
            );
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(CliError);
        expect((caught as CliError).code).toBe("INTERNAL");
        expect(fetch.requests.length).toBe(0);
        expect(readFileSync(paths.credentials)).toEqual(beforeBytes);

        store.close();
    });
});
