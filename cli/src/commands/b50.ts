import type { Chart } from "@core/music/type";
import type { ChartRow } from "../catalog/chartRow";
import type { ChartEntry } from "../catalog/songs";
import type { Warning } from "../output/warning";
import {
    createMusicChartMap,
    getSourceRecords,
    selectB50Charts,
    sumChartRatings,
} from "@core/query/b50";
import { allChartEntries } from "../catalog/chartQuery";
import { chartRow } from "../catalog/chartRow";
import { chartRowSchema } from "../catalog/schemas";
import { buildSongCatalog, chartKeyOf } from "../catalog/songs";
import { paginate } from "../output/paging";
import { extend, int, list, nullable, num, object, strEnum } from "../output/schema";
import { readUser } from "../users/repository";
import { USER_OPTION } from "./describe";
import { listOptions } from "./listOptions";
import { METADATA_ERRORS, useMetadata } from "./metadata";
import { defineCommand } from "./registry";
import { carryScoreContext, requireUserForScores, scoreMeta, useUserScores } from "./userScores";

const MODES = ["normal", "fit", "ap", "fc", "pc", "nb"] as const;
type B50Mode = (typeof MODES)[number];

const LABELS: Readonly<Record<B50Mode, string>> = {
    normal: "B50",
    fit: "拟合 B50",
    ap: "AP50",
    fc: "FC50",
    pc: "PC50",
    nb: "牛逼 50",
};

interface B50Item extends ChartRow {
    readonly rank: number;
    readonly rating: number;
    readonly ratingConstant: number | null;
}

interface B50Group {
    readonly key: "B35" | "B15";
    readonly count: number;
    readonly items: readonly B50Item[];
}

interface B50Rating {
    readonly total: number;
    readonly b35: number;
    readonly b15: number;
}

interface B50Result {
    readonly mode: B50Mode;
    readonly label: string;
    readonly rating: B50Rating;
    readonly groups: readonly B50Group[];
}

const itemSchema = extend<B50Item, ChartRow>(
    chartRowSchema,
    {
        rank: int("这张谱在当前模式、当前部分里的名次，从 1 开始，不受分页影响"),
        rating: int("当前模式把这张谱计入总分的 rating"),
        ratingConstant: nullable(
            num("重新计算 rating 使用的拟合定数"),
            "fit 和 nb 模式重新计算 rating 使用的拟合定数；其他模式是 null"
        ),
    },
    { description: "当前 B50 模式中的一张谱面" }
);

const groupSchema = object<B50Group>(
    {
        key: strEnum(["B35", "B15"], "B50 的旧曲或新曲部分"),
        count: int("该部分在分页前包含的谱面数"),
        items: list(itemSchema, "该部分分页后显示的谱面"),
    },
    { description: "B50 的一个固定部分" }
);

function optionsFor(mode: B50Mode) {
    return {
        fitDiff: mode === "fit",
        nb50: mode === "nb",
        comboFilter: mode === "ap" || mode === "fc" ? mode : null,
        pc50: mode === "pc",
    } as const;
}

