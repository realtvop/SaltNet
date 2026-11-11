import { allChartEntries, filterCharts } from "../catalog/chartQuery";
import { chartRow } from "../catalog/chartRow";
import { buildSongCatalog } from "../catalog/songs";
import { paginate } from "../output/paging";
import { DIFFICULTIES, parseDifficulty } from "../refs/difficulty";
import { parseLevelRange } from "../refs/level";
import { resolveVersions } from "../refs/version";
import { listOptions } from "./listOptions";
import { useMetadata } from "./metadata";
import { defineCommand } from "./registry";

export const charts = defineCommand(
    {
        name: "charts",
        summary: "按等级、定数、版本、难度或文本筛选谱面",
        description:
            "列出同时满足所有条件的谱面，一行一张。不写任何条件就是全部谱面（宴谱除外）。顺序和网页端的默认顺序一致：难度高的在前，同一难度里新曲在前。--level 的等级写成 13 或 13+，区间两端都包含，13..14 含 13、13+、14，不含 14+，要含 14+ 就写 13..14+。--constant 是定数区间，没有定数的谱（宴谱）不会通过。--diff 不写时不含宴谱，宴谱只有写了 --diff utage 才会出现，它的等级照常写，末尾的 ? 可以省略。--version 写版本名（舞萌DX 2024、maimai PLUS）、省略 maimai 或舞萌的写法（murasaki plus）、能唯一确定一个版本的一部分（2024），或牌子字（熊），牌子字对应的版本都会算；多个值用逗号隔开。--search 的匹配规则和 search 一样，曲师和谱师只找到谱师做的那几张谱。成绩相关的条件和 --sort、--group-by 之后加入。",
        category: "catalog",
        effect: "none",
        output: "list",
        options: {
            level: {
                kind: "range",
                item: "string",
                valueName: "等级",
                description: "等级或区间，例如 13+、13..14、14..、..12+",
            },
            constant: {
                kind: "range",
                item: "number",
                valueName: "定数",
                description: "定数区间，例如 13.5..14.0、14.5..、..12.9，或一个定数 13.7",
            },
            diff: {
                kind: "list",
                item: {
                    kind: "enum",
                    values: DIFFICULTIES.map(difficulty => ({
                        value: difficulty.value,
                        aliases: difficulty.aliases,
                    })),
                },
                valueName: "难度,难度",
                description: "只要这些难度，例如 mas,rem；不写则不含宴谱，宴谱要写 utage",
            },
            version: {
                kind: "list",
                item: { kind: "string" },
                valueName: "版本,版本",
                description:
                    "只要这些版本的曲子：版本名、省略前缀的写法或牌子字，例如 熊,舞萌DX 2024",
            },
            search: {
                kind: "string",
                valueName: "文本",
                description: "只要这段文本能搜到的歌的谱面，规则和 search 一样",
            },
            ...listOptions(),
        },
        examples: [
            { command: "charts --level 13+ --diff mas", description: "13+ 的紫谱" },
            {
                command: "charts --constant 14.5.. --diff mas,rem",
                description: "定数 14.5 以上的高难谱",
            },
            { command: "charts --version 熊 --level 12..", description: "熊版本里 12 以上的谱" },
            { command: "charts --diff utage --level 13", description: "等级 13 的宴谱" },
            { command: "charts --search 谱师名 --limit 20", description: "按文本找谱面" },
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
        const { level, constant, diff, version, search } = args.options;
        const metadata = await useMetadata(args, ctx, ["catalog"]);
        const catalog = buildSongCatalog(metadata.catalog.music);

        const matching = filterCharts(catalog, allChartEntries(catalog), {
            levels: level ? parseLevelRange(level) : undefined,
            constants: constant,
            grades: diff?.map(value => parseDifficulty(value)!.grade),
            versions: version?.flatMap(text =>
                resolveVersions(metadata.catalog.metadata.cnVersions, text)
            ),
            search,
        });
        const { items, page } = paginate(matching.map(chartRow), args.options);

        return {
            data: { items },
            meta: { dataAsOf: metadata.dataAsOf, page },
            warnings: metadata.warnings,
        };
    }
);
