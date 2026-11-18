/**
 * The sync command: fetches scores from Diving Fish or LXNS and writes them to SQLite (design 5.1).
 */
import type { ChartRow } from "../catalog/chartRow";
import type { SyncChangeItem, SyncData } from "../sync/types";
import { chartRowSchema, chartScoreSchema } from "../catalog/schemas";
import { usageError } from "../errors";
import { anything, extend, int, list, nullable, object, str, strEnum } from "../output/schema";
import { executeSync } from "../sync/execute";
import { USER_OPTION } from "./describe";
import { defineCommand } from "./registry";

const syncUserSchema = object(
    {
        uid: str("用户 uid"),
        index: int("用户从 0 开始的序号"),
        name: str("用户显示名"),
    },
    { description: "同步的用户" }
);

const syncRatingSchema = object(
    {
        before: nullable(
            int("同步前的 rating"),
            "同步前的 rating；原先没有或不是安全整数时是 null"
        ),
        after: nullable(int("同步后的 rating"), "同步后的 rating；不是安全整数时是 null"),
    },
    { description: "同步前后的 rating" }
);

const syncCountsSchema = object(
    {
        charts: int("同步后有成绩的谱面总数"),
        added: int("新游玩的谱面数"),
        improved: int("有成绩提升的谱面数"),
    },
    { description: "成绩数量变化" }
);

const syncChangeItemSchema = extend<SyncChangeItem, ChartRow>(
    chartRowSchema,
    {
        before: nullable(chartScoreSchema, "变化前的成绩；原先没有成绩时是 null"),
    },
    { description: "一个有成绩变化的谱面及变动前后的成绩" }
);

export const syncDataSchema = object<SyncData>(
    {
        user: syncUserSchema,
        source: strEnum(["lxns", "df-token", "df-name"], "本次使用的同步来源"),
        mode: strEnum(
            ["full", "public-b50"],
            "同步模式：full 为完整详细数据，public-b50 为水鱼公开 B50"
        ),
        rating: syncRatingSchema,
        counts: syncCountsSchema,
        changes: list(syncChangeItemSchema, "有成绩变化的谱面列表，默认最多 20 条；首次同步时为空"),
        changesTotal: int("有成绩变化的谱面总数"),
        missing: int("曲库中缺少的谱面变化数"),
        uploads: list(anything("上传目标结果"), "自动上传到第三方服务的结果；本步骤暂为空数组"),
    },
    { description: "成绩同步结果" }
);

export const sync = defineCommand(
    {
        name: "sync",
        summary: "从落雪或水鱼同步成绩",
        description:
            "从落雪或水鱼拉取最新的成绩、B50 和 rating，写入本地数据库，并记录成绩变动历史。支持按优先级自动选择来源（auto），或指定数据源（lxns、df-token、df-name）。同步成功后记录操作日志，成绩变化按 rating 增幅倒序排列。",
        category: "account",
        effect: "local",
        output: "object",
        examples: [],
        errors: [
            "NO_USER",
            "NOT_FOUND",
            "AMBIGUOUS_REF",
            "NOT_BOUND",
            "LXNS_REAUTH_REQUIRED",
            "NETWORK",
            "UPSTREAM_ERROR",
            "SYNC_IN_PROGRESS",
            "DB_LOCKED",
        ],
        options: {
            ...USER_OPTION,
            source: {
                kind: "enum",
                values: ["auto", "ingame", "lxns", "df-token", "df-name"],
                default: "auto",
                valueName: "数据源",
                description: "从哪个数据源同步成绩：auto 为按优先级自动选择",
            },
        },
        dataSchema: syncDataSchema,
    },
    async (args, ctx) => {
        if (args.global.offline) {
            throw usageError("sync 要联网，不能和 --offline 一起用");
        }
        return executeSync(args, ctx);
    }
);
