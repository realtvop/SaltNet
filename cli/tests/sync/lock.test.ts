import process from "node:process";
import { describe, expect, it, vi } from "vitest";
import { CliError, exitCodeOf } from "../../src/errors";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import { beginRun, readRuns } from "../../src/sync/journal";
import { assertNoSync, withSyncLock } from "../../src/sync/lock";
import { formatLocalTime } from "../../src/util/time";
import { caught } from "../caught";
import { insertMadeUsers } from "../madeUsers";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

describe("sync lock", () => {
    it("throws SYNC_IN_PROGRESS when lock is held without running work", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = { uid: "u1", name: "Alice" };

        let workCalled = false;
        await withSyncLock(store, user, async () => {
            // A second process tries to take the lock
            let caught: unknown;
            try {
                await withSyncLock(store, user, () => {
                    workCalled = true;
                });
            } catch (error) {
                caught = error;
            }

            expect(workCalled).toBe(false);
            expect(caught).toBeInstanceOf(CliError);
            const err = caught as CliError;
            expect(err.code).toBe("SYNC_IN_PROGRESS");
            expect(err.retryable).toBe(true);
            expect(exitCodeOf(err.code)).toBe(7);
            expect(err.message).toContain("用户 Alice 正在由另一个 saltnet 进程");
            expect(err.message).toContain(`pid ${process.pid}`);
            expect(err.extra).toBeDefined();
            const holder = (
                err.extra as { holder: { pid: number; acquiredAt: string; expiresAt: string } }
            ).holder;
            expect(holder.pid).toBe(process.pid);
            expect(holder.acquiredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
            expect(holder.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
            expect(err.message).toContain("可能已中断");
            expect(err.message).toContain(holder.expiresAt);
        });

        store.close();
    });

    it("marks the lock lost when background renewal throws and releases it on failure", async () => {
        vi.useFakeTimers();
        const store = openStore(makeHome());
        try {
            await expect(
                withSyncLock(store, { uid: "u1", name: "Alice" }, handle => {
                    const renewal = vi.spyOn(handle.lock, "renew").mockImplementationOnce(() => {
                        throw new Error("made-up database busy failure");
                    });
                    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
                    expect(renewal).toHaveBeenCalledTimes(1);
                    handle.assertHeld();
                })
            ).rejects.toMatchObject({
                code: "INTERNAL",
                message: expect.stringContaining("同步锁已失效"),
            });
            expect(store.db.prepare("SELECT count(*) AS n FROM locks").get()).toEqual({ n: 0 });
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            store.close();
            vi.useRealTimers();
        }
    });

    it("releases the lock after work returns and after it throws", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = { uid: "u2", name: "Bob" };

        // Normal return
        await withSyncLock(store, user, () => "done");
        expect(
            store.db.prepare("SELECT count(*) AS n FROM locks WHERE name = ?").get("sync:u2")
        ).toEqual({ n: 0 });

        // When work throws
        await expect(
            withSyncLock(store, user, () => {
                throw new Error("failed");
            })
        ).rejects.toThrow("failed");
        expect(
            store.db.prepare("SELECT count(*) AS n FROM locks WHERE name = ?").get("sync:u2")
        ).toEqual({ n: 0 });

        store.close();
    });

    it("takes an expired lock", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = { uid: "u3", name: "Charlie" };

        let time = 1000;
        const now = () => time;

        acquireLock(store, "sync:u3", { ttlMs: 1500, now });
        expect(
            store.db.prepare("SELECT count(*) AS n FROM locks WHERE name = 'sync:u3'").get()
        ).toEqual({
            n: 1,
        });
        await expect(withSyncLock(store, user, () => {}, { now })).rejects.toMatchObject({
            code: "SYNC_IN_PROGRESS",
            retryable: true,
            message: expect.stringContaining(formatLocalTime(new Date(2500))),
        });

        // Fast forward time past expiry
        time = 2500;

        let acquired = false;
        await withSyncLock(
            store,
            user,
            () => {
                acquired = true;
            },
            { now }
        );

        expect(acquired).toBe(true);
        store.close();
    });

    it("marks this user's running rows interrupted and leaves another user's running rows alone", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const userA = { uid: "uA", name: "User A" };

        // Simulate an interrupted run for User A and User B
        store.db
            .prepare(
                `INSERT INTO sync_runs (kind, user_uid, user_name, outcome, started_at, cli_version)
                 VALUES ('sync', 'uA', 'User A', 'running', 1000, '0.0.0')`
            )
            .run();
        store.db
            .prepare(
                `INSERT INTO sync_runs (kind, user_uid, user_name, outcome, started_at, cli_version)
                 VALUES ('sync', 'uB', 'User B', 'running', 1000, '0.0.0')`
            )
            .run();

        // When User A takes sync lock, User A's running row should become interrupted
        await withSyncLock(store, userA, () => {
            const runsA = readRuns(store, { userUid: "uA" });
            expect(runsA.items[0].outcome).toBe("interrupted");
            expect(runsA.items[0].finishedAt).toBeNull();

            // User B's row is left alone
            const runsB = readRuns(store, { userUid: "uB" });
            expect(runsB.items[0].outcome).toBe("running");
        });

        store.close();
    });

    it("keeps the lock alive beyond TTL via renewal timer, and timer is cleared afterwards", async () => {
        vi.useFakeTimers();
        try {
            const paths = makeHome();
            const store = openStore(paths);
            const user = { uid: "u4", name: "Diana" };

            let currentTime = 1000;
            const now = () => currentTime;

            await withSyncLock(
                store,
                user,
                async handle => {
                    expect(handle.renew()).toBe(true);

                    // Advance timer by 60s
                    currentTime += 60_000;
                    vi.advanceTimersByTime(60_000);

                    // Lock should have been renewed
                    const lockRow = store.db
                        .prepare("SELECT expires_at FROM locks WHERE name = 'sync:u4'")
                        .get() as { expires_at: number };
                    expect(lockRow.expires_at).toBe(currentTime + 180_000);
                },
                { now, ttlMs: 180_000, renewIntervalMs: 60_000 }
            );

            // Lock released after withSyncLock completes
            expect(
                store.db.prepare("SELECT count(*) AS n FROM locks WHERE name = 'sync:u4'").get()
            ).toEqual({ n: 0 });

            // Timer should be cleared
            expect(vi.getTimerCount()).toBe(0);

            store.close();
        } finally {
            vi.useRealTimers();
        }
    });

    it("holds the lock for 3 minutes and renews it every minute by default", async () => {
        vi.useFakeTimers();
        try {
            const paths = makeHome();
            const store = openStore(paths);
            let currentTime = 1000;
            const lockRow = () =>
                store.db
                    .prepare("SELECT acquired_at, expires_at FROM locks WHERE name = 'sync:u5'")
                    .get() as { acquired_at: number; expires_at: number };

            await withSyncLock(
                store,
                { uid: "u5", name: "Eve" },
                () => {
                    expect(lockRow()).toEqual({ acquired_at: 1000, expires_at: 181_000 });
                    currentTime = 61_000;
                    vi.advanceTimersByTime(59_999);
                    expect(lockRow().expires_at).toBe(181_000);
                    vi.advanceTimersByTime(1);
                    expect(lockRow().expires_at).toBe(241_000);
                },
                { now: () => currentTime }
            );
            store.close();
        } finally {
            vi.useRealTimers();
        }
    });

    it("assertHeld throws once the lock was lost", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = { uid: "u5", name: "Eve" };

        const currentTime = 1000;
        const now = () => currentTime;

        await withSyncLock(
            store,
            user,
            handle => {
                handle.assertHeld();

                // Delete lock out from under it
                store.db.prepare("DELETE FROM locks WHERE name = 'sync:u5'").run();

                expect(() => handle.assertHeld()).toThrow(CliError);
                try {
                    handle.assertHeld();
                } catch (e) {
                    expect((e as CliError).code).toBe("INTERNAL");
                    expect((e as CliError).message).toContain("用户 Eve 的同步锁已失效");
                }
            },
            { now }
        );

        store.close();
    });

    it("beginRun of kind sync refuses a lock that belongs to another user or was released", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user1 = { uid: "u1", name: "User 1" };
        const user2 = { uid: "u2", name: "User 2" };

        await withSyncLock(store, user1, handle1 => {
            // Lock belongs to u1, trying to beginRun for u2
            expect(() =>
                beginRun(store, { kind: "sync", userUid: user2.uid, userName: user2.name }, handle1)
            ).toThrow(CliError);
            try {
                beginRun(
                    store,
                    { kind: "sync", userUid: user2.uid, userName: user2.name },
                    handle1
                );
            } catch (e) {
                expect((e as CliError).code).toBe("INTERNAL");
                expect((e as CliError).message).toContain("不一致");
            }
        });

        // After lock was released
        let releasedHandle!: Parameters<Parameters<typeof withSyncLock>[2]>[0];
        await withSyncLock(store, user1, handle => {
            releasedHandle = handle;
        });

        expect(() =>
            beginRun(
                store,
                { kind: "sync", userUid: user1.uid, userName: user1.name },
                releasedHandle
            )
        ).toThrow(CliError);
        try {
            beginRun(
                store,
                { kind: "sync", userUid: user1.uid, userName: user1.name },
                releasedHandle
            );
        } catch (e) {
            expect((e as CliError).code).toBe("INTERNAL");
            expect((e as CliError).message).toContain("已失效");
        }

        store.close();
    });

    it("assertNoSync with a uid ignores a lock that only shares a prefix and handles % and _ in uid", () => {
        const paths = makeHome();
        const store = openStore(paths);

        // Put a lock on sync:a
        acquireLock(store, "sync:a", { ttlMs: 100_000, now: () => 1000 });

        // assertNoSync for "ab" should NOT match "sync:a"
        expect(() => assertNoSync(store, "ab", () => 1000)).not.toThrow();

        // Put a lock on sync:a%b and sync:a_b
        acquireLock(store, "sync:a%b", { ttlMs: 100_000, now: () => 1000 });
        acquireLock(store, "sync:a_b", { ttlMs: 100_000, now: () => 1000 });

        // Checking "aXb" should NOT match "a%b" or "a_b" (ensuring no LIKE wildcard interpretation)
        expect(() => assertNoSync(store, "aXb", () => 1000)).not.toThrow();

        // Exact match for "a%b" should throw
        expect(() => assertNoSync(store, "a%b", () => 1000)).toThrow(CliError);

        // Exact match for "a_b" should throw
        expect(() => assertNoSync(store, "a_b", () => 1000)).toThrow(CliError);

        // Checking null checks all sync: locks
        expect(() => assertNoSync(store, null, () => 1000)).toThrow(CliError);

        store.close();
    });

    it("assertNoSync compares whole lock names: no LIKE patterns, case counts, other locks ignored", () => {
        const paths = makeHome();
        const store = openStore(paths);
        const now = () => 1000;
        acquireLock(store, "sync:aXb", { ttlMs: 100_000, now });
        acquireLock(store, "sync:Upper", { ttlMs: 100_000, now });

        expect(() => assertNoSync(store, "a_b", now)).not.toThrow();
        expect(() => assertNoSync(store, "a%", now)).not.toThrow();
        expect(() => assertNoSync(store, "upper", now)).not.toThrow();
        expect(caught(() => assertNoSync(store, "aXb", now)).code).toBe("SYNC_IN_PROGRESS");
        store.close();

        const other = openStore(makeHome());
        acquireLock(other, "metadata", { ttlMs: 100_000, now });
        acquireLock(other, "SYNC:u1", { ttlMs: 100_000, now });
        expect(() => assertNoSync(other, null, now)).not.toThrow();
        other.close();
    });

    it("assertNoSync names the user as the other commands do, or by uid once it is gone", () => {
        const paths = makeHome();
        const store = openStore(paths);
        const now = () => 1000;
        insertMadeUsers(store.db, [
            {
                uid: "u_named",
                position: 0,
                raw: JSON.stringify({ uid: "u_named", remark: "Named" }),
            },
        ]);
        const named = acquireLock(store, "sync:u_named", { ttlMs: 100_000, now });
        if (!named.acquired) throw new Error("expected the lock");
        for (const uid of ["u_named", null]) {
            expect(caught(() => assertNoSync(store, uid, now)).message).toContain(
                "用户 Named 正在"
            );
        }
        named.lock.release();

        acquireLock(store, "sync:u_gone", { ttlMs: 100_000, now });
        for (const uid of ["u_gone", null]) {
            expect(caught(() => assertNoSync(store, uid, now)).message).toContain(
                "用户 u_gone 正在"
            );
        }
        store.close();
    });

    it("assertNoSync inside store.transaction rolls back other writes when throwing SYNC_IN_PROGRESS", () => {
        const paths = makeHome();
        const store = openStore(paths);

        // Active lock for user "active_user"
        acquireLock(store, "sync:active_user", { ttlMs: 100_000, now: () => 1000 });

        expect(() => {
            store.transaction(() => {
                store.db.exec(
                    "INSERT INTO favorites (id, position, name) VALUES (10, 0, 'temp_fav')"
                );
                assertNoSync(store, "active_user", () => 1000);
            });
        }).toThrow(CliError);

        try {
            store.transaction(() => {
                assertNoSync(store, "active_user", () => 1000);
            });
        } catch (e) {
            expect((e as CliError).code).toBe("SYNC_IN_PROGRESS");
            expect((e as CliError).exitCode).toBe(7);
        }

        // The write to favorites should have rolled back
        expect(store.db.prepare("SELECT count(*) AS n FROM favorites WHERE id = 10").get()).toEqual(
            {
                n: 0,
            }
        );

        // Expired lock does not count
        expect(() => {
            store.transaction(() => {
                assertNoSync(store, "active_user", () => 200_000);
            });
        }).not.toThrow();

        // Nor for the check of every user
        acquireLock(store, "sync:other_user", { ttlMs: 100_000, now: () => 1000 });
        expect(() => {
            store.transaction(() => {
                assertNoSync(store, null, () => 200_000);
            });
        }).not.toThrow();

        store.close();
    });
});
