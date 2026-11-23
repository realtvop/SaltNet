import type { User } from "@core/user/type";
import type { CredentialsFile, UserCredentials } from "../runtime/credentials";
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
import {
    readCredentials,
    stageCredentials,
    updateCredentials,
    withCredentialsLock,
} from "../runtime/credentials";
import { postQrGameApi } from "../sync/ingame";
import { assertNoSync } from "../sync/lock";
import { confirmIdentityChange, writeBinding } from "../users/bindIdentity";
import { completeLxnsBind, confirmLxnsBind, startLxnsBind } from "../users/lxnsBind";
import { listUsers, readUser, readUserCounts, saveUser } from "../users/repository";
import { userDetail } from "../users/view";
import { CONFIRM_OPTIONS } from "./confirm";
import { defineCommand } from "./registry";

const USER_POSITIONAL = {
    name: "user",
    valueName: "用户",
    description: "用户序号（从 0 开始）、uid 或显示名",
} as const;

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

function bindLocal(
    ctx: CommandContext,
    store: Store,
    uid: string,
    binding: LocalBinding,
    given: string | undefined
) {
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

        if (changed) assertNoSync(store, uid, () => ctx.io.now().getTime());
        const reset = confirmIdentityChange(store, uid, current, next, binding.source, given);
        if (reset) credentials ??= readCredentials(ctx.paths);
        return { user: next, changed, reset, credentials: reset ? credentials : undefined };
    }

    // Reject a preview before acquiring the credential lock. Check it again in the write
    // transaction because user edits, reorders, and sync may commit before we get that lock.
    store.transaction(prepare);
    return withCredentialsLock(store, () =>
        writeBinding(ctx.paths, store, uid, binding.source, prepare)
    );
}

