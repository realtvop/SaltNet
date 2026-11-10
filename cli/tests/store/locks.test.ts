import type { Store } from "../../src/store/store";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { acquireLock, withLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

/** Two connections to one database, the way two saltnet processes see it. */
function pair(): { first: Store; second: Store } {
    const paths = makeHome();
    return { first: openStore(paths), second: openStore(paths) };
}

/** A clock a test can move. */
function clock(start: number) {
    let at = start;
    return {
        now: () => at,
        set: (value: number) => void (at = value),
    };
}

describe("acquireLock", () => {
    it("takes a free lock and tells the next caller who has it", () => {
        const { first, second } = pair();
        const time = clock(1000);

        const mine = acquireLock(first, "sync:1", { ttlMs: 500, now: time.now });
        expect(mine.acquired).toBe(true);

        const theirs = acquireLock(second, "sync:1", { ttlMs: 500, now: time.now });
        expect(theirs).toEqual({
            acquired: false,
            holder: { pid: process.pid, acquiredAt: 1000, expiresAt: 1500 },
        });
    });

    it("is free again once the holder releases it", () => {
        const { first, second } = pair();
        const mine = acquireLock(first, "metadata", { ttlMs: 500 });
        if (!mine.acquired) throw new Error("expected the lock");

        mine.lock.release();

        expect(acquireLock(second, "metadata", { ttlMs: 500 }).acquired).toBe(true);
    });

    it("treats a lock as free once it has expired, as after a crash", () => {
        const { first, second } = pair();
        const time = clock(1000);
        const crashed = acquireLock(first, "sync:1", { ttlMs: 500, now: time.now });
        if (!crashed.acquired) throw new Error("expected the lock");

        time.set(1499);
        expect(acquireLock(second, "sync:1", { ttlMs: 500, now: time.now }).acquired).toBe(false);
        time.set(1500);
        const taken = acquireLock(second, "sync:1", { ttlMs: 500, now: time.now });
        expect(taken.acquired).toBe(true);

        // The old holder wakes up: it has lost the lock, and letting go must not free the new one.
        expect(crashed.lock.renew()).toBe(false);
        crashed.lock.release();
        expect(acquireLock(first, "sync:1", { ttlMs: 500, now: time.now }).acquired).toBe(false);
    });

    it("lets the holder renew the lock for work that takes longer", () => {
        const { first, second } = pair();
        const time = clock(1000);
        const mine = acquireLock(first, "sync:1", { ttlMs: 500, now: time.now });
        if (!mine.acquired) throw new Error("expected the lock");

        time.set(1400);
        expect(mine.lock.renew(1000)).toBe(true);

        time.set(2399);
        expect(acquireLock(second, "sync:1", { ttlMs: 500, now: time.now }).acquired).toBe(false);
        time.set(2400);
        expect(acquireLock(second, "sync:1", { ttlMs: 500, now: time.now }).acquired).toBe(true);
    });

    it("renews for the original time to live when no other is given", () => {
        const { first, second } = pair();
        const time = clock(1000);
        const mine = acquireLock(first, "sync:1", { ttlMs: 500, now: time.now });
        if (!mine.acquired) throw new Error("expected the lock");

        time.set(1400);
        expect(mine.lock.renew()).toBe(true);

        time.set(1899);
        expect(acquireLock(second, "sync:1", { ttlMs: 500, now: time.now }).acquired).toBe(false);
        time.set(1900);
        expect(acquireLock(second, "sync:1", { ttlMs: 500, now: time.now }).acquired).toBe(true);
    });

    it("keeps locks with different names apart", () => {
        const { first, second } = pair();
        expect(acquireLock(first, "sync:1", { ttlMs: 500 }).acquired).toBe(true);
        expect(acquireLock(second, "sync:2", { ttlMs: 500 }).acquired).toBe(true);
        expect(acquireLock(second, "metadata", { ttlMs: 500 }).acquired).toBe(true);
    });

    it("does not let one connection take the same lock twice", () => {
        const { first } = pair();
        expect(acquireLock(first, "sync:1", { ttlMs: 500 }).acquired).toBe(true);
        expect(acquireLock(first, "sync:1", { ttlMs: 500 }).acquired).toBe(false);
    });
});

describe("withLock", () => {
    it("holds the lock while the work runs and releases it afterwards", async () => {
        const { first, second } = pair();
        let busyInside: boolean | undefined;

        const result = await withLock(first, "sync:1", { ttlMs: 500 }, async () => {
            await Promise.resolve();
            busyInside = !acquireLock(second, "sync:1", { ttlMs: 500 }).acquired;
            return "value";
        });

        expect(result).toEqual({ acquired: true, value: "value" });
        expect(busyInside).toBe(true);
        expect(acquireLock(second, "sync:1", { ttlMs: 500 }).acquired).toBe(true);
    });

    it("hands the work the lock, so it can renew", async () => {
        const { first } = pair();
        const result = await withLock(first, "sync:1", { ttlMs: 500 }, lock => lock.renew());
        expect(result).toEqual({ acquired: true, value: true });
    });

    it("releases the lock and passes the error on when the work fails", async () => {
        const { first, second } = pair();

        await expect(
            withLock(first, "sync:1", { ttlMs: 500 }, () => {
                throw new Error("work failed");
            })
        ).rejects.toThrow("work failed");

        expect(acquireLock(second, "sync:1", { ttlMs: 500 }).acquired).toBe(true);
    });

    it("does not run the work when someone else holds the lock", async () => {
        const { first, second } = pair();
        const time = clock(5000);
        acquireLock(first, "sync:1", { ttlMs: 500, now: time.now });
        let ran = false;

        const result = await withLock(second, "sync:1", { ttlMs: 500, now: time.now }, () => {
            ran = true;
        });

        expect(ran).toBe(false);
        expect(result).toEqual({
            acquired: false,
            holder: { pid: process.pid, acquiredAt: 5000, expiresAt: 5500 },
        });
    });

    it("still gives back the result when the lock cannot be released", async () => {
        const { first } = pair();
        const result = await withLock(first, "sync:1", { ttlMs: 500 }, () => {
            first.close();
            return "finished";
        });
        expect(result).toEqual({ acquired: true, value: "finished" });
    });
});
