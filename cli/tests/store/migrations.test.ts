import type { Migration } from "../../src/store/migrations";
import type { DatabaseSync } from "../../src/store/sqlite";
import { mkdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CliError } from "../../src/errors";
import { migrate, MIGRATIONS, readUserVersion } from "../../src/store/migrations";
import { loadSqlite } from "../../src/store/sqlite";
import { insertMadeUsers } from "../madeUsers";
import { useTempHome } from "../tempHome";

function memory(): DatabaseSync {
    return new (loadSqlite().DatabaseSync)(":memory:");
}

function tables(db: DatabaseSync): string[] {
    const rows = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all() as { name: string }[];
    return rows.map(row => row.name);
}

function createsTable(version: number, table: string): Migration {
    return {
        version,
        name: `create ${table}`,
        up: db => db.exec(`CREATE TABLE ${table} (x INTEGER) STRICT`),
    };
}

describe("the shipped migrations", () => {
    it("are numbered from 1 and create the locks table", () => {
        MIGRATIONS.forEach((migration, index) => expect(migration.version).toBe(index + 1));

        const db = memory();
        const result = migrate(db);
        expect(result).toEqual({ from: 0, to: MIGRATIONS.length });
        expect(readUserVersion(db)).toBe(MIGRATIONS.length);
        const columns = db.prepare("PRAGMA table_info(locks)").all() as { name: string }[];
        expect(columns.map(column => column.name)).toEqual([
            "name",
            "owner",
            "pid",
            "acquired_at",
            "expires_at",
        ]);
    });

    it("create the catalog and the static data tables", () => {
        const db = memory();
        migrate(db);

        expect(tables(db)).toEqual([
            "b50_snapshot",
            "charts",
            "collections",
            "course_tracks",
            "courses",
            "locks",
            "meta_state",
            "rating_history",
            "score_events",
            "scores",
            "songs",
            "user_characters",
            "user_items",
            "users",
            "versions",
        ]);
    });

    it("keep the catalog rows when a database from before the course tables is updated", () => {
        const db = memory();
        migrate(db, MIGRATIONS.slice(0, 2));
        db.exec("INSERT INTO versions (position, name, word) VALUES (0, 'maimai', '真')");
        db.exec(
            "INSERT INTO meta_state (source, fetched_at, builder) VALUES ('saltmeta', 1000, 'catalog-2/search-1')"
        );
        const backup = vi.fn(() => "/cache/saltnet-v2.db");

        const result = migrate(db, MIGRATIONS, backup);

        expect(result).toEqual({ from: 2, to: MIGRATIONS.length, backup: "/cache/saltnet-v2.db" });
        expect(backup).toHaveBeenCalledWith(2);
        expect(db.prepare("SELECT name FROM versions").all()).toEqual([{ name: "maimai" }]);
        expect(db.prepare("SELECT source FROM meta_state").all()).toEqual([{ source: "saltmeta" }]);
        expect(db.prepare("SELECT count(*) AS n FROM courses").get()).toEqual({ n: 0 });
    });

    it("keeps version-3 catalog rows and adds every user table", () => {
        const db = memory();
        migrate(db, MIGRATIONS.slice(0, 3));
        db.exec("INSERT INTO versions (position, name, word) VALUES (0, 'maimai', '真')");
        db.exec(
            "INSERT INTO meta_state (source, fetched_at, builder) VALUES ('saltmeta', 1000, 'catalog-2/search-1')"
        );
        const backup = vi.fn(() => "/cache/saltnet-v3.db");

        expect(migrate(db, MIGRATIONS, backup)).toEqual({
            from: 3,
            to: 4,
            backup: "/cache/saltnet-v3.db",
        });
        expect(readUserVersion(db)).toBe(4);
        expect(backup).toHaveBeenCalledWith(3);
        expect(db.prepare("SELECT name FROM versions").all()).toEqual([{ name: "maimai" }]);
        expect(db.prepare("SELECT source FROM meta_state").all()).toEqual([{ source: "saltmeta" }]);
        for (const table of [
            "users",
            "scores",
            "b50_snapshot",
            "user_items",
            "user_characters",
            "rating_history",
            "score_events",
        ]) {
            expect(tables(db)).toContain(table);
        }
    });

    it("enforces user-data checks, strict types, and one score per chart", () => {
        const db = memory();
        migrate(db);
        insertMadeUsers(db, [{ uid: "u", position: 0 }]);

        expect(() =>
            db.exec(
                `INSERT INTO users VALUES ('bad-position', -1, '{"uid":"bad-position"}', NULL, NULL, 0, NULL, NULL, NULL, NULL, 0, 0, 0, NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0)`
            )
        ).toThrow(/CHECK constraint failed/);
        expect(() => insertMadeUsers(db, [{ uid: "same-position", position: 0 }])).toThrow(
            /UNIQUE constraint failed: users\.position/
        );
        for (const column of [
            "has_lxns",
            "in_game_enabled",
            "in_game_fast_update",
            "manually_update",
            "has_detailed",
            "has_b50",
            "has_items",
            "has_characters",
            "has_rating_history",
        ]) {
            expect(() =>
                db.prepare(`UPDATE users SET ${column} = 2 WHERE uid = 'u'`).run()
            ).toThrow(/CHECK constraint failed/);
        }
        expect(() => db.exec("UPDATE users SET info = '{' WHERE uid = 'u'")).toThrow(
            /CHECK constraint failed/
        );
        expect(() => db.exec("UPDATE users SET position = 'zero' WHERE uid = 'u'")).toThrow(
            /cannot store TEXT value in INTEGER column/
        );
        expect(() =>
            db.exec(
                "INSERT INTO b50_snapshot VALUES ('u', 'old', 0, '1-0', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)"
            )
        ).toThrow(/CHECK constraint failed/);
        expect(() =>
            db.exec(
                "INSERT INTO b50_snapshot VALUES ('u', 'sd', -1, '1-0', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)"
            )
        ).toThrow(/CHECK constraint failed/);
        expect(() =>
            db.exec("INSERT INTO user_items VALUES ('u', -1, 0, NULL, NULL, NULL, NULL)")
        ).toThrow(/CHECK constraint failed/);
        expect(() =>
            db.exec("INSERT INTO user_items VALUES ('u', 1, -1, NULL, NULL, NULL, NULL)")
        ).toThrow(/CHECK constraint failed/);
        expect(() =>
            db.exec("INSERT INTO user_items VALUES ('u', 1, 0, NULL, NULL, NULL, 2)")
        ).toThrow(/CHECK constraint failed/);
        expect(() =>
            db.exec(
                "INSERT INTO score_events VALUES ('bad-source', 1, 'g', 'b', 'u', '1-0', 0, 0, 'other', 'initial', 0, 0, 0, '', '', NULL)"
            )
        ).toThrow(/CHECK constraint failed/);
        expect(() =>
            db.exec(
                "INSERT INTO score_events VALUES ('bad-kind', 1, 'g', 'b', 'u', '1-0', 0, 0, 'lxns', 'other', 0, 0, 0, '', '', NULL)"
            )
        ).toThrow(/CHECK constraint failed/);

        db.exec(
            "INSERT INTO scores (user_uid, record_key, chart_key) VALUES ('u', 'record-1', 'chart-1')"
        );
        expect(() =>
            db.exec(
                "INSERT INTO scores (user_uid, record_key, chart_key) VALUES ('u', 'record-2', 'chart-1')"
            )
        ).toThrow(/UNIQUE constraint failed/);
    });

    it("deleting a user cascades through every user-data child table", () => {
        const db = memory();
        migrate(db);
        insertMadeUsers(db, [
            {
                uid: "u",
                position: 0,
                scores: [{ recordKey: "1-0" }],
                b50: [{ section: "sd", position: 0, recordKey: "1-0" }],
                items: [{ listIndex: 1, position: 0 }],
                characters: [{ position: 0, characterId: 1 }],
                ratingHistory: [{ position: 0, time: 0, rating: 1 }],
                scoreEvents: [{ id: "e", recordKey: "1-0", observedAt: 0, sequence: 0 }],
            },
        ]);

        db.exec("DELETE FROM users WHERE uid = 'u'");
        for (const table of [
            "scores",
            "b50_snapshot",
            "user_items",
            "user_characters",
            "rating_history",
            "score_events",
        ]) {
            expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
        }
    });

    it("keeps the web user object without tokens, with its own uid", () => {
        const db = memory();
        migrate(db);
        const raw = JSON.stringify({
            uid: "u",
            remark: null,
            divingFish: { name: null, importToken: null },
            lxns: { auth: null, name: null, id: null },
            inGame: { id: null },
            settings: { manuallyUpdate: false },
            data: { updateTime: 1000.5, name: null, rating: 15000.25, items: [null, [], null] },
            addedLater: { anything: [1, "two"] },
        });
        insertMadeUsers(db, [{ uid: "u", position: 0, raw }]);
        expect(db.prepare("SELECT raw FROM users").get()).toEqual({ raw });

        for (const bad of [
            "{",
            "[]",
            '"text"',
            "{}",
            '{"uid":"other"}',
            '{"uid":1}',
            '{"uid":"v","divingFish":{"importToken":"secret"}}',
            '{"uid":"v","divingFish":{"importToken":""}}',
            '{"uid":"v","lxns":{"auth":{"access_token":"secret"}}}',
        ]) {
            expect(() => insertMadeUsers(db, [{ uid: "v", position: 1, raw: bad }])).toThrow(
                /CHECK constraint failed/
            );
        }
        // Compared with the TEXT column, 1 and true would both read as "1".
        for (const bad of ['{"uid":1}', '{"uid":true}']) {
            expect(() => insertMadeUsers(db, [{ uid: "1", position: 1, raw: bad }])).toThrow(
                /CHECK constraint failed/
            );
        }
        expect(db.prepare("SELECT count(*) AS n FROM users").get()).toEqual({ n: 1 });
    });

    it("stores fractional and full record values as the web app keeps them", () => {
        const db = memory();
        migrate(db);
        const record = {
            chartKey: "11590-3",
            songId: 1590,
            type: "DX",
            title: "Made",
            level: "13+",
            levelIndex: 3,
            levelLabel: "Master",
            ds: 13.7,
            achievements: 100.5123,
            dxScore: 2012,
            fc: "fcp",
            fs: "fsd",
            rate: "sssp",
            ra: 308,
            playCount: 12,
            lastChangedAt: 1700000000123,
        };
        insertMadeUsers(db, [
            {
                uid: "u",
                position: 0,
                b50: [
                    { section: "dx", position: 0, recordKey: "11590-3", ...record },
                    {
                        section: "sd",
                        position: 1,
                        recordKey: "8-2",
                        ds: 12.4,
                        achievements: 99.0001,
                    },
                    { section: "sd", position: 0, recordKey: "7-3", ds: 13, achievements: 97 },
                ],
                scoreEvents: [
                    {
                        id: "e",
                        recordKey: "11590-3",
                        observedAt: 1000.5,
                        sequence: 0,
                        achievements: 100.5,
                    },
                ],
                ratingHistory: [{ position: 0, time: null, rating: null }],
                characters: [{ position: 0, characterId: null }],
            },
        ]);

        expect(
            db
                .prepare(
                    "SELECT section, position, record_key, chart_key, song_id, type, title, level, level_index, level_label, ds, achievements, dx_score, fc, fs, rate, ra, play_count, last_changed_at FROM b50_snapshot ORDER BY section, position"
                )
                .all()
        ).toEqual([
            {
                section: "dx",
                position: 0,
                record_key: "11590-3",
                chart_key: "11590-3",
                song_id: 1590,
                type: "DX",
                title: "Made",
                level: "13+",
                level_index: 3,
                level_label: "Master",
                ds: 13.7,
                achievements: 100.5123,
                dx_score: 2012,
                fc: "fcp",
                fs: "fsd",
                rate: "sssp",
                ra: 308,
                play_count: 12,
                last_changed_at: 1700000000123,
            },
            expect.objectContaining({ section: "sd", position: 0, ds: 13, achievements: 97 }),
            expect.objectContaining({
                section: "sd",
                position: 1,
                ds: 12.4,
                achievements: 99.0001,
            }),
        ]);
        expect(db.prepare("SELECT observed_at, achievements FROM score_events").get()).toEqual({
            observed_at: 1000.5,
            achievements: 100.5,
        });
        expect(db.prepare("SELECT time, rating FROM rating_history").get()).toEqual({
            time: null,
            rating: null,
        });
        expect(db.prepare("SELECT character_id FROM user_characters").get()).toEqual({
            character_id: null,
        });
    });
});

