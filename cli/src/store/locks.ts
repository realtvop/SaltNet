/**
 * Named locks kept in the database (design 2.2): one for each sync, metadata refresh and token
 * refresh. Every lock records who holds it and when it expires, so a process that crashed cannot
 * block the others for longer than its time to live.
 */
import type { Store } from "./store";
import { randomUUID } from "node:crypto";
import process from "node:process";

export interface LockHolder {
    readonly pid: number;
    /** Epoch milliseconds. */
    readonly acquiredAt: number;
    readonly expiresAt: number;
}

export interface LockOptions {
    /** How long the lock stays valid if its holder never lets go. */
    ttlMs: number;
    /** Epoch milliseconds; a test moves it. */
    now?: () => number;
}

export interface Lock {
    readonly name: string;
    /** Lets go. A lock that has expired and been taken by someone else is left alone. */
    release: () => void;
    /** Pushes the expiry forward, for work that outlasts the time to live. False when the lock was lost. */
    renew: (ttlMs?: number) => boolean;
}

export type Acquisition =
    | { readonly acquired: true; readonly lock: Lock }
    | { readonly acquired: false; readonly holder: LockHolder };

interface LockRow {
    pid: number;
    acquired_at: number;
    expires_at: number;
}

/** Takes the lock when it is free or expired; otherwise says who has it. It never waits. */
export function acquireLock(store: Store, name: string, options: LockOptions): Acquisition {
    const { db } = store;
    const now = options.now ?? Date.now;
    const owner = randomUUID();

    return store.transaction((): Acquisition => {
        const at = now();
        db.prepare("DELETE FROM locks WHERE name = ? AND expires_at <= ?").run(name, at);
        const held = db
            .prepare("SELECT pid, acquired_at, expires_at FROM locks WHERE name = ?")
            .get(name) as LockRow | undefined;
        if (held) {
            return {
                acquired: false,
                holder: {
                    pid: held.pid,
                    acquiredAt: held.acquired_at,
                    expiresAt: held.expires_at,
                },
            };
        }

        db.prepare(
            "INSERT INTO locks (name, owner, pid, acquired_at, expires_at) VALUES (?, ?, ?, ?, ?)"
        ).run(name, owner, process.pid, at, at + options.ttlMs);

        const lock: Lock = {
            name,
            release() {
                db.prepare("DELETE FROM locks WHERE name = ? AND owner = ?").run(name, owner);
            },
            renew(ttlMs = options.ttlMs) {
                const { changes } = db
                    .prepare("UPDATE locks SET expires_at = ? WHERE name = ? AND owner = ?")
                    .run(now() + ttlMs, name, owner);
                return changes === 1;
            },
        };
        return { acquired: true, lock };
    });
}

export type LockResult<T> =
    | { readonly acquired: true; readonly value: T }
    | { readonly acquired: false; readonly holder: LockHolder };

/**
 * Runs `work` while holding the lock and lets go afterwards, however it ends. When someone else
 * has the lock, `work` does not run and the holder is returned, so each caller decides what a busy
 * lock means: a sync refuses, a metadata refresh carries on with the cache it has.
 */
export async function withLock<T>(
    store: Store,
    name: string,
    options: LockOptions,
    work: (lock: Lock) => Promise<T> | T
): Promise<LockResult<T>> {
    const acquisition = acquireLock(store, name, options);
    if (!acquisition.acquired) return acquisition;
    try {
        return { acquired: true, value: await work(acquisition.lock) };
    } finally {
        try {
            acquisition.lock.release();
        } catch {
            // The lock simply expires; what `work` returned or threw matters more.
        }
    }
}
