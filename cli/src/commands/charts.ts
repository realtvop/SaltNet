import { GROUP_KEYS, groupCharts } from "../catalog/chartGroups";
import { allChartEntries, filterCharts } from "../catalog/chartQuery";
import { chartRow } from "../catalog/chartRow";
import { SORT_KEYS, sortCharts } from "../catalog/chartSort";
import { buildSongCatalog } from "../catalog/songs";
import { usageError } from "../errors";
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
        summary: "按等级、定数、版本、难度或文本筛选谱面，可以排序和分组",
        description:
            "列出同时满足所有条件的谱面，一行一张。不写任何条件就是全部谱面（宴谱除外）。顺序和网页端的默认顺序一致：难度高的在前，同一难度里新曲在前。--level 的等级写成 13 或 13+，区间两端都包含，13..14 含 13、13+、14，不含 14+，要含 14+ 就写 13..14+。--constant 是定数区间，没有定数的谱（宴谱）不会通过。--diff 不写时不含宴谱，宴谱只有写了 --diff utage 才会出现，它的等级照常写，末尾的 ? 可以省略。--version 写版本名（舞萌DX 2024、maimai PLUS）、省略 maimai 或舞萌的写法（murasaki plus）、能唯一确定一个版本的一部分（2024），或牌子字（熊），牌子字对应的版本都会算；多个值用逗号隔开。--search 的匹配规则和 search 一样，曲师和谱师只找到谱师做的那几张谱。--sort 选排序的依据：default 是上面说的网页端顺序，constant 按定数，version 按版本；默认从大到小（定数高的、版本新的在前，default 则是难度高的、新曲在前），写 --asc 反过来，--asc 和 --desc 不能一起写；没有定数的谱（宴谱）和不认识的版本排在最后，依据相同的按谱面 key（曲目 id，再难度）排，所以同样的数据和参数永远给出同样的顺序。--group-by 按 constant（定数，从高到低）、version（版本，从新到旧）、level（等级，从难到易）或 difficulty（难度，从 BASIC 起）分组，结果放在 groups 里，每组是 {key, count, items}，组的顺序固定，--sort 排的是组内的顺序，没有定数的宴谱谱面自成一组（key 是 null）排在最后；这时 --limit 和 --offset 对每一组分别生效，count 是这一组一共有几张。成绩相关的条件、统计和按成绩排序、分组之后加入。",
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
            sort: {
                kind: "enum",
                values: SORT_KEYS,
                default: "default",
                valueName: "依据",
                description:
                    "排序的依据：default（网页端的默认顺序）、constant（定数）、version（版本）",
            },
            asc: {
                kind: "boolean",
                description: "从小到大排：定数低的、版本旧的在前，default 则整个反过来",
            },
            desc: {
                kind: "boolean",
                description: "从大到小排；这是默认的方向，可以不写",
            },
            groupBy: {
                kind: "enum",
                values: GROUP_KEYS,
                valueName: "分组依据",
                description:
                    "按 constant、version、level 或 difficulty 分组，--limit 对每组分别生效",
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
            {
                command: "charts --level 14.. --sort constant --limit 10",
                description: "14 以上的谱里定数最高的十张",
            },
            {
                command: "charts --diff mas --group-by version --limit 3",
                description: "紫谱按版本分组，每个版本看三张",
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
    },
    async (args, ctx) => {
        const { level, constant, diff, version, search, sort, asc, desc, groupBy } = args.options;
        if (asc && desc) throw usageError("--asc 和 --desc 不能同时写；默认就是 --desc");
        const metadata = await useMetadata(args, ctx, ["catalog"]);
        const catalog = buildSongCatalog(metadata.catalog.music);
        const { cnVersions } = metadata.catalog.metadata;

        const matching = filterCharts(catalog, allChartEntries(catalog), {
            levels: level ? parseLevelRange(level) : undefined,
            constants: constant,
            grades: diff?.map(value => parseDifficulty(value)!.grade),
            versions: version?.flatMap(text => resolveVersions(cnVersions, text)),
            search,
        });
        const versionNames = cnVersions.map(({ name }) => name);
        const sorted = sortCharts(matching, { key: sort, ascending: asc, versions: versionNames });

        if (groupBy) {
            const groups = groupCharts(sorted, groupBy, versionNames).map(group => ({
                key: group.key,
                count: group.entries.length,
                items: paginate(group.entries, args.options).items.map(chartRow),
            }));
            return {
                data: { groups },
                meta: { dataAsOf: metadata.dataAsOf },
                warnings: metadata.warnings,
            };
        }

        const { items, page } = paginate(sorted, args.options);
        return {
            data: { items: items.map(chartRow) },
            meta: { dataAsOf: metadata.dataAsOf, page },
            warnings: metadata.warnings,
        };
    }
);
