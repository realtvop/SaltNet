import type { CommandContext, CommandResult } from "../commands/registry";
import type { UserListRow } from "../users/repository";
import type { SyncCommandArgs } from "./execute";
import type { SyncAllData, SyncAllResult, SyncPlanData } from "./types";
import { CliError, usageError } from "../errors";
import { resolveUser } from "../refs/user";
import { listUsers } from "../users/repository";
import { executeSync } from "./execute";
import { planUserSync, readSyncPlanUsers } from "./plan";
import { assertGameQrSource, syncResultError, syncUserMeta } from "./sources";

function selectUsers(rows: UserListRow[], options: SyncCommandArgs["options"]) {
    if (!options.all) return { selected: [resolveUser(rows, options.user)], skipped: [] };
    if (rows.length === 0) throw new CliError("NO_USER", "还没有任何用户");
    return {
        selected: rows.filter(row => !row.manuallyUpdate),
        skipped: rows.filter(row => row.manuallyUpdate).map(row => ({ user: syncUserMeta(row) })),
    };
}

export async function runSync(args: SyncCommandArgs, ctx: CommandContext): Promise<CommandResult> {
    const { all, dryRun, user, source, qr } = args.options;
    if (all && (user !== undefined || source !== undefined || qr !== undefined)) {
        throw usageError("--all 不能和 --user、--source 或 --qr 一起用");
    }
    assertGameQrSource(source === undefined || source === "auto" || source === "ingame", qr);
    if (args.global.offline && !dryRun) {
        throw usageError("sync 要联网，不能和 --offline 一起用");
    }

    if (dryRun) {
        const { rows, users } = readSyncPlanUsers(ctx.paths.database);
        const { selected, skipped } = selectUsers(rows, args.options);
        const usersByUid = new Map(users.map(user => [user.uid, user]));
        const plans = selected.map(row => {
            const storedUser = usersByUid.get(row.uid);
            if (!storedUser) throw new Error(`找不到用户 ${row.uid} 的存档`);
            return planUserSync(args, ctx, row, storedUser);
        });
        const data: SyncPlanData = { plans, skipped };
        return { data };
    }

    const { selected, skipped } = selectUsers(listUsers(ctx.store()), args.options);
    if (!all) return executeSync(args, ctx, selected[0]);

    const results: SyncAllResult[] = [];
    for (const row of selected) {
        try {
            const { data, warnings } = await executeSync(args, ctx, row);
            results.push({ user: data.user, ok: true, data, error: null, warnings });
        } catch (error) {
            if (!(error instanceof CliError)) throw error;
            results.push({
                user: syncUserMeta(row),
                ok: false,
                data: null,
                error: syncResultError(error),
                warnings: error.warnings ?? [],
            });
        }
    }
    const data: SyncAllData = { results, skipped };
    const failed = results.filter(result => !result.ok);
    if (failed.length === 0) return { data };
    const names = failed.map(({ user }) => `${user.name}（${user.uid}）`).join("、");
    return {
        data,
        warnings: [{ code: "SOME_FAILED", message: `${failed.length} 位用户同步失败：${names}` }],
    };
}
