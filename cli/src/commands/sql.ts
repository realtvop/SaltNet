import type { MetadataKind } from "../catalog/ensure";
import type { Warning } from "../output/warning";
import { fetchedAtOf, PUBLIC_VIEWS, VIEWS_VERSION, viewsMentionedIn } from "../catalog/views";
import { anything, dictionary, list, object } from "../output/schema";
import { runQuery } from "../store/query";
import { openSandbox } from "../store/sandbox";
import { formatLocalTime } from "../util/time";
import { listOptions, MAX_LIMIT } from "./listOptions";
import { useStoredMetadata } from "./metadata";
import { defineCommand } from "./registry";

/** Enough for most questions, and what an agent can read without being flooded. */
const DEFAULT_SQL_LIMIT = 1000;

const { limit, fields } = listOptions(DEFAULT_SQL_LIMIT);

export const sql = defineCommand(
    {
        name: "sql",
        summary: "在只读视图上执行一条 SQL 查询",
        description:
            `复杂的问题用 SQL 来问。查询只能读 ${PUBLIC_VIEWS.map(view => view.name).join("、")} 这几个视图（列的定义用 schema --views 看），数据库里的其他表看不到，也写不了任何东西；一次只能执行一条语句，只能是 SELECT（可以带 WITH，包括 WITH RECURSIVE，也可以用 json_each 这样的函数）。` +
            "视图的数据和别的命令用的是同一份：用到曲库或收藏品的视图，会先像别的命令一样检查它们是不是过期、需要就刷新，meta.dataAsOf 里是各自的下载时间；只用段位课程的视图不联网。查询里没有写到的视图不会被读，所以 SELECT 1 这样的查询什么都不用准备。" +
            `结果放在 data.items 里，每行是一个对象，键是结果列的名字，所以两列不能重名（用 AS 起不同的名字）；meta.columns 是各列的名字，meta.viewsVersion 是视图的版本号，视图有不兼容的改动时它会加一。数据库的整数照原样给，大到 JavaScript 放不下的给文本，BLOB 给十六进制文本，没有的是 null。默认最多 ${DEFAULT_SQL_LIMIT} 行，用 --limit 改（最多 ${MAX_LIMIT}）；超出时只给前面的行，并带 TRUNCATED 警告，meta.truncated 是 true，这时用 WHERE 或 LIMIT 缩小范围更好。` +
            "没有办法中途打断一条跑不完的查询（比如没有终止条件的 WITH RECURSIVE），需要从外面结束这个进程。SQL 里有 * 或 ; 或括号时，整条查询要加引号，免得被 shell 吃掉；SQL 以 - 开头（比如第一行是 -- 注释）时会被当成选项，要在它前面单独加一个 --（sql -- 查询）。",
        category: "data",
        effect: "none",
        output: "list",
        positionals: [
            {
                name: "query",
                valueName: "查询",
                description: "一条 SELECT；多个词会用空格连起来，所以整条加不加引号都行",
                variadic: true,
            },
        ],
        options: { limit, fields },
        examples: [
            {
                command:
                    "sql 'SELECT title, difficulty, constant FROM v_charts WHERE constant >= 14.8 ORDER BY constant DESC'",
                description: "定数最高的谱面",
            },
            {
                command:
                    "sql 'SELECT difficulty, count(*) AS charts FROM v_charts GROUP BY difficulty'",
                description: "每个难度有多少张谱面",
            },
            {
                command:
                    "sql \"SELECT c.title, c.difficulty FROM v_collection_targets t JOIN v_charts c ON c.music_id = t.music_id AND (t.difficulty IS NULL OR t.difficulty = c.difficulty) WHERE t.collection_ref = 'title:5108'\"",
                description: "一个收藏品的条件点名的谱面",
            },
        ],
        errors: [
            "USAGE",
            "SQL_ERROR",
            "NETWORK",
            "UPSTREAM_ERROR",
            "OFFLINE_NO_CACHE",
            "DB_LOCKED",
        ],
        dataSchema: object(
            {
                items: list(
                    dictionary(anything("列的值：数字、文本或 null"), "一行查询结果，键为列名"),
                    "查询返回的行列表"
                ),
            },
            { description: "SQL 查询结果" }
        ),
    },
    async (args, ctx) => {
        const query = args.positionals.query.join(" ");
        const views = viewsMentionedIn(query);
        const kinds = [...new Set(views.flatMap(view => view.needs))];

        // Only what the query names is looked at, and nothing at all for a query that names no
        // view: the database may not even exist yet, and `SELECT 1` has no reason to create it.
        const warnings: Warning[] =
            views.length > 0 ? [...(await useStoredMetadata(args, ctx, kinds))] : [];

        const sandbox = openSandbox({
            database: ctx.paths.database,
            views,
            readAlso: db => fetchedAtOf(db, kinds),
        });
        try {
            const result = runQuery(sandbox.db, query, args.options.limit);

            const dataAsOf: Partial<Record<MetadataKind, string>> = {};
            for (const kind of kinds) {
                const fetchedAt = sandbox.also?.[kind];
                if (fetchedAt !== undefined) dataAsOf[kind] = formatLocalTime(new Date(fetchedAt));
            }

            if (result.truncated) {
                const { limit: shown } = args.options;
                warnings.push({
                    code: "TRUNCATED",
                    message: `结果不止 ${shown} 行，只返回了前 ${shown} 行；用 WHERE 或 LIMIT 缩小范围${shown < MAX_LIMIT ? `，或者用 --limit 要更多（最多 ${MAX_LIMIT}）` : ""}`,
                });
            }

            return {
                data: { items: result.rows },
                meta: {
                    dataAsOf,
                    viewsVersion: VIEWS_VERSION,
                    columns: result.columns,
                    limit: args.options.limit,
                    truncated: result.truncated,
                },
                warnings,
            };
        } finally {
            sandbox.close();
        }
    }
);