describe("migrate", () => {
    it("applies every migration to a new database without a backup", () => {
        const db = memory();
        const backup = vi.fn(() => "unused");
        const result = migrate(db, [createsTable(1, "a"), createsTable(2, "b")], backup);

        expect(result).toEqual({ from: 0, to: 2 });
        expect(readUserVersion(db)).toBe(2);
        expect(tables(db)).toEqual(["a", "b"]);
        expect(backup).not.toHaveBeenCalled();
    });

    it("does nothing when the database is up to date", () => {
        const db = memory();
        const second = vi.fn();
        const migrations: Migration[] = [{ ...createsTable(1, "a"), up: second }];
        migrate(db, [createsTable(1, "a")]);
        second.mockClear();

        expect(migrate(db, migrations)).toEqual({ from: 1, to: 1 });
        expect(second).not.toHaveBeenCalled();
    });

    it("applies only what is missing, after asking for a backup", () => {
        const db = memory();
        migrate(db, [createsTable(1, "a")]);
        const backup = vi.fn(() => "/cache/saltnet-v1.db");

        const result = migrate(db, [createsTable(1, "a"), createsTable(2, "b")], backup);

        expect(backup).toHaveBeenCalledTimes(1);
        expect(backup).toHaveBeenCalledWith(1);
        expect(result).toEqual({ from: 1, to: 2, backup: "/cache/saltnet-v1.db" });
        expect(tables(db)).toEqual(["a", "b"]);
    });

    it("rolls a failing migration back completely, with the version it was bumping", () => {
        const db = memory();
        migrate(db, [createsTable(1, "a")]);
        const failing: Migration = {
            version: 2,
            name: "break halfway",
            up: db => {
                db.exec("CREATE TABLE b (x INTEGER) STRICT");
                throw new Error("disk on fire");
            },
        };

        let caught: unknown;
        try {
            migrate(db, [createsTable(1, "a"), failing], () => "/cache/saltnet-v1.db");
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(CliError);
        const error = caught as CliError;
        expect(error.code).toBe("INTERNAL");
        expect(error.message).toContain("结构版本 2（break halfway）");
        expect(error.message).toContain("disk on fire");
        expect(error.message).toContain("已回滚");
        expect(error.message).toContain("/cache/saltnet-v1.db");
        expect(tables(db)).toEqual(["a"]);
        expect(readUserVersion(db)).toBe(1);
        expect(db.isTransaction).toBe(false);
    });

    it("keeps the steps that succeeded when a later one fails", () => {
        const db = memory();
        const failing: Migration = {
            version: 3,
            name: "fails",
            up: () => {
                throw new Error("nope");
            },
        };
        expect(() => migrate(db, [createsTable(1, "a"), createsTable(2, "b"), failing])).toThrow(
            CliError
        );
        expect(readUserVersion(db)).toBe(2);
        expect(tables(db)).toEqual(["a", "b"]);
    });

    it("says nothing about a backup when none was made", () => {
        const db = memory();
        const failing: Migration = {
            version: 1,
            name: "fails",
            up: () => {
                throw new Error("nope");
            },
        };
        expect(() => migrate(db, [failing])).toThrow(/已回滚，数据没有改动$/);
    });

    it("refuses a database that a newer saltnet created, and leaves it alone", () => {
        const db = memory();
        migrate(db, [createsTable(1, "a")]);
        db.exec("PRAGMA user_version = 9");
        const backup = vi.fn(() => "unused");

        let caught: unknown;
        try {
            migrate(db, [createsTable(1, "a"), createsTable(2, "b")], backup);
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(CliError);
        expect((caught as CliError).code).toBe("INTERNAL");
        expect((caught as CliError).message).toContain("结构版本 9");
        expect((caught as CliError).message).toContain("只认识到 2");
        expect(backup).not.toHaveBeenCalled();
        expect(readUserVersion(db)).toBe(9);
    });

    it("insists on migrations numbered 1, 2, 3 in order", () => {
        expect(() => migrate(memory(), [createsTable(2, "a")])).toThrow(/versions must be/);
        expect(() => migrate(memory(), [createsTable(1, "a"), createsTable(1, "b")])).toThrow(
            /versions must be/
        );
        expect(() => migrate(memory(), [createsTable(1, "a"), createsTable(3, "b")])).toThrow(
            /versions must be/
        );
    });
});

describe("migrate with two connections", () => {
    const makeHome = useTempHome();

    function pair() {
        const { DatabaseSync } = loadSqlite();
        const paths = makeHome();
        mkdirSync(paths.home, { recursive: true });
        return {
            first: new DatabaseSync(paths.database, { timeout: 30 }),
            second: new DatabaseSync(paths.database, { timeout: 30 }),
        };
    }

    it("skips a step that the other connection applied while this one was preparing", () => {
        const { first, second } = pair();
        const migrations = [createsTable(1, "a"), createsTable(2, "b")];
        migrate(first, [migrations[0]]);

        // The second connection has seen version 1 and is about to migrate; before it gets to,
        // the first one finishes the job. Creating `b` twice would fail.
        const result = migrate(second, migrations, () => {
            migrate(first, migrations);
            return "/cache/backup.db";
        });

        expect(result).toEqual({ from: 1, to: 2, backup: "/cache/backup.db" });
        expect(tables(second)).toEqual(["a", "b"]);
        expect(readUserVersion(second)).toBe(2);
    });

    it("reports DB_LOCKED when another connection holds the write lock", () => {
        const { first, second } = pair();
        first.exec("BEGIN IMMEDIATE");

        let caught: unknown;
        try {
            migrate(second, [createsTable(1, "a")]);
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(CliError);
        expect((caught as CliError).code).toBe("DB_LOCKED");
        expect(second.isTransaction).toBe(false);
        first.exec("ROLLBACK");
        expect(migrate(second, [createsTable(1, "a")])).toEqual({ from: 0, to: 1 });
    });
});
