import type { FinishRunResult } from "../../src/sync/journal";
import { describe, expect, it, vi } from "vitest";
import { CliError } from "../../src/errors";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import * as journal from "../../src/sync/journal";
import { beginRun, finishRun, readRuns, recordRun, validateSummary } from "../../src/sync/journal";
import { withSyncLock } from "../../src/sync/lock";
import { VERSION } from "../../src/version";
import { caught } from "../caught";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

describe("sync journal", () => {
    it("can interrupt a user's abandoned running rows through the journal", async () => {
        const store = openStore(makeHome());
        const user = { uid: "fake-abandoned", name: "Fake Player" };
        try {
            await withSyncLock(store, user, handle => {
                beginRun(store, { kind: "sync", userUid: user.uid }, handle);
            });
            const interrupt = vi.spyOn(journal, "interruptRuns");
            try {
                await withSyncLock(store, user, () => {
                    expect(interrupt).toHaveBeenCalledWith(store, user.uid);
                    expect(readRuns(store).items).toMatchObject([
                        { userUid: user.uid, outcome: "interrupted", finishedAt: null },
                    ]);
                });
            } finally {
                interrupt.mockRestore();
            }
        } finally {
            store.close();
        }
    });

    it("begins and finishes a run with outcome ok", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = { uid: "u1", name: "User 1" };

        let runId = 0;
        await withSyncLock(store, user, handle => {
            runId = beginRun(
                store,
                {
                    kind: "sync",
                    userUid: user.uid,
                    userName: user.name,
                    source: "ingame",
                    mode: "full",
                },
                handle,
                { now: () => 1000, version: "1.2.3" }
            );
            expect(runId).toBeGreaterThan(0);

            // Row should be running
            const runs = readRuns(store);
            expect(runs.total).toBe(1);
            expect(runs.items[0]).toEqual({
                id: runId,
                kind: "sync",
                userUid: "u1",
                userName: "User 1",
                source: "ingame",
                mode: "full",
                outcome: "running",
                errorCode: null,
                errorMessage: null,
                summary: null,
                startedAt: 1000,
                finishedAt: null,
                cliVersion: "1.2.3",
            });

            finishRun(
                store,
                runId,
                {
                    outcome: "ok",
                    summary: { counts: { total: 10, updated: 2 } },
                },
                { now: () => 2000 }
            );
        });

        const finishedRuns = readRuns(store);
        expect(finishedRuns.total).toBe(1);
        expect(finishedRuns.items[0]).toEqual({
            id: runId,
            kind: "sync",
            userUid: "u1",
            userName: "User 1",
            source: "ingame",
            mode: "full",
            outcome: "ok",
            errorCode: null,
            errorMessage: null,
            summary: { counts: { total: 10, updated: 2 } },
            startedAt: 1000,
            finishedAt: 2000,
            cliVersion: "1.2.3",
        });

        store.close();
    });

    it("begins and finishes a run with outcome failed (recording error code and message)", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = { uid: "u2", name: "User 2" };

        let runId = 0;
        await withSyncLock(store, user, handle => {
            runId = beginRun(
                store,
                {
                    kind: "upload",
                    userUid: user.uid,
                    userName: user.name,
                    source: "lxns",
                },
                handle,
                { now: () => 3000, version: "2.0.0" }
            );

            const err = new CliError("NETWORK", "连接落雪超时");
            finishRun(
                store,
                runId,
                {
                    outcome: "failed",
                    error: err,
                    summary: { attempt: 1 },
                },
                { now: () => 4000 }
            );
        });

        const runs = readRuns(store);
        expect(runs.total).toBe(1);
        expect(runs.items[0]).toEqual({
            id: runId,
            kind: "upload",
            userUid: "u2",
            userName: "User 2",
            source: "lxns",
            mode: null,
            outcome: "failed",
            errorCode: "NETWORK",
            errorMessage: "连接落雪超时",
            summary: { attempt: 1 },
            startedAt: 3000,
            finishedAt: 4000,
            cliVersion: "2.0.0",
        });

        store.close();
    });

    it("finishRun inside a rolled back transaction leaves the row running", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = { uid: "u3", name: "User 3" };

        await withSyncLock(store, user, handle => {
            const runId = beginRun(
                store,
                {
                    kind: "account",
                    userUid: user.uid,
                    userName: user.name,
                    source: "ingame",
                    mode: "clear-tickets",
                },
                handle,
                { now: () => 5000 }
            );

            expect(() => {
                store.transaction(() => {
                    finishRun(store, runId, { outcome: "ok" }, { now: () => 6000 });
                    throw new Error("transaction failed");
                });
            }).toThrow("transaction failed");

            const runs = readRuns(store);
            expect(runs.items[0].outcome).toBe("running");
            expect(runs.items[0].finishedAt).toBeNull();
        });

        store.close();
    });

    it("fails when finishing a non-existent or already finished id", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = { uid: "u4", name: "User 4" };

        await withSyncLock(store, user, handle => {
            const runId = beginRun(store, { kind: "sync", userUid: user.uid }, handle);
            finishRun(store, runId, { outcome: "ok" });

            // Already finished
            expect(() => finishRun(store, runId, { outcome: "ok" })).toThrow(CliError);
            try {
                finishRun(store, runId, { outcome: "ok" });
            } catch (e) {
                expect((e as CliError).code).toBe("INTERNAL");
                expect((e as CliError).message).toContain("不是 running");
            }

            // Non-existent id
            expect(() => finishRun(store, 999999, { outcome: "ok" })).toThrow(CliError);
            try {
                finishRun(store, 999999, { outcome: "ok" });
            } catch (e) {
                expect((e as CliError).code).toBe("INTERNAL");
                expect((e as CliError).message).toContain("找不到 sync_runs 记录 999999");
            }
        });

        store.close();
    });

    it("recordRun inside a rolled-back transaction leaves no row", () => {
        const paths = makeHome();
        const store = openStore(paths);

        expect(() => {
            store.transaction(() => {
                recordRun(
                    store,
                    { kind: "import" },
                    { outcome: "ok", summary: { users: 2, scoreEvents: 10 } }
                );
                expect(readRuns(store).total).toBe(1);
                throw new Error("abort transaction");
            });
        }).toThrow("abort transaction");

        expect(readRuns(store).total).toBe(0);
        store.close();
    });

    it("rejects forbidden secret keys at any depth and names the key without the value", () => {
        const forbiddenKeys = [
            "token",
            "accessToken",
            "AUTHORIZATION",
            "user_verifier",
            "secret",
            "my_password",
            "cookieData",
            "qr",
            "qrCode",
        ];

        for (const key of forbiddenKeys) {
            // Top level
            expect(() => validateSummary({ [key]: "super_secret_value_123" })).toThrow(CliError);
            try {
                validateSummary({ [key]: "super_secret_value_123" });
            } catch (e) {
                expect((e as CliError).code).toBe("INTERNAL");
                expect((e as CliError).message).toContain(`"${key}"`);
                expect((e as CliError).message).not.toContain("super_secret_value_123");
            }

            // Nested in an object
            expect(() =>
                validateSummary({ meta: { nested: { [key]: "nested_secret_456" } } })
            ).toThrow(CliError);
            try {
                validateSummary({ meta: { nested: { [key]: "nested_secret_456" } } });
            } catch (e) {
                expect((e as CliError).code).toBe("INTERNAL");
                expect((e as CliError).message).toContain(`"${key}"`);
                expect((e as CliError).message).not.toContain("nested_secret_456");
            }

            // Nested inside an array
            expect(() =>
                validateSummary({ items: [1, { details: [{ [key]: "array_secret_789" }] }] })
            ).toThrow(CliError);
            try {
                validateSummary({ items: [1, { details: [{ [key]: "array_secret_789" }] }] });
            } catch (e) {
                expect((e as CliError).code).toBe("INTERNAL");
                expect((e as CliError).message).toContain(`"${key}"`);
                expect((e as CliError).message).not.toContain("array_secret_789");
            }
        }
    });

    it("rejects summaries with undefined, functions, NaN, or Dates", () => {
        // undefined value in object
        expect(() => validateSummary({ a: undefined })).toThrow(CliError);
        // undefined in array
        expect(() => validateSummary({ a: [1, undefined] })).toThrow(CliError);
        // function
        expect(() => validateSummary({ fn: () => {} })).toThrow(CliError);
        // NaN
        expect(() => validateSummary({ num: Number.NaN })).toThrow(CliError);
        // Infinity
        expect(() => validateSummary({ num: Number.POSITIVE_INFINITY })).toThrow(CliError);
        // Date class instance
        expect(() => validateSummary({ time: new Date() })).toThrow(CliError);
        // Non-object at top level
        expect(() => validateSummary([1, 2])).toThrow(CliError);
        expect(() => validateSummary("not an object")).toThrow(CliError);
        expect(() => validateSummary(123)).toThrow(CliError);
    });

    it("rejects a cyclic summary but accepts an object that appears twice", () => {
        const cyclic: Record<string, unknown> = { a: 1 };
        cyclic.nested = { back: cyclic };
        const error = caught(() => validateSummary(cyclic));
        expect(error.code).toBe("INTERNAL");
        expect(error.message).toContain("循环引用");

        const shared = { n: 1 };
        expect(validateSummary({ a: shared, b: [shared] })).toBe('{"a":{"n":1},"b":[{"n":1}]}');
    });

    it("refuses a lock for a kind that takes none", () => {
        const paths = makeHome();
        const store = openStore(paths);
        const acquisition = acquireLock(store, "sync:u1", { ttlMs: 100_000 });
        if (!acquisition.acquired) throw new Error("expected the lock");
        const error = caught(() => beginRun(store, { kind: "import" }, acquisition.lock));
        expect(error.code).toBe("INTERNAL");
        expect(error.message).toContain("import 操作不需要同步锁");
        expect(readRuns(store).total).toBe(0);
        acquisition.lock.release();
        store.close();
    });

    it("readRuns orders newest first, filters by user, kind, and since, and pages with correct total", () => {
        const paths = makeHome();
        const store = openStore(paths);

        // Record a series of runs; a sync or upload run is begun under its user's sync lock
        const finished = (
            kind: "sync" | "upload",
            userUid: string,
            result: FinishRunResult,
            at: number
        ) => {
            const now = () => at;
            const acquisition = acquireLock(store, `sync:${userUid}`, { ttlMs: 60_000, now });
            if (!acquisition.acquired) throw new Error("the sync lock should be free");
            const id = beginRun(store, { kind, userUid }, acquisition.lock, { now });
            finishRun(store, id, result, { now });
            acquisition.lock.release();
        };
        recordRun(
            store,
            { kind: "import", userUid: null },
            { outcome: "ok", summary: { step: 1 } },
            { now: () => 100 }
        );
        finished("sync", "u1", { outcome: "ok", summary: { step: 2 } }, 200);
        finished(
            "sync",
            "u2",
            { outcome: "failed", errorMessage: "fail", summary: { step: 3 } },
            300
        );
        finished("upload", "u1", { outcome: "ok", summary: { step: 4 } }, 400);
        finished("sync", "u1", { outcome: "ok", summary: { step: 5 } }, 500);

        // All runs: newest first
        const all = readRuns(store);
        expect(all.total).toBe(5);
        expect(all.items.map(r => r.id)).toEqual([5, 4, 3, 2, 1]);

        // Filter by userUid
        const u1Runs = readRuns(store, { userUid: "u1" });
        expect(u1Runs.total).toBe(3);
        expect(u1Runs.items.map(r => r.id)).toEqual([5, 4, 2]);

        // Filter by userUid null (import)
        const nullUserRuns = readRuns(store, { userUid: null });
        expect(nullUserRuns.total).toBe(1);
        expect(nullUserRuns.items[0].id).toBe(1);

        // Filter by kind
        const syncRuns = readRuns(store, { kind: "sync" });
        expect(syncRuns.total).toBe(3);
        expect(syncRuns.items.map(r => r.id)).toEqual([5, 3, 2]);

        // Filter by since
        const since300 = readRuns(store, { since: 300 });
        expect(since300.total).toBe(3);
        expect(since300.items.map(r => r.id)).toEqual([5, 4, 3]);

        // Combined filter with paging
        const paged = readRuns(store, { userUid: "u1", limit: 2, offset: 1 });
        expect(paged.total).toBe(3);
        expect(paged.items.map(r => r.id)).toEqual([4, 2]);

        store.close();
    });

    it("refuses to record a sync, upload or account run in one step", () => {
        const paths = makeHome();
        const store = openStore(paths);
        for (const kind of ["sync", "upload", "account"] as const) {
            expect(() =>
                recordRun(store, { kind, userUid: "u1", userName: "U" }, { outcome: "ok" })
            ).toThrow(CliError);
        }
        expect(readRuns(store).total).toBe(0);
        store.close();
    });

    it("supports the usage import needs: recordRun of kind import inside transaction with other table writes", () => {
        const paths = makeHome();
        const store = openStore(paths);

        // Commit transaction writes both
        store.transaction(() => {
            store.db.exec("INSERT INTO favorites (id, position, name) VALUES (1, 0, 'fav1')");
            recordRun(
                store,
                { kind: "import", userUid: null, userName: null },
                { outcome: "ok", summary: { users: 3, scoreEvents: 15 } }
            );
        });

        expect(store.db.prepare("SELECT count(*) AS n FROM favorites").get()).toEqual({ n: 1 });
        const runs = readRuns(store);
        expect(runs.total).toBe(1);
        expect(runs.items[0].kind).toBe("import");
        expect(runs.items[0].userUid).toBeNull();
        expect(runs.items[0].summary).toEqual({ users: 3, scoreEvents: 15 });
        // Written by this build when the caller names no version.
        expect(runs.items[0].cliVersion).toBe(VERSION);

        // Rollback transaction rolls back both
        expect(() => {
            store.transaction(() => {
                store.db.exec("INSERT INTO favorites (id, position, name) VALUES (2, 1, 'fav2')");
                recordRun(
                    store,
                    { kind: "import", userUid: null },
                    { outcome: "ok", summary: { users: 1, scoreEvents: 0 } }
                );
                throw new Error("failed import");
            });
        }).toThrow("failed import");

        expect(store.db.prepare("SELECT count(*) AS n FROM favorites").get()).toEqual({ n: 1 });
        expect(readRuns(store).total).toBe(1);

        store.close();
    });
});
