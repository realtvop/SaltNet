/** Resolves `--user` and supplies score meta, warnings and one reusable chart lookup. */
import type { Chart } from "@core/music/type";
import type { Warning } from "../output/warning";
import type { UserScores } from "../users/scores";
import type { CommandContext } from "./registry";
import { CliError } from "../errors";
import { resolveUser } from "../refs/user";
import { listUsers } from "../users/repository";
import { readUserScores } from "../users/scores";
import { formatLocalTime } from "../util/time";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CommandUserScores {
    readonly scores?: UserScores;
    readonly meta: Readonly<Record<string, unknown>>;
    readonly dataAsOf: Readonly<Record<string, string | null>>;
    readonly warnings: readonly Warning[];
}

function syncFix(user: UserScores["user"]): string {
    return user.index === 0 ? "saltnet sync" : `saltnet sync --user ${user.uid}`;
}

function scoreTime(value: number | null): string | null {
    if (value === null) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : formatLocalTime(date);
}

function scoreWarnings(scores: UserScores, now: Date, staleDays: number): Warning[] {
    if (scores.source === "none") {
        return [
            {
                code: "NO_SCORES",
                message: "这个用户还没有成绩",
                fix: syncFix(scores.user),
            },
        ];
    }
    if (scores.source === "b50") {
        return [
            {
                code: "PARTIAL_SCORES",
                message: "只拿到了水鱼公开的 B50，其他谱面没有成绩",
            },
        ];
    }
    const updatedAt = scores.user.updatedAt;
    if (updatedAt === null) {
        return [
            {
                code: "STALE_SCORES",
                message: "成绩的更新时间未知",
                fix: syncFix(scores.user),
            },
        ];
    }
    const age = now.getTime() - updatedAt;
    if (age <= staleDays * DAY_MS) return [];
    return [
        {
            code: "STALE_SCORES",
            message: `成绩已经 ${Math.floor(age / DAY_MS)} 天没更新`,
            fix: syncFix(scores.user),
        },
    ];
}

/** No users and no explicit reference preserves the phase-1 result exactly. */
export function useUserScores(
    args: { readonly options: { readonly user?: string } },
    ctx: CommandContext,
    charts: readonly Chart[]
): CommandUserScores {
    const users = listUsers(ctx.store());
    if (users.length === 0 && args.options.user === undefined) {
        return { meta: {}, dataAsOf: {}, warnings: [] };
    }
    const user = resolveUser(users, args.options.user);
    const scores = readUserScores(ctx.store(), user, charts);
    return {
        scores,
        meta: { user: { index: user.index, uid: user.uid, name: user.displayName } },
        dataAsOf: { scores: scoreTime(user.updatedAt) },
        warnings: scoreWarnings(scores, ctx.io.now(), ctx.config.values.scores.staleDays),
    };
}

function record(value: unknown): Readonly<Record<string, unknown>> {
    return value !== null && typeof value === "object"
        ? (value as Readonly<Record<string, unknown>>)
        : {};
}

/** Adds everything already read to a later command error, as design 4.3 requires. */
export function carryScoreContext(
    error: unknown,
    scores: CommandUserScores,
    baseMeta: Readonly<Record<string, unknown>> = {},
    baseWarnings: readonly Warning[] = []
): never {
    if (!(error instanceof CliError)) throw error;
    const existingMeta = error.meta ?? {};
    const dataAsOf = {
        ...record(baseMeta.dataAsOf),
        ...scores.dataAsOf,
        ...record(existingMeta.dataAsOf),
    };
    const meta = {
        ...baseMeta,
        ...scores.meta,
        ...existingMeta,
        ...(Object.keys(dataAsOf).length > 0 ? { dataAsOf } : {}),
    };
    const warnings = [...baseWarnings, ...scores.warnings, ...(error.warnings ?? [])];
    throw new CliError(error.code, error.message, {
        candidates: error.candidates,
        fix: error.fix,
        retryable: error.retryable,
        extra: error.extra,
        ...(Object.keys(meta).length > 0 ? { meta } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
        cause: error,
    });
}

/** Adds the selected user and score time to a successful command's existing meta. */
export function scoreMeta(
    scores: CommandUserScores,
    dataAsOf: Readonly<Record<string, unknown>>,
    rest: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
    return {
        ...scores.meta,
        dataAsOf: { ...dataAsOf, ...scores.dataAsOf },
        ...rest,
    };
}
