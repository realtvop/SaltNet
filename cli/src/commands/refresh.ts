import type { FailedOutcome, SourceOutcome } from "../catalog/refresh";
import { refreshBusyError, refreshCatalog, SOURCE_LABELS } from "../catalog/refresh";
import { CliError, usageError } from "../errors";
import { formatLocalTime } from "../util/time";
import { defineCommand } from "./registry";

function time(epochMs: number): string {
    return formatLocalTime(new Date(epochMs));
}

/** One source as the command reports it, whether it worked or not. */
function report(outcome: SourceOutcome): Record<string, unknown> {
    if (!outcome.ok) {
        const { error } = outcome;
        return {
            source: outcome.source,
            ok: false,
            error: { code: error.code, message: error.message, retryable: error.retryable },
            keptFetchedAt: outcome.keptFetchedAt === undefined ? null : time(outcome.keptFetchedAt),
        };
    }
    if (outcome.source === "saltmeta") {
        return {
            source: outcome.source,
            ok: true,
            fetchedAt: time(outcome.fetchedAt),
            songs: outcome.songs,
            charts: outcome.charts,
            versions: outcome.versions,
            mergedDuplicates: outcome.merged,
        };
    }
    return {
        source: outcome.source,
        ok: true,
        fetchedAt: time(outcome.fetchedAt),
        counts: outcome.counts,
    };
}

export const refresh = defineCommand(
    {
        name: "refresh",
        summary: "强制刷新曲库和收藏品",
        description:
            "重新下载曲库（SaltMeta）和收藏品（落雪），整体替换本地数据，原始文件另存一份在数据目录的 cache/ 里。两部分各自独立：一个失败时它原来的数据保留，另一个照常更新，命令以失败退出，error 里的 sources 给出各自的结果。",
        category: "data",
        effect: "local",
        output: "object",
        examples: [{ command: "refresh", description: "强制刷新曲库和收藏品" }],
        errors: ["NETWORK", "UPSTREAM_ERROR", "SYNC_IN_PROGRESS", "DB_LOCKED"],
    },
    async (args, ctx) => {
        if (args.global.offline) {
            throw usageError("refresh 要联网，不能和 --offline 一起用");
        }

        const result = await refreshCatalog({
            store: ctx.store(),
            paths: ctx.paths,
            config: ctx.config.values,
            http: ctx.http({ timeoutMs: ctx.config.values.metadata.timeoutMs }),
            now: () => ctx.io.now(),
            log: ctx.log,
        });

        if (!result.refreshed) throw refreshBusyError(result.holder);

        const sources = result.outcomes.map(report);
        const failed = result.outcomes.filter((outcome): outcome is FailedOutcome => !outcome.ok);
        if (failed.length > 0) {
            // The first failure decides the code. Each source's own result is in `sources`.
            const [first] = failed;
            const lines = failed.map(
                outcome => `${SOURCE_LABELS[outcome.source]}：${outcome.error.message}`
            );
            throw new CliError(first.error.code, `刷新失败，${lines.join("；")}`, {
                retryable: first.error.retryable,
                cause: first.error,
                extra: { sources },
            });
        }
        return { data: { sources } };
    }
);
