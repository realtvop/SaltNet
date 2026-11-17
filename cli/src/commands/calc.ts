import type { ChartRow } from "../catalog/chartRow";
import type { RatingStageEntry } from "../catalog/schemas";
import { getDetailedRatingsByConstant } from "@core/chart/rating";
import { ScoreCoefficient } from "@core/chart/rating/ScoreCoefficient";
import { getRankRateByAchievement } from "@core/mai/types";
import { getB50Gain } from "@core/query/b50";
import { chartRow, constantOf } from "../catalog/chartRow";
import { chartRowSchema, ratingStageSchema } from "../catalog/schemas";
import { buildSongCatalog } from "../catalog/songs";
import { usageError } from "../errors";
import { int, list, nullable, num, object, strEnum } from "../output/schema";
import { resolveChart } from "../refs/chart";
import { rankLabel, RANKS } from "../refs/status";
import { USER_OPTION } from "./describe";
import { METADATA_ERRORS, useMetadata } from "./metadata";
import { defineCommand } from "./registry";
import { carryScoreContext, scoreMeta, useUserScores } from "./userScores";

export interface CalcData {
    readonly constant: number;
    readonly chart: ChartRow | null;
    readonly target: number | null;
    readonly achievements: number | null;
    readonly rating: number | null;
    readonly rank: string | null;
    readonly gain: number | null;
    readonly stages: readonly RatingStageEntry[] | null;
}

const calcDataSchema = object<CalcData>(
    {
        constant: num("计算所用的谱面定数"),
        chart: nullable(chartRowSchema, "计算所针对的谱面行；直接指定定数时为 null"),
        target: nullable(
            int("目标 rating；未指定 --rating 时为 null"),
            "目标 rating；未指定 --rating 时为 null"
        ),
        achievements: nullable(num("达成率"), "达成率；未指定计算选项或无法达到时为 null"),
        rating: nullable(
            int("计算得出的单曲 rating"),
            "计算得出的单曲 rating；未指定计算选项或无法达到时为 null"
        ),
        rank: nullable(
            strEnum(RANKS.map(rankLabel), "达成率对应的评级写法，例如 SSS+"),
            "达成率对应的评级写法，例如 SSS+；未指定计算选项或无法达到时为 null"
        ),
        gain: nullable(
            int("打到计算得出的单曲 rating 时，用户 B50 总分的理论增加值"),
            "打到计算得出的单曲 rating 时，用户 B50 总分的理论增加值；所在部分未满时为完整单曲 rating，已满时为超出该部分最低单曲 rating 的差值；未指定计算选项、无法达到目标、直接指定定数、宴谱、新旧曲属性未知或无用户时为 null"
        ),
        stages: nullable(
            list(ratingStageSchema, "完整的 Rating 阶段表"),
            "完整的 Rating 阶段表；指定了 --achievements 或 --rating 时为 null"
        ),
    },
    { description: "达成率与 Rating 互算结果或完整阶段表" }
);

function parseConstant(value: string): number | null {
    if (!/^-?\d+(?:\.\d+)?$/.test(value)) return null;
    const parts = value.split(".");
    if (parts.length === 2 && parts[1].length > 1) {
        throw usageError("定数最多只能有一位小数");
    }
    const numVal = Number(value);
    if (!Number.isFinite(numVal) || numVal < 1.0 || numVal > 15.0) {
        if (parts.length === 2 || numVal <= 0) {
            throw usageError("定数应该在 1.0 到 15.0 之间");
        }
        return null;
    }
    return numVal;
}

