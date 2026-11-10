import type { Migration } from "../../src/store/migrations";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { CliError } from "../../src/errors";
import { isSqliteError, storeError } from "../../src/store/errors";
import { MIGRATIONS, readUserVersion } from "../../src/store/migrations";
import { loadSqlite } from "../../src/store/sqlite";
import { openStore } from "../../src/store/store";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

const posix = process.platform !== "win32";

function mode(file: string): string {
    return (statSync(file).mode & 0o777).toString(8);
}

const createA: Migration = {
    version: 1,
    name: "create a",
    up: db => db.exec("CREATE TABLE a (x TEXT) STRICT"),
};
const createB: Migration = {
    version: 2,
    name: "create b",
    up: db => db.exec("CREATE TABLE b (y TEXT) STRICT"),
};
const createC: Migration = {
    version: 3,
    name: "create c",
    up: db => db.exec("CREATE TABLE c (z TEXT) STRICT"),
};

describe("openStore", () => {
    it("creates the data directory and the database on first use", () => {
        const paths = makeHome();
        expect(existsSync(paths.home)).toBe(false);

        const store = openStore(paths);

        expect(existsSync(paths.database)).toBe(true);
        expect(existsSync(paths.cache)).toBe(true);
        expect(store.path).toBe(paths.database);
        store.close();
    });

    it("keeps the data private to the user", () => {
        if (!posix) return;
        const paths = makeHome();
        const store = openStore(paths);
        store.db.exec("CREATE TABLE t (x INTEGER)");
        store.db.exec("INSERT INTO t VALUES (1)");

        expect(mode(paths.home)).toBe("700");
        expect(mode(paths.cache)).toBe("700");
        expect(mode(paths.database)).toBe("600");
        // The write-ahead log holds the same data as the database.
        expect(existsSync(`${paths.database}-wal`)).toBe(true);
        expect(mode(`${paths.database}-wal`)).toBe("600");
        store.close();
    });

    it("uses write-ahead logging and enforces foreign keys", () => {
        const store = openStore(makeHome());
        expect(store.db.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
        expect(store.db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
        store.close();
    });

    it("brings a new database to the newest layout without a backup", () => {
        const paths = makeHome();
        const store = openStore(paths);

        expect(store.migration).toEqual({ from: 0, to: MIGRATIONS.length });
        expect(readUserVersion(store.db)).toBe(MIGRATIONS.length);
        expect(readdirSync(paths.cache)).toEqual([]);
        store.close();
    });

    it("keeps what was written when it is opened again", () => {
        const paths = makeHome();
        const first = openStore(paths, { migrations: [createA] });
        first.db.prepare("INSERT INTO a (x) VALUES (?)").run("kept");
        first.close();

        const second = openStore(paths, { migrations: [createA] });
        expect(second.migration).toEqual({ from: 1, to: 1 });
        expect(second.db.prepare("SELECT x FROM a").all()).toEqual([{ x: "kept" }]);
        second.close();
    });

    it("copies the database into cache/ before migrating data that already exists", () => {
        const paths = makeHome();
        const old = openStore(paths, { migrations: [createA] });
        old.db.prepare("INSERT INTO a (x) VALUES (?)").run("precious");
        old.close();

        const upgraded = openStore(paths, {
            migrations: [createA, createB],
            now: () => new Date("2026-11-11T01:18:00.123Z"),
        });

        const backup = path.join(paths.cache, "saltnet-v1-20261111T011800Z.db");
        expect(upgraded.migration).toEqual({ from: 1, to: 2, backup });
        expect(readdirSync(paths.cache)).toEqual(["saltnet-v1-20261111T011800Z.db"]);
        if (posix) expect(mode(backup)).toBe("600");

        // The copy is the old database as it was, and the real one has moved on.
        const copy = new (loadSqlite().DatabaseSync)(backup);
        expect(readUserVersion(copy)).toBe(1);
        expect(copy.prepare("SELECT x FROM a").all()).toEqual([{ x: "precious" }]);
        expect(copy.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").all()).toEqual([]);
        copy.close();
        expect(readUserVersion(upgraded.db)).toBe(2);
        expect(upgraded.db.prepare("SELECT x FROM a").all()).toEqual([{ x: "precious" }]);
        upgraded.close();
    });

    it("does not overwrite an earlier backup made in the same second", () => {
        const paths = makeHome();
        openStore(paths, { migrations: [createA] }).close();
        mkdirSync(paths.cache, { recursive: true });
        writeFileSync(path.join(paths.cache, "saltnet-v1-20261111T011800Z.db"), "earlier");

        const store = openStore(paths, {
            migrations: [createA, createB],
            now: () => new Date("2026-11-11T01:18:00.999Z"),
        });

        expect(store.migration.backup).toBe(
            path.join(paths.cache, "saltnet-v1-20261111T011800Z-2.db")
        );
        expect(readFileSync(path.join(paths.cache, "saltnet-v1-20261111T011800Z.db"), "utf8")).toBe(
            "earlier"
        );
        store.close();
    });

    it("names the backup after the version it saves", () => {
        const paths = makeHome();
        openStore(paths, { migrations: [createA, createB] }).close();
        const store = openStore(paths, {
            migrations: [createA, createB, createC],
            now: () => new Date("2026-01-02T03:04:05Z"),
        });
        expect(path.basename(store.migration.backup ?? "")).toBe("saltnet-v2-20260102T030405Z.db");
        store.close();
    });

    it("reports a migration that fails, leaves the database as it was and keeps the backup", () => {
        const paths = makeHome();
        openStore(paths, { migrations: [createA] }).close();
        const failing: Migration = {
            version: 2,
            name: "fails",
            up: () => {
                throw new Error("nope");
            },
        };

        let caught: unknown;
        try {
            openStore(paths, { migrations: [createA, failing] });
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(CliError);
        const [backup] = readdirSync(paths.cache);
        expect((caught as CliError).message).toContain(path.join(paths.cache, backup));

        const again = openStore(paths, { migrations: [createA] });
        expect(again.migration).toEqual({ from: 1, to: 1 });
        again.close();
    });

    it("refuses a database from a newer saltnet without touching it", () => {
        const paths = makeHome();
        openStore(paths, { migrations: [createA] }).close();
        const raw = new (loadSqlite().DatabaseSync)(paths.database);
        raw.exec("PRAGMA user_version = 99");
        raw.close();

        let caught: unknown;
        try {
            openStore(paths, { migrations: [createA] });
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(CliError);
        expect((caught as CliError).message).toContain("结构版本 99");
        expect(readdirSync(paths.cache)).toEqual([]);
    });

    it("explains a file that is not a database and leaves it where it is", () => {
        const paths = makeHome();
        mkdirSync(paths.home, { recursive: true });
        const junk = "this is not a sqlite database, just some text that is long enough";
        writeFileSync(paths.database, junk);

        let caught: unknown;
        try {
            openStore(paths);
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(CliError);
        expect((caught as CliError).code).toBe("INTERNAL");
        expect((caught as CliError).message).toContain(paths.database);
        expect((caught as CliError).message).toContain("不是 SQLite 数据库");
        expect(readFileSync(paths.database, "utf8")).toBe(junk);
    });

    it("reports DB_LOCKED when another connection holds the write lock for too long", () => {
        const paths = makeHome();
        const holder = openStore(paths);
        holder.db.exec("BEGIN IMMEDIATE");

        // Readers are not blocked by a writer in WAL mode, so opening works.
        const reader = openStore(paths, { busyTimeoutMs: 30 });
        let caught: unknown;
        try {
            reader.transaction(() => undefined);
        } catch (error) {
            caught = error;
        }

        expect(isSqliteError(caught)).toBe(true);
        expect(storeError(caught)?.code).toBe("DB_LOCKED");
        holder.db.exec("ROLLBACK");
        expect(reader.transaction(() => "now it works")).toBe("now it works");
        reader.close();
        holder.close();
    });

    it("can be closed twice, and the database is unusable afterwards", () => {
        const store = openStore(makeHome());
        store.close();
        expect(() => store.close()).not.toThrow();
        expect(() => store.db.exec("SELECT 1")).toThrow(/not open/);
    });
});

describe("store.transaction", () => {
    function open() {
        const store = openStore(makeHome(), { migrations: [createA] });
        const rows = (): string[] =>
            (store.db.prepare("SELECT x FROM a ORDER BY rowid").all() as { x: string }[]).map(
                row => row.x
            );
        const add = (x: string): void =>
            void store.db.prepare("INSERT INTO a (x) VALUES (?)").run(x);
        return { store, rows, add };
    }

    it("commits what the work changed and returns its result", () => {
        const { store, rows, add } = open();
        const result = store.transaction(() => {
            add("one");
            add("two");
            return "done";
        });
        expect(result).toBe("done");
        expect(rows()).toEqual(["one", "two"]);
        expect(store.db.isTransaction).toBe(false);
        store.close();
    });

    it("undoes everything when the work throws, and lets the error through", () => {
        const { store, rows, add } = open();
        expect(() =>
            store.transaction(() => {
                add("one");
                throw new Error("halfway");
            })
        ).toThrow("halfway");
        expect(rows()).toEqual([]);
        expect(store.db.isTransaction).toBe(false);
        store.close();
    });

    it("undoes only the inner changes when the outer code catches an inner failure", () => {
        const { store, rows, add } = open();
        store.transaction(() => {
            add("outer 1");
            try {
                store.transaction(() => {
                    add("inner");
                    throw new Error("inner failed");
                });
            } catch {
                // Carry on without the inner change.
            }
            add("outer 2");
        });
        expect(rows()).toEqual(["outer 1", "outer 2"]);
        store.close();
    });

    it("keeps inner changes together with the outer ones", () => {
        const { store, rows, add } = open();
        store.transaction(() => {
            add("outer");
            store.transaction(() => add("inner"));
        });
        expect(rows()).toEqual(["outer", "inner"]);
        store.close();
    });

    it("undoes the inner changes too when the outer work fails after an inner success", () => {
        const { store, rows, add } = open();
        expect(() =>
            store.transaction(() => {
                store.transaction(() => add("inner"));
                throw new Error("outer failed");
            })
        ).toThrow("outer failed");
        expect(rows()).toEqual([]);
        expect(store.db.isTransaction).toBe(false);
        store.close();
    });

    it("refuses work that is asynchronous, because it would commit before the work is done", () => {
        const { store, rows, add } = open();
        expect(() =>
            store.transaction(async () => {
                add("early");
                await Promise.resolve();
            })
        ).toThrow(TypeError);
        expect(rows()).toEqual([]);
        expect(store.db.isTransaction).toBe(false);
        store.close();
    });

    it("can be used again after a failure", () => {
        const { store, rows, add } = open();
        expect(() =>
            store.transaction(() => {
                throw new Error("first");
            })
        ).toThrow("first");
        store.transaction(() => add("second"));
        expect(rows()).toEqual(["second"]);
        store.close();
    });
});
