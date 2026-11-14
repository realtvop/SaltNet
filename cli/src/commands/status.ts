import { existsSync } from "node:fs";
import { mergedDuplicateSchema, sourceStatusSchema } from "../catalog/schemas";
import { mergedDuplicatesOf, sourceStatus } from "../catalog/statusView";
import { readMetaState } from "../catalog/store";
import { bool, int, list, nullable, num, object, str } from "../output/schema";
import { formatLocalTime } from "../util/time";
import { defineCommand } from "./registry";

export const status = defineCommand(
    {
        name: "status",
        summary: "各项数据的更新时间和本地状态",
        description:
            "汇总本机上 saltnet 的状态，用其他命令之前先看一眼。不联网，也不会创建数据目录：数据库还不存在时，各项数据都是 missing。结果有 version（saltnet 的版本）、home（数据目录，可以用环境变量 SALTNET_HOME 换）、database（exists 是数据库文件在不在，schemaVersion 是它的结构版本，不在时是 null）、metadata（maxAgeHours 是过期时间，catalog 是曲库、collections 是收藏品落雪的列表；每项有 source、label、state、fetchedAt、ageHours、upstreamVersion 和 counts）、mergedDuplicates（上游列了两遍、被合并成一首的歌，每首有 id、title 和 mergedTitles）。state 是 fresh（新的），stale（超过 maxAgeHours，下次用到时自动刷新），other-version（别的版本的 saltnet 存的，下次用到时重建）或 missing（还没有，下次用到时下载，也可以运行 refresh）。",
        category: "data",
        effect: "none",
        output: "object",
        examples: [{ command: "status", description: "数据有多新、有没有缺" }],
        errors: ["DB_LOCKED"],
        dataSchema: object(
            {
                version: str("saltnet CLI 版本号"),
                home: str("数据目录路径"),
                database: object(
                    {
                        exists: bool("数据库文件是否存在"),
                        schemaVersion: nullable(int("数据库结构版本号；不存在时为 null")),
                    },
                    { description: "数据库状态" }
                ),
                metadata: object(
                    {
                        maxAgeHours: num(
                            "曲库和收藏品多少小时后算过期（设置 metadata.maxAgeHours，可以是小数）"
                        ),
                        catalog: sourceStatusSchema,
                        collections: sourceStatusSchema,
                    },
                    { description: "元数据状态" }
                ),
                mergedDuplicates: list(mergedDuplicateSchema, "上游重名合并的曲目列表"),
            },
            { description: "本地数据与缓存状态" }
        ),
    },
    (_args, ctx) => {
        const now = ctx.io.now();
        const { maxAgeHours } = ctx.config.values.metadata;

        // Looking must not create anything, so a database that is not there is not opened.
        let schemaVersion: number | null = null;
        let saltmeta;
        let collections;
        if (existsSync(ctx.paths.database)) {
            const store = ctx.store();
            schemaVersion = store.migration.to;
            ({ saltmeta, collections } = store.read(() => ({
                saltmeta: readMetaState(store, "saltmeta"),
                collections: readMetaState(store, "lxns-collections"),
            })));
        }

        const catalog = sourceStatus("saltmeta", saltmeta, now, maxAgeHours);
        const lists = sourceStatus("lxns-collections", collections, now, maxAgeHours);
        const dataAsOf: Record<string, string> = {};
        if (saltmeta) dataAsOf.catalog = formatLocalTime(new Date(saltmeta.fetchedAt));
        if (collections) dataAsOf.collections = formatLocalTime(new Date(collections.fetchedAt));

        return {
            data: {
                version: ctx.version,
                home: ctx.paths.home,
                database: { exists: schemaVersion !== null, schemaVersion },
                metadata: { maxAgeHours, catalog, collections: lists },
                mergedDuplicates: mergedDuplicatesOf(saltmeta),
            },
            meta: { dataAsOf },
        };
    }
);
