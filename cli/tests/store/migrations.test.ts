import type { Migration } from "../../src/store/migrations";
import type { DatabaseSync } from "../../src/store/sqlite";
import { mkdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CliError } from "../../src/errors";
import { migrate, MIGRATIONS, readUserVersion } from "../../src/store/migrations";
import { loadSqlite } from "../../src/store/sqlite";
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
            "charts",
            "collections",
            "course_tracks",
            "courses",
            "locks",
            "meta_state",
            "songs",
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
