import type { LXNSOAuthCallback, LXNSOAuthToken } from "@core/integrations/lxns/oauth";
import type { User } from "@core/user/type";
import type { CommandContext } from "../commands/registry";
import type { CredentialsFile, PendingLxnsAuthorization } from "../runtime/credentials";
import type { Lock } from "../store/locks";
import type { Store } from "../store/store";
import type { SyncLockHandle } from "../sync/lock";
import type { UserListRow } from "./repository";
import { createHash } from "node:crypto";
import {
    assertLXNSOAuthCallbackAddress,
    assertLXNSOAuthCallbackParameters,
    assertLXNSOAuthCallbackSucceeded,
    assertLXNSOAuthTokenUsable,
    createLXNSOAuthAuthorizeUrl,
    exchangeLXNSOAuthCode,
    generateCodeChallenge,
    generateCodeVerifier,
    LXNS_OAUTH_LIFETIME,
    parseLXNSOAuthCallback,
    validateLXNSOAuthTransaction,
} from "@core/integrations/lxns/oauth";
import { applyLXNSAuth, LXNSTokenError } from "@core/integrations/lxns/token";
import { hasStrongIdentityChanged } from "@core/user/scoreHistory/userIdentity";
import { CliError, usageError } from "../errors";
import {
    readCredentials,
    stageCredentials,
    updateCredentials,
    withCredentialsLock,
} from "../runtime/credentials";
import { assertNoSync, withSyncLock } from "../sync/lock";
import { quoteArg } from "../util/shell";
import { formatLocalTime } from "../util/time";
import { listUsers, readUser, readUserCounts, saveUser } from "./repository";
import { userDetail } from "./view";

export interface LxnsBindStart {
    authorizeUrl: string;
    expiresAt: string;
}

function restartBind(uid: string): string {
    const separator = uid.startsWith("-") ? "-- " : "";
    return `saltnet user bind ${separator}${quoteArg(uid)} lxns`;
}

export async function startLxnsBind(
    ctx: CommandContext,
    store: Store,
    uid: string
): Promise<LxnsBindStart> {
    const { baseUrl, clientId, redirectUri } = ctx.config.values.lxns;
    if (!clientId || !redirectUri) {
        throw usageError("落雪授权缺少配置，请设置 lxns.clientId 和 lxns.redirectUri");
    }
    const codeVerifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(codeVerifier);
    const state = generateCodeVerifier();
    const now = () => ctx.io.now().getTime();
    const updated = await updateCredentials(
        ctx.paths,
        store,
        current => {
            store.transaction(() => {
                assertNoSync(store, uid, now);
                if (!readUser(store, uid)) throw new CliError("NOT_FOUND", "找不到要绑定的用户");
            });
            const pending = Object.fromEntries(
                Object.entries(current.pendingLxnsAuthorizations ?? {}).filter(
                    ([, record]) => record.userUid !== uid
                )
            );
            pending[state] = {
                userUid: uid,
                codeVerifier,
                clientId,
                redirectUri,
                baseUrl,
                expiresAt: now() + LXNS_OAUTH_LIFETIME,
            };
            return { ...current, pendingLxnsAuthorizations: pending };
        },
        { pruneNow: now }
    );
    return {
        authorizeUrl: createLXNSOAuthAuthorizeUrl(clientId, redirectUri, challenge, state, {
            config: { lxnsBaseUrl: baseUrl },
        }),
        expiresAt: formatLocalTime(new Date(updated.pendingLxnsAuthorizations![state].expiresAt)),
    };
}

function readCallback(value: string, fix: string): LXNSOAuthCallback {
    try {
        const callback = parseLXNSOAuthCallback(value.trim());
        assertLXNSOAuthCallbackParameters(callback);
        return callback;
    } catch {
        throw usageError("请从 stdin 提供落雪授权完成后的完整回调链接", { fix });
    }
}

function writePending(
    ctx: CommandContext,
    current: CredentialsFile,
    state: string,
    transaction: PendingLxnsAuthorization
): CredentialsFile {
    const updated = {
        ...current,
        pendingLxnsAuthorizations: { ...current.pendingLxnsAuthorizations, [state]: transaction },
    };
    stageCredentials(ctx.paths, updated).commit();
    return updated;
}

async function exchangeCode(
    ctx: CommandContext,
    code: string,
    transaction: PendingLxnsAuthorization,
    restorePending: () => void,
    fix: string
): Promise<LXNSOAuthToken> {
    const http = ctx.http({ retry: false });
    let rejected = false;
    try {
        return await exchangeLXNSOAuthCode(code, transaction, {
            config: { lxnsBaseUrl: transaction.baseUrl ?? ctx.config.values.lxns.baseUrl },
            now: ctx.io.now().getTime(),
            fetch: async (url, init) => {
                const request = { ...init, redirect: "error" as const };
                const response = await http(url, request);
                rejected = !response.ok;
                // Surface network errors from the body before core tries to parse it.
                const text = await response.text();
                return { ...response, json: async () => JSON.parse(text) };
            },
        });
    } catch (error) {
        // An explicit rejection leaves the original pending record. A lost or malformed
        // success response may have consumed the code, so leave the reservation.
        if (rejected || (error instanceof LXNSTokenError && error.oauthError)) restorePending();
        if (error instanceof LXNSTokenError && error.oauthError === "invalid_grant") {
            throw new CliError("LXNS_REAUTH_REQUIRED", "落雪授权码已失效，请重新授权", { fix });
        }
        if (error instanceof CliError && error.code === "NETWORK") {
            throw new CliError("NETWORK", "连接落雪授权服务失败", { fix, retryable: false });
        }
        throw new CliError("UPSTREAM_ERROR", "落雪授权服务未返回有效令牌", { fix });
    }
}

