import type { Collection } from "@core/collection/type";
import type { ChartSet } from "../catalog/chartSets";
import type { ChartResultStats } from "../catalog/chartStats";
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
import { countChartResultStats } from "../catalog/chartStats";
import { chartRowSchema } from "../catalog/schemas";
import { buildSongCatalog } from "../catalog/songs";
import { usageError } from "../errors";
import { paginate } from "../output/paging";
import { anyOf, int, list, nullable, object, str } from "../output/schema";
import { collectionRef, listCollections, resolveCollection } from "../refs/collection";
import { resolveCourse } from "../refs/course";
import { DIFFICULTIES, parseDifficulty } from "../refs/difficulty";
import { resolveGate } from "../refs/gate";
import { parseLevelRange } from "../refs/level";
import { resolvePlate } from "../refs/plate";
import { parseScoreCondition } from "../refs/status";
import { resolveVersions } from "../refs/version";
import { USER_OPTION } from "./describe";
import { listOptions } from "./listOptions";
import { METADATA_ERRORS, useMetadata } from "./metadata";
import { defineCommand } from "./registry";
import { carryScoreContext, requireUserForScores, scoreMeta, useUserScores } from "./userScores";

/** The charts a collection or plate asks for, or `USAGE` when its conditions name no song. */
function songsOf(label: string, collection: Collection, entries: readonly ChartEntry[]): ChartSet {
    if (!hasSongRequirement(collection)) {
        throw usageError(`${label}的获取条件里没有曲目，没有谱面可选`);
    }
    return collectionCharts(collection, entries);
}

const statsSchema = object<ChartResultStats>(
    {
        total: int("通过筛选、参与统计的谱面总数，不受分页影响"),
        played: int("有数值达成率的谱面数"),
        sss: int("达成率至少 100 的谱面数，包含 SSS+"),
        sssPlus: int("达成率至少 100.5 的谱面数"),
        fc: int("连击状态至少 FC 的谱面数"),
        ap: int("连击状态至少 AP 的谱面数"),
        fdx: int("同步状态至少 FDX 的谱面数"),
    },
    { description: "谱面成绩统计；各项都按分页前的完整筛选结果计算" }
);

const groupKeySchema = nullable(
    str("分组依据的值，例如定数 14.0、版本名、难度、SSS+、AP+ 或 FDX+"),
    "分组依据的值；没有定数或没有对应成绩状态的组是 null"
);

function groupSchema(withStats: boolean) {
    const common = {
        key: groupKeySchema,
        count: int("该组在分页前包含的谱面总数"),
        items: list(chartRowSchema, "该组分页后的谱面列表"),
    };
    return withStats
        ? object({ ...common, stats: statsSchema }, { description: "一个带成绩统计的谱面分组" })
        : object(common, { description: "一个谱面分组" });
}

