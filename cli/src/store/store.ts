/**
 * The SQLite database in the data directory (design 2.1, 2.2): opened in WAL mode so several
 * agent processes can read at once, migrated to the layout this version of the CLI expects, and
 * closed by the runner when the command ends.
 */
import type { RuntimePaths } from "../runtime/paths";
import type { Migration, MigrationResult } from "./migrations";
import type { DatabaseSync } from "./sqlite";
import { chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { ensureRuntimeDirs } from "../runtime/paths";
import { storeError } from "./errors";
import { migrate, MIGRATIONS } from "./migrations";
import { loadSqlite } from "./sqlite";

/** How long a statement waits for another process to finish writing before it gives up. */
export const DEFAULT_BUSY_TIMEOUT_MS = 5000;

export interface StoreOptions {
    busyTimeoutMs?: number;
    /** The layout to migrate to; the real one unless a test brings its own. */
    migrations?: readonly Migration[];
    /** The clock that names backups. */
    now?: () => Date;
}

export interface Store {
    readonly db: DatabaseSync;
    /** The database file. */
    readonly path: string;
    /** What happened to the layout when the store was opened. */
    readonly migration: MigrationResult;
    /**
     * Runs `work` in one write transaction: everything it changes is committed together, or none of
     * it is when it throws. Calls nested inside `work` become savepoints, so an inner failure that
     * the outer code catches undoes only the inner changes. `work` must be synchronous.
     */
    transaction: <T>(work: () => T) => T;
    /** Closes the database; closing twice is fine. */
    close: () => void;
}

/** SQLite creates files with the process's umask, but these hold scores and must stay private. */
function makePrivate(file: string): void {
    try {
        chmodSync(file, 0o600);
    } catch {
        // Windows has no such modes; the data directory is private to the user there already.
    }
}

/** `20261111T011800Z`: sorts by time and has no characters a file system dislikes. */
function stamp(at: Date): string {
    return at
        .toISOString()
        .replace(/\.\d+Z$/, "Z")
        .replaceAll(/[-:]/g, "");
}

/** Copies the database into `cache/` before a migration touches it (design 2.2). */
function backupDatabase(db: DatabaseSync, paths: RuntimePaths, from: number, at: Date): string {
    const base = `saltnet-v${from}-${stamp(at)}`;
    let target = path.join(paths.cache, `${base}.db`);
    for (let n = 2; existsSync(target); n++) target = path.join(paths.cache, `${base}-${n}.db`);
    // Unlike copying the file, this is consistent while other processes write, and it takes the
    // WAL with it.
    db.prepare("VACUUM INTO ?").run(target);
    makePrivate(target);
    return target;
}

function assertSynchronous(result: unknown): void {
    if (typeof (result as { then?: unknown } | null)?.then === "function") {
        throw new TypeError("事务里的回调必须是同步的，不能 await");
    }
}

/** Undoing a transaction that SQLite already abandoned fails; the original error matters more. */
function quietly(undo: () => void): void {
    try {
        undo();
    } catch {
        // Nothing left to undo.
    }
}

function createStore(db: DatabaseSync, file: string, migration: MigrationResult): Store {
    let savepoints = 0;
    let closed = false;

    function transaction<T>(work: () => T): T {
        if (db.isTransaction) {
            const name = `saltnet_sp_${++savepoints}`;
            db.exec(`SAVEPOINT ${name}`);
            try {
                const result = work();
                assertSynchronous(result);
                db.exec(`RELEASE ${name}`);
                return result;
            } catch (error) {
                quietly(() => db.exec(`ROLLBACK TO ${name}`));
                quietly(() => db.exec(`RELEASE ${name}`));
                throw error;
            }
        }

        db.exec("BEGIN IMMEDIATE");
        try {
            const result = work();
            assertSynchronous(result);
            db.exec("COMMIT");
            return result;
        } catch (error) {
            if (db.isTransaction) quietly(() => db.exec("ROLLBACK"));
            throw error;
        }
    }

    return {
        db,
        path: file,
        migration,
        transaction,
        close() {
            if (closed) return;
            closed = true;
            db.close();
        },
    };
}

/**
 * Opens the database, creating the data directory and the file on first use, and migrates it.
 * Commands that only print help or the schema never call this, so they leave the disk alone.
 */
export function openStore(paths: RuntimePaths, options: StoreOptions = {}): Store {
    const { DatabaseSync } = loadSqlite();
    ensureRuntimeDirs(paths);
    const now = options.now ?? (() => new Date());
    const isNew = !existsSync(paths.database);

    let db: DatabaseSync | undefined;
    try {
        const opened = new DatabaseSync(paths.database, {
            timeout: options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS,
        });
        db = opened;
        // Before WAL creates its side files, so they get the same mode.
        if (isNew) makePrivate(paths.database);
        opened.exec("PRAGMA journal_mode = WAL");
        const migration = migrate(opened, options.migrations ?? MIGRATIONS, from =>
            backupDatabase(opened, paths, from, now())
        );
        return createStore(opened, paths.database, migration);
    } catch (error) {
        quietly(() => db?.close());
        throw storeError(error, paths.database) ?? error;
    }
}
