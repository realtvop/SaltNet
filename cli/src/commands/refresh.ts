import type { FailedOutcome, SourceOutcome } from "../catalog/refresh";
import type { CollectionCounts } from "../catalog/store";
import { refreshBusyError, refreshCatalog, SOURCE_LABELS } from "../catalog/refresh";
import { mergedDuplicateSchema } from "../catalog/schemas";
import { CliError, usageError } from "../errors";
import { anyOf, int, list, literal, object, str } from "../output/schema";
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

const saltMetaResultSchema = object(
    {
        source: literal("saltmeta", "曲库"),
        ok: literal(true, "刷新成功"),
        fetchedAt: str("下载的时间，用本机时区的偏移写"),
        songs: int("曲库里有几首歌"),
        charts: int("曲库里有几张谱面"),
        versions: int("曲库里有几个版本"),
        mergedDuplicates: list(mergedDuplicateSchema, "上游列了两遍、被合并成一首的歌"),
    },
    { description: "曲库（SaltMeta）的刷新结果" }
);

const collectionsResultSchema = object(
    {
        source: literal("lxns-collections", "落雪的收藏品列表"),
        ok: literal(true, "刷新成功"),
        fetchedAt: str("下载的时间，用本机时区的偏移写"),
        counts: object<CollectionCounts>(
            {
                title: int("称号的数量"),
                icon: int("头像的数量"),
                plate: int("姓名框的数量"),
                frame: int("背景的数量"),
            },
            { description: "各类收藏品的数量；旅行伙伴和搭档随 saltnet 自带，不在其中" }
        ),
    },
    { description: "收藏品（落雪）的刷新结果" }
);

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
        dataSchema: object(
            {
                sources: list(
                    anyOf("一个数据源的结果", saltMetaResultSchema, collectionsResultSchema),
                    "两个数据源各一项，曲库在前。只有都成功了才有 data；有失败时命令出错，各自的结果在 error.sources 里"
                ),
            },
            { description: "刷新成功的结果" }
        ),
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
