import type { User } from "@core/user/type";
import type { CredentialsFile } from "../runtime/credentials";
import type { Store } from "../store/store";
import type { LxnsBindStart } from "../users/lxnsBind";
import type { UserDetail, UserRow } from "../users/view";
import type { CommandContext } from "./registry";
import { DivingFishError, fetchDivingFishRecords } from "@core/integrations/diving-fish/client";
import { SaltAPIEndpoints } from "@core/integrations/saltnet/client";
import { normalizeQrCodeFromInput } from "@core/sync/qrCode";
import { userCountsSchema, userRowSchema } from "../catalog/schemas";
import { CliError, usageError } from "../errors";
import { anyOf, bool, extend, object, str } from "../output/schema";
import { resolveUser } from "../refs/user";
import { pruneCredentials, readCredentials, withCredentialsLock } from "../runtime/credentials";
import { createHttp } from "../runtime/http";
import { postQrGameApi } from "../sync/ingame";
import { assertNoSync, withSyncLock } from "../sync/lock";
import {
    confirmIdentityChange,
    rejectUnneededConfirmation,
    writeBinding,
} from "../users/bindIdentity";
import { completeLxnsBind, confirmLxnsBind, startLxnsBind } from "../users/lxnsBind";
import { listUsers, readUser } from "../users/repository";
import { CONFIRM_OPTIONS } from "./confirm";
import { USER_POSITIONAL } from "./describe";
import { defineCommand } from "./registry";

const SOURCE_POSITIONAL = {
    name: "source",
    valueName: "来源",
    description: "数据来源：ingame、df-token、df-name 或 lxns",
} as const;

const VALUE_POSITIONAL = {
    name: "value",
    valueName: "值",
    optional: true,
    description: "水鱼 token（写 - 从 stdin 读）或水鱼用户名",
} as const;

const USER_REFERENCE_ERRORS = ["NO_USER", "NOT_FOUND", "AMBIGUOUS_REF", "DB_LOCKED"] as const;

const BIND_SOURCES = ["ingame", "df-token", "df-name", "lxns"] as const;
type BindSource = (typeof BIND_SOURCES)[number];

export interface BoundUser extends UserDetail {
    source: string;
    changed: boolean;
}

interface BindResult extends BoundUser {
    oldUid?: string;
    newUid?: string;
}

const userDetailSchema = extend<UserDetail, UserRow>(
    userRowSchema,
    { counts: userCountsSchema },
    { description: "一个本地用户及其拥有的各类数据行数" }
);

export const boundUserSchema = extend<BoundUser, UserDetail>(
    userDetailSchema,
    {
        source: str("绑定的数据来源：ingame、df-token、df-name 或 lxns"),
        changed: bool("本次操作是否改动了数据；如果原本就是该绑定状态则为 false"),
    },
    { description: "绑定或解绑后的用户行、数据行数、数据来源及是否发生改动" }
);

function assertValidSource(source: string): asserts source is BindSource {
    if (!BIND_SOURCES.includes(source as BindSource)) {
        throw usageError(`未知的数据来源：${source}；可选：ingame、df-token、df-name、lxns`);
    }
}

type LocalBinding = { source: "ingame"; id: number } | { source: "df-name"; name: string };

function withBindingLocks<T>(
    ctx: CommandContext,
    store: Store,
    target: { uid: string; displayName: string },
    work: () => T
) {
    return withSyncLock(
        store,
        { uid: target.uid, name: target.displayName },
        sync =>
            withCredentialsLock(store, () => {
                sync.assertHeld();
                return work();
            }),
        { now: () => ctx.io.now().getTime() }
    );
}

function bindLocal(
    ctx: CommandContext,
    store: Store,
    target: { uid: string; displayName: string },
    binding: LocalBinding,
    given: string | undefined
) {
    const { uid } = target;

    function prepare() {
        const current = readUser(store, uid);
        if (!current) throw new CliError("NOT_FOUND", "找不到要绑定的用户");

        let credentials = binding.source === "df-name" ? readCredentials(ctx.paths) : undefined;
        if (credentials?.users[uid]?.divingFishImportToken !== undefined) {
            throw usageError(
                "当前已绑定水鱼 Import-Token；若要改用用户名绑定，请先运行 saltnet user unbind <user> df-token"
            );
        }
        const next: User = { ...current };
        let changed: boolean;
        if (binding.source === "ingame") {
            next.inGame = { ...current.inGame, id: binding.id, enabled: true };
            changed = current.inGame?.id !== binding.id || current.inGame?.enabled !== true;
        } else {
            next.divingFish = { ...current.divingFish, name: binding.name, importToken: null };
            changed = current.divingFish?.name !== binding.name;
        }

        const reset = confirmIdentityChange(store, uid, current, next, binding.source, given);
        if (reset) credentials ??= readCredentials(ctx.paths);
        return { user: next, changed, reset, credentials: reset ? credentials : undefined };
    }

    // Preview without the credentials lock, then recheck in the transaction that saves.
    store.transaction(() => {
        assertNoSync(store, uid, () => ctx.io.now().getTime());
        prepare();
    });
    return withBindingLocks(ctx, store, target, () =>
        writeBinding(ctx.paths, store, uid, binding.source, prepare)
    );
}