function findLowestAchievementsForRating(
    constant: number,
    target: number
): {
    achievements: number | null;
    rating: number | null;
    rank: string | null;
} {
    const maxRa = new ScoreCoefficient(101).ra(constant);
    if (target > maxRa) {
        return { achievements: null, rating: null, rank: null };
    }
    let low = 0;
    let high = 1_005_000;
    let ans = high;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const coeff = new ScoreCoefficient(mid / 10_000);
        if (coeff.ra(constant) >= target) {
            ans = mid;
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
    const ach = Number((ans / 10_000).toFixed(4));
    const coeff = new ScoreCoefficient(ach);
    const ra = coeff.ra(constant);
    const rank = rankLabel(getRankRateByAchievement(ach));
    return { achievements: ach, rating: ra, rank };
}

export const calc = defineCommand(
    {
        name: "calc",
        summary: "达成率与 Rating 互算或输出阶段表",
        description:
            "计算谱面定数、达成率和单曲 rating 之间的换算关系。第一个参数可以给出 1.0 到 15.0 之间最多一位小数的定数，也可以像 chart 命令一样给出谱面引用（谱面 key，或曲目加难度；支持 --type）。" +
            "指定 --achievements <达成率>（0 到 101）计算该达成率下的单曲 rating 和评级；指定 --rating <rating>（非负整数）计算达到该 rating 所需的最低达成率（以 0.0001 为步长），以及在该达成率下的 rating 和评级（即使 101 也无法达到时均为 null）。" +
            "两者都不指定时输出完整的 Rating 阶段表（同 chart --with stages）。两者不能同时指定。" +
            "传入谱面引用时带上所选用户的成绩和谱面行，支持 --user；传入定数时不读取用户和曲库，可完全离线运行。",
        category: "scores",
        effect: "none",
        output: "object",
        positionals: [
            {
                name: "chartOrConstant",
                valueName: "定数或谱面",
                description: "谱面定数（1.0 到 15.0），或谱面 key / 曲目 id、标题、别名",
            },
            {
                name: "difficulty",
                valueName: "难度",
                description: "难度；指定曲目时必须提供，使用谱面 key 或定数时省略",
                optional: true,
            },
        ],
        options: {
            achievements: {
                kind: "number",
                min: 0,
                max: 101,
                valueName: "达成率",
                description: "达成率（0 到 101），计算对应的 rating 和评级",
            },
            rating: {
                kind: "integer",
                min: 0,
                valueName: "rating",
                description: "目标 rating（非负整数），计算达到该 rating 所需的最低达成率",
            },
            type: {
                kind: "enum",
                values: ["sd", "dx"],
                description:
                    "标题或别名两面都有这个难度时取哪一面；写 id 或谱面 key 时用来核对类型",
            },
            ...USER_OPTION,
        },
        examples: [
            {
                command: "calc 13.5 --achievements 100",
                description: "计算定数 13.5 在达成率 100% 时的 rating",
            },
            {
                command: "calc 146-3 --rating 250",
                description: "计算谱面 146-3 达到 rating 250 所需的最低达成率",
            },
            {
                command: "calc 14.0",
                description: "输出定数 14.0 的完整 Rating 阶段表",
            },
        ],
        errors: ["USAGE", "NOT_FOUND", "AMBIGUOUS_REF", "NO_USER", ...METADATA_ERRORS],
        dataSchema: calcDataSchema,
    },
    async (args, ctx) => {
        if (args.options.achievements !== undefined && args.options.rating !== undefined) {
            throw usageError("--achievements 和 --rating 不能同时指定");
        }

        const isRefExplicit =
            args.positionals.difficulty !== undefined || args.options.type !== undefined;
        const parsedConstant = isRefExplicit
            ? null
            : parseConstant(args.positionals.chartOrConstant);

        if (parsedConstant !== null) {
            let target: number | null = null;
            let achievements: number | null = null;
            let rating: number | null = null;
            let rank: string | null = null;
            let stages: RatingStageEntry[] | null = null;

            if (args.options.achievements !== undefined) {
                achievements = args.options.achievements;
                const coeff = new ScoreCoefficient(achievements);
                rating = coeff.ra(parsedConstant);
                rank = rankLabel(getRankRateByAchievement(achievements));
            } else if (args.options.rating !== undefined) {
                target = args.options.rating;
                const found = findLowestAchievementsForRating(parsedConstant, target);
                achievements = found.achievements;
                rating = found.rating;
                rank = found.rank;
            } else {
                stages = getDetailedRatingsByConstant(parsedConstant).map(item => ({
                    achievements: item.achievements,
                    rating: item.rating,
                    rank: rankLabel(item.rank),
                    gain: null,
                }));
            }

            return {
                data: {
                    constant: parsedConstant,
                    chart: null,
                    target,
                    achievements,
                    rating,
                    rank,
                    gain: null,
                    stages,
                },
                meta: {},
                warnings: [],
            };
        }

        const metadata = await useMetadata(args, ctx, ["catalog"]);
        const userScores = useUserScores(
            args,
            ctx,
            Object.values(metadata.catalog.music.chartList)
        );
        try {
            const entry = resolveChart(buildSongCatalog(metadata.catalog.music), {
                ref: args.positionals.chartOrConstant,
                difficulty: args.positionals.difficulty,
                type: args.options.type,
            });
            const constant = constantOf(entry.chart);
            if (constant === null) {
                throw usageError("该谱面没有定数");
            }

            let target: number | null = null;
            let achievements: number | null = null;
            let rating: number | null = null;
            let rank: string | null = null;
            let gain: number | null = null;
            let stages: RatingStageEntry[] | null = null;

            if (args.options.achievements !== undefined) {
                achievements = args.options.achievements;
                const coeff = new ScoreCoefficient(achievements);
                rating = coeff.ra(constant);
                rank = rankLabel(getRankRateByAchievement(achievements));
                gain = userScores.scores
                    ? getB50Gain(userScores.scores.b50, entry.chart, rating)
                    : null;
            } else if (args.options.rating !== undefined) {
                target = args.options.rating;
                const found = findLowestAchievementsForRating(constant, target);
                achievements = found.achievements;
                rating = found.rating;
                rank = found.rank;
                gain =
                    rating !== null && userScores.scores
                        ? getB50Gain(userScores.scores.b50, entry.chart, rating)
                        : null;
            } else {
                const userB50 = userScores.scores?.b50;
                stages = getDetailedRatingsByConstant(constant).map(item => ({
                    achievements: item.achievements,
                    rating: item.rating,
                    rank: rankLabel(item.rank),
                    gain: userB50 ? getB50Gain(userB50, entry.chart, item.rating) : null,
                }));
            }

            return {
                data: {
                    constant,
                    chart: chartRow(entry, userScores.scores),
                    target,
                    achievements,
                    rating,
                    rank,
                    gain,
                    stages,
                },
                meta: scoreMeta(userScores, metadata.dataAsOf),
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
