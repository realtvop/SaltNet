import type { LXNSOAuthTransaction } from "@core/integrations/lxns/oauth";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { CliError } from "../../src/errors";
import {
    readCredentials,
    updateCredentials,
    withCredentialsLock,
} from "../../src/runtime/credentials";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import { saveUser } from "../../src/users/repository";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

function madeUser(uid: string, lxnsId?: number | null) {
    return {
        uid,
        remark: null,
        divingFish: { name: `fish-${uid}`, importToken: null },
        ...(lxnsId === undefined ? {} : { lxns: { id: lxnsId, name: null, auth: null } }),
        inGame: { id: 100, name: `game-${uid}`, enabled: true, useFastUpdate: true },
        settings: { manuallyUpdate: false },
        data: { updateTime: null, name: null, rating: null },
    };
}

function validTransaction(userUid: string, expiresAt: number): LXNSOAuthTransaction {
    return {
        userUid,
        codeVerifier: "a".repeat(43),
        clientId: "client-id-1",
        redirectUri: "https://example.com/oauth/callback",
        expiresAt,
    };
}

describe("readCredentials", () => {
    it("returns empty credentials when no file exists", () => {
        const paths = makeHome();
        expect(readCredentials(paths)).toEqual({ version: 1, users: {} });
    });

    it.each(['{"version":2,"users":{}}', '{"users":{}}'])(
        "rejects version other than 1 (%s) without modifying the file",
        content => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.credentials, content, "utf8");
            let caught: CliError | undefined;
            try {
                readCredentials(paths);
            } catch (error) {
                caught = error as CliError;
            }
            expect(caught).toBeInstanceOf(CliError);
            expect(caught?.code).toBe("INTERNAL");
            expect(caught?.message).toContain(paths.credentials);
            expect(caught?.message).not.toContain(content);
            expect(caught?.fix).toBe(
                `检查 ${paths.credentials}；修不好时可以把它移走，再重新绑定水鱼和落雪`
            );
            expect(readFileSync(paths.credentials, "utf8")).toBe(content);
        }
    );

    it.each([
        JSON.stringify({ version: 1, users: { "made-up-uid": "fake-token-as-string" } }),
        JSON.stringify({ version: 1, users: { "made-up-uid": null } }),
        JSON.stringify({ version: 1, users: { "made-up-uid": [] } }),
    ])("rejects non-object user entries (%s) without leaking secrets", content => {
        const paths = makeHome();
        mkdirSync(paths.home, { recursive: true });
        writeFileSync(paths.credentials, content, "utf8");
        let caught: CliError | undefined;
        try {
            readCredentials(paths);
        } catch (error) {
            caught = error as CliError;
        }
        expect(caught).toBeInstanceOf(CliError);
        expect(caught?.code).toBe("INTERNAL");
        expect(caught?.message).not.toContain("fake-token-as-string");
        expect(caught?.fix).toBe(
            `检查 ${paths.credentials}；修不好时可以把它移走，再重新绑定水鱼和落雪`
        );
        expect(readFileSync(paths.credentials, "utf8")).toBe(content);
    });

    it.each([
        JSON.stringify({ version: 1, users: {}, pendingLxnsAuthorizations: "not-an-object" }),
        JSON.stringify({ version: 1, users: {}, pendingLxnsAuthorizations: null }),
        JSON.stringify({ version: 1, users: {}, pendingLxnsAuthorizations: [] }),
        JSON.stringify({
            version: 1,
            users: {},
            pendingLxnsAuthorizations: { s1: "not-an-object" },
        }),
        JSON.stringify({ version: 1, users: {}, pendingLxnsAuthorizations: { s1: null } }),
        JSON.stringify({ version: 1, users: {}, pendingLxnsAuthorizations: { s1: [] } }),
        JSON.stringify({ version: 1, users: {}, unknownProp: 123 }),
    ])("rejects invalid pending authorizations and unknown top-level members (%s)", content => {
        const paths = makeHome();
        mkdirSync(paths.home, { recursive: true });
        writeFileSync(paths.credentials, content, "utf8");
        let caught: CliError | undefined;
        try {
            readCredentials(paths);
        } catch (error) {
            caught = error as CliError;
        }
        expect(caught).toBeInstanceOf(CliError);
        expect(caught?.code).toBe("INTERNAL");
        expect(caught?.message).toContain(paths.credentials);
        expect(caught?.message).not.toContain(content);
        expect(caught?.fix).toBe(
            `检查 ${paths.credentials}；修不好时可以把它移走，再重新绑定水鱼和落雪`
        );
        expect(readFileSync(paths.credentials, "utf8")).toBe(content);
    });

    it("returns valid credentials when file has one valid entry", () => {
        const paths = makeHome();
        mkdirSync(paths.home, { recursive: true });
        const valid = {
            version: 1 as const,
            users: {
                "made-up-uid": {
                    divingFishImportToken: "fake-import-token-unit",
                },
            },
        };
        writeFileSync(paths.credentials, JSON.stringify(valid), "utf8");
        expect(readCredentials(paths)).toEqual(valid);
    });

    it("accepts valid pendingLxnsAuthorizations", () => {
        const paths = makeHome();
        mkdirSync(paths.home, { recursive: true });
        const valid = {
            version: 1 as const,
            users: {},
            pendingLxnsAuthorizations: {
                state1: validTransaction("u1", 123456),
            },
        };
        writeFileSync(paths.credentials, JSON.stringify(valid), "utf8");
        expect(readCredentials(paths)).toEqual(valid);
    });
});