function ratingConstantOf(chart: Chart, mode: B50Mode): number | null {
    if (mode !== "fit" && mode !== "nb") return null;
    const value = (chart.score as (Chart["score"] & { fitConstant?: unknown }) | undefined)
        ?.fitConstant;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function itemOf(
    chart: Chart,
    rank: number,
    mode: B50Mode,
    entryByKey: ReadonlyMap<string, ChartEntry>,
    scores: Parameters<typeof chartRow>[1]
): B50Item {
    const key = chartKeyOf(chart);
    const entry = entryByKey.get(key);
    if (!entry) throw new Error(`selected B50 chart is not in the catalog: ${key}`);
    return {
        ...chartRow(entry, scores),
        rank,
        rating: chart.score?.deluxeRating ?? 0,
        ratingConstant: ratingConstantOf(chart, mode),
    };
}

function groupOf(
    key: B50Group["key"],
    charts: readonly Chart[],
    mode: B50Mode,
    entryByKey: ReadonlyMap<string, ChartEntry>,
    scores: Parameters<typeof chartRow>[1],
    window: { readonly limit: number; readonly offset: number }
): B50Group {
    const ranked = charts.map((chart, index) => itemOf(chart, index + 1, mode, entryByKey, scores));
    return { key, count: ranked.length, items: paginate(ranked, window).items };
}

function playCountWarning(mode: B50Mode, data: Parameters<typeof getSourceRecords>[0]): Warning[] {
    if (mode !== "pc") return [];
    const records = getSourceRecords(data, true);
    if (records.some(record => typeof record.play_count === "number" && record.play_count > 0)) {
        return [];
    }
    return [
        {
            code: "NO_PLAY_COUNTS",
            message: "没有可用的正数游玩次数，PC50 只能按 rating 排序",
        },
    ];
}

export const b50 = defineCommand(
    {
        name: "b50",
        summary: "按网页端的模式查看 B35、B15 和总 rating",
        description:
            "按网页端 B50 页的规则选出固定的 B35 和 B15。normal 是普通 B50；fit 用拟合定数重算；ap、fc 按连击状态筛选；pc 先按成绩记录自己的游玩次数排序；nb 只保留拟合定数高于原定数的谱。--limit 和 --offset 对 B35、B15 分别生效，rating 和 count 始终按分页前的完整部分计算。每行的 b50 是普通 B50 的位置，rank 才是当前模式里的位置。",
        category: "scores",
        effect: "none",
        output: "list",
        options: {
            mode: {
                kind: "enum",
                values: MODES,
                default: "normal",
                valueName: "模式",
                description: "normal、fit、ap、fc、pc 或 nb；默认 normal",
            },
            ...USER_OPTION,
            ...listOptions(),
        },
        examples: [
            { command: "b50 --fields chartKey,title,rank,rating", description: "普通 B50" },
            { command: "b50 --mode fit --limit 5", description: "拟合 B50 每部分前五张" },
        ],
        errors: ["NOT_FOUND", "AMBIGUOUS_REF", "NO_USER", ...METADATA_ERRORS],
        dataSchema: object<B50Result>(
            {
                mode: strEnum(MODES, "实际使用的 B50 模式"),
                label: strEnum(Object.values(LABELS), "网页端显示的模式名称"),
                rating: object<B50Rating>(
                    {
                        total: int("B35 和 B15 的 rating 总和，不受分页影响"),
                        b35: int("完整 B35 部分的 rating 总和，不受分页影响"),
                        b15: int("完整 B15 部分的 rating 总和，不受分页影响"),
                    },
                    { description: "当前模式的 rating 汇总" }
                ),
                groups: list(groupSchema, "固定为 B35、B15 两组，即使没有谱面也都存在"),
            },
            { description: "网页端 B50 页在指定模式下的谱面和 rating" }
        ),
    },
    async (args, ctx) => {
        requireUserForScores(args, ctx);
        const initialScores = useUserScores(args, ctx, []);
        let metadata;
        try {
            metadata = await useMetadata(args, ctx, ["catalog"]);
        } catch (error) {
            carryScoreContext(error, initialScores);
        }

        const catalog = buildSongCatalog(metadata.catalog.music);
        const entries = allChartEntries(catalog);
        const charts = entries.map(entry => entry.chart);
        const userScores = useUserScores(args, ctx, charts);
        const selectedUser = userScores.scores?.user;
        if (!selectedUser) throw new Error("b50 requires a selected user");
        const user = readUser(ctx.store(), selectedUser.uid);
        if (!user) throw new Error(`selected user disappeared: ${selectedUser.uid}`);

        const mode = args.options.mode;
        const selected = selectB50Charts(user.data, createMusicChartMap(charts), optionsFor(mode));
        const b35 = sumChartRatings(selected.old);
        const b15 = sumChartRatings(selected.newer);
        const entryByKey = new Map(entries.map(entry => [chartKeyOf(entry.chart), entry]));
        return {
            data: {
                mode,
                label: LABELS[mode],
                rating: { total: b35 + b15, b35, b15 },
                groups: [
                    groupOf("B35", selected.old, mode, entryByKey, userScores.scores, args.options),
                    groupOf(
                        "B15",
                        selected.newer,
                        mode,
                        entryByKey,
                        userScores.scores,
                        args.options
                    ),
                ],
            },
            meta: scoreMeta(userScores, metadata.dataAsOf),
            warnings: [
                ...metadata.warnings,
                ...userScores.warnings,
                ...playCountWarning(mode, user.data),
            ],
        };
    }
);