function profileFromToken(
    user: User,
    token: LXNSOAuthToken,
    now: number,
    callbackSecrets: string[],
    fix: string
) {
    const candidate: User = { ...user, lxns: { id: null, name: null, auth: null } };
    try {
        assertLXNSOAuthTokenUsable(token, now);
        applyLXNSAuth(candidate, token.auth, (token.expiresAt - now) / 1000);
    } catch (error) {
        if (error instanceof LXNSTokenError) {
            throw new CliError("LXNS_REAUTH_REQUIRED", "落雪授权已过期，请重新授权", { fix });
        }
        throw new CliError("UPSTREAM_ERROR", "落雪授权令牌无法读取账号资料", { fix });
    }
    const { id, name } = candidate.lxns!;
    const secrets = [...callbackSecrets, token.auth.accessToken, token.auth.refreshToken];
    if (
        typeof id !== "number" ||
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        typeof name !== "string" ||
        secrets.some(secret => secret && name.includes(secret))
    ) {
        throw new CliError("UPSTREAM_ERROR", "落雪授权令牌没有有效的账号资料", { fix });
    }
    return { id, name, auth: null };
}

function assertCredentialLock(lock: Lock, fix: string): void {
    if (!lock.renew()) {
        throw new CliError("DB_LOCKED", "保存落雪授权前凭据锁已失效", { fix, retryable: false });
    }
}

export async function completeLxnsBind(
    ctx: CommandContext,
    store: Store,
    target: UserListRow,
    value: string
) {
    const { uid, displayName } = target;
    const fix = restartBind(uid);
    const callback = readCallback(value, fix);
    const { state, code } = callback;
    const now = () => ctx.io.now().getTime();

    async function finish(sync: SyncLockHandle, lock: Lock) {
        const user = readUser(store, uid);
        if (!user) throw new CliError("NOT_FOUND", "找不到要绑定的用户");
        let current = readCredentials(ctx.paths);
        const transaction = current.pendingLxnsAuthorizations?.[state];
        if (
            !transaction ||
            !validateLXNSOAuthTransaction(transaction, now()) ||
            transaction.userUid !== uid
        ) {
            throw new CliError("LXNS_REAUTH_REQUIRED", "找不到此用户有效的落雪授权记录", { fix });
        }
        try {
            assertLXNSOAuthCallbackAddress(callback, transaction);
        } catch {
            throw usageError("落雪授权回调地址不匹配，请使用完整的回调链接", { fix });
        }
        try {
            assertLXNSOAuthCallbackSucceeded(callback);
        } catch {
            throw new CliError("LXNS_REAUTH_REQUIRED", "落雪授权未成功，请重新授权", {
                fix,
            });
        }

        const codeHash = createHash("sha256").update(code).digest("hex");
        let token = transaction.token;
        let issuedAt = transaction.issuedAt;
        if (transaction.codeHash !== undefined || token) {
            if (transaction.codeHash !== codeHash || !token || !Number.isSafeInteger(issuedAt)) {
                throw new CliError("LXNS_REAUTH_REQUIRED", "这次落雪授权无法继续，请重新授权", {
                    fix,
                });
            }
        } else {
            sync.assertHeld();
            current = writePending(ctx, current, state, { ...transaction, codeHash });
            token = await exchangeCode(
                ctx,
                code,
                transaction,
                () => {
                    assertCredentialLock(lock, fix);
                    writePending(ctx, current, state, transaction);
                },
                fix
            );
            assertCredentialLock(lock, fix);
            issuedAt = now();
            current = writePending(ctx, current, state, {
                ...transaction,
                codeHash,
                token,
                issuedAt,
                expiresAt: issuedAt + LXNS_OAUTH_LIFETIME,
            });
        }

        const lxns = profileFromToken(user, token, now(), [code, transaction.codeVerifier], fix);
        const nextUser = { ...user, lxns };
        if (hasStrongIdentityChanged(user, nextUser)) {
            throw usageError(
                "绑定这个账号会改变玩家身份；若要记录新玩家，请使用 saltnet user add 添加新用户"
            );
        }
        const pending = { ...current.pendingLxnsAuthorizations };
        delete pending[state];
        const staged = stageCredentials(ctx.paths, {
            ...current,
            pendingLxnsAuthorizations: pending,
            users: {
                ...current.users,
                [uid]: {
                    ...current.users[uid],
                    lxnsAuthorization: { ...token.auth, expiresAt: token.expiresAt },
                    lxnsAccountId: lxns.id,
                    lxnsIssuedAt: issuedAt,
                },
            },
        });
        try {
            store.transaction(() => {
                sync.assertHeld();
                saveUser(store, nextUser);
            });
            staged.commit();
        } finally {
            staged.discard();
        }
        const updated = listUsers(store).find(row => row.uid === uid)!;
        return {
            ...userDetail(updated, readUserCounts(store, uid)),
            source: "lxns",
            changed: true,
        };
    }

    // Reserve the credential file across the single-use request and its checkpoint.
    const ttlMs = ctx.config.values.network.timeoutMs + 30_000;
    return withSyncLock(
        store,
        { uid, name: displayName },
        sync => withCredentialsLock(store, lock => finish(sync, lock), { ttlMs }),
        { now }
    );
}
