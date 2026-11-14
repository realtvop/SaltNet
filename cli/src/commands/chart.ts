import type { ChartDetails, ChartNotes, ChartRow, ChartStatsRow } from "../catalog/chartRow";
import type { Related } from "../catalog/relatedView";
import { chartDetails, chartRow } from "../catalog/chartRow";
import { chartRowSchema, relatedSchema } from "../catalog/schemas";
import { buildSongCatalog } from "../catalog/songs";
import { dictionary, extend, int, nullable, num, object, str } from "../output/schema";
import { resolveChart } from "../refs/chart";
import { useMetadata } from "./metadata";
import { defineCommand } from "./registry";
import { loadRelated, withOptions } from "./withRelated";

const notesSchema = object<ChartNotes>(
    {
        tap: nullable(int("TAP 音符数"), "TAP 音符数；未知时为 null"),
        hold: nullable(int("HOLD 音符数"), "HOLD 音符数；未知时为 null"),
        slide: nullable(int("SLIDE 音符数"), "SLIDE 音符数；未知时为 null"),
        touch: nullable(int("TOUCH 音符数"), "TOUCH 音符数；SD 谱或未知时为 null"),
        break: nullable(int("BREAK 音符数"), "BREAK 音符数；未知时为 null"),
        total: nullable(int("总音符物量"), "总音符物量；任何一种音符未知时为 null"),
    },
    { description: "各音符物量" }
);

const statsSchema = object<ChartStatsRow>(
    {
        samples: int("参与统计的玩家人数"),
        avgAchievements: num("平均达成率，保留四位小数"),
        avgDxScore: num("平均 DX 分数，保留两位小数"),
        stdDevAchievements: num("达成率标准差，保留四位小数"),
        rankDist: dictionary(int("人数"), "各评级（D 到 SSS+）的人数分布"),
        comboDist: dictionary(int("人数"), "各连击状态（none、FC、FC+、AP、AP+）的人数分布"),
    },
    { description: "玩家成绩统计" }
);

export const chart = defineCommand(
    {
        name: "chart",
        summary: "一张谱的详情：定数、拟合定数、物量、谱师、统计",
        description:
            "谱面可以写谱面 key（如 146-3），也可以写曲目加难度：曲目 id、标题或别名，后面再给难度（bas、adv、exp、mas、rem、utage，或 0–4、10，或 绿黄红紫白宴）。曲目 id 只在这个 id 自己的一面找；标题或别名如果 SD 和 DX 都有这个难度，要加 --type 选一面，否则是 AMBIGUOUS_REF，候选是两个谱面 key。结果是统一的谱面行，再加 charter、notes（tap、hold、slide、touch、break、total）和 stats（样本数、平均达成率、平均 DX 分、标准差、评级分布、combo 分布）。成绩和 B50 之后随用户数据加入，现在 score 和 b50 恒为 null。" +
            "加 --with related 会多一个 related：用到这张谱的收藏品、段位和门，和 charts 的 --collection、--course、--gate 一致：收藏品要条件点名了这首歌、难度也符合（条件没写难度就是任意难度），段位要这张谱本身是其中一首，门只看歌、不看难度。related.collections 里每个是 collection list 里的那一行，再加 requirements：点名了这张谱的条件，每条是 collection show 里的条件，再加 charts（这里只有这张谱的 key）；related.courses 里每个是 course list 里的那一行，再加 tracks（这张谱在这个段位里是第几首，track 从 1 起，加上谱面 key 和难度）；related.gates 里每个有 id、name、shortName、region、key（是不是钥匙条件点名的歌）和 pools（在哪几个曲池里，每个有 track 和 label）。三个列表的顺序和 collection list、course list、kaleidxscope 一样。收藏品要用落雪的列表，所以会和 collection list 一样联网取，meta.dataAsOf 里也多一个 collections；不写 --with related 就不取。",
        category: "catalog",
        effect: "none",
        output: "object",
        positionals: [
            {
                name: "chart",
                valueName: "谱面",
                description: "谱面 key，或曲目 id、标题、别名（再给难度）",
            },
            {
                name: "difficulty",
                valueName: "难度",
                description: "难度；用谱面 key 时可以省略",
                optional: true,
            },
        ],
        options: {
            type: {
                kind: "enum",
                values: ["sd", "dx"],
                description:
                    "标题或别名两面都有这个难度时，取哪一面；写 id 或谱面 key 时用来核对类型",
            },
            ...withOptions(),
        },
        examples: [
            { command: "chart 146-3", description: "按谱面 key" },
            { command: "chart 146 mas", description: "曲目 id 加难度" },
            { command: "chart 'True Love Song' mas --type sd", description: "标题加难度，指定 SD" },
            {
                command: "chart 146-3 --with related",
                description: "再加上用到这张谱的收藏品、段位和门",
            },
        ],
        errors: [
            "USAGE",
            "NOT_FOUND",
            "AMBIGUOUS_REF",
            "NETWORK",
            "UPSTREAM_ERROR",
            "OFFLINE_NO_CACHE",
        ],
        dataSchema: extend<ChartRow & ChartDetails & { readonly related?: Related }, ChartRow>(
            chartRowSchema,
            {
                charter: nullable(
                    str("谱师"),
                    "谱师；数据里没有（宴谱），或只写了一个短横线时是 null"
                ),
                notes: notesSchema,
                stats: nullable(statsSchema, "玩家成绩统计；这张谱没有统计时是 null"),
                related: relatedSchema,
            },
            {
                description: "一张谱面的详细信息；加了 --with related 才有 related",
                optional: ["related"],
            }
        ),
    },
    async (args, ctx) => {
        const metadata = await useMetadata(args, ctx, ["catalog"]);
        const entry = resolveChart(buildSongCatalog(metadata.catalog.music), {
            ref: args.positionals.chart,
            difficulty: args.positionals.difficulty,
            type: args.options.type,
        });
        // The collections are fetched only now: a chart that cannot be found costs no download.
        const related = await loadRelated(args, ctx, [entry.chart]);
        return {
            data: {
                ...chartRow(entry),
                ...chartDetails(entry.chart),
                ...(related && { related: related.data }),
            },
            meta: { dataAsOf: { ...metadata.dataAsOf, ...related?.dataAsOf } },
            warnings: [...metadata.warnings, ...(related?.warnings ?? [])],
        };
    }
);
