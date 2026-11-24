import type { Chart } from "@core/music/type";
import type { ChartRow } from "../catalog/chartRow";
import type { ChartEntry } from "../catalog/songs";
import type { Warning } from "../output/warning";
import type { OutputFileTarget } from "../runtime/outputFile";
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
import { CliError } from "../errors";
import { prepareFields } from "../output/fields";
import { paginate } from "../output/paging";
import { extend, int, list, nullable, num, object, str, strEnum } from "../output/schema";
import { buildB50RenderPayload, requestB50Image } from "../render/b50Image";
import { resolveOutputFile, writeOutputFile } from "../runtime/outputFile";
import { readUser } from "../users/repository";
import { userForCoreScores } from "../users/rows";
import { fileWord, optionWords } from "../util/printedCommand";
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

interface B50ImageResult {
    readonly path: string;
    readonly byteSize: number;
}

interface B50Result {
    readonly mode: B50Mode;
    readonly label: string;
    readonly rating: B50Rating;
    readonly groups: readonly B50Group[];
    readonly image: B50ImageResult | null;
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

const imageSchema = nullable(
    object<B50ImageResult>(
        {
            path: str("生成图片的绝对路径"),
            byteSize: int("写入图片的字节数"),
        },
        { description: "导出的 B50 图片信息" }
    ),
    "使用 --image 生成的图片信息；未指定 --image 时为 null"
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
            "按网页端 B50 页的规则选出固定的 B35 和 B15。normal 是普通 B50；fit 用拟合定数重算；ap、fc 按连击状态筛选；pc 先按成绩记录自己的游玩次数排序；nb 只保留拟合定数高于原定数的谱。--limit 和 --offset 对 B35、B15 分别生效，rating 和 count 始终按分页前的完整部分计算。每行的 b50 是普通 B50 的位置，rank 才是当前模式里的位置。只有 --image 会调用渲染服务并在本地写入文件。",
        category: "scores",
        effect: "local",
        output: "list",
        options: {
            mode: {
                kind: "enum",
                values: MODES,
                default: "normal",
                valueName: "模式",
                description: "normal、fit、ap、fc、pc 或 nb；默认 normal",
            },
            image: {
                kind: "string",
                valueName: "文件",
                description: "调用渲染服务将 B50 保存为 PNG 图片；相对路径按当前目录解析",
            },
            overwrite: {
                kind: "boolean",
                description: "允许替换已经存在的目标文件（仅配合 --image 使用）",
            },
            dxScore: {
                kind: "boolean",
                description: "在图片中显示 DX 分数（仅配合 --image 使用）",
            },
            ...USER_OPTION,
            ...listOptions(),
        },
        examples: [
            { command: "b50 --fields chartKey,title,rank,rating", description: "普通 B50" },
            { command: "b50 --mode fit --limit 5", description: "拟合 B50 每部分前五张" },
        ],
        errors: [
            "NOT_FOUND",
            "AMBIGUOUS_REF",
            "NO_USER",
            "USAGE",
            "FILE_EXISTS",
            ...METADATA_ERRORS,
        ],
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
                image: imageSchema,
            },
            { description: "网页端 B50 页在指定模式下的谱面和 rating" }
        ),
    },
    async (args, ctx) => {
        const image = args.options.image;
        if (image === undefined) {
            if (args.options.overwrite) {
                throw new CliError("USAGE", "--overwrite 只能配合 --image 使用", {
                    retryable: false,
                });
            }
            if (args.options.dxScore) {
                throw new CliError("USAGE", "--dx-score 只能配合 --image 使用", {
                    retryable: false,
                });
            }
        }

        let outputImage: OutputFileTarget | undefined;
        let renderUrl: string | undefined;
        if (image !== undefined) {
            renderUrl = ctx.config.values.render.url.trim().replace(/\/+$/, "");
            if (!renderUrl) {
                throw new CliError("USAGE", "未配置渲染服务地址 render.url", {
                    retryable: false,
                    fix: "saltnet config set render.url <地址>",
                });
            }
            if (args.global.offline) {
                throw new CliError(
                    "USAGE",
                    "--offline 不能与 --image 一起使用；生成图片需要访问渲染服务",
                    { retryable: false }
                );
            }
            const retryCommand = [
                "saltnet",
                "b50",
                ...(args.options.mode !== "normal" ? ["--mode", args.options.mode] : []),
                ...(args.options.user === undefined
                    ? []
                    : optionWords("--user", args.options.user)),
                ...(args.options.dxScore ? ["--dx-score"] : []),
                "--image",
                fileWord(image),
            ];
            outputImage = resolveOutputFile(
                ctx,
                image,
                args.options.overwrite,
                retryCommand,
                "b50"
            );
            if (args.options.fields !== undefined) {
                prepareFields([itemSchema], args.options.fields);
            }
        }

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
        const rawUser = readUser(ctx.store(), selectedUser.uid);
        if (!rawUser) throw new Error(`selected user disappeared: ${selectedUser.uid}`);
        const user = userForCoreScores(rawUser);

        const mode = args.options.mode;
        const selected = selectB50Charts(user.data, createMusicChartMap(charts), optionsFor(mode));
        const b35 = sumChartRatings(selected.old);
        const b15 = sumChartRatings(selected.newer);
        const entryByKey = new Map(entries.map(entry => [chartKeyOf(entry.chart), entry]));

        const rankedOld = selected.old.map((chart, index) =>
            itemOf(chart, index + 1, mode, entryByKey, userScores.scores)
        );
        const rankedNewer = selected.newer.map((chart, index) =>
            itemOf(chart, index + 1, mode, entryByKey, userScores.scores)
        );

        const groups = [
            {
                key: "B35" as const,
                count: rankedOld.length,
                items: paginate(rankedOld, args.options).items,
            },
            {
                key: "B15" as const,
                count: rankedNewer.length,
                items: paginate(rankedNewer, args.options).items,
            },
        ];

        const isEmpty = selected.old.length === 0 && selected.newer.length === 0;

        let imageResult: B50ImageResult | null = null;
        const warnings: Warning[] = [
            ...metadata.warnings,
            ...userScores.warnings,
            ...playCountWarning(mode, user.data),
        ];

        if (image !== undefined) {
            if (isEmpty) {
                warnings.push({
                    code: "NO_IMAGE",
                    message: "选中的模式里没有谱面，没有画图片",
                });
            } else if (outputImage !== undefined && renderUrl !== undefined) {
                const payload = buildB50RenderPayload({
                    user: rawUser,
                    modeLabel: LABELS[mode],
                    showDxScore: args.options.dxScore,
                    sd: selected.old,
                    dx: selected.newer,
                });
                const http = ctx.http({
                    timeoutMs: ctx.config.values.network.timeoutMs,
                    timeoutKey: "network.timeoutMs",
                    retry: true,
                });
                const bytes = await requestB50Image({ renderUrl, payload, http });
                writeOutputFile(outputImage, bytes, "b50");
                imageResult = {
                    path: outputImage.path,
                    byteSize: bytes.byteLength,
                };
            }
        }

        return {
            data: {
                mode,
                label: LABELS[mode],
                rating: { total: b35 + b15, b35, b15 },
                groups,
                image: imageResult,
            },
            meta: scoreMeta(userScores, metadata.dataAsOf),
            warnings,
        };
    }
);
