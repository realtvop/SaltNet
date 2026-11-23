import type { Warning } from "../output/warning";
import type {
    StatusUserRow,
    StatusUserRowWithCredentials,
    UserCredentialState,
} from "../users/view";
import { existsSync } from "node:fs";
import { mergedDuplicateSchema, sourceStatusSchema, statusUserRowSchema } from "../catalog/schemas";
import { mergedDuplicatesOf, sourceStatus } from "../catalog/statusView";
import { readMetaState } from "../catalog/store";
import { bool, extend, int, list, nullable, num, object, str, strEnumOf } from "../output/schema";
import { lxnsAccountIdOf, readCredentials } from "../runtime/credentials";
import { listUsers, readUsers } from "../users/repository";
import { statusUserRow, userCredentialState } from "../users/view";
import { userBindCommand, userRefWord } from "../util/printedCommand";
import { formatLocalTime } from "../util/time";
import { defineCommand } from "./registry";

const userCredentialSchema = object<UserCredentialState>(
    {
        divingFish: strEnumOf<UserCredentialState["divingFish"]>(
            {
                present: "已保存非空水鱼导入令牌",
                missing: "未保存水鱼导入令牌",
            },
            "水鱼凭据状态"
        ),
        lxns: strEnumOf<UserCredentialState["lxns"]>(
            {
                valid: "落雪授权有效，刷新令牌充足",
                expiring: "落雪授权即将过期",
                expired: "落雪授权已过期",
                unknown: "落雪授权有效但颁发时间未知",
                missing: "未绑定落雪或无可用授权",
            },
            "落雪授权状态"
        ),
        lxnsRefreshExpiresAt: nullable(
            str("落雪刷新令牌过期时间（本地时区带偏移）；未知或缺失时为 null")
        ),
    },
    { description: "用户凭据状态" }
);

const statusUserItemSchema = extend<StatusUserRowWithCredentials, StatusUserRow>(
    statusUserRowSchema,
    {
        credentials: userCredentialSchema,
    },
    { description: "status 里的一个用户" }
);

export const status = defineCommand(
    {
        name: "status",
        summary: "各项数据的更新时间和本地状态",
        description:
            "汇总本机上 saltnet 的状态，用其他命令之前先看一眼。不联网，也不会创建数据目录：数据库还不存在时，各项元数据都是 missing，users.items 是空数组。结果有 version（saltnet 的版本）、home（数据目录，可以用环境变量 SALTNET_HOME 换）、database（exists 是数据库文件在不在，schemaVersion 是它的结构版本，不在时是 null）、metadata（maxAgeHours 是过期时间，catalog 是曲库、collections 是收藏品落雪的列表；每项有 source、label、state、fetchedAt、ageHours、upstreamVersion 和 counts）、users（scores.staleDays 和每个用户的成绩更新时间、fresh、stale、missing 状态及 credentials 凭据状态）、mergedDuplicates（上游列了两遍、被合并成一首的歌，每首有 id、title 和 mergedTitles）。元数据 state 的 fresh、stale、other-version、missing 分别表示新鲜、过期、由另一个 CLI 版本构建和尚未下载。用户凭据 credentials 包含 divingFish（present 或 missing，是否保存了非空水鱼导入令牌）与 lxns（valid、expiring、expired、unknown 或 missing，落雪授权状态），以及落雪刷新令牌过期时间 lxnsRefreshExpiresAt（本地时区带偏移，未知或无凭据时为 null）。",
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
                users: object(
                    {
                        staleDays: num("成绩多少天没有更新后算 stale（设置 scores.staleDays）"),
                        items: list(statusUserItemSchema, "按当前顺序排列的用户状态"),
                    },
                    { description: "用户成绩的新鲜度" }
                ),
                mergedDuplicates: list(mergedDuplicateSchema, "上游重名合并的曲目列表"),
            },
            { description: "本地数据与缓存状态" }
        ),
    },
    (_args, ctx) => {
        const now = ctx.io.now();
        const { maxAgeHours } = ctx.config.values.metadata;

        const credentialsFile = readCredentials(ctx.paths);

        // Looking must not create anything, so a database that is not there is not opened.
        let schemaVersion: number | null = null;
        let saltmeta;
        let collections;
        let users: ReturnType<typeof listUsers> = [];
        let rawUsers: ReturnType<typeof readUsers> = [];
        if (existsSync(ctx.paths.database)) {
            const store = ctx.store();
            schemaVersion = store.migration.to;
            ({ saltmeta, collections, users, rawUsers } = store.read(() => ({
                saltmeta: readMetaState(store, "saltmeta"),
                collections: readMetaState(store, "lxns-collections"),
                users: listUsers(store),
                rawUsers: readUsers(store),
            })));
        }
        const rawUsersByUid = new Map(rawUsers.map(u => [u.uid, u]));

        const catalog = sourceStatus("saltmeta", saltmeta, now, maxAgeHours);
        const lists = sourceStatus("lxns-collections", collections, now, maxAgeHours);
        const dataAsOf: Record<string, string> = {};
        if (saltmeta) dataAsOf.catalog = formatLocalTime(new Date(saltmeta.fetchedAt));
        if (collections) dataAsOf.collections = formatLocalTime(new Date(collections.fetchedAt));

        const warnings: Warning[] = [];
        const items = users.map(user => {
            const entry = credentialsFile.users[user.uid];
            const rawUser = rawUsersByUid.get(user.uid);
            const credState = userCredentialState(
                entry,
                lxnsAccountIdOf(rawUser),
                now,
                ctx.config.values.lxns
            );
            if (credState.lxns === "expiring" || credState.lxns === "expired") {
                warnings.push({
                    code: "LXNS_EXPIRING",
                    message: `用户 ${user.displayName} 的落雪授权${credState.lxns === "expired" ? "已于" : "将于"} ${credState.lxnsRefreshExpiresAt} 过期`,
                    fix: userBindCommand(userRefWord(user), "lxns"),
                });
            }
            return statusUserRow(user, now, ctx.config.values.scores.staleDays, credState);
        });

        return {
            data: {
                version: ctx.version,
                home: ctx.paths.home,
                database: { exists: schemaVersion !== null, schemaVersion },
                metadata: { maxAgeHours, catalog, collections: lists },
                users: {
                    staleDays: ctx.config.values.scores.staleDays,
                    items,
                },
                mergedDuplicates: mergedDuplicatesOf(saltmeta),
            },
            meta: { dataAsOf },
            warnings,
        };
    }
);
