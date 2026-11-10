import { chartDetails, chartRow } from "../catalog/chartRow";
import { buildSongCatalog } from "../catalog/songs";
import { resolveChart } from "../refs/chart";
import { useMetadata } from "./metadata";
import { defineCommand } from "./registry";

export const chart = defineCommand(
    {
        name: "chart",
        summary: "一张谱的详情：定数、拟合定数、物量、谱师、统计",
        description:
            "谱面可以写谱面 key（如 146-3），也可以写曲目加难度：曲目 id、标题或别名，后面再给难度（bas、adv、exp、mas、rem、utage，或 0–4、10，或 绿黄红紫白宴）。曲目 id 只在这个 id 自己的一面找；标题或别名如果 SD 和 DX 都有这个难度，要加 --type 选一面，否则是 AMBIGUOUS_REF，候选是两个谱面 key。结果是统一的谱面行，再加 charter、notes（tap、hold、slide、touch、break、total）和 stats（样本数、平均达成率、平均 DX 分、标准差、评级分布、combo 分布）。成绩和 B50 之后随用户数据加入，现在 score 和 b50 恒为 null。",
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
        },
        examples: [
            { command: "chart 146-3", description: "按谱面 key" },
            { command: "chart 146 mas", description: "曲目 id 加难度" },
            { command: "chart 'True Love Song' mas --type sd", description: "标题加难度，指定 SD" },
        ],
        errors: [
            "USAGE",
            "NOT_FOUND",
            "AMBIGUOUS_REF",
            "NETWORK",
            "UPSTREAM_ERROR",
            "OFFLINE_NO_CACHE",
        ],
    },
    async (args, ctx) => {
        const metadata = await useMetadata(args, ctx, ["catalog"]);
        const entry = resolveChart(buildSongCatalog(metadata.catalog.music), {
            ref: args.positionals.chart,
            difficulty: args.positionals.difficulty,
            type: args.options.type,
        });
        return {
            data: { ...chartRow(entry), ...chartDetails(entry.chart) },
            meta: { dataAsOf: metadata.dataAsOf },
            warnings: metadata.warnings,
        };
    }
);
