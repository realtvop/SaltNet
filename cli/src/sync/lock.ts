/**
 * Per-user sync lock (design 2.2): one lock per user named `sync:<uid>`.
 *
 * Ensures that only one saltnet process at a time can sync, upload or perform account operations
 * for a given user. Any conflicting operation is rejected immediately with SYNC_IN_PROGRESS.
 */
import type { Lock, LockHolder } from "../store/locks";
import type { Store } from "../store/store";
import { getUserDisplayName } from "@core/user/type";
import { CliError } from "../errors";
import { acquireLock, maintainLock } from "../store/locks";
import { readUser } from "../users/repository";
import { formatLocalTime } from "../util/time";
import { interruptRuns } from "./journal";

export const DEFAULT_SYNC_LOCK_TTL_MS = 180_000;
export const DEFAULT_SYNC_LOCK_RENEW_INTERVAL_MS = 60_000;

export interface SyncLockUser {
    readonly uid: string;
    readonly name: string;
}

export interface SyncLockOptions {
    ttlMs?: number;
    renewIntervalMs?: number;
    now?: () => number;
}

export interface SyncLockHandle {
    readonly user: SyncLockUser;
    readonly lock: Lock;
    assertHeld: () => void;
    renew: (ttlMs?: number) => boolean;
}

interface LockRow {
    name: string;
    pid: number;
    acquired_at: number;
    expires_at: number;
}

function syncInProgressError(userName: string, holder: LockHolder): CliError {
    const acquiredAt = formatLocalTime(new Date(holder.acquiredAt));
    const expiresAt = formatLocalTime(new Date(holder.expiresAt));
    return new CliError(
        "SYNC_IN_PROGRESS",
        `用户 ${userName} 正在由另一个 saltnet 进程（pid ${holder.pid}）同步，开始于 ${acquiredAt}；同步可能已中断，当前锁于 ${expiresAt} 到期。同步结束或锁到期后可重试`,
        {
            extra: {
                holder: {
                    pid: holder.pid,
                    acquiredAt,
                    expiresAt,
                },
            },
            retryable: true,
        }
    );
}

/**
 * Runs `work` while holding the per-user sync lock `sync:<user.uid>`.
 *
 * If another process holds the lock, throws `SYNC_IN_PROGRESS` without running `work`.
 * While `work` runs, periodically renews the lock every 60s. Always releases the lock afterwards.
 */
export async function withSyncLock<T>(
    store: Store,
    user: SyncLockUser,
    work: (handle: SyncLockHandle) => Promise<T> | T,
    options?: SyncLockOptions
): Promise<T> {
    const ttlMs = options?.ttlMs ?? DEFAULT_SYNC_LOCK_TTL_MS;
    const renewIntervalMs = options?.renewIntervalMs ?? DEFAULT_SYNC_LOCK_RENEW_INTERVAL_MS;
    const now = options?.now ?? Date.now;

    const acquisition = acquireLock(store, `sync:${user.uid}`, { ttlMs, now });
    if (!acquisition.acquired) {
        throw syncInProgressError(user.name, acquisition.holder);
    }

    const { lock } = acquisition;

    const lease = maintainLock(lock, renewIntervalMs);
    const handle: SyncLockHandle = {
        user,
        lock,
        assertHeld() {
            if (!lease.renew(ttlMs)) {
                throw new CliError("INTERNAL", `用户 ${user.name} 的同步锁已失效`);
            }
        },
        renew: lease.renew,
    };

    try {
        interruptRuns(store, user.uid);
        return await work(handle);
    } finally {
        lease.stop();
        try {
            lock.release();
        } catch {
            // Quietly ignore release failure
        }
    }
}

/**
 * Checks that no live `sync:<uid>` lock exists, or if `uid === null` that no live `sync:` lock exists at all.
 *
 * It must be called inside a write transaction (store.transaction, which begins with BEGIN IMMEDIATE):
 * then no other process can take a lock between the check and the commit, because acquireLock writes
 * to the same database.
 */
export function assertNoSync(store: Store, uid: string | null, now: () => number = Date.now): void {
    const { db } = store;
    const at = now();

    let held: LockRow | undefined;
    if (uid !== null) {
        const name = `sync:${uid}`;
        db.prepare("DELETE FROM locks WHERE name = ? AND expires_at <= ?").run(name, at);
        held = db
            .prepare("SELECT name, pid, acquired_at, expires_at FROM locks WHERE name = ?")
            .get(name) as LockRow | undefined;
    } else {
        db.prepare("DELETE FROM locks WHERE substr(name, 1, 5) = 'sync:' AND expires_at <= ?").run(
            at
        );
        held = db
            .prepare(
                "SELECT name, pid, acquired_at, expires_at FROM locks WHERE substr(name, 1, 5) = 'sync:' LIMIT 1"
            )
            .get() as LockRow | undefined;
    }

    if (held) {
        const targetUid = uid ?? held.name.slice(5);
        // The name the other commands print; the uid when the user is gone.
        const user = readUser(store, targetUid);
        const userName = user ? getUserDisplayName(user) : targetUid;

        throw syncInProgressError(userName, {
            pid: held.pid,
            acquiredAt: held.acquired_at,
            expiresAt: held.expires_at,
        });
    }
}
