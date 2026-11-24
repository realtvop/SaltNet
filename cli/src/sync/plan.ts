import type { User } from "@core/user/type";
import type { CommandContext } from "../commands/registry";
import type { Store } from "../store/store";
import type { UserListRow } from "../users/repository";
import type { SyncCommandArgs } from "./execute";
import type { SyncPlan } from "./types";
import { existsSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { CliError } from "../errors";
import { storeError } from "../store/errors";
import { readUserVersion } from "../store/migrations";
import { loadSqlite } from "../store/sqlite";
import { DEFAULT_BUSY_TIMEOUT_MS } from "../store/store";
import { listUsers, readUsers } from "../users/repository";
import {
    assertGameId,
    assertGameQrSource,
    assertLxnsRefreshAvailable,
    buildUserForCore,
    formatOtherSourcesFix,
    getOtherBoundSources,
    plannedMode,
    resolveSyncSource,
    syncResultError,
    syncUploadTargets,
    syncUserMeta,
    usesGame,
} from "./sources";

/** A consistent snapshot without opening the writable store or running migrations. */
export function readSyncPlanUsers(file: string): { rows: UserListRow[]; users: User[] } {
    const { DatabaseSync } = loadSqlite();
    const wal = `${file}-wal`;
    const before = statSync(file, { bigint: true, throwIfNoEntry: false });
    if (!before) return { rows: [], users: [] };

    function readSnapshot(immutable: boolean) {
        const uri = pathToFileURL(file);
        if (immutable) uri.searchParams.set("immutable", "1");
        const db = new DatabaseSync(uri.href, { readOnly: true, timeout: DEFAULT_BUSY_TIMEOUT_MS });
        try {
            db.exec("BEGIN");
            const version = readUserVersion(db);
            // Layouts before migration 4 have no users. Planning must leave them as they are.
            if (version < 4) return { rows: [], users: [] };
            const store: Store = {
                db,
                path: file,
                migration: { from: version, to: version },
                transaction: () => {
                    throw new Error("同步预览不能写入数据库");
                },
                read: work => work(),
                close: () => db.close(),
            };
            return { rows: listUsers(store), users: readUsers(store) };
        } finally {
            db.close();
        }
    }

    try {
        if (!existsSync(wal)) {
            // A normal SQLite WAL reader can create sidecars even on a checkpointed database.
            // Use an immutable read there and verify a concurrent writer did not change the file.
            let snapshot;
            try {
                snapshot = readSnapshot(true);
            } catch (error) {
                if (stayedCheckpointed()) throw error;
            }
            if (snapshot && stayedCheckpointed()) return snapshot;
        }
        // A live WAL can contain newer committed rows. Read it with SQLite's normal snapshot rules.
        return readSnapshot(false);
    } catch (error) {
        throw storeError(error, file) ?? error;
    }

    function stayedCheckpointed(): boolean {
        const after = statSync(file, { bigint: true, throwIfNoEntry: false });
        return after?.ino === before?.ino && after?.ctimeNs === before?.ctimeNs && !existsSync(wal);
    }
}

export function planUserSync(
    args: SyncCommandArgs,
    ctx: CommandContext,
    row: UserListRow,
    storedUser: User
): SyncPlan {
    const { source: requestedSource = "auto", upload = true, qr } = args.options;
    assertGameQrSource(usesGame(row, requestedSource), qr);
    const user = syncUserMeta(row);
    let source: SyncPlan["source"] = null;
    try {
        const workingUser = buildUserForCore(storedUser, ctx.paths);
        source = resolveSyncSource(workingUser, row, requestedSource);
        if (source === "ingame" && !qr) assertGameId(workingUser, row);
        if (source === "lxns") {
            try {
                assertLxnsRefreshAvailable(workingUser, row, ctx.io.now().getTime());
            } catch (error) {
                if (!(error instanceof CliError)) throw error;
                const fix = formatOtherSourcesFix(
                    row,
                    getOtherBoundSources(workingUser, source),
                    error.fix
                );
                throw new CliError(error.code, error.message, { fix });
            }
        }
        const uploads = syncUploadTargets(workingUser, source, upload);
        return {
            user,
            source,
            mode: plannedMode(source, qr !== undefined),
            uploads,
            effect: qr ? "account" : uploads.length ? "remote" : "local",
            error: null,
        };
    } catch (cause) {
        if (!(cause instanceof CliError)) throw cause;
        return {
            user,
            source,
            mode: null,
            uploads: [],
            effect: "local",
            error: syncResultError(cause),
        };
    }
}
