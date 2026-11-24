import type { SandboxView } from "../../src/store/sandbox";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CliError } from "../../src/errors";
import { openSandbox, REAL_SCHEMA } from "../../src/store/sandbox";
import { loadSqlite } from "../../src/store/sqlite";
import { DEFAULT_BUSY_TIMEOUT_MS } from "../../src/store/store";
import { caught } from "../caught";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

function setupDb(home: string): string {
    mkdirSync(home, { recursive: true });
    const { DatabaseSync } = loadSqlite();
    const dbPath = join(home, "test.db");
    const db = new DatabaseSync(dbPath);
    db.exec(`
        CREATE TABLE things (id INTEGER, name TEXT);
        INSERT INTO things VALUES (1, 'a'), (2, 'b'), (3, NULL);
    `);
    db.close();
    return dbPath;
}

/** What SQLite says when it refuses a statement: its own message and its error code. */
function refusal(run: () => unknown): { message: string; errcode: number | undefined } {
    try {
        run();
    } catch (error) {
        const { message, errcode } = error as { message: string; errcode?: number };
        return { message, errcode };
    }
    throw new Error("expected the statement to be refused");
}

const vThings: SandboxView = {
    name: "v_things",
    columns: [
        { name: "id", type: "INTEGER" },
        { name: "label", type: "TEXT" },
    ],
    select: `SELECT id AS "id", upper(name) AS "label" FROM ${REAL_SCHEMA}.things ORDER BY id`,
};

