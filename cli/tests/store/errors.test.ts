import { describe, expect, it } from "vitest";
import { CliError } from "../../src/errors";
import { isSqliteError, storeError } from "../../src/store/errors";
import { loadSqlite } from "../../src/store/sqlite";

/** What `node:sqlite` throws, without needing a database that fails in just that way. */
function sqliteError(errcode: number, errstr = "something happened"): Error {
    return Object.assign(new Error(errstr), { code: "ERR_SQLITE_ERROR", errcode, errstr });
}

describe("isSqliteError", () => {
    it("recognizes the errors node:sqlite throws", () => {
        const db = new (loadSqlite().DatabaseSync)(":memory:");
        let caught: unknown;
        try {
            db.exec("SELEC 1");
        } catch (error) {
            caught = error;
        }
        expect(isSqliteError(caught)).toBe(true);
    });

    it("does not take other errors for them", () => {
        expect(isSqliteError(new Error("x"))).toBe(false);
        expect(isSqliteError(Object.assign(new Error("x"), { errcode: 5 }))).toBe(false);
        expect(isSqliteError(Object.assign(new Error("x"), { code: "ERR_SQLITE_ERROR" }))).toBe(
            false
        );
        expect(isSqliteError({ code: "ERR_SQLITE_ERROR", errcode: 5 })).toBe(false);
        expect(isSqliteError("database is locked")).toBe(false);
        expect(isSqliteError(null)).toBe(false);
    });
});

describe("storeError", () => {
    it("calls a busy or locked database DB_LOCKED, which is worth retrying", () => {
        // 261 and 517 are SQLITE_BUSY_RECOVERY and SQLITE_BUSY_SNAPSHOT: the low byte says BUSY.
        for (const errcode of [5, 6, 261, 517]) {
            const error = storeError(sqliteError(errcode, "database is locked"));
            expect(error).toBeInstanceOf(CliError);
            expect(error?.code).toBe("DB_LOCKED");
            expect(error?.exitCode).toBe(7);
            expect(error?.retryable).toBe(true);
        }
    });

    it("explains a damaged database and names the file when it is known", () => {
        for (const errcode of [11, 26, 267]) {
            const error = storeError(sqliteError(errcode), "/data/saltnet.db");
            expect(error?.code).toBe("INTERNAL");
            expect(error?.message).toContain("数据库 /data/saltnet.db已损坏");
            expect(error?.message).toContain("SALTNET_HOME");
        }
        expect(storeError(sqliteError(26))?.message).toContain("数据库已损坏");
    });

    it("explains a database that cannot be read or written", () => {
        for (const errcode of [3, 8, 10, 13, 14]) {
            const error = storeError(sqliteError(errcode, "unable to open database file"));
            expect(error?.code).toBe("INTERNAL");
            expect(error?.message).toContain("unable to open database file");
            expect(error?.message).toContain("SALTNET_HOME");
        }
    });

    it("keeps the original error as the cause", () => {
        const original = sqliteError(5);
        expect(storeError(original)?.cause).toBe(original);
    });

    it("leaves any other failure alone, so it is reported as an internal error", () => {
        expect(storeError(sqliteError(1))).toBeUndefined();
        expect(storeError(sqliteError(19))).toBeUndefined();
        expect(storeError(new Error("boom"))).toBeUndefined();
        expect(storeError("boom")).toBeUndefined();
    });
});