export const userBind = defineCommand(
    {
        name: "user bind",
        summary: "绑定舞萌账号、水鱼或落雪数据源",
        description:
            "为指定用户绑定数据来源：ingame（--id <8位数字> 或 --qr -）、df-token（- 从 stdin 读取）、df-name（用户名），或 lxns（先生成授权链接，再用 --callback - 从 stdin 读取回调链接）。换人时预览将清除的数据，经用户同意后运行 error.fix。二维码预览的确认命令改用 --id；落雪确认使用 user bind <用户> lxns --yes <确认码>。绑定水鱼 Import-Token 会先联网拉取成绩校验。",
        category: "account",
        effect: "local",
        output: "object",
        positionals: [USER_POSITIONAL, SOURCE_POSITIONAL, VALUE_POSITIONAL],
        options: {
            ...CONFIRM_OPTIONS,
            id: {
                kind: "string",
                valueName: "8位数字",
                description: "舞萌 8 位数字游戏 UserID",
            },
            qr: {
                kind: "credential",
                description: "从 stdin 读取二维码扫描结果或链接",
            },
            callback: {
                kind: "credential",
                description: "从 stdin 读取落雪授权回调链接",
            },
        },
        examples: [
            {
                command: "user bind 0 ingame --id 99990001",
                description: "预览更换舞萌账号；用 --qr - 查出 UserID 后也会打印此形式的确认命令",
            },
            {
                command: "user bind 1 df-name example_player",
                description: "预览更换水鱼用户名；确认后运行 error.fix",
            },
            {
                command: "user bind 0 lxns",
                description:
                    "生成落雪授权链接；用 --callback - 提交回调，若预览显示换人则运行 error.fix",
            },
        ],
        errors: [
            "USAGE",
            ...USER_REFERENCE_ERRORS,
            "CONFIRMATION_REQUIRED",
            "QR_INVALID",
            "NETWORK",
            "UPSTREAM_ERROR",
            "LXNS_REAUTH_REQUIRED",
            "SYNC_IN_PROGRESS",
        ],
        dataSchema: anyOf(
            "绑定后的用户，或落雪两步授权的第一步结果",
            extend<BindResult, BoundUser>(
                boundUserSchema,
                {
                    oldUid: str("换人前的本地用户 uid"),
                    newUid: str("换人后的本地用户 uid"),
                },
                { optional: ["oldUid", "newUid"] }
            ),
            object<LxnsBindStart>(
                {
                    authorizeUrl: str("落雪 OAuth 授权链接"),
                    expiresAt: str("本次授权的过期时间，ISO 8601，带本机时区"),
                },
                { description: "用浏览器授权所需的链接和过期时间" }
            )
        ),
    },
    async (args, ctx) => {
        const source = args.positionals.source.trim();
        assertValidSource(source);

        if (source !== "lxns" && args.options.callback !== undefined) {
            throw usageError("选项 --callback 只能用于 lxns 来源");
        }

        if (source !== "ingame") {
            if (args.options.id !== undefined) {
                throw usageError("选项 --id 只能用于 ingame 来源");
            }
            if (args.options.qr !== undefined) {
                throw usageError("选项 --qr 只能用于 ingame 来源");
            }
        }

        // Resolve the user before reading stdin or asking anyone, so a wrong reference costs no QR
        // code and no request; the user is read again by uid under the lock before the write.
        const store = ctx.store();
        const rows = listUsers(store);
        const given = args.options.yes;
        // A printed fix always uses the exact uid, including a digit-only imported uid.
        const byUid =
            given === undefined || args.positionals.user.startsWith("uid:")
                ? undefined
                : rows.find(row => row.uid === args.positionals.user);
        const target = byUid ?? resolveUser(rows, args.positionals.user);

        if (source === "lxns") {
            if (args.positionals.value !== undefined) {
                throw usageError(
                    "lxns 来源不需要值参数；请通过 --callback - 从 stdin 读取回调链接"
                );
            }
            if (args.options.callback === undefined) {
                if (given !== undefined) {
                    return { data: await confirmLxnsBind(ctx, store, target, given) };
                }
                return { data: await startLxnsBind(ctx, store, target.uid) };
            }
            rejectUnneededConfirmation(given);
            if (args.global.offline) {
                throw usageError("离线模式下无法完成落雪授权");
            }
            return {
                data: await completeLxnsBind(ctx, store, target, await ctx.io.readStdin()),
            };
        }

        if (source === "ingame") {
            if (args.positionals.value !== undefined) {
                throw usageError("ingame 来源不需要值参数，请使用 --id 或 --qr");
            }
            const rawId = args.options.id;
            if ((rawId !== undefined) === (args.options.qr !== undefined)) {
                throw usageError(
                    "user bind <用户> ingame 必须且只能指定 --id <8位数字> 或 --qr - 之一"
                );
            }
            if (rawId !== undefined) {
                if (!/^\d{8}$/.test(rawId)) throw usageError("舞萌 UserID 必须是 8 位数字");
                return {
                    data: await bindLocal(ctx, store, target, { source, id: Number(rawId) }, given),
                };
            }
            if (args.global.offline) {
                throw usageError("离线模式下无法通过二维码查找账号");
            }
            store.transaction(() => assertNoSync(store, target.uid, () => ctx.io.now().getTime()));
            const normalized = normalizeQrCodeFromInput(await ctx.io.readStdin());
            if (normalized === null) {
                throw new CliError("QR_INVALID", "二维码内容无效或无法识别");
            }
            const qrData = await postQrGameApi(ctx, SaltAPIEndpoints.GetQRInfo, {
                qrCode: normalized,
            });
            const id = qrData.userID;
            if (
                qrData.errorID !== 0 ||
                typeof id !== "number" ||
                !Number.isSafeInteger(id) ||
                id <= 0 ||
                id > 99_999_999
            ) {
                throw new CliError("UPSTREAM_ERROR", "后端返回的用户 ID 无效");
            }
            return { data: await bindLocal(ctx, store, target, { source, id }, given) };
        }

        if (source === "df-name") {
            if (args.positionals.value === undefined) {
                throw usageError("user bind <用户> df-name <用户名> 需要提供水鱼用户名");
            }
            const name = args.positionals.value.trim();
            if (!name) {
                throw usageError("水鱼用户名不能为空或只有空白");
            }
            return { data: await bindLocal(ctx, store, target, { source, name }, given) };
        }

        rejectUnneededConfirmation(given);
        if (args.positionals.value === undefined) {
            throw usageError("user bind <用户> df-token - 需要写 - 表示从 stdin 读取凭据");
        }
        if (args.positionals.value !== "-") {
            throw usageError("水鱼 Import-Token 只接受 -，表示从 stdin 读取；凭据不能写在命令行里");
        }

        if (args.global.offline) {
            throw usageError("离线模式下无法验证并绑定水鱼 Token");
        }

        const raw = await ctx.io.readStdin();
        const token = raw.trim();
        if (!token) {
            throw usageError("水鱼 Import-Token 不能为空");
        }

        // Import-Tokens can be shorter than either HTTP or the shared client redacts.
        const redact = (message: string) => message.replaceAll(token, "<已隐藏>");
        const { userAgent, timeoutMs } = ctx.config.values.network;
        try {
            await fetchDivingFishRecords(token, {
                fetch: createHttp({
                    fetch: ctx.io.fetch,
                    userAgent,
                    timeoutMs,
                    timeoutKey: "network.timeoutMs",
                    retry: true,
                    log: message => ctx.log(redact(message)),
                }),
            });
        } catch (error) {
            if (error instanceof DivingFishError) {
                if (error.status === 400 || error.status === 401 || error.status === 403) {
                    throw new CliError(
                        "USAGE",
                        `水鱼数据拒绝了这个 Import-Token（${redact(error.message)}）`,
                        {
                            fix: "在水鱼查分器「用户设置」页面重新生成导入 Token 并重试",
                        }
                    );
                }
                throw new CliError("UPSTREAM_ERROR", `水鱼服务返回了 HTTP ${error.status}`, {
                    retryable: error.status >= 500 || error.status === 429,
                    extra: { status: error.status },
                });
            }
            if (error instanceof CliError) {
                throw new CliError(error.code, redact(error.message), {
                    fix: error.fix,
                    retryable: error.retryable,
                    extra: error.extra,
                });
            }
            throw new CliError("NETWORK", "连接水鱼数据失败", { retryable: true });
        }

        const { uid } = target;
        return {
            data: await withBindingLocks(ctx, store, target, () =>
                writeBinding(ctx.paths, store, uid, source, () => {
                    const user = readUser(store, uid);
                    if (!user) throw new CliError("NOT_FOUND", "找不到要绑定的用户");
                    const current = readCredentials(ctx.paths);
                    const entry = current.users[uid];
                    const tokenChanged = entry?.divingFishImportToken !== token;
                    const userChanged =
                        user.divingFish?.name !== null || user.divingFish?.importToken !== null;
                    return {
                        user: {
                            ...user,
                            divingFish: { ...user.divingFish, name: null, importToken: null },
                        },
                        changed: tokenChanged || userChanged,
                        userChanged,
                        reset: false,
                        credentials: tokenChanged
                            ? {
                                  ...current,
                                  users: {
                                      ...current.users,
                                      [uid]: { ...entry, divingFishImportToken: token },
                                  },
                              }
                            : undefined,
                    };
                })
            ),
        };
    }
);

