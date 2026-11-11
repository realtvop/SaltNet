import type { Collection } from "@core/collection/type";
import type { ChartSet } from "../catalog/chartSets";
import type { ChartEntry } from "../catalog/songs";
import { GROUP_KEYS, groupCharts } from "../catalog/chartGroups";
import { allChartEntries, filterCharts } from "../catalog/chartQuery";
import { chartRow } from "../catalog/chartRow";
import {
    collectionCharts,
    courseCharts,
    gateCharts,
    hasSongRequirement,
    intersectChartSets,
} from "../catalog/chartSets";
import { SORT_KEYS, sortCharts } from "../catalog/chartSort";
import { buildSongCatalog } from "../catalog/songs";
import { usageError } from "../errors";
import { paginate } from "../output/paging";
import { collectionRef, listCollections, resolveCollection } from "../refs/collection";
import { resolveCourse } from "../refs/course";
import { DIFFICULTIES, parseDifficulty } from "../refs/difficulty";
import { resolveGate } from "../refs/gate";
import { parseLevelRange } from "../refs/level";
import { resolvePlate } from "../refs/plate";
import { resolveVersions } from "../refs/version";
import { listOptions } from "./listOptions";
import { useMetadata } from "./metadata";
import { defineCommand } from "./registry";

/** The charts a collection or plate asks for, or `USAGE` when its conditions name no song. */
function songsOf(label: string, collection: Collection, entries: readonly ChartEntry[]): ChartSet {
    if (!hasSongRequirement(collection)) {
        throw usageError(`${label}的获取条件里没有曲目，没有谱面可选`);
    }
    return collectionCharts(collection, entries);
}

