import type { ChartRow } from "../catalog/chartRow";
import type { HistoryItem } from "../catalog/historyView";
import type { ScoreRecordLink } from "../users/history";
import { historyItem } from "../catalog/historyView";
import {
    chartRowSchema,
    HISTORY_KINDS,
    HISTORY_SOURCES,
    historyChangeSchema,
} from "../catalog/schemas";
import { buildSongCatalog, chartKeyOf } from "../catalog/songs";
import { usageError } from "../errors";
import { paginate } from "../output/paging";
import { extend, int, list, nullable, object, str, strEnum } from "../output/schema";
import { resolveChart } from "../refs/chart";
import { parseSinceOption } from "../refs/time";
import {
    buildScoreHistoryTimeline,
    filterScoreHistory,
    readChartScoreHistoryEntries,
    readStoredScoreHistory,
    sortScoreHistoryNewest,
} from "../users/history";
import { USER_OPTION } from "./describe";
import { listOptions } from "./listOptions";
import { METADATA_ERRORS, useMetadata } from "./metadata";
import { defineCommand } from "./registry";
import { carryScoreContext, requireUserForScores, scoreMeta, useUserScores } from "./userScores";

interface MissingHistory {
    readonly recordKey: string;
    readonly count: number;
}

interface HistoryResult {
    readonly items: readonly HistoryItem[];
    readonly missing: readonly MissingHistory[];
}

const itemSchema = extend<HistoryItem, ChartRow>(
    chartRowSchema,
    {
        eventId: str("成绩历史事件的稳定 id"),
        time: nullable(
            str("观察到事件的时间，用本机时区的偏移写"),
            "观察到事件的时间；存储的时间超出 Date 范围时是 null"
        ),
        source: strEnum(HISTORY_SOURCES, "事件来源"),
        kind: strEnum(HISTORY_KINDS, "initial 是首次记录，change 是变化"),
        changes: list(
            historyChangeSchema,
            "网页端会显示的变化，顺序固定为达成率、DX 分、combo、sync、游玩次数"
        ),
    },
    { description: "一条成绩历史，带它所属谱面的当前谱面行" }
);

const missingSchema = object<MissingHistory>(
    {
        recordKey: str("无法放到当前曲库谱面的网页端成绩记录 key"),
        count: int("这个 key 通过时间和变化类型筛选的事件数"),
    },
    { description: "无法放到当前曲库谱面的事件 key 和数量" }
);

function linkMaps(links: readonly ScoreRecordLink[]): {
    readonly byRecord: ReadonlyMap<string, string | null>;
    readonly byChart: ReadonlyMap<string, string>;
} {
    const byRecord = new Map<string, string | null>();
    const byChart = new Map<string, string>();
    for (const link of links) {
        byRecord.set(link.recordKey, link.chartKey);
        if (link.chartKey !== null) byChart.set(link.chartKey, link.recordKey);
    }
    return { byRecord, byChart };
}