describe("withCredentialsLock and updateCredentials", () => {
    it("waits for a busy lock and succeeds once the first releases within wait", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const first = acquireLock(store, "credentials", { ttlMs: 10_000 });
        expect(first.acquired).toBe(true);
        if (!first.acquired) return;

        setTimeout(() => first.lock.release(), 50);

        let mutated = false;
        await updateCredentials(
            paths,
            store,
            curr => {
                mutated = true;
                return curr;
            },
            { waitIntervalMs: 20, timeoutMs: 500 }
        );
        expect(mutated).toBe(true);
        store.close();
    });

    it("fails with DB_LOCKED naming the holder's pid when lock is not released within wait", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const first = acquireLock(store, "credentials", { ttlMs: 10_000 });
        expect(first.acquired).toBe(true);
        if (!first.acquired) return;

        let caught: CliError | undefined;
        try {
            await updateCredentials(paths, store, curr => curr, {
                waitIntervalMs: 10,
                timeoutMs: 30,
            });
        } catch (error) {
            caught = error as CliError;
        }
        expect(caught).toBeInstanceOf(CliError);
        expect(caught?.code).toBe("DB_LOCKED");
        expect(caught?.message).toContain(
            `另一个 saltnet 进程（pid ${process.pid}）正在改凭据文件；稍后再试`
        );
        expect(caught?.retryable).toBe(true);
        first.lock.release();
        store.close();
    });

    it("releases the lock after a throwing mutate", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        await expect(
            updateCredentials(paths, store, () => {
                throw new Error("mutate failed");
            })
        ).rejects.toThrow("mutate failed");

        const next = acquireLock(store, "credentials", { ttlMs: 10_000 });
        expect(next.acquired).toBe(true);
        if (next.acquired) next.lock.release();
        store.close();
    });

    it("releases the lock after throwing in withCredentialsLock", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        await expect(
            withCredentialsLock(store, () => {
                throw new Error("work failed");
            })
        ).rejects.toThrow("work failed");

        const next = acquireLock(store, "credentials", { ttlMs: 10_000 });
        expect(next.acquired).toBe(true);
        if (next.acquired) next.lock.release();
        store.close();
    });

    it("writes mode 0600", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        saveUser(store, madeUser("user-1"));
        await updateCredentials(paths, store, () => ({
            version: 1,
            users: { "user-1": { divingFishImportToken: "fake-token" } },
        }));
        expect(statSync(paths.credentials).mode & 0o777).toBe(0o600);
        store.close();
    });

    it("writes nothing when mutate throws", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        mkdirSync(paths.home, { recursive: true });
        writeFileSync(paths.credentials, '{"version":1,"users":{}}\n', "utf8");

        await expect(
            updateCredentials(paths, store, () => {
                throw new Error("boom");
            })
        ).rejects.toThrow("boom");

        expect(readFileSync(paths.credentials, "utf8")).toBe('{"version":1,"users":{}}\n');
        store.close();
    });
    it("reads the file again inside the lock and keeps the entries the change leaves alone", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        saveUser(store, madeUser("u1"));
        saveUser(store, madeUser("u2"));
        writeFileSync(
            paths.credentials,
            `${JSON.stringify({ version: 1, users: { u1: { divingFishImportToken: "fake-u1" } } })}\n`,
            "utf8"
        );

        const result = await updateCredentials(paths, store, current => ({
            ...current,
            users: { ...current.users, u2: { divingFishImportToken: "fake-u2" } },
        }));

        expect(result.users).toEqual({
            u1: { divingFishImportToken: "fake-u1" },
            u2: { divingFishImportToken: "fake-u2" },
        });
        expect(readCredentials(paths)).toEqual(result);
        store.close();
    });
});

