import type { DatabaseSync } from "../../src/store/sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runQuery } from "../../src/store/query";
import { openSandbox } from "../../src/store/sandbox";
import { loadSqlite } from "../../src/store/sqlite";
import { caught } from "../caught";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

describe("runQuery", () => {
    let plain: DatabaseSync;

    beforeEach(() => {
        const { DatabaseSync } = loadSqlite();
        plain = new DatabaseSync(":memory:");
        plain.exec(`
            CREATE TABLE t (a INTEGER, b TEXT);
            INSERT INTO t VALUES (1, 'x'), (2, 'y'), (3, 'z'), (4, 'w'), (5, 'v');
        `);
    });

    afterEach(() => {
        if (plain.isOpen) plain.close();
    });

    it("converts SQLite values correctly into JSON-safe values", () => {
        const res = runQuery(
            plain,
            `SELECT
                9007199254740991 AS max_safe,
                9007199254740993 AS unsafe_pos,
                -9007199254740991 AS min_safe,
                -9007199254740992 AS unsafe_neg,
                0.1 + 0.2 AS fadd,
                1e999 AS inf,
                '12' AS s_num,
                12 AS n_num,
                NULL AS nil,
                x'00ff10' AS b_hex,
                x'' AS b_empty`,
            10
        );

        expect(res.rows).toEqual([
            {
                max_safe: 9007199254740991,
                unsafe_pos: "9007199254740993",
                min_safe: -9007199254740991,
                unsafe_neg: "-9007199254740992",
                fadd: 0.30000000000000004,
                inf: null,
                s_num: "12",
                n_num: 12,
                nil: null,
                b_hex: "00ff10",
                b_empty: "",
            },
        ]);
    });

    it("reports column names accurately for expressions and aliases", () => {
        const res1 = runQuery(plain, "SELECT 1, 2+3, 'x'", 10);
        expect(res1.columns).toEqual(["1", "2+3", "'x'"]);

        const res2 = runQuery(plain, "SELECT 1 AS one, 2 AS two", 10);
        expect(res2.columns).toEqual(["one", "two"]);
    });

    it("throws an error when duplicate column names appear in the result", () => {
        const err1 = caught(() => runQuery(plain, "SELECT a, a FROM t", 10));
        expect(err1.code).toBe("SQL_ERROR");
        expect(err1.message).toBe("结果里有两列都叫 a，用 AS 给它们起不同的名字");

        const err2 = caught(() => runQuery(plain, "SELECT a, a AS b, 2 AS a FROM t", 10));
        expect(err2.code).toBe("SQL_ERROR");
        expect(err2.message).toBe("结果里有两列都叫 a，用 AS 给它们起不同的名字");
    });

    it("creates null-prototype rows that safely hold special column names", () => {
        const res = runQuery(plain, "SELECT 1 AS __proto__, 2 AS constructor", 10);
        expect(res.rows).toHaveLength(1);
        const [row] = res.rows;
        expect(Object.getPrototypeOf(row)).toBeNull();
        expect(Object.keys(row)).toEqual(["__proto__", "constructor"]);
        // eslint-disable-next-line no-proto, no-restricted-properties
        expect(row.__proto__).toBe(1);
        expect(row.constructor).toBe(2);
    });

    it("preserves column names when query returns zero rows", () => {
        const res = runQuery(plain, "SELECT a, b FROM t WHERE a = 999", 10);
        expect(res.columns).toEqual(["a", "b"]);
        expect(res.rows).toEqual([]);
        expect(res.truncated).toBe(false);
    });

    it("handles limit boundaries and sets truncated correctly", () => {
        const res5 = runQuery(plain, "SELECT a, b FROM t", 5);
        expect(res5.rows).toHaveLength(5);
        expect(res5.truncated).toBe(false);

        const res4 = runQuery(plain, "SELECT a, b FROM t", 4);
        expect(res4.rows).toHaveLength(4);
        expect(res4.truncated).toBe(true);

        const res0Rows = runQuery(plain, "SELECT a, b FROM t", 0);
        expect(res0Rows.rows).toEqual([]);
        expect(res0Rows.truncated).toBe(true);

        const res0Empty = runQuery(plain, "SELECT a, b FROM t WHERE 0", 0);
        expect(res0Empty.rows).toEqual([]);
        expect(res0Empty.truncated).toBe(false);
    });

    it("stops iterating early once limit rows plus one are produced", () => {
        let calls = 0;
        plain.function("tick", () => ++calls);
        const res = runQuery(
            plain,
            "WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c WHERE n < 1000) SELECT tick() AS n FROM c",
            3
        );
        expect(res.rows).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
        expect(res.truncated).toBe(true);
        expect(calls).toBe(4);
    });

    it("accepts trailing semicolons, whitespace, and comments", () => {
        const variants = [
            "SELECT 1 AS one;",
            "SELECT 1 AS one;;",
            "SELECT 1 AS one   ",
            "SELECT 1 AS one -- comment",
            "SELECT 1 AS one /* comment */",
        ];
        for (const sql of variants) {
            const res = runQuery(plain, sql, 10);
            expect(res.rows).toEqual([{ one: 1 }]);
        }
    });

    it("rejects queries with multiple statements", () => {
        const paths = makeHome();
        const sandbox = openSandbox({ database: paths.home, views: [] });
        try {
            const err1 = caught(() => runQuery(plain, "SELECT 1; SELECT 2", 10));
            expect(err1.code).toBe("SQL_ERROR");
            expect(err1.message).toBe("一次只能执行一条语句；要分几步，就分几次运行 saltnet sql");

            const err2 = caught(() => runQuery(plain, "SELECT 1; SELEC 2", 10));
            expect(err2.code).toBe("SQL_ERROR");
            expect(err2.message).toBe("一次只能执行一条语句；要分几步，就分几次运行 saltnet sql");

            const err3 = caught(() => runQuery(sandbox.db, "SELECT 1; DROP TABLE x", 10));
            expect(err3.code).toBe("SQL_ERROR");
            expect(err3.message).toBe("一次只能执行一条语句；要分几步，就分几次运行 saltnet sql");
        } finally {
            sandbox.close();
        }
    });

    it("rejects empty statements and comment-only input", () => {
        const empties = ["", "   ", ";", "-- c", "/* c */", " ; ; "];
        for (const sql of empties) {
            const err = caught(() => runQuery(plain, sql, 10));
            expect(err.code).toBe("SQL_ERROR");
            expect(err.message).toBe("没有要执行的语句：SQL 是空的，或者只有注释");
        }
    });

    it("translates SQLite errors into SQL_ERROR with appropriate fixes", () => {
        const errSyntax = caught(() => runQuery(plain, "SELEC 1", 10));
        expect(errSyntax.code).toBe("SQL_ERROR");
        expect(errSyntax.message).toBe('near "SELEC": syntax error');
        expect(errSyntax.fix).toBeUndefined();
        expect((errSyntax.cause as { errcode?: number })?.errcode).toBe(1);

        const errIncomplete = caught(() => runQuery(plain, "SELECT a FROM t WHERE", 10));
        expect(errIncomplete.code).toBe("SQL_ERROR");
        expect(errIncomplete.message).toBe("incomplete input");
        expect(errIncomplete.fix).toBeUndefined();

        const errTable = caught(() => runQuery(plain, "SELECT * FROM nosuch", 10));
        expect(errTable.code).toBe("SQL_ERROR");
        expect(errTable.message).toMatch(/^no such table: nosuch/);
        expect(errTable.fix).toBe("saltnet schema --views");

        const errCol = caught(() => runQuery(plain, "SELECT nosuch FROM t", 10));
        expect(errCol.code).toBe("SQL_ERROR");
        expect(errCol.message).toMatch(/^no such column: nosuch/);
        expect(errCol.fix).toBe("saltnet schema --views");

        const errFn = caught(() => runQuery(plain, "SELECT nosuchfn()", 10));
        expect(errFn.code).toBe("SQL_ERROR");
        expect(errFn.message).toMatch(/^no such function: nosuchfn/);
        expect(errFn.fix).toBeUndefined();

        const errOverflow = caught(() =>
            runQuery(plain, "SELECT abs(-9223372036854775807 - 1)", 10)
        );
        expect(errOverflow.code).toBe("SQL_ERROR");
        expect(errOverflow.message).toBe("integer overflow");
        expect(errOverflow.fix).toBeUndefined();
    });

    it("maps authorizer rejections in locked-down sandboxes", () => {
        const paths = makeHome();
        const sandbox = openSandbox({ database: paths.home, views: [] });
        try {
            const forbidden = [
                "CREATE TABLE x (a)",
                "ATTACH DATABASE ':memory:' AS x",
                "PRAGMA query_only = OFF",
                "SELECT * FROM sqlite_master",
            ];
            for (const sql of forbidden) {
                const err = caught(() => runQuery(sandbox.db, sql, 10));
                expect(err.code).toBe("SQL_ERROR");
                expect(err.message).toBe(
                    "这条语句不被允许：sql 只能用一条 SELECT 查询 v_ 开头的视图，不能写入，也不能用 PRAGMA、ATTACH 这样的语句"
                );
                expect(err.fix).toBe("saltnet schema --views");
                expect((err.cause as { errcode?: number }).errcode).toBe(23);
            }
        } finally {
            sandbox.close();
        }
    });

    it("allows INSERT in runQuery when executed against a plain unconstrained database", () => {
        const res = runQuery(plain, "INSERT INTO t VALUES (9, 'q')", 10);
        expect(res.rows).toEqual([]);
        expect(res.truncated).toBe(false);
    });
});
