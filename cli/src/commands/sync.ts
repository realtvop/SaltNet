/**
 * The sync command: fetches scores from the game, LXNS or Diving Fish (design 5.1).
 */
import type { ChartRow } from "../catalog/chartRow";
import type { SyncChangeItem, SyncData, SyncUploadResult } from "../sync/types";
import { chartRowSchema, chartScoreSchema } from "../catalog/schemas";
import { ERROR_CODES, usageError } from "../errors";
import { bool, extend, int, list, nullable, object, str, strEnum } from "../output/schema";
import { executeSync } from "../sync/execute";
import { UPLOAD_TARGETS } from "../sync/types";
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

const syncUploadSchema = object<SyncUploadResult>(
    {
        target: strEnum(UPLOAD_TARGETS, "上传目标"),
        ok: bool("上传是否成功"),
        error: nullable(
            object({ code: strEnum(ERROR_CODES, "上传错误码"), message: str("上传错误说明") }),
            "上传失败的原因；成功时为 null"
        ),
    },
    { description: "一次自动上传的结果" }
);

export const syncDataSchema = object<SyncData>(
    {
        user: syncUserSchema,
        source: strEnum(["ingame", "lxns", "df-token", "df-name"], "本次使用的同步来源"),
        mode: strEnum(
            ["full", "fast", "public-b50"],
            "同步模式：full 为完整更新，fast 为舞萌快速更新，public-b50 为水鱼公开 B50"
        ),
        rating: syncRatingSchema,
        counts: syncCountsSchema,
        changes: list(syncChangeItemSchema, "有成绩变化的谱面列表，默认最多 20 条；首次同步时为空"),
        changesTotal: int("有成绩变化的谱面总数"),
        missing: int("曲库中缺少的谱面变化数"),
        uploads: list(syncUploadSchema, "自动上传到已绑定服务的结果，水鱼在前，落雪在后"),
    },
    { description: "成绩同步结果" }
);

export const sync = defineCommand(
    {
        name: "sync",
        summary: "从舞萌、落雪或水鱼同步成绩",
        description:
            "从舞萌、落雪或水鱼拉取成绩，写入本地数据库并记录变动历史。auto 按优先级选择来源。舞萌默认快速更新，使用 --qr - 时会登录舞萌账号进行全量更新。舞萌更新后会向已绑定的水鱼和落雪上传游戏成绩，可用 --no-upload 关闭。",
        category: "account",
        effect: "account",
        output: "object",
        examples: [],
        errors: [
            "NO_USER",
            "NOT_FOUND",
            "AMBIGUOUS_REF",
            "NOT_BOUND",
            "QR_REQUIRED",
            "QR_INVALID",
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
            qr: {
                kind: "credential",
                description: "从 stdin 读取舞萌二维码扫描结果或页面链接，进行全量更新",
            },
            upload: {
                kind: "boolean",
                default: true,
                description: "舞萌更新后自动上传到已绑定的服务，用 --no-upload 关闭",
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