function prepareUnbind(
    ctx: CommandContext,
    store: Store,
    uid: string,
    user: User,
    source: BindSource
) {
    if (source === "ingame") {
        const inGame = user.inGame;
        const changed = Boolean(
            inGame && (inGame.id !== null || inGame.name !== null || inGame.enabled !== false)
        );
        return {
            user: { ...user, inGame: { ...inGame!, name: null, id: null, enabled: false } },
            changed,
            reset: false,
        };
    }
    if (source === "df-name") {
        return {
            user: { ...user, divingFish: { ...user.divingFish, name: null } },
            changed: user.divingFish?.name != null,
            reset: false,
        };
    }

    const current = readCredentials(ctx.paths);
    const users = { ...current.users };
    const entry = { ...users[uid] };
    if (source === "df-token") {
        const changed = entry.divingFishImportToken !== undefined;
        delete entry.divingFishImportToken;
        if (Object.keys(entry).length === 0) delete users[uid];
        const credentials: CredentialsFile = {
            ...current,
            users: Object.keys(entry).length ? { ...users, [uid]: entry } : users,
        };
        return {
            user,
            changed,
            reset: false,
            userChanged: false,
            credentials: changed ? pruneCredentials(credentials, store) : undefined,
        };
    }

    const hasLxnsCredentials =
        entry.lxnsAuthorization !== undefined ||
        entry.lxnsAccountId !== undefined ||
        entry.lxnsIssuedAt !== undefined;
    const pending = current.pendingLxnsAuthorizations;
    const otherPending = Object.entries(pending ?? {}).filter(
        ([, record]) => record.userUid !== uid
    );
    const pendingChanged =
        pending !== undefined && Object.keys(pending).length !== otherPending.length;
    const userChanged = Boolean(
        user.lxns && (user.lxns.auth !== null || user.lxns.name !== null || user.lxns.id !== null)
    );
    const credentialsChanged = hasLxnsCredentials || pendingChanged;
    delete entry.lxnsAuthorization;
    delete entry.lxnsAccountId;
    delete entry.lxnsIssuedAt;
    if (Object.keys(entry).length === 0) delete users[uid];
    const credentials: CredentialsFile = {
        ...current,
        users: Object.keys(entry).length ? { ...users, [uid]: entry } : users,
        ...(pendingChanged ? { pendingLxnsAuthorizations: Object.fromEntries(otherPending) } : {}),
    };
    return {
        user: { ...user, lxns: { auth: null, name: null, id: null } },
        changed: userChanged || credentialsChanged,
        userChanged,
        reset: false,
        credentials: credentialsChanged ? credentials : undefined,
    };
}