export const charts = defineCommand(
    {
        name: "charts",
        summary: "筛选谱面，并按曲目或成绩排序、分组和统计",
        description:
            "列出同时满足所有条件的谱面，一行一张；每行带 --user 指定用户（不写就是默认用户）的成绩和 B50 名次。本地没有用户时，只有不读取成绩的普通查询可以运行，score 和 b50 都是 null。--level、--constant、--diff、--version、--search、--gate、--course、--plate、--collection 的写法和曲目页分类一致，所有筛选同时生效；宴谱只有写 --diff utage 才出现。--achieved 和 --missing 各接受一个评级、clear、combo 或 sync 条件，按「至少达到」判断，--missing 包含没有成绩的谱；本步条件不能省略。--recent 只留有成绩变化时间的谱，不写 --sort 时也按最近变化排序。--sort 可按 default、constant、achievements、rating、playcount、version、recent 排；自然方向都是最大或最新在前，--asc 只反转依据，没有值的谱始终在最后。default 有成绩时先按达成率，无成绩的按游戏内顺序排后面；--course 的 default 始终是段位出场顺序。--group-by 可按 constant、version、level、difficulty、rank、combo、sync 分组，成绩状态组从最好到最差，没有状态的 null 组最后；--limit 和 --offset 对每组分别生效。--stats 统计完整筛选结果的 total、played、SSS、SSS+、FC、AP、FDX，不受分页影响，分组时每组各一份。只有 --sort gain 仍留到后续步骤。",
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
            achieved: {
                kind: "string",
                valueName: "条件",
                description:
                    "只要至少达到条件的谱：评级、clear、fc/fc+/ap/ap+ 或 sync/fs/fs+/fdx/fdx+",
            },
            missing: {
                kind: "string",
                valueName: "条件",
                description: "只要没有达到条件的谱，包含没有成绩的谱；条件写法同 --achieved",
            },
            recent: {
                kind: "boolean",
                description: "只要成绩有变化时间的谱；不写 --sort 时按最近变化排序",
            },
            stats: {
                kind: "boolean",
                description: "统计分页前的 total、played、SSS、SSS+、FC、AP 和 FDX 数量",
            },
            sort: {
                kind: "enum",
                values: SORT_KEYS,
                valueName: "依据",
                description:
                    "排序依据：default、constant、achievements、rating、playcount、version 或 recent；不写时是 default，--recent 时是 recent",
            },
            asc: {
                kind: "boolean",
                description: "反转排序依据；没有值的谱仍排在最后",
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
                    "按 constant、version、level、difficulty、rank、combo 或 sync 分组，--limit 对每组分别生效",
            },
            ...USER_OPTION,
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
            { command: "charts --plate 真極 --diff mas", description: "真極要求的紫谱" },
            { command: "charts --gate 蓝门 --diff mas", description: "蓝门曲池里歌的紫谱" },
        ],
        errors: ["USAGE", "NOT_FOUND", "AMBIGUOUS_REF", "NO_USER", ...METADATA_ERRORS],
        dataSchema: anyOf(
            "谱面筛选结果：普通或分组列表，各自可以带分页前的成绩统计",
            object(
                { items: list(chartRowSchema, "符合条件的谱面列表") },
                { description: "不带统计的谱面列表" }
            ),
            object(
                {
                    items: list(chartRowSchema, "符合条件并分页后的谱面列表"),
                    stats: statsSchema,
                },
                { description: "带分页前成绩统计的谱面列表" }
            ),
            object(
                { groups: list(groupSchema(false), "按指定依据分组的谱面列表") },
                { description: "不带统计的谱面分组列表" }
            ),
            object(
                { groups: list(groupSchema(true), "按指定依据分组且各组带统计的谱面列表") },
                { description: "带分页前成绩统计的谱面分组列表" }
            )
        ),
    },
    async (args, ctx) => {
        const {
            level,
            constant,
            diff,
            version,
            search,
            gate,
            course,
            plate,
            collection,
            achieved,
            missing,
            recent,
            stats,
            sort,
            asc,
            desc,
            groupBy,
        } = args.options;
        if (asc && desc) throw usageError("--asc 和 --desc 不能同时写；默认就是 --desc");
        const achievedCondition =
            achieved === undefined ? undefined : parseScoreCondition(achieved);
        const missingCondition = missing === undefined ? undefined : parseScoreCondition(missing);
        // The gates and the courses ship with the CLI, so a wrong one fails before any fetching.
        const gateFound = gate === undefined ? undefined : resolveGate(gate);
        const courseFound = course === undefined ? undefined : resolveCourse(course);
        const scoreSort =
            sort === "achievements" ||
            sort === "rating" ||
            sort === "playcount" ||
            sort === "recent";
        const scoreGroup = groupBy === "rank" || groupBy === "combo" || groupBy === "sync";
        if (achievedCondition || missingCondition || recent || stats || scoreSort || scoreGroup) {
            requireUserForScores(args, ctx);
        }

        const metadata = await useMetadata(args, ctx, ["catalog"]);
        // The collections are only fetched, and only reported on, when a plate or a collection asks.
        const collectionData =
            plate === undefined && collection === undefined
                ? undefined
                : await useMetadata(args, ctx, ["collections"]);
        const catalog = buildSongCatalog(metadata.catalog.music);
        const userScores = useUserScores(
            args,
            ctx,
            Object.values(metadata.catalog.music.chartList)
        );
        const { cnVersions } = metadata.catalog.metadata;
        const entries = allChartEntries(catalog);
        const dataAsOf = { ...metadata.dataAsOf, ...collectionData?.dataAsOf };
        const metadataWarnings = [...metadata.warnings, ...(collectionData?.warnings ?? [])];
        try {
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
                achieved: achievedCondition,
                missing: missingCondition,
                recent,
                scores: userScores.scores,
            });
            const versionNames = cnVersions.map(({ name }) => name);
            const sorted = sortCharts(matching, {
                key: sort ?? (recent ? "recent" : "default"),
                ascending: asc,
                versions: versionNames,
                order: courseSet?.order,
                scores: userScores.scores,
            });
            const warnings = [...metadataWarnings, ...userScores.warnings];

            if (groupBy) {
                const groups = groupCharts(sorted, groupBy, versionNames, userScores.scores).map(
                    group => ({
                        key: group.key,
                        count: group.entries.length,
                        ...(stats
                            ? { stats: countChartResultStats(group.entries, userScores.scores) }
                            : {}),
                        items: paginate(group.entries, args.options).items.map(entry =>
                            chartRow(entry, userScores.scores)
                        ),
                    })
                );
                return {
                    data: { groups },
                    meta: scoreMeta(userScores, dataAsOf),
                    warnings,
                };
            }

            const { items, page } = paginate(sorted, args.options);
            return {
                data: {
                    items: items.map(entry => chartRow(entry, userScores.scores)),
                    ...(stats ? { stats: countChartResultStats(matching, userScores.scores) } : {}),
                },
                meta: scoreMeta(userScores, dataAsOf, { page }),
                warnings,
            };
        } catch (error) {
            carryScoreContext(error, userScores, { dataAsOf }, metadataWarnings);
        }
    }
);