describe("pruning in updateCredentials", () => {
    it.each([
        ["equal ids", 7, true, 7, true],
        ["different ids", 7, true, 8, false],
        ["null and null", undefined, true, null, true],
        ["missing lxnsAccountId", 7, false, undefined, false],
    ])(
        "%s: prunes LXNS by its recorded account while keeping Diving Fish",
        async (_name, userId, hasMember, recordedId, keepsAuthorization) => {
            const paths = makeHome();
            const store = openStore(paths);
            saveUser(store, madeUser("u1", userId));
            const entry = {
                divingFishImportToken: "fake-diving-fish-token",
                lxnsAuthorization: { accessToken: "fake-lxns-token" },
                ...(hasMember ? { lxnsAccountId: recordedId } : {}),
                lxnsIssuedAt: 123456789,
            };
            const result = await updateCredentials(paths, store, () => ({
                version: 1,
                users: { u1: entry },
            }));
            expect(result.users.u1.divingFishImportToken).toBe("fake-diving-fish-token");
            expect(result.users.u1.lxnsAuthorization !== undefined).toBe(keepsAuthorization);
            expect(Object.hasOwn(result.users.u1, "lxnsAccountId")).toBe(keepsAuthorization);
            expect(Object.hasOwn(result.users.u1, "lxnsIssuedAt")).toBe(keepsAuthorization);
            if (keepsAuthorization) {
                expect(result.users.u1.lxnsIssuedAt).toBe(123456789);
            }
            store.close();
        }
    );

    it("drops a pending authorization that expires at now and keeps one that expires 1 min later", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        saveUser(store, madeUser("u1"));
        const nowMs = 1_000_000;

        const result = await updateCredentials(
            paths,
            store,
            () => ({
                version: 1,
                users: { u1: { divingFishImportToken: "token" } },
                pendingLxnsAuthorizations: {
                    expiredAtNow: validTransaction("u1", nowMs),
                    validLater: validTransaction("u1", nowMs + 60_000),
                },
            }),
            { now: () => nowMs }
        );

        expect(result.pendingLxnsAuthorizations).toEqual({
            validLater: validTransaction("u1", nowMs + 60_000),
        });
        store.close();
    });

    it("drops a malformed pending authorization", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        saveUser(store, madeUser("u1"));
        const nowMs = 1_000_000;

        const result = await updateCredentials(
            paths,
            store,
            () => ({
                version: 1,
                users: { u1: { divingFishImportToken: "token" } },
                pendingLxnsAuthorizations: {
                    badVerifier: {
                        userUid: "u1",
                        codeVerifier: "too-short",
                        clientId: "client",
                        redirectUri: "https://example.com",
                        expiresAt: nowMs + 60_000,
                    },
                },
            }),
            { now: () => nowMs }
        );

        expect(result.pendingLxnsAuthorizations).toEqual({});
        store.close();
    });

    it("drops a pending authorization whose userUid is not in the database", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        saveUser(store, madeUser("u1"));
        const nowMs = 1_000_000;

        const result = await updateCredentials(
            paths,
            store,
            () => ({
                version: 1,
                users: { u1: { divingFishImportToken: "token" } },
                pendingLxnsAuthorizations: {
                    unknownUser: validTransaction("nonexistent-uid", nowMs + 60_000),
                },
            }),
            { now: () => nowMs }
        );

        expect(result.pendingLxnsAuthorizations).toEqual({});
        store.close();
    });

    it("drops a users entry whose uid is not in the database", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        saveUser(store, madeUser("in-db"));

        const result = await updateCredentials(paths, store, () => ({
            version: 1,
            users: {
                "in-db": { divingFishImportToken: "token1" },
                "not-in-db": { divingFishImportToken: "token2" },
            },
        }));

        expect(result.users).toEqual({
            "in-db": { divingFishImportToken: "token1" },
        });
        store.close();
    });

    it("drops a users entry with neither divingFishImportToken nor lxnsAuthorization", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        saveUser(store, madeUser("u1"));
        saveUser(store, madeUser("u2"));
        saveUser(store, madeUser("u3"));

        const result = await updateCredentials(paths, store, () => ({
            version: 1,
            users: {
                u1: { divingFishImportToken: "token" },
                u2: { lxnsAuthorization: { accessToken: "token" }, lxnsAccountId: null },
                u3: {},
            },
        }));

        expect(Object.keys(result.users)).toEqual(["u1", "u2"]);
        expect(result.users.u3).toBeUndefined();
        store.close();
    });
});
