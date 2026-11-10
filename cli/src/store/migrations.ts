/**
 * The database layout and how it moves from one version of the CLI to the next (design 2.2).
 *
 * The tables are an internal detail, so a migration may reshape them freely. `PRAGMA user_version`
 * records how many have been applied. Each runs in its own transaction together with the bump of
 * `user_version`, so a failure leaves the database exactly as it was.
 */
import type { DatabaseSync } from "./sqlite";
import { CliError } from "../errors";
import { storeError } from "./errors";

export interface Migration {
    /** 1, 2, 3, ... with no gaps; it becomes `user_version` once the migration has run. */
    readonly version: number;
    /** What the step does, for the error message when it fails. */
    readonly name: string;
    /**
     * Runs inside the migration's transaction. `PRAGMA foreign_keys` cannot be changed there, so a
     * step that rebuilds a table other tables point at has to defer the checks instead.
     */
    readonly up: (db: DatabaseSync) => void;
}

/** Every migration, oldest first. Append; never edit one that has been released. */
export const MIGRATIONS: readonly Migration[] = [
    {
        version: 1,
        name: "locks",
        up: db => {
            // Held while a sync, a metadata refresh or a token refresh runs. A row that expires is
            // free to take, so a process that crashed cannot block the others for good.
            db.exec(`
                CREATE TABLE locks (
                    name TEXT PRIMARY KEY,
                    owner TEXT NOT NULL,
                    pid INTEGER NOT NULL,
                    acquired_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
                ) STRICT
            `);
        },
    },
];

export interface MigrationResult {
    /** `user_version` when the store was opened; 0 for a database that was just created. */
    readonly from: number;
    /** `user_version` now. */
    readonly to: number;
    /** Where the copy made before migrating went; undefined when there was nothing to save. */
    readonly backup?: string;
}

export function readUserVersion(db: DatabaseSync): number {
    const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
    return row.user_version;
}

function checkMigrations(migrations: readonly Migration[]): void {
    migrations.forEach((migration, index) => {
        if (migration.version !== index + 1) {
            throw new Error(
                `migration ${index + 1} is numbered ${migration.version}: versions must be 1, 2, 3, ... in order`
            );
        }
    });
}

/**
 * Brings the database up to the newest migration. `backup` is asked to copy the database first
 * when it already holds data of an older version; a database that was just created has nothing
 * worth saving.
 */
export function migrate(
    db: DatabaseSync,
    migrations: readonly Migration[] = MIGRATIONS,
    backup?: (fromVersion: number) => string
): MigrationResult {
    checkMigrations(migrations);
    const latest = migrations.length;
    const from = readUserVersion(db);

    if (from > latest) {
        throw new CliError(
            "INTERNAL",
            `数据库是更新版本的 saltnet 建的（结构版本 ${from}），这个版本只认识到 ${latest}；请升级 saltnet，或者用 SALTNET_HOME 换一个目录`
        );
    }
    if (from === latest) return { from, to: latest };

    const saved = from > 0 ? backup?.(from) : undefined;
    for (const migration of migrations.slice(from)) {
        try {
            db.exec("BEGIN IMMEDIATE");
            // Another process may have got here first while this one waited for the lock.
            if (readUserVersion(db) < migration.version) {
                migration.up(db);
                db.exec(`PRAGMA user_version = ${migration.version}`);
            }
            db.exec("COMMIT");
        } catch (error) {
            if (db.isTransaction) db.exec("ROLLBACK");
            throw (
                storeError(error) ??
                new CliError(
                    "INTERNAL",
                    `数据库升级到结构版本 ${migration.version}（${migration.name}）失败：${
                        error instanceof Error ? error.message : String(error)
                    }；已回滚，数据没有改动${saved === undefined ? "" : `，升级前的备份在 ${saved}`}`,
                    { cause: error }
                )
            );
        }
    }
    return saved === undefined ? { from, to: latest } : { from, to: latest, backup: saved };
}
