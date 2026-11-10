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
    {
        version: 2,
        name: "catalog",
        up: db => {
            // Everything here can be fetched again, so these tables are replaced as a whole by a
            // refresh and a later layout change never has to carry their rows over. JSON columns
            // hold what has no column of its own.
            db.exec(`
                -- Where each source stands: when it was fetched, which upstream format it had, and
                -- how the rows were built from it (CATALOG_BUILDER).
                CREATE TABLE meta_state (
                    source TEXT PRIMARY KEY,
                    fetched_at INTEGER NOT NULL,
                    upstream_version TEXT,
                    builder TEXT NOT NULL,
                    detail TEXT
                ) STRICT;

                CREATE TABLE versions (
                    position INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    word TEXT NOT NULL
                ) STRICT;

                -- One row per SaltNet song: SD and DX of one SaltMeta entry are two rows that share
                -- meta_id.
                CREATE TABLE songs (
                    id INTEGER PRIMARY KEY,
                    meta_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    genre TEXT NOT NULL,
                    bpm REAL,
                    version TEXT NOT NULL,
                    is_new INTEGER NOT NULL,
                    type TEXT NOT NULL,
                    aliases TEXT,
                    search_index TEXT
                ) STRICT;
                CREATE INDEX songs_meta_id ON songs (meta_id);

                -- chart_key is "<song id>-<grade>", the key every output uses; id is the number
                -- the web app calls the chart.
                CREATE TABLE charts (
                    chart_key TEXT PRIMARY KEY,
                    id INTEGER NOT NULL UNIQUE,
                    song_id INTEGER NOT NULL REFERENCES songs (id),
                    position INTEGER NOT NULL,
                    grade INTEGER NOT NULL,
                    level TEXT NOT NULL,
                    constant REAL,
                    charter TEXT,
                    notes TEXT NOT NULL,
                    deluxe_score_max INTEGER NOT NULL,
                    stat TEXT,
                    search_index TEXT
                ) STRICT;
                CREATE INDEX charts_song_id ON charts (song_id);

                -- The four lists LXNS serves (title, icon, plate, frame), and the characters and
                -- partners that ship with the CLI (catalog/static.ts). required is the requirements
                -- as LXNS sent them, and raw is the whole item, so the lists can be rebuilt exactly.
                CREATE TABLE collections (
                    kind TEXT NOT NULL,
                    id INTEGER NOT NULL,
                    position INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    genre TEXT,
                    description TEXT,
                    color TEXT,
                    required TEXT,
                    raw TEXT NOT NULL,
                    PRIMARY KEY (kind, id)
                ) STRICT;
            `);
        },
    },
    {
        version: 3,
        name: "courses",
        up: db => {
            // Data that ships with the CLI (design 2.2), written by catalog/static.ts. It is here
            // so that SQL can join it with the charts; the commands read the same data from core.
            db.exec(`
                CREATE TABLE courses (
                    id INTEGER PRIMARY KEY,
                    position INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    mode_id INTEGER NOT NULL,
                    mode_name TEXT NOT NULL,
                    base_dani_id INTEGER NOT NULL,
                    is_locked INTEGER NOT NULL,
                    unlock_course_id INTEGER NOT NULL,
                    life_initial INTEGER NOT NULL,
                    life_recovery INTEGER NOT NULL,
                    damage_perfect INTEGER NOT NULL,
                    damage_great INTEGER NOT NULL,
                    damage_good INTEGER NOT NULL,
                    damage_miss INTEGER NOT NULL
                ) STRICT;

                -- chart_key is "<song id>-<difficulty>", the same key charts.chart_key has, so a
                -- track joins its chart directly. A track whose chart does not exist in the CN
                -- catalog simply has no match.
                CREATE TABLE course_tracks (
                    course_id INTEGER NOT NULL REFERENCES courses (id),
                    position INTEGER NOT NULL,
                    chart_key TEXT NOT NULL,
                    music_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    difficulty INTEGER NOT NULL,
                    PRIMARY KEY (course_id, position)
                ) STRICT;
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
