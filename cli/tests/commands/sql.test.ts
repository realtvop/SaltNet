import type { RuntimePaths } from "../../src/runtime/paths";
import type { PrintedOutput } from "../commandRun";
import type { Route } from "../mockHttp";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatLocalTime } from "../../src/util/time";
import { commandIn, LXNS_URL, META_URL, NOW } from "../commandRun";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

const lxnsList = (kind: string) => `${LXNS_URL}/api/v0/maimai/${kind}/list?required=true`;
const EXPECTED_LXNS_REQUESTS = [
    lxnsList("trophy"),
    lxnsList("icon"),
    lxnsList("plate"),
    lxnsList("frame"),
];

interface SqlOutput extends Omit<PrintedOutput, "data"> {
    data: { items: Record<string, unknown>[] };
    meta: {
        dataAsOf: Record<string, string>;
        viewsVersion: number;
        columns: string[];
        limit: number;
        truncated: boolean;
    };
}

interface Printed<Output> {
    code: number;
    json: Output;
    stdout: string;
    requests: { url: string }[];
}

function runSql(
    paths: RuntimePaths,
    args: string[],
    options: {
        now?: Date;
        network?: Record<string, Route>;
        env?: Record<string, string | undefined>;
    } = {}
): Promise<Printed<SqlOutput>> {
    return commandIn(paths, "sql", args, options) as Promise<Printed<SqlOutput>>;
}