describe("openSandbox", () => {
    it("copies the views into the in-memory database", () => {
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        const sandbox = openSandbox({ database: dbPath, views: [vThings] });
        try {
            const rows = sandbox.db.prepare("SELECT id, label FROM v_things").all();
            expect(rows).toEqual([
                { id: 1, label: "A" },
                { id: 2, label: "B" },
                { id: 3, label: null },
            ]);
        } finally {
            sandbox.close();
        }
    });

    it("applies type affinity to the columns of the copy", () => {
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        const vAffinity: SandboxView = {
            name: "v_affinity",
            columns: [
                { name: "a", type: "INTEGER" },
                { name: "b", type: "REAL" },
                { name: "c", type: "TEXT" },
            ],
            select: `SELECT '7' AS "a", 5 AS "b", 7 AS "c"`,
        };
        const sandbox = openSandbox({ database: dbPath, views: [vAffinity] });
        try {
            const rows = sandbox.db
                .prepare(
                    "SELECT a, typeof(a) AS ta, b, typeof(b) AS tb, c, typeof(c) AS tc FROM v_affinity"
                )
                .all();
            expect(rows).toEqual([{ a: 7, ta: "integer", b: 5, tb: "real", c: "7", tc: "text" }]);
        } finally {
            sandbox.close();
        }
    });

    it("returns what readAlso produces and copies multiple views", () => {
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        const vNames: SandboxView = {
            name: "v_names",
            columns: [{ name: "name", type: "TEXT" }],
            select: `SELECT name FROM ${REAL_SCHEMA}.things ORDER BY id`,
        };
        const readAlso = vi.fn(
            db =>
                db.prepare(`SELECT count(*) AS n FROM ${REAL_SCHEMA}.things`).get() as {
                    n: number;
                }
        );
        const sandbox = openSandbox({ database: dbPath, views: [vThings, vNames], readAlso });
        try {
            expect(sandbox.also).toEqual({ n: 3 });
            expect(readAlso).toHaveBeenCalledTimes(1);
            expect(sandbox.db.prepare("SELECT count(*) AS n FROM v_things").get()).toEqual({
                n: 3,
            });
            expect(sandbox.db.prepare("SELECT count(*) AS n FROM v_names").get()).toEqual({ n: 3 });
        } finally {
            sandbox.close();
        }
    });

    it("handles mixed-case and quoted view and column names", () => {
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        const vMixed: SandboxView = {
            name: "V_Mixed",
            columns: [{ name: "id", type: "INTEGER" }],
            select: `SELECT id FROM ${REAL_SCHEMA}.things ORDER BY id LIMIT 1`,
        };
        const vOdd: SandboxView = {
            name: 'v_"odd"',
            columns: [{ name: 'a"b', type: "TEXT" }],
            select: `SELECT 'x' AS "a""b"`,
        };
        const sandbox = openSandbox({ database: dbPath, views: [vMixed, vOdd] });
        try {
            expect(sandbox.db.prepare("SELECT id FROM v_mixed").all()).toEqual([{ id: 1 }]);
            expect(sandbox.db.prepare("SELECT id FROM V_MIXED").all()).toEqual([{ id: 1 }]);
            expect(sandbox.db.prepare('SELECT id FROM "V_Mixed"').all()).toEqual([{ id: 1 }]);
            expect(sandbox.db.prepare('SELECT "a""b" FROM "v_""odd"""').all()).toEqual([
                { 'a"b': "x" },
            ]);
        } finally {
            sandbox.close();
        }
    });

    it("does not open or require the database file when views is empty", () => {
        const paths = makeHome();
        const nonExistent = join(paths.home, "non_existent.db");
        const readAlso = vi.fn();
        const sandbox = openSandbox({ database: nonExistent, views: [], readAlso });
        try {
            expect(sandbox.also).toBeUndefined();
            expect(readAlso).not.toHaveBeenCalled();
            expect(sandbox.db.prepare("SELECT 1+1 AS two").all()).toEqual([{ two: 2 }]);
            expect(existsSync(nonExistent)).toBe(false);
        } finally {
            sandbox.close();
        }
    });

    it("treats the real database as read-only during readAlso", () => {
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        const beforeBytes = readFileSync(dbPath);

        const error = caught(() =>
            openSandbox({
                database: dbPath,
                views: [vThings],
                readAlso: db => db.exec(`DELETE FROM ${REAL_SCHEMA}.things`),
            })
        );
        expect(error.code).toBe("INTERNAL");
        expect(error.message).toContain(dbPath);
        expect(readFileSync(dbPath).equals(beforeBytes)).toBe(true);

        const { DatabaseSync } = loadSqlite();
        const checkDb = new DatabaseSync(dbPath);
        expect(checkDb.prepare("SELECT count(*) AS n FROM things").get()).toEqual({ n: 3 });
        checkDb.close();

        const customError = new CliError("INTERNAL", "boom");
        const customCaught = caught(() =>
            openSandbox({
                database: dbPath,
                views: [vThings],
                readAlso: () => {
                    throw customError;
                },
            })
        );
        expect(customCaught).toBe(customError);
    });

    it("reports missing, corrupt, or locked databases when views are requested", () => {
        const paths = makeHome();
        mkdirSync(paths.home, { recursive: true });
        const missingPath = join(paths.home, "missing.db");

        const errMissing = caught(() => openSandbox({ database: missingPath, views: [vThings] }));
        expect(errMissing.code).toBe("INTERNAL");
        expect(errMissing.message.startsWith("无法读写数据库 ")).toBe(true);
        expect(errMissing.message).toContain(missingPath);
        expect(existsSync(missingPath)).toBe(false);

        const corruptPath = join(paths.home, "corrupt.db");
        writeFileSync(corruptPath, "not a database");
        const errCorrupt = caught(() => openSandbox({ database: corruptPath, views: [vThings] }));
        expect(errCorrupt.code).toBe("INTERNAL");
        expect(errCorrupt.message).toContain("已损坏");

        const lockedPath = setupDb(paths.home);
        const { DatabaseSync } = loadSqlite();
        const holder = new DatabaseSync(lockedPath);
        holder.exec("BEGIN EXCLUSIVE");
        try {
            const errLocked = caught(() =>
                openSandbox({ database: lockedPath, views: [vThings], busyTimeoutMs: 50 })
            );
            expect(errLocked.code).toBe("DB_LOCKED");
            expect(errLocked.message).toBe("数据库正被另一个 saltnet 进程占用，稍后再试");
        } finally {
            holder.exec("ROLLBACK");
            holder.close();
        }
    });

    /** The error code of a statement the authorizer refused (`SQLITE_AUTH`). */
    const SQLITE_AUTH = 23;

    // The words differ with the kind of statement (`not authorized` for most, `authorization
    // denied` for VACUUM, `access to <table>.<column> is prohibited` for a read of something that
    // is not a copy), the error code does not. A bare `REINDEX` is not here: SQLite does not ask
    // the authorizer about it, and with no index in the sandbox it has nothing to rebuild.
    const REFUSED_STATEMENTS = [
        "INSERT INTO v_things VALUES (4, 'd')",
        "UPDATE v_things SET label = 'x'",
        "DELETE FROM v_things",
        "DROP TABLE v_things",
        "ALTER TABLE v_things RENAME TO x",
        "CREATE TABLE x (a)",
        "CREATE TEMP TABLE x (a)",
        "CREATE VIEW v AS SELECT 1",
        "CREATE INDEX i ON v_things (id)",
        "ATTACH DATABASE ':memory:' AS x",
        "DETACH DATABASE main",
        "PRAGMA query_only = OFF",
        "PRAGMA writable_schema = ON",
        "PRAGMA user_version = 5",
        "PRAGMA user_version",
        "PRAGMA table_info(v_things)",
        "VACUUM",
        "ANALYZE",
        "ANALYZE v_things",
        "BEGIN",
        "SAVEPOINT s",
        "RELEASE s",
        "COMMIT",
        "ROLLBACK",
        "SELECT * FROM sqlite_master",
        "SELECT * FROM sqlite_schema",
        "SELECT * FROM sqlite_temp_master",
        "SELECT * FROM sqlite_temp_schema",
        "SELECT count(*) FROM sqlite_master",
        "SELECT (SELECT count(*) FROM sqlite_master)",
        "SELECT * FROM v_things, sqlite_master",
        "SELECT * FROM pragma_table_info('v_things')",
        "SELECT * FROM pragma_database_list",
        "SELECT * FROM pragma_user_version",
        "SELECT * FROM dbstat",
    ];

    it.each(REFUSED_STATEMENTS)("refuses statement %s under the authorizer", statement => {
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        const beforeBytes = readFileSync(dbPath);
        const sandbox = openSandbox({ database: dbPath, views: [vThings] });
        try {
            const { message, errcode } = refusal(() => sandbox.db.exec(statement));
            expect(errcode).toBe(SQLITE_AUTH);
            expect(message).toMatch(/not authorized|authorization denied|is prohibited/);
            expect(sandbox.db.prepare("SELECT count(*) AS n FROM v_things").get()).toEqual({
                n: 3,
            });
            expect(readFileSync(dbPath).equals(beforeBytes)).toBe(true);
        } finally {
            sandbox.close();
        }
    });

    it("refuses unauthorized functions and base tables", () => {
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        const sandbox = openSandbox({ database: dbPath, views: [vThings] });
        try {
            expect(() => sandbox.db.prepare("SELECT load_extension('x')").all()).toThrow(
                /not authorized to use function: load_extension/
            );
            expect(() => sandbox.db.prepare("SELECT * FROM things").all()).toThrow(
                /no such table: things/
            );
            expect(() => sandbox.db.prepare(`SELECT * FROM ${REAL_SCHEMA}.things`).all()).toThrow(
                /no such table: real.things/
            );
        } finally {
            sandbox.close();
        }
    });

    it("allows standard read operations, recursion, json functions, and CTEs", () => {
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        const sandbox = openSandbox({ database: dbPath, views: [vThings] });
        try {
            expect(sandbox.db.prepare("SELECT 1+1 AS two").all()).toEqual([{ two: 2 }]);
            expect(sandbox.db.prepare("SELECT sqlite_version() IS NOT NULL AS ok").all()).toEqual([
                { ok: 1 },
            ]);
            expect(sandbox.db.prepare("SELECT value FROM json_each('[1,2]')").all()).toEqual([
                { value: 1 },
                { value: 2 },
            ]);
            expect(
                sandbox.db
                    .prepare(
                        "SELECT v.id, j.value FROM v_things v JOIN json_each('[1,2]') j ON v.id = j.value"
                    )
                    .all()
            ).toEqual([
                { id: 1, value: 1 },
                { id: 2, value: 2 },
            ]);
            expect(
                sandbox.db.prepare("SELECT count(*) AS n FROM json_tree('{\"a\":[1,2]}')").all()
            ).toEqual([{ n: 4 }]);
            expect(
                sandbox.db
                    .prepare(
                        "WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c WHERE n < 3) SELECT n FROM c"
                    )
                    .all()
            ).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
            expect(sandbox.db.prepare("VALUES (1), (2)").all()).toEqual([
                { column1: 1 },
                { column1: 2 },
            ]);
            expect(
                sandbox.db.prepare("WITH things AS (SELECT 42 AS n) SELECT n FROM things").all()
            ).toEqual([{ n: 42 }]);
            expect(
                sandbox.db
                    .prepare(
                        "SELECT id, row_number() OVER (ORDER BY id DESC) AS r FROM v_things ORDER BY id"
                    )
                    .all()
            ).toEqual([
                { id: 1, r: 3 },
                { id: 2, r: 2 },
                { id: 3, r: 1 },
            ]);
        } finally {
            sandbox.close();
        }
    });

    it("allows jsonb_each and jsonb_tree like their text counterparts", () => {
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        const sandbox = openSandbox({ database: dbPath, views: [vThings] });
        try {
            expect(
                sandbox.db.prepare("SELECT count(*) AS n FROM jsonb_each('[1,2]')").all()
            ).toEqual([{ n: 2 }]);
            expect(
                sandbox.db.prepare("SELECT count(*) AS n FROM jsonb_tree('{\"a\":[1,2]}')").all()
            ).toEqual([{ n: 4 }]);
        } finally {
            sandbox.close();
        }
    });

    it("reads what readAlso asks for from the same snapshot as the copies", () => {
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        // In WAL mode (as the real database is) a writer is not held up by a reader.
        const { DatabaseSync } = loadSqlite();
        const writer = new DatabaseSync(dbPath);
        try {
            writer.exec("PRAGMA journal_mode = WAL");
            const sandbox = openSandbox({
                database: dbPath,
                views: [vThings],
                readAlso: db => {
                    // Another process adds a row after the copy was made; the snapshot the copy
                    // came from does not have it, so neither may what is read now.
                    writer.exec("INSERT INTO things VALUES (4, 'd')");
                    return db.prepare(`SELECT count(*) AS n FROM ${REAL_SCHEMA}.things`).get() as {
                        n: number;
                    };
                },
            });
            try {
                expect(sandbox.also).toEqual({ n: 3 });
                expect(sandbox.db.prepare("SELECT count(*) AS n FROM v_things").get()).toEqual({
                    n: 3,
                });
            } finally {
                sandbox.close();
            }
            // The row was written, and a sandbox opened afterwards has it.
            const later = openSandbox({ database: dbPath, views: [vThings] });
            try {
                expect(later.db.prepare("SELECT count(*) AS n FROM v_things").get()).toEqual({
                    n: 4,
                });
            } finally {
                later.close();
            }
        } finally {
            writer.close();
        }
    });

    it("sets the busy timeout it was given, and a default when it was given none", () => {
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        const timeoutOf = (busyTimeoutMs?: number): unknown => {
            const sandbox = openSandbox({
                database: dbPath,
                views: [vThings],
                ...(busyTimeoutMs === undefined ? {} : { busyTimeoutMs }),
                readAlso: db => db.prepare("PRAGMA busy_timeout").get(),
            });
            sandbox.close();
            return sandbox.also;
        };

        expect(timeoutOf()).toEqual({ timeout: DEFAULT_BUSY_TIMEOUT_MS });
        expect(timeoutOf(50)).toEqual({ timeout: 50 });
        expect(timeoutOf(0)).toEqual({ timeout: 0 });
    });

    it("refuses the functions that reach outside the database, however they are written", () => {
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        const sandbox = openSandbox({ database: dbPath, views: [vThings] });
        try {
            const calls = [
                "load_extension('x')",
                "LOAD_EXTENSION('x')",
                "fts3_tokenizer('simple')",
                "Fts3_Tokenizer('simple')",
            ];
            for (const call of calls) {
                expect(() => sandbox.db.prepare(`SELECT ${call}`).all(), call).toThrow(
                    /not authorized to use function/
                );
            }
        } finally {
            sandbox.close();
        }
    });

    it("keeps the connection from writing even where the authorizer is taken away", () => {
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        const sandbox = openSandbox({ database: dbPath, views: [vThings] });
        try {
            // No query can get here, since the authorizer refuses PRAGMA. These are the layers
            // under it, which still hold when SQLite adds a kind of statement the authorizer does
            // not know yet.
            sandbox.db.setAuthorizer(null);
            expect(sandbox.db.prepare("PRAGMA query_only").get()).toEqual({ query_only: 1 });
            for (const statement of [
                "CREATE TABLE x (a)",
                "INSERT INTO v_things VALUES (4, 'd')",
            ]) {
                expect(refusal(() => sandbox.db.exec(statement)).message, statement).toBe(
                    "attempt to write a readonly database"
                );
            }

            // With writing allowed again, defensive mode still keeps the schema from being edited.
            sandbox.db.exec("PRAGMA query_only = OFF");
            sandbox.db.exec("PRAGMA writable_schema = ON");
            expect(sandbox.db.prepare("PRAGMA writable_schema").get()).toEqual({
                writable_schema: 0,
            });
            expect(() => sandbox.db.exec("UPDATE sqlite_schema SET name = name")).toThrow(
                /may not be modified/
            );
        } finally {
            sandbox.close();
        }
    });

    it("asks for defensive mode itself, whatever this Node starts connections with", () => {
        // This Node already opens connections in defensive mode (its `defensive` option defaults to
        // true), so only the call itself can be seen; the sandbox asks too, because SQLite's own
        // default is off and the safety of `sql` should not depend on a default of Node's.
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        const { DatabaseSync } = loadSqlite();
        const enableDefensive = vi.spyOn(DatabaseSync.prototype, "enableDefensive");
        try {
            openSandbox({ database: dbPath, views: [vThings] }).close();
            expect(enableDefensive).toHaveBeenCalledWith(true);
        } finally {
            enableDefensive.mockRestore();
        }
    });

    it("closes cleanly and supports idempotent close calls", () => {
        const paths = makeHome();
        const dbPath = setupDb(paths.home);
        const sandbox = openSandbox({ database: dbPath, views: [vThings] });
        expect(sandbox.db.isOpen).toBe(true);
        sandbox.close();
        expect(sandbox.db.isOpen).toBe(false);
        sandbox.close();
        expect(() => sandbox.db.exec("SELECT 1")).toThrow();
    });
});