export const charts = defineCommand(
    {
        name: "charts",
        summary: "按等级、定数、版本、难度或文本筛选谱面，可以排序和分组",
        description:
            "列出同时满足所有条件的谱面，一行一张。不写任何条件就是全部谱面（宴谱除外）。顺序和网页端的默认顺序一致：难度高的在前，同一难度里新曲在前。--level 的等级写成 13 或 13+，区间两端都包含，13..14 含 13、13+、14，不含 14+，要含 14+ 就写 13..14+。--constant 是定数区间，没有定数的谱（宴谱）不会通过。--diff 不写时不含宴谱，宴谱只有写了 --diff utage 才会出现，它的等级照常写，末尾的 ? 可以省略。--version 写版本名（舞萌DX 2024、maimai PLUS）、省略 maimai 或舞萌的写法（murasaki plus）、能唯一确定一个版本的一部分（2024），或牌子字（熊），牌子字对应的版本都会算；多个值用逗号隔开。--search 的匹配规则和 search 一样，曲师和谱师只找到谱师做的那几张谱。--gate、--course、--plate、--collection 各对应曲目页的一个分类，只要它们包含的谱面：--gate 是万花筒的门（id blue、名称 蓝色之门、简称 蓝门，或只有一个门有的一部分），要这个门的钥匙曲目和各个曲池里每首歌的所有难度的谱面，难度用 --diff 选；--course 是段位（id、名称 十段，或只有一个段位有的一部分），要它的曲目；--plate 是版本牌子，合并的写法（熊華極）和单个牌子（熊極）都行，要牌子的条件里点名的谱面；--collection 是任何收藏品，写 类型:id（title:5108）或名称，名称重复时是 AMBIGUOUS_REF，候选的 ref 就是 类型:id，获取条件里没有曲目的收藏品（多数头像和背景、约一半的称号、旅行伙伴和搭档）没有谱面可选，会报 USAGE。这些条件和别的条件一起写时结果须同时满足。--sort 选排序的依据：default 是上面说的网页端顺序（写了 --course 时是段位的出场顺序），constant 按定数，version 按版本；默认从大到小（定数高的、版本新的在前，default 则是难度高的、新曲在前），写 --asc 反过来，--asc 和 --desc 不能一起写；没有定数的谱（宴谱）和不认识的版本排在最后，依据相同的按谱面 key（曲目 id，再难度）排，所以同样的数据和参数永远给出同样的顺序。--group-by 按 constant（定数，从高到低）、version（版本，从新到旧）、level（等级，从难到易）或 difficulty（难度，从 BASIC 起）分组，结果放在 groups 里，每组是 {key, count, items}，组的顺序固定，--sort 排的是组内的顺序，没有定数的宴谱谱面自成一组（key 是 null）排在最后；这时 --limit 和 --offset 对每一组分别生效，count 是这一组一共有几张。成绩相关的条件、统计和按成绩排序、分组之后加入。",
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
            gate: {
                kind: "string",
                valueName: "门",
                description: "只要这个万花筒门的钥匙曲目和曲池里的歌的谱面，例如 blue、蓝门",
            },
            course: {
                kind: "string",
                valueName: "段位",
                description: "只要这个段位的曲目，例如 十段、真皆伝、551010",
            },
            plate: {
                kind: "string",
                valueName: "牌子",
                description: "只要这个牌子要求的谱面，合并的写法（熊華極）和单个牌子（熊極）都行",
            },
            collection: {
                kind: "string",
                valueName: "收藏品",
                description: "只要这个收藏品要求的谱面：类型:id 或名称，例如 title:5108",
            },
            sort: {
                kind: "enum",
                values: SORT_KEYS,
                default: "default",
                valueName: "依据",
                description:
                    "排序的依据：default（网页端的默认顺序，--course 时是出场顺序）、constant（定数）、version（版本）",
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
            { command: "charts --course 十段", description: "十段的四首曲目，按出场顺序" },
            { command: "charts --plate 熊華極 --diff mas", description: "熊華極要求的紫谱" },
            { command: "charts --gate 蓝门 --diff mas", description: "蓝门曲池里歌的紫谱" },
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
        const { level, constant, diff, version, search, gate, course, plate, collection } =
            args.options;
        const { sort, asc, desc, groupBy } = args.options;
        if (asc && desc) throw usageError("--asc 和 --desc 不能同时写；默认就是 --desc");
        // The gates and the courses ship with the CLI, so a wrong one fails before any fetching.
        const gateFound = gate === undefined ? undefined : resolveGate(gate);
        const courseFound = course === undefined ? undefined : resolveCourse(course);

        const metadata = await useMetadata(args, ctx, ["catalog"]);
        // The collections are only fetched, and only reported on, when a plate or a collection asks.
        const collectionData =
            plate === undefined && collection === undefined
                ? undefined
                : await useMetadata(args, ctx, ["collections"]);
        const catalog = buildSongCatalog(metadata.catalog.music);
        const { cnVersions } = metadata.catalog.metadata;
        const entries = allChartEntries(catalog);

        const sets: ChartSet[] = [];
        if (gateFound) sets.push(gateCharts(gateFound, entries));
        const courseSet = courseFound && courseCharts(courseFound, entries);
        if (courseSet) sets.push(courseSet);
        if (collectionData) {
            const { collections } = collectionData.collections;
            if (plate !== undefined) {
                const found = resolvePlate(collections.versionPlates, plate);
                sets.push(songsOf(`牌子「${found.text}」`, found.plate, entries));
            }
            if (collection !== undefined) {
                const found = resolveCollection(listCollections(collections), collection);
                const label = `收藏品「${found.collection.name}」（${collectionRef(found)}）`;
                sets.push(songsOf(label, found.collection, entries));
            }
        }

        const matching = filterCharts(catalog, entries, {
            levels: level ? parseLevelRange(level) : undefined,
            constants: constant,
            grades: diff?.map(value => parseDifficulty(value)!.grade),
            versions: version?.flatMap(text => resolveVersions(cnVersions, text)),
            search,
            within: intersectChartSets(sets),
        });
        const versionNames = cnVersions.map(({ name }) => name);
        const sorted = sortCharts(matching, {
            key: sort,
            ascending: asc,
            versions: versionNames,
            order: courseSet?.order,
        });
        const dataAsOf = { ...metadata.dataAsOf, ...collectionData?.dataAsOf };
        const warnings = [...metadata.warnings, ...(collectionData?.warnings ?? [])];

        if (groupBy) {
            const groups = groupCharts(sorted, groupBy, versionNames).map(group => ({
                key: group.key,
                count: group.entries.length,
                items: paginate(group.entries, args.options).items.map(chartRow),
            }));
            return {
                data: { groups },
                meta: { dataAsOf },
                warnings,
            };
        }

        const { items, page } = paginate(sorted, args.options);
        return {
            data: { items: items.map(chartRow) },
            meta: { dataAsOf, page },
            warnings,
        };
    }
);