export const userUnbind = defineCommand(
    {
        name: "user unbind",
        summary: "解绑舞萌账号、水鱼或落雪数据源",
        description:
            "解除指定用户的绑定并清除对应凭据：ingame、df-token、df-name 或 lxns。只改动本地数据，不需要联网或确认。解除落雪绑定也会取消此用户进行中的落雪授权。没有绑定或授权记录可清除时，changed 为 false。",
        category: "account",
        effect: "local",
        output: "object",
        positionals: [USER_POSITIONAL, SOURCE_POSITIONAL],
        examples: [
            { command: "user unbind 0 ingame", description: "解绑舞萌账号" },
            { command: "user unbind 0 df-token", description: "解绑水鱼 Import-Token" },
            { command: "user unbind 0 df-name", description: "解绑水鱼用户名" },
            { command: "user unbind 0 lxns", description: "解绑落雪账号" },
        ],
        errors: ["USAGE", ...USER_REFERENCE_ERRORS, "SYNC_IN_PROGRESS"],
        dataSchema: boundUserSchema,
    },
    async (args, ctx) => {
        const source = args.positionals.source.trim();
        assertValidSource(source);

        const store = ctx.store();
        const users = listUsers(store);
        const target = resolveUser(users, args.positionals.user);
        const { uid } = target;
        return {
            data: await withBindingLocks(ctx, store, target, () =>
                writeBinding(ctx.paths, store, uid, source, () => {
                    const user = readUser(store, uid);
                    if (!user) throw new CliError("NOT_FOUND", "找不到要解绑的用户");
                    return prepareUnbind(ctx, store, uid, user, source);
                })
            ),
        };
    }
);
