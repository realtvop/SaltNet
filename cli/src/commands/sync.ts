/**
 * The sync command: fetches scores from the game, LXNS or Diving Fish (design 5.1).
 */
import type { ChartRow } from "../catalog/chartRow";
import type { Warning } from "../output/warning";
import type {
    SyncAllData,
    SyncAllResult,
    SyncChangeItem,
    SyncData,
    SyncPlan,
    SyncPlanData,
    SyncResultError,
    SyncSkippedUser,
    SyncUploadResult,
    SyncUserMeta,
} from "../sync/types";
import { chartRowSchema, chartScoreSchema } from "../catalog/schemas";
import { ERROR_CODES } from "../errors";
import { anyOf, bool, extend, int, list, nullable, object, str, strEnum } from "../output/schema";
import { WARNING_CODES } from "../output/warning";
import { runSync } from "../sync/all";
import { SYNC_SOURCES, UPLOAD_TARGETS } from "../sync/types";
import { USER_OPTION } from "./describe";
import { defineCommand } from "./registry";

const syncUserSchema = object<SyncUserMeta>(
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
        improved: int("达成率、DX 分、连击或同步状态至少一项提升且四项均未下降的谱面数"),
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
        source: strEnum(SYNC_SOURCES, "本次使用的同步来源"),
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

const syncErrorSchema = object<SyncResultError>(
    { code: strEnum(ERROR_CODES, "错误码"), message: str("错误说明"), fix: str("建议命令") },
    { description: "单个用户的同步错误", optional: ["fix"] }
);

const syncWarningSchema = object<Warning>(
    {
        code: strEnum(Object.keys(WARNING_CODES), "警告码"),
        message: str("警告说明"),
        fix: str("建议命令"),
    },
    { description: "一条同步警告", optional: ["fix"] }
);

const skippedUsersSchema = list(
    object<SyncSkippedUser>({ user: syncUserSchema }, { description: "跳过的一个用户" }),
    "因手动更新设置而跳过的用户"
);

const syncAllDataSchema = object<SyncAllData>(
    {
        results: list(
            object<SyncAllResult>(
                {
                    user: syncUserSchema,
                    ok: bool("用户同步是否成功"),
                    data: nullable(syncDataSchema, "用户成绩同步结果，失败时为 null"),
                    error: nullable(syncErrorSchema, "用户同步错误，成功时为 null"),
                    warnings: list(syncWarningSchema, "用户同步警告"),
                },
                { description: "全部更新中的一项用户结果" }
            ),
            "按存储顺序排列的各用户结果"
        ),
        skipped: skippedUsersSchema,
    },
    { description: "全部更新的结果" }
);

const syncPlanDataSchema = object<SyncPlanData>(
    {
        plans: list(
            object<SyncPlan>(
                {
                    user: syncUserSchema,
                    source: nullable(
                        strEnum(SYNC_SOURCES, "将使用的数据源"),
                        "无可用来源时为 null"
                    ),
                    mode: nullable(
                        strEnum(["full", "fast"], "预计的同步模式"),
                        "未解析来源或需联网确定时为 null"
                    ),
                    uploads: list(
                        strEnum(UPLOAD_TARGETS, "上传目标"),
                        "舞萌同步成功后会上传到的服务"
                    ),
                    effect: strEnum(["local", "remote", "account"], "实际执行该方案的副作用级别"),
                    error: nullable(syncErrorSchema, "联网前能确认的配置或绑定错误，没有时为 null"),
                },
                { description: "一个用户的同步计划" }
            ),
            "按存储顺序排列的各用户同步预览"
        ),
        skipped: skippedUsersSchema,
    },
    { description: "同步预览的结果" }
);

export const sync = defineCommand(
    {
        name: "sync",
        summary: "从舞萌、落雪或水鱼同步成绩",
        description:
            "从舞萌、落雪或水鱼拉取成绩，写入本地数据库并记录变动历史。auto 按优先级选择来源。舞萌同步需要配置服务地址，默认快速更新，使用 --qr - 时会登录舞萌账号进行全量更新。舞萌更新后会向已绑定的水鱼和落雪上传游戏成绩，可用 --no-upload 关闭。--all 按顺序同步所有未开启手动更新的用户。--dry-run 展示计划，不联网、读取 stdin 或写入本地数据。",
        category: "account",
        effect: "account",
        output: "object",
        examples: [{ command: "sync --all --dry-run", description: "预览全部更新及其副作用" }],
        errors: [
            "NO_USER",
            "NOT_FOUND",
            "AMBIGUOUS_REF",
            "NOT_BOUND",
            "QR_REQUIRED",
            "QR_INVALID",
            "LXNS_REAUTH_REQUIRED",
            "USAGE",
            "NETWORK",
            "UPSTREAM_ERROR",
            "SYNC_IN_PROGRESS",
            "DB_LOCKED",
        ],
        options: {
            ...USER_OPTION,
            source: {
                kind: "enum",
                values: ["auto", ...SYNC_SOURCES],
                valueName: "数据源",
                description: "从哪个数据源同步成绩：默认 auto，按优先级自动选择",
            },
            qr: {
                kind: "credential",
                description:
                    "从 stdin 读取舞萌二维码扫描结果或页面链接，进行全量更新。二维码属于另一个舞萌账号时，sync.qrOtherAccount 决定改写游戏 ID（默认）或报错",
            },
            upload: {
                kind: "boolean",
                default: true,
                description: "舞萌更新后自动上传到已绑定的服务，用 --no-upload 关闭",
            },
            all: {
                kind: "boolean",
                description:
                    "依次同步所有未开启手动更新的用户，不能和 --user、--source 或 --qr 一起用",
            },
            dryRun: {
                kind: "boolean",
                description: "只预览同步的来源、模式、上传与副作用级别",
            },
        },
        dataSchema: anyOf(
            "单用户同步、全部更新或同步预览的结果",
            syncDataSchema,
            syncAllDataSchema,
            syncPlanDataSchema
        ),
    },
    runSync
);