describe("sql command", () => {
    it("runs simple queries without touching the network or creating database files", async () => {
        const paths = makeHome();
        const res = await runSql(paths, ["SELECT 1+1 AS two"]);

        expect(res.code).toBe(0);
        expect(res.json.data.items).toEqual([{ two: 2 }]);
        expect(Object.keys(res.json.meta)).toEqual([
            "dataAsOf",
            "viewsVersion",
            "columns",
            "limit",
            "truncated",
        ]);
        expect(res.json.meta).toEqual({
            dataAsOf: {},
            viewsVersion: 1,
            columns: ["two"],
            limit: 1000,
            truncated: false,
        });
        expect(res.json.warnings).toEqual([]);
        expect(res.requests).toEqual([]);
        expect(existsSync(paths.home)).toBe(false);
    });

    it("joins positional arguments with spaces", async () => {
        const paths = makeHome();
        const res = await runSql(paths, ["SELECT", "1", "AS", "one"]);
        expect(res.code).toBe(0);
        expect(res.json.data.items).toEqual([{ one: 1 }]);
    });

    it("accepts comments when preceded by -- to avoid option parsing", async () => {
        const paths = makeHome();
        const res = await runSql(paths, ["--", "-- note\nSELECT 1 AS one"]);
        expect(res.code).toBe(0);
        expect(res.json.data.items).toEqual([{ one: 1 }]);

        const failed = await runSql(paths, ["-- note\nSELECT 1 AS one"]);
        expect(failed.code).toBe(2);
        expect(failed.json.error.code).toBe("USAGE");
        expect(failed.json.error.message).toContain("未知选项");
    });

    it("downloads only the metadata sources required by referenced views", async () => {
        const pathsCharts = makeHome();
        const resCharts = await runSql(pathsCharts, ["SELECT count(*) AS n FROM v_charts"]);
        expect(resCharts.code).toBe(0);
        expect(resCharts.requests.map(r => r.url)).toEqual([META_URL]);
        expect(resCharts.json.meta.dataAsOf).toEqual({ catalog: formatLocalTime(NOW) });

        const pathsCols = makeHome();
        const resCols = await runSql(pathsCols, ["SELECT count(*) AS n FROM v_collections"]);
        expect(resCols.code).toBe(0);
        expect(resCols.requests.map(r => r.url)).toEqual(EXPECTED_LXNS_REQUESTS);
        expect(resCols.json.meta.dataAsOf).toEqual({ collections: formatLocalTime(NOW) });

        const pathsTargets = makeHome();
        const resTargets = await runSql(pathsTargets, [
            "SELECT count(*) AS n FROM v_collection_targets",
        ]);
        expect(resTargets.code).toBe(0);
        expect(resTargets.requests.map(r => r.url)).toEqual(EXPECTED_LXNS_REQUESTS);
        expect(resTargets.json.meta.dataAsOf).toEqual({ collections: formatLocalTime(NOW) });

        const pathsCourses = makeHome();
        const resCourses = await runSql(pathsCourses, [
            "SELECT count(*) AS n FROM v_course_tracks",
        ]);
        expect(resCourses.code).toBe(0);
        expect(resCourses.requests).toEqual([]);
        expect(resCourses.json.meta.dataAsOf).toEqual({});
        expect(resCourses.json.data.items).toEqual([{ n: 88 }]);

        const pathsBoth = makeHome();
        const resBoth = await runSql(pathsBoth, ["SELECT 1 FROM v_charts, v_collections LIMIT 1"]);
        expect(resBoth.code).toBe(0);
        expect(resBoth.requests.map(r => r.url).sort()).toEqual(
            [META_URL, ...EXPECTED_LXNS_REQUESTS].sort()
        );
        expect(resBoth.json.meta.dataAsOf).toEqual({
            catalog: formatLocalTime(NOW),
            collections: formatLocalTime(NOW),
        });

        const pathsString = makeHome();
        const resString = await runSql(pathsString, ["SELECT 'v_collections' AS name"]);
        expect(resString.code).toBe(0);
        expect(resString.requests.map(r => r.url)).toEqual(EXPECTED_LXNS_REQUESTS);
        expect(resString.json.data.items).toEqual([{ name: "v_collections" }]);
    });

    it("serves subsequent calls from cache and handles stale metadata", async () => {
        const paths = makeHome();
        const first = await runSql(paths, ["SELECT count(*) AS n FROM v_charts"]);
        expect(first.requests).toHaveLength(1);

        const oneHourLater = new Date(NOW.getTime() + 3_600_000);
        const second = await runSql(paths, ["SELECT count(*) AS n FROM v_charts"], {
            now: oneHourLater,
        });
        expect(second.requests).toHaveLength(0);
        expect(second.json.meta.dataAsOf).toEqual(first.json.meta.dataAsOf);

        const thirtyHoursLater = new Date(NOW.getTime() + 30 * 3_600_000);
        const staleFail = await runSql(paths, ["SELECT count(*) AS n FROM v_charts"], {
            now: thirtyHoursLater,
            network: {
                [META_URL]: () => {
                    throw new Error("offline");
                },
            },
        });
        expect(staleFail.code).toBe(0);
        expect(staleFail.json.data.items).toEqual([{ n: 183 }]);
        expect(staleFail.json.warnings).toHaveLength(1);
        expect(staleFail.json.warnings[0].code).toBe("STALE_METADATA");
        expect(staleFail.json.warnings[0].fix).toBe("saltnet refresh");
    });

    it("respects --offline flag with and without cached data", async () => {
        const pathsWithoutCache = makeHome();
        const failOffline = await runSql(pathsWithoutCache, [
            "--offline",
            "SELECT count(*) AS n FROM v_charts",
        ]);
        expect(failOffline.code).toBe(5);
        expect(failOffline.json.error.code).toBe("OFFLINE_NO_CACHE");
        expect(failOffline.json.error.message).toBe(
            "没有曲库（SaltMeta）的缓存，而 --offline 不能联网；去掉 --offline 运行一次 saltnet refresh"
        );

        const pathsWithCache = makeHome();
        await runSql(pathsWithCache, ["SELECT count(*) AS n FROM v_charts"]);
        const passOffline = await runSql(pathsWithCache, [
            "--offline",
            "SELECT count(*) AS n FROM v_charts",
        ]);
        expect(passOffline.code).toBe(0);
        expect(passOffline.json.data.items).toEqual([{ n: 183 }]);
    });

    it("needs no cache and no network for a query that names no view, even with --offline", async () => {
        const paths = makeHome();
        const res = await runSql(paths, ["--offline", "SELECT 2*21 AS answer"], { network: {} });
        expect(res.code).toBe(0);
        expect(res.json.data.items).toEqual([{ answer: 42 }]);
        expect(res.json.warnings).toEqual([]);
        expect(res.requests).toEqual([]);
        expect(existsSync(paths.home)).toBe(false);
    });

    it("fails with NETWORK error when network is unreachable and nothing is cached", async () => {
        const paths = makeHome();
        const failNet = await runSql(paths, ["SELECT count(*) AS n FROM v_charts"], {
            network: {},
        });
        expect(failNet.code).toBe(5);
        expect(failNet.json.error.code).toBe("NETWORK");
    });

    it("counts 183 charts in fixture v_charts", async () => {
        const paths = makeHome();
        const res = await runSql(paths, ["SELECT count(*) AS charts FROM v_charts"]);
        expect(res.code).toBe(0);
        expect(res.json.data.items).toEqual([{ charts: 183 }]);
    });

    it("applies --limit and emits TRUNCATED warning when rows exceed limit", async () => {
        const paths = makeHome();
        const resDefault = await runSql(paths, [
            "WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c WHERE n < 1001) SELECT n FROM c",
        ]);
        expect(resDefault.json.data.items).toHaveLength(1000);
        expect(resDefault.json.meta.truncated).toBe(true);
        expect(resDefault.json.warnings).toEqual([
            {
                code: "TRUNCATED",
                message:
                    "结果不止 1000 行，只返回了前 1000 行；用 WHERE 或 LIMIT 缩小范围，或者用 --limit 要更多（最多 10000）",
            },
        ]);

        const res5 = await runSql(paths, ["--limit", "5", "SELECT chart_key FROM v_charts"]);
        expect(res5.json.data.items.map(r => r.chart_key)).toEqual([
            "8-0",
            "8-1",
            "8-2",
            "8-3",
            "9-0",
        ]);
        expect(res5.json.meta.truncated).toBe(true);
        expect(res5.json.meta.limit).toBe(5);
        expect(res5.json.warnings).toEqual([
            {
                code: "TRUNCATED",
                message:
                    "结果不止 5 行，只返回了前 5 行；用 WHERE 或 LIMIT 缩小范围，或者用 --limit 要更多（最多 10000）",
            },
        ]);

        const resExact = await runSql(paths, [
            "--limit",
            "4",
            "SELECT chart_key FROM v_charts WHERE music_id = 8 ORDER BY grade",
        ]);
        expect(resExact.json.data.items).toHaveLength(4);
        expect(resExact.json.meta.truncated).toBe(false);
        expect(resExact.json.warnings).toEqual([]);

        const resMax = await runSql(paths, [
            "--limit",
            "10000",
            "WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c WHERE n < 10001) SELECT n FROM c",
        ]);
        expect(resMax.json.data.items).toHaveLength(10000);
        expect(resMax.json.meta.truncated).toBe(true);
        expect(resMax.json.meta.limit).toBe(10000);
        expect(resMax.json.warnings).toEqual([
            {
                code: "TRUNCATED",
                message: "结果不止 10000 行，只返回了前 10000 行；用 WHERE 或 LIMIT 缩小范围",
            },
        ]);

        const res0 = await runSql(paths, ["--limit", "0", "SELECT 1"]);
        expect(res0.code).toBe(2);
        expect(res0.json.error.code).toBe("USAGE");
        expect(res0.json.error.message).toBe("选项 --limit 的值要在 1 到 10000 之间");

        const resOver = await runSql(paths, ["--limit", "10001", "SELECT 1"]);
        expect(resOver.code).toBe(2);
        expect(resOver.json.error.code).toBe("USAGE");
        expect(resOver.json.error.message).toBe("选项 --limit 的值要在 1 到 10000 之间");
    });

    it("projects fields using --fields and validates field names", async () => {
        const paths = makeHome();
        const res = await runSql(paths, [
            "--fields",
            "chart_key,level",
            "SELECT chart_key, level, constant FROM v_charts WHERE music_id = 8 ORDER BY grade",
        ]);
        expect(res.code).toBe(0);
        expect(res.json.data.items).toEqual([
            { chart_key: "8-0", level: "5" },
            { chart_key: "8-1", level: "7" },
            { chart_key: "8-2", level: "10" },
            { chart_key: "8-3", level: "12" },
        ]);
        expect(res.json.meta.columns).toEqual(["chart_key", "level", "constant"]);

        const fail = await runSql(paths, ["--fields", "nosuch", "SELECT chart_key FROM v_charts"]);
        expect(fail.code).toBe(2);
        expect(fail.json.error.code).toBe("USAGE");
        expect(fail.json.error.message).toBe("--fields 里有不存在的字段「nosuch」");
    });

    it("rejects missing query arguments", async () => {
        const paths = makeHome();
        const res = await runSql(paths, []);
        expect(res.code).toBe(2);
        expect(res.json.error.code).toBe("USAGE");
        expect(res.json.error.message).toBe("缺少参数 <查询>");
        expect(res.json.error.fix).toBe("saltnet sql --help");
    });

    it("handles all SQL syntax, authorizer, and semantic errors as SQL_ERROR", async () => {
        const paths = makeHome();
        await runSql(paths, ["SELECT * FROM v_charts LIMIT 1"]);

        const cases: readonly [string, string, string | undefined][] = [
            ["SELECT * FROM songs", "no such table: songs", "saltnet schema --views"],
            [
                "SELECT * FROM v_charts WHERE nosuch = 1",
                "no such column: nosuch",
                "saltnet schema --views",
            ],
            ["SELECT chart_key FROM v_charts WHERE", "incomplete input", undefined],
            [
                "DELETE FROM v_charts",
                "这条语句不被允许：sql 只能用一条 SELECT 查询 v_ 开头的视图，不能写入，也不能用 PRAGMA、ATTACH 这样的语句",
                "saltnet schema --views",
            ],
            [
                "PRAGMA user_version",
                "这条语句不被允许：sql 只能用一条 SELECT 查询 v_ 开头的视图，不能写入，也不能用 PRAGMA、ATTACH 这样的语句",
                "saltnet schema --views",
            ],
            ["", "没有要执行的语句：SQL 是空的，或者只有注释", undefined],
            [
                "SELECT 1; SELECT 2",
                "一次只能执行一条语句；要分几步，就分几次运行 saltnet sql",
                undefined,
            ],
            ["SELECT 1 AS a, 2 AS a", "结果里有两列都叫 a，用 AS 给它们起不同的名字", undefined],
        ];

        for (const [query, expectedMsg, expectedFix] of cases) {
            const res = await runSql(paths, [query]);
            expect(res.code).toBe(2);
            expect(res.json.error.code).toBe("SQL_ERROR");
            expect(res.json.error.retryable).toBe(false);
            expect(res.json.error.message).toBe(expectedMsg);
            expect(res.json.error.fix).toBe(expectedFix);
        }
    });

    it("enforces complete database isolation and protects disk data against modifications", async () => {
        const paths = makeHome();
        await runSql(paths, ["SELECT * FROM v_charts LIMIT 1"]);
        const before = readFileSync(paths.database);

        const forbidden = [
            "SELECT * FROM songs",
            "SELECT * FROM meta_state",
            "SELECT * FROM sqlite_master",
            "PRAGMA user_version",
            "ATTACH DATABASE ':memory:' AS x",
            "DELETE FROM v_charts",
            "DROP TABLE charts",
        ];

        for (const sql of forbidden) {
            const res = await runSql(paths, [sql]);
            expect(res.code).toBe(2);
            expect(res.json.error.code).toBe("SQL_ERROR");
        }

        const check = await runSql(paths, ["SELECT count(*) AS charts FROM v_charts"]);
        expect(check.code).toBe(0);
        expect(check.json.data.items).toEqual([{ charts: 183 }]);
        expect(readFileSync(paths.database).equals(before)).toBe(true);
    });

    it("formats output correctly as TSV", async () => {
        const paths = makeHome();
        const res = await runSql(paths, [
            "--format",
            "tsv",
            "SELECT chart_key, level, constant, charter FROM v_charts WHERE music_id = 8 ORDER BY grade",
        ]);
        expect(res.code).toBe(0);
        expect(res.stdout).toBe(
            "chart_key\tlevel\tconstant\tcharter\n8-0\t5\t5\t\n8-1\t7\t7.2\t\n8-2\t10\t10.2\t譜面-100号\n8-3\t12\t12.4\tニャイン\n"
        );
    });

    it("formats output correctly as text", async () => {
        const paths = makeHome();
        const res = await runSql(paths, [
            "--format",
            "text",
            "SELECT chart_key, level FROM v_charts WHERE music_id = 8 ORDER BY grade",
        ]);
        expect(res.code).toBe(0);
        const expectedTable =
            "chart_key  level\n8-0        5\n8-1        7\n8-2        10\n8-3        12\n\n";
        const expectedMeta = `dataAsOf:\n  catalog: ${formatLocalTime(NOW)}\nviewsVersion: 1\ncolumns: chart_key、level\nlimit: 1000\ntruncated: false\n`;
        expect(res.stdout.startsWith(expectedTable)).toBe(true);
        expect(res.stdout).toContain(expectedMeta);
    });

    it("outputs help information for sql --help", async () => {
        const paths = makeHome();
        const res = await runSql(paths, ["--help"]);
        expect(res.code).toBe(0);
        expect(res.json).toBeUndefined();
        expect(res.stdout).toContain("saltnet sql <查询...> [选项]");
        expect(res.stdout).toContain("副作用：无，只读");
        expect(res.stdout).toContain("--limit <整数>");
        expect(res.stdout).toContain("定数最高的谱面");
        expect(res.stdout).toContain("每个难度有多少张谱面");
        expect(res.stdout).toContain("一个收藏品的条件点名的谱面");
    });

    it("indents JSON properly when --pretty is given", async () => {
        const paths = makeHome();
        const res = await runSql(paths, ["--pretty", "SELECT 1 AS one"]);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('\n    "data"');
    });
});