export const userBind = defineCommand(
    {
        name: "user bind",
        summary: "绑定舞萌账号、水鱼或落雪数据源",
        description:
            "为指定用户绑定数据来源：ingame（--id <8位数字> 或 --qr -）、df-token（- 从 stdin 读取）、df-name（用户名），或 lxns（先生成授权链接，再用 --callback - 从 stdin 读取回调链接）。换人时预览将清除的数据，经用户同意后运行 error.fix。二维码预览的确认命令改用 --id；落雪确认只需 lxns --yes <确认码>。绑定水鱼 Import-Token 会先联网拉取成绩校验。",
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
            given === undefined ? undefined : rows.find(row => row.uid === args.positionals.user);
        const target = byUid ?? resolveUser(rows, args.positionals.user);

        if (source === "lxns") {
            if (args.positionals.value !== undefined) {
                throw usageError(
                    "lxns 来源不需要值参数；请通过 --callback - 从 stdin 读取回调链接"
                );
            }
            if (args.options.callback === undefined) {
                if (given !== undefined) {
                    return { data: await confirmLxnsBind(ctx, store, target.uid, given) };
                }
                return { data: await startLxnsBind(ctx, store, target.uid) };
            }
            if (args.global.offline) {
                throw usageError("离线模式下无法完成落雪授权");
            }
            return {
                data: await completeLxnsBind(ctx, store, target, await ctx.io.readStdin(), given),
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
                    data: await bindLocal(
                        ctx,
                        store,
                        target.uid,
                        { source, id: Number(rawId) },
                        given
                    ),
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
            return { data: await bindLocal(ctx, store, target.uid, { source, id }, given) };
        }

        if (source === "df-name") {
            if (args.positionals.value === undefined) {
                throw usageError("user bind <用户> df-name <用户名> 需要提供水鱼用户名");
            }
            const name = args.positionals.value.trim();
            if (!name) {
                throw usageError("水鱼用户名不能为空或只有空白");
            }
            return { data: await bindLocal(ctx, store, target.uid, { source, name }, given) };
        }

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

        try {
            await fetchDivingFishRecords(token, {
                fetch: ctx.http({ retry: true }),
            });
        } catch (error) {
            if (error instanceof DivingFishError) {
                if (error.status === 400 || error.status === 401 || error.status === 403) {
                    throw new CliError(
                        "USAGE",
                        `水鱼数据拒绝了这个 Import-Token（${error.message}）`,
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
                throw error;
            }
            throw new CliError(
                "NETWORK",
                error instanceof Error ? error.message : "连接水鱼数据失败",
                { retryable: true, cause: error }
            );
        }

        return withCredentialsLock(store, () => {
            const freshUser = readUser(store, target.uid);
            if (!freshUser) {
                throw new CliError("NOT_FOUND", `找不到用户「${target.displayName}」`);
            }
            const targetUid = freshUser.uid!;

            const nextUser = {
                ...freshUser,
                divingFish: {
                    ...freshUser.divingFish,
                    name: null,
                    importToken: null,
                },
            };
            // No identity check: a token bind keeps both ids and clears the name, so
            // hasStrongIdentityChanged can never be true here.
            const currentCredentials = readCredentials(ctx.paths);
            const currentToken = currentCredentials.users[targetUid]?.divingFishImportToken;
            const tokenChanged = currentToken !== token;
            const userChanged =
                freshUser.divingFish?.name !== null || freshUser.divingFish?.importToken !== null;
            const changed = tokenChanged || userChanged;

            if (changed) {
                const nextUsers: Record<string, UserCredentials> = {
                    ...currentCredentials.users,
                };
                nextUsers[targetUid] = {
                    ...nextUsers[targetUid],
                    divingFishImportToken: token,
                };
                const nextCredentials: CredentialsFile = {
                    ...currentCredentials,
                    users: nextUsers,
                };
                const staged = stageCredentials(ctx.paths, nextCredentials);
                let userSaved = false;
                try {
                    store.transaction(() => {
                        assertNoSync(store, targetUid, () => ctx.io.now().getTime());
                        saveUser(store, nextUser);
                    });
                    userSaved = true;
                } catch (error) {
                    staged.discard();
                    throw error;
                }

                try {
                    staged.commit();
                } catch (error) {
                    if (userSaved) {
                        const reason = error instanceof Error ? `（${error.message}）` : "";
                        throw new CliError(
                            "INTERNAL",
                            `用户已绑定，但凭据文件未能保存${reason}；请修复文件权限后重新绑定`,
                            { cause: error }
                        );
                    }
                    staged.discard();
                    throw error;
                }
            }

            const updatedRow = listUsers(store).find(u => u.uid === targetUid);
            if (!updatedRow) throw new Error("bound user disappeared");
            return {
                data: {
                    ...userDetail(updatedRow, readUserCounts(store, targetUid)),
                    source,
                    changed,
                },
            };
        });
    }
);

export const userUnbind = defineCommand(
    {
        name: "user unbind",
        summary: "解绑舞萌账号、水鱼或落雪数据源",
        description:
            "解除指定用户的绑定并清除对应凭据：ingame、df-token、df-name 或 lxns。只改动本地数据，不需要联网或确认。若原本未绑定该来源则成功且 changed 为 false。",
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
        const targetUid = target.uid;

        if (source === "df-token") {
            // The stored user never holds the token (src/users refuses one), so only
            // credentials.json changes, and nothing is written when no token is bound.
            let changed = false;
            if (readCredentials(ctx.paths).users[targetUid]?.divingFishImportToken !== undefined) {
                store.transaction(() => {
                    assertNoSync(store, targetUid, () => ctx.io.now().getTime());
                });
                await updateCredentials(ctx.paths, store, current => {
                    const entry = current.users[targetUid];
                    if (entry?.divingFishImportToken === undefined) return current;
                    changed = true;
                    const nextEntry = { ...entry };
                    delete nextEntry.divingFishImportToken;
                    return { ...current, users: { ...current.users, [targetUid]: nextEntry } };
                });
            }
            const updatedRow = listUsers(store).find(u => u.uid === targetUid) ?? target;
            return {
                data: {
                    ...userDetail(updatedRow, readUserCounts(store, targetUid)),
                    source,
                    changed,
                },
            };
        }

        return withCredentialsLock(store, () => {
            const freshUser = readUser(store, targetUid);
            if (!freshUser) {
                throw new CliError("NOT_FOUND", `找不到用户「${target.displayName}」`);
            }

            let nextUser: User = freshUser;
            let changed = false;

            if (source === "ingame") {
                const inGame = freshUser.inGame;
                changed = Boolean(
                    inGame &&
                    (inGame.id !== null || inGame.name !== null || inGame.enabled !== false)
                );
                if (changed) {
                    nextUser = {
                        ...freshUser,
                        inGame: {
                            ...inGame,
                            name: null,
                            id: null,
                            enabled: false,
                        },
                    };
                    store.transaction(() => {
                        assertNoSync(store, targetUid, () => ctx.io.now().getTime());
                        saveUser(store, nextUser);
                    });
                }
            } else if (source === "df-name") {
                changed =
                    freshUser.divingFish?.name !== null && freshUser.divingFish?.name !== undefined;
                if (changed) {
                    nextUser = {
                        ...freshUser,
                        divingFish: {
                            ...freshUser.divingFish,
                            name: null,
                        },
                    };
                    store.transaction(() => {
                        assertNoSync(store, targetUid, () => ctx.io.now().getTime());
                        saveUser(store, nextUser);
                    });
                }
            } else if (source === "lxns") {
                const currentCreds = readCredentials(ctx.paths);
                const userCreds = currentCreds.users[targetUid];
                const hasLxnsCreds =
                    userCreds?.lxnsAuthorization !== undefined ||
                    userCreds?.lxnsAccountId !== undefined ||
                    userCreds?.lxnsIssuedAt !== undefined;
                const lxns = freshUser.lxns;
                const hasLxnsDb = Boolean(
                    lxns && (lxns.auth !== null || lxns.name !== null || lxns.id !== null)
                );
                changed = hasLxnsCreds || hasLxnsDb;

                if (changed) {
                    nextUser = {
                        ...freshUser,
                        lxns: { auth: null, name: null, id: null },
                    };

                    if (hasLxnsCreds) {
                        const nextUsers: Record<string, UserCredentials> = {
                            ...currentCreds.users,
                        };
                        if (nextUsers[targetUid]) {
                            const credsCopy = {
                                ...nextUsers[targetUid],
                            };
                            delete credsCopy.lxnsAuthorization;
                            delete credsCopy.lxnsAccountId;
                            delete credsCopy.lxnsIssuedAt;
                            nextUsers[targetUid] = credsCopy;
                        }
                        const staged = stageCredentials(ctx.paths, {
                            ...currentCreds,
                            users: nextUsers,
                        });
                        let userSaved = false;
                        try {
                            store.transaction(() => {
                                assertNoSync(store, targetUid, () => ctx.io.now().getTime());
                                saveUser(store, nextUser);
                            });
                            userSaved = true;
                        } catch (error) {
                            staged.discard();
                            throw error;
                        }

                        try {
                            staged.commit();
                        } catch (error) {
                            if (userSaved) {
                                const reason = error instanceof Error ? `（${error.message}）` : "";
                                throw new CliError(
                                    "INTERNAL",
                                    `落雪凭据未能清理${reason}；残留凭据将在下次改动凭据文件时自动清理`,
                                    { cause: error }
                                );
                            }
                            staged.discard();
                            throw error;
                        }
                    } else {
                        store.transaction(() => {
                            assertNoSync(store, targetUid, () => ctx.io.now().getTime());
                            saveUser(store, nextUser);
                        });
                    }
                }
            }

            const updatedRow = listUsers(store).find(u => u.uid === targetUid);
            if (!updatedRow) throw new Error("unbound user disappeared");
            return {
                data: {
                    ...userDetail(updatedRow, readUserCounts(store, targetUid)),
                    source,
                    changed,
                },
            };
        });
    }
);