export const history = defineCommand(
    {
        name: "history",
        summary: "查看全部谱面或一张谱的成绩变化记录",
        description:
            "不写谱面时列出所选用户的全部成绩历史；写法和 chart 完全一样：谱面 key，或曲目引用加难度，标题或别名两面都有时用 --type。每条都是当前谱面行，再加事件 id、时间、来源、类型和网页端显示的变化；谱面行里的 score 和 b50 是用户当前存下的值。时间线先找每个事件的前态，再做 --since 和变化类型筛选，所以时间窗口里的第一条仍保留窗口前的值。默认隐藏只有游玩次数变化的事件，--all-changes 会把它们也列出。全部谱面时，无法关联到当前曲库的事件按 recordKey 计入 missing；单谱查询的 missing 始终为空。所有事件合在一起从新到旧分页。",
        category: "scores",
        effect: "none",
        output: "list",
        positionals: [
            {
                name: "chart",
                valueName: "谱面",
                description: "可选的谱面 key，或曲目 id、标题、别名（再给难度）",
                optional: true,
            },
            {
                name: "difficulty",
                valueName: "难度",
                description: "难度；用谱面 key 或列出全部谱面时可以省略",
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
            since: {
                kind: "string",
                valueName: "时间",
                description:
                    "只要不早于这个时间的事件：ISO 8601，或从现在倒推的正整数天/小时，例如 7d、24h",
            },
            allChanges: {
                kind: "boolean",
                description: "也列出只有游玩次数发生变化的事件",
            },
            ...USER_OPTION,
            ...listOptions(),
        },
        examples: [
            {
                command: "history --since 7d --fields chartKey,title,time,changes",
                description: "最近七天哪些成绩有变化",
            },
            { command: "history 146-3", description: "一张谱的成绩历史" },
            {
                command: "history 'True Love Song' mas --type sd --all-changes",
                description: "按标题和难度查看，并包含只有游玩次数变化的记录",
            },
        ],
        errors: ["NOT_FOUND", "AMBIGUOUS_REF", "NO_USER", ...METADATA_ERRORS],
        dataSchema: object<HistoryResult>(
            {
                items: list(itemSchema, "分页后的成绩历史，全部谱面合在一起从新到旧"),
                missing: list(missingSchema, "无法放到当前曲库谱面的事件 key；单谱查询总是空列表"),
            },
            { description: "所选用户的成绩历史和无法关联的事件计数" }
        ),
    },
    async (args, ctx) => {
        requireUserForScores(args, ctx);
        const initialScores = useUserScores(args, ctx, []);
        let since: number | undefined;
        let metadata;
        try {
            if (args.positionals.chart === undefined && args.options.type !== undefined) {
                throw usageError("--type 只能和谱面一起使用");
            }
            since =
                args.options.since === undefined
                    ? undefined
                    : parseSinceOption("since", args.options.since, ctx.io.now()).getTime();
            metadata = await useMetadata(args, ctx, ["catalog"]);
        } catch (error) {
            carryScoreContext(error, initialScores);
        }

        const catalog = buildSongCatalog(metadata.catalog.music);
        const charts = [...catalog.chartByKey.values()].map(entry => entry.chart);
        const userScores = useUserScores(args, ctx, charts);
        const selected = userScores.scores;
        if (!selected) throw new Error("history requires a selected user");

        try {
            const requested =
                args.positionals.chart === undefined
                    ? undefined
                    : resolveChart(catalog, {
                          ref: args.positionals.chart,
                          difficulty: args.positionals.difficulty,
                          type: args.options.type,
                      });
            let items: HistoryItem[];
            const missing = new Map<string, number>();
            if (requested) {
                const requestedKey = chartKeyOf(requested.chart);
                const timeline = readChartScoreHistoryEntries(
                    ctx.store(),
                    selected.user.uid,
                    requestedKey,
                    { since, allChanges: args.options.allChanges }
                );
                items = timeline.map(entry => historyItem(requested, entry, selected));
            } else {
                const stored = readStoredScoreHistory(ctx.store(), selected.user.uid);
                const links = linkMaps(stored.links);
                const timeline = buildScoreHistoryTimeline(stored.events);
                const filtered = sortScoreHistoryNewest(
                    filterScoreHistory(timeline, { since, allChanges: args.options.allChanges })
                );

                items = filtered.flatMap(({ recordKey: key, entry }) => {
                    let chart;
                    if (links.byRecord.has(key)) {
                        const linkedKey = links.byRecord.get(key);
                        chart =
                            linkedKey === null || linkedKey === undefined
                                ? undefined
                                : catalog.chartByKey.get(linkedKey);
                    } else {
                        chart = catalog.chartByKey.get(key);
                    }
                    if (!chart) {
                        missing.set(key, (missing.get(key) ?? 0) + 1);
                        return [];
                    }
                    return [historyItem(chart, entry, selected)];
                });
            }
            const page = paginate(items, args.options);
            return {
                data: {
                    items: page.items,
                    missing: requested
                        ? []
                        : [...missing]
                              .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
                              .map(([key, count]) => ({ recordKey: key, count })),
                },
                meta: scoreMeta(userScores, metadata.dataAsOf, { page: page.page }),
                warnings: [...metadata.warnings, ...userScores.warnings],
            };
        } catch (error) {
            carryScoreContext(
                error,
                userScores,
                { dataAsOf: metadata.dataAsOf },
                metadata.warnings
            );
        }
    }
);
