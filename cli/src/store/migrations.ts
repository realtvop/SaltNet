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
    {
        version: 4,
        name: "user data",
        up: db => {
            // User data cannot be downloaded again. The columns keep the web backup's optional
            // members distinct from members that are present but empty; credentials never enter
            // this database (they belong in credentials.json).
            db.exec(`
                -- The web profiles in their displayed order. position 0 is the default user.
                -- raw is the whole web user object without its tokens; a backup is exported
                -- from it, so nothing the web app keeps (fields it adds later, null as opposed
                -- to a missing field, values of an unexpected type) is lost. The other columns
                -- here and the rows of scores, b50_snapshot, user_items, user_characters and
                -- rating_history are copies of parts of it for queries; a value that does not
                -- fit its column is NULL there (an INTEGER column takes only safe integers,
                -- because node:sqlite cannot read a larger one back). has_lxns records whether
                -- the optional lxns object exists at all; the other has_* columns do the same
                -- for members of data. The writer rejects a user that still has a token; the
                -- check on raw stops one that slips through. raw is always JSON.stringify
                -- output, so no key appears twice, and the members SQLite reads here are the
                -- ones JSON.parse reads back.
                CREATE TABLE users (
                    uid TEXT PRIMARY KEY,
                    position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
                    raw TEXT NOT NULL CHECK (
                        json_valid(raw)
                        AND json_type(raw) = 'object'
                        AND json_type(raw, '$.uid') = 'text'
                        AND json_extract(raw, '$.uid') IS uid
                        AND json_extract(raw, '$.divingFish.importToken') IS NULL
                        AND json_extract(raw, '$.lxns.auth') IS NULL
                    ),
                    remark TEXT,
                    diving_fish_name TEXT,
                    has_lxns INTEGER NOT NULL CHECK (has_lxns IN (0, 1)),
                    lxns_id INTEGER,
                    lxns_name TEXT,
                    in_game_id INTEGER,
                    in_game_name TEXT,
                    in_game_enabled INTEGER NOT NULL CHECK (in_game_enabled IN (0, 1)),
                    in_game_fast_update INTEGER NOT NULL CHECK (in_game_fast_update IN (0, 1)),
                    manually_update INTEGER NOT NULL CHECK (manually_update IN (0, 1)),
                    updated_at INTEGER,
                    data_name TEXT,
                    rating INTEGER,
                    info TEXT CHECK (info IS NULL OR json_valid(info)),
                    has_detailed INTEGER NOT NULL CHECK (has_detailed IN (0, 1)),
                    has_b50 INTEGER NOT NULL CHECK (has_b50 IN (0, 1)),
                    has_items INTEGER NOT NULL CHECK (has_items IN (0, 1)),
                    has_characters INTEGER NOT NULL CHECK (has_characters IN (0, 1)),
                    has_rating_history INTEGER NOT NULL CHECK (has_rating_history IN (0, 1))
                ) STRICT;

                -- data.detailed, keyed exactly as the web app stores it. chart_key is the catalog
                -- chart matched by core (different from record_key for banquet charts), or NULL
                -- when no current catalog chart matches. It deliberately is not a foreign key.
                CREATE TABLE scores (
                    user_uid TEXT NOT NULL REFERENCES users (uid) ON DELETE CASCADE,
                    record_key TEXT NOT NULL,
                    chart_key TEXT,
                    song_id INTEGER,
                    type TEXT,
                    title TEXT,
                    level TEXT,
                    level_index INTEGER,
                    level_label TEXT,
                    ds REAL,
                    achievements REAL,
                    dx_score INTEGER,
                    fc TEXT,
                    fs TEXT,
                    rate TEXT,
                    ra INTEGER,
                    play_count INTEGER,
                    last_changed_at INTEGER,
                    PRIMARY KEY (user_uid, record_key)
                ) STRICT;
                -- A chart can contribute at most one score row to a user's chart join.
                CREATE UNIQUE INDEX scores_user_chart
                    ON scores (user_uid, chart_key) WHERE chart_key IS NOT NULL;

                -- data.b50 as stored, including its section and order, for every user whose data
                -- has that member. record_key is the web key; chart_key is its current core match.
                CREATE TABLE b50_snapshot (
                    user_uid TEXT NOT NULL REFERENCES users (uid) ON DELETE CASCADE,
                    section TEXT NOT NULL CHECK (section IN ('sd', 'dx')),
                    position INTEGER NOT NULL CHECK (position >= 0),
                    record_key TEXT NOT NULL,
                    chart_key TEXT,
                    song_id INTEGER,
                    type TEXT,
                    title TEXT,
                    level TEXT,
                    level_index INTEGER,
                    level_label TEXT,
                    ds REAL,
                    achievements REAL,
                    dx_score INTEGER,
                    fc TEXT,
                    fs TEXT,
                    rate TEXT,
                    ra INTEGER,
                    play_count INTEGER,
                    last_changed_at INTEGER,
                    PRIMARY KEY (user_uid, section, position)
                ) STRICT;

                -- data.items is a list of lists. list_index is the outer index (the collection
                -- kind the web app uses), and position preserves the order of its inner list.
                CREATE TABLE user_items (
                    user_uid TEXT NOT NULL REFERENCES users (uid) ON DELETE CASCADE,
                    list_index INTEGER NOT NULL CHECK (list_index >= 0),
                    position INTEGER NOT NULL CHECK (position >= 0),
                    item_kind INTEGER,
                    item_id INTEGER,
                    stock INTEGER,
                    is_valid INTEGER CHECK (is_valid IS NULL OR is_valid IN (0, 1)),
                    PRIMARY KEY (user_uid, list_index, position)
                ) STRICT;

                -- data.characters in its original order. These rows, rather than data.items,
                -- decide whether the web app regards a travel partner as owned.
                CREATE TABLE user_characters (
                    user_uid TEXT NOT NULL REFERENCES users (uid) ON DELETE CASCADE,
                    position INTEGER NOT NULL,
                    character_id INTEGER,
                    point INTEGER,
                    use_count INTEGER,
                    level INTEGER,
                    next_awake INTEGER,
                    next_awake_percent REAL,
                    awakening INTEGER,
                    PRIMARY KEY (user_uid, position)
                ) STRICT;

                -- data.ratingHistory in its original order; time is epoch milliseconds.
                CREATE TABLE rating_history (
                    user_uid TEXT NOT NULL REFERENCES users (uid) ON DELETE CASCADE,
                    position INTEGER NOT NULL,
                    time INTEGER,
                    rating INTEGER,
                    PRIMARY KEY (user_uid, position)
                ) STRICT;

                -- ScoreHistoryEventV1 field for field. record_key is the event's chartKey, which
                -- is the web record key rather than the matched catalog chart key. observed_at
                -- is REAL because the web app accepts any finite time that is not negative. The
                -- INTEGER columns take only safe integers (node:sqlite cannot read a larger one
                -- back); the writer rejects an event with a larger sequence, dxScore or
                -- playCount, which the web app never writes. An import gives every event a new
                -- generation and id, as the web app's import does.
                CREATE TABLE score_events (
                    id TEXT PRIMARY KEY,
                    schema_version INTEGER NOT NULL,
                    generation_id TEXT NOT NULL,
                    batch_id TEXT NOT NULL,
                    user_uid TEXT NOT NULL REFERENCES users (uid) ON DELETE CASCADE,
                    record_key TEXT NOT NULL,
                    observed_at REAL NOT NULL,
                    sequence INTEGER NOT NULL,
                    source TEXT NOT NULL CHECK (
                        source IN ('inGame', 'lxns', 'divingFishImport', 'divingFishPublic')
                    ),
                    kind TEXT NOT NULL CHECK (kind IN ('initial', 'change')),
                    changed_mask INTEGER NOT NULL,
                    achievements REAL NOT NULL,
                    dx_score INTEGER NOT NULL,
                    fc TEXT NOT NULL,
                    fs TEXT NOT NULL,
                    play_count INTEGER
                ) STRICT;
                CREATE INDEX score_events_timeline
                    ON score_events (user_uid, record_key, observed_at, sequence);
            `);
        },
    },
    {
        version: 5,
        name: "favorites",
        up: db => {
            // Favorites are stored locally on this machine and never exported to backups.
            db.exec(`
                CREATE TABLE favorites (
                    id INTEGER PRIMARY KEY,
                    position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
                    name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0)
                ) STRICT;

                CREATE TABLE favorite_charts (
                    favorite_id INTEGER NOT NULL REFERENCES favorites (id) ON DELETE CASCADE,
                    position INTEGER NOT NULL CHECK (position >= 0),
                    music_id INTEGER NOT NULL,
                    grade INTEGER NOT NULL,
                    PRIMARY KEY (favorite_id, position),
                    UNIQUE (favorite_id, music_id)
                ) STRICT;
                CREATE INDEX favorite_charts_music_id ON favorite_charts (music_id);
            `);
        },
    },
    {
        version: 6,
        name: "sync_runs",
        up: db => {
            // The journal of syncs, uploads, account operations and imports (design 2.2).
            // It outlives the users it mentions: deleting a user or importing a backup leaves
            // every row intact, and it is never exported to backups. user_name keeps the display
            // name at the time of the run so the journal stays readable after a rename or removal.
            db.exec(`
                -- kind: 'sync', 'upload', 'account', 'import' (validated in TypeScript).
                -- user_uid: target user's uid; null for whole-library or non-user runs.
                -- user_name: target user's display name at run time.
                -- source: for 'sync' (ingame, lxns, df-token, df-name); for 'upload' (diving-fish, lxns);
                --         for 'account' (ingame); for 'import' null.
                -- mode: for 'sync' (full, fast, public-b50); for 'account' the operation (e.g. clear-tickets);
                --       otherwise null.
                -- outcome: 'running' while active, then 'ok' or 'failed'; 'interrupted' when process ended prematurely.
                -- error_code & error_message: CliError code and message of a failed run; null otherwise.
                -- summary: kind-specific JSON object or null; no secrets ever recorded.
                -- started_at & finished_at: epoch milliseconds; finished_at is null while running or interrupted.
                -- cli_version: saltnet CLI version that recorded the run.
                CREATE TABLE sync_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kind TEXT NOT NULL,
                    user_uid TEXT,
                    user_name TEXT,
                    source TEXT,
                    mode TEXT,
                    outcome TEXT NOT NULL CHECK (outcome IN ('running', 'ok', 'failed', 'interrupted')),
                    error_code TEXT,
                    error_message TEXT,
                    summary TEXT CHECK (summary IS NULL OR (json_valid(summary) AND json_type(summary) = 'object')),
                    started_at INTEGER NOT NULL,
                    finished_at INTEGER,
                    cli_version TEXT NOT NULL
                ) STRICT;
                CREATE INDEX sync_runs_user ON sync_runs (user_uid, id);
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
