/**
 * Refresh LXNS tokens safely under sync lock (design 5.2, 5.3).
 *
 * Returns an LXNS authorization of this user whose access token is valid for at least another
 * minute, checking its account and refreshing it when needed. Every caller holds this
 * user's sync lock, and that lock is what keeps two saltnet processes from using the same refresh
 * token at once: refresh tokens rotate, so the second refresh with the old one would fail with
 * invalid_grant.
 */
import type { LXNSAuth } from "@core/integrations/lxns/type";
import type { User } from "@core/user/type";
import type { CommandContext } from "../commands/registry";
import type { ErrorCode } from "../errors";
import type { RuntimePaths } from "../runtime/paths";
import type { Store } from "../store/store";
import type { SyncLockHandle } from "./lock";
import { LXNSTokenError, refreshLXNSOAuthToken } from "@core/integrations/lxns/token";
import { getUserDisplayName } from "@core/user/type";
import { jwtDecode } from "jwt-decode";
import { CliError } from "../errors";
import { toCoreConfig } from "../runtime/config";
import {
    lxnsAccountIdOf,
    matchingLxnsAuthorization,
    readCredentials,
    updateCredentials,
} from "../runtime/credentials";
import { listUsers } from "../users/repository";
import { userBindCommand, userRefWord, userUidWord } from "../util/printedCommand";

/** Refresh this long before the access token expires, as the web app does. */
export const LXNS_ACCESS_MARGIN_MS = 60_000;

/** Message thrown by `applyLXNSAuth` in `@core/integrations/lxns/token.ts` when token payload id differs. */
const LXNS_IDENTITY_CHANGED_MESSAGE = "LXNS token identity changed unexpectedly";

async function removeUserLxnsAuth(
    paths: RuntimePaths,
    store: Store,
    uid: string,
    expectedAccountId: unknown,
    failedAuth: LXNSAuth,
    now: () => number
): Promise<void> {
    await updateCredentials(
        paths,
        store,
        current => {
            const storedEntry = current.users[uid];
            const storedAuth = matchingLxnsAuthorization(storedEntry, expectedAccountId) as
                | LXNSAuth
                | undefined;
            if (
                !storedAuth ||
                storedAuth.refreshToken !== failedAuth.refreshToken ||
                storedAuth.accessToken !== failedAuth.accessToken
            ) {
                return current;
            }
            const currentEntry = { ...storedEntry };
            delete currentEntry.lxnsAuthorization;
            delete currentEntry.lxnsAccountId;
            delete currentEntry.lxnsIssuedAt;
            return {
                ...current,
                users: {
                    ...current.users,
                    [uid]: currentEntry,
                },
            };
        },
        { now }
    );
}

function hasAccountClaim(accessToken: string, expectedAccountId: number): boolean {
    try {
        return jwtDecode<{ id: unknown }>(accessToken).id === expectedAccountId;
    } catch {
        return false;
    }
}

function reauthError(user: User, userRef: string, reason: string): CliError {
    return new CliError(
        "LXNS_REAUTH_REQUIRED",
        `用户 ${getUserDisplayName(user)} 的落雪授权${reason}，需要重新授权`,
        { fix: userBindCommand(userRef, "lxns") }
    );
}

/** Decide whether we can use the authorization or need to refresh it, without any I/O. */
export function checkLxnsAccess(
    user: User,
    auth: LXNSAuth,
    userRef: string,
    now: number
): "usable" | "refresh" | { error: CliError; discard: boolean } {
    const accountId = lxnsAccountIdOf(user);
    const invalidAccount = () => ({
        error: reauthError(user, userRef, "的账号无法验证"),
        discard: true,
    });
    if (typeof accountId !== "number" || !Number.isSafeInteger(accountId) || accountId <= 0) {
        return invalidAccount();
    }
    if (
        Number.isFinite(auth.expiresAt) &&
        (auth.expiresAt ?? 0) - now > LXNS_ACCESS_MARGIN_MS &&
        typeof auth.accessToken === "string" &&
        auth.accessToken.length > 0
    ) {
        return hasAccountClaim(auth.accessToken, accountId) ? "usable" : invalidAccount();
    }
    return typeof auth.refreshToken === "string" && auth.refreshToken.length > 0
        ? "refresh"
        : { error: reauthError(user, userRef, "缺少刷新令牌"), discard: false };
}

/** A credential-free diagnostic for a refresh we cannot send again. */
export class LxnsRefreshSkippedError extends CliError {
    constructor(code: ErrorCode, fix?: string) {
        super(code, "本次同步已尝试刷新该落雪授权，无法再次刷新", { fix });
    }
}

export function createLxnsAccess(
    ctx: Parameters<typeof lxnsAccessToken>[0],
    store: Store,
    handle: SyncLockHandle,
    user: User,
    attempted: Set<string>
): () => Promise<LXNSAuth> {
    // A failed request may already have consumed the token, so the upload must skip refresh.
    let failure: LxnsRefreshSkippedError | undefined;
    return async () => {
        if (failure) throw failure;
        const before = attempted.size;
        try {
            return await lxnsAccessToken(ctx, store, handle, user, attempted);
        } catch (error) {
            if (attempted.size > before) {
                const code = error instanceof CliError ? error.code : "UPSTREAM_ERROR";
                failure = new LxnsRefreshSkippedError(
                    code,
                    error instanceof CliError && code === "LXNS_REAUTH_REQUIRED"
                        ? error.fix
                        : undefined
                );
            }
            throw error;
        }
    };
}

export async function lxnsAccessToken(
    ctx: Pick<CommandContext, "paths" | "config" | "http" | "log" | "io">,
    store: Store,
    handle: SyncLockHandle,
    user: User,
    attempted = new Set<string>()
): Promise<LXNSAuth> {
    // 1. handle.user.uid must be user.uid (otherwise INTERNAL).
    const uid = user.uid;
    if (!uid || handle.user.uid !== uid) {
        throw new CliError(
            "INTERNAL",
            `同步锁的用户（${handle.user.uid}）与请求的用户（${user.uid ?? "未知"}）不一致`
        );
    }

    const targetUserRow = listUsers(store).find(u => u.uid === uid);
    const userRef = targetUserRow ? userRefWord(targetUserRow) : userUidWord(uid);

    // 2. Read credentials.json now, while the lock is held, never from an earlier read.
    const credentials = readCredentials(ctx.paths);

    // 3. Take the authorization only under the account rule.
    const expectedAccountId = lxnsAccountIdOf(user);
    const entry = credentials.users[uid];
    const initialAuth = matchingLxnsAuthorization(entry, expectedAccountId) as LXNSAuth | undefined;
    if (!initialAuth) {
        throw new CliError("NOT_BOUND", `用户 ${getUserDisplayName(user)} 尚未绑定落雪账号`, {
            fix: userBindCommand(userRef, "lxns"),
        });
    }

    let currentAuth = initialAuth;
    let retried = false;
    const clock = () => ctx.io.now().getTime();
    const requireReauthorization = async (auth: LXNSAuth, reason: string): Promise<never> => {
        await removeUserLxnsAuth(ctx.paths, store, uid, expectedAccountId, auth, clock);
        throw reauthError(user, userRef, reason);
    };

    while (true) {
        const access = checkLxnsAccess(user, currentAuth, userRef, clock());
        if (access === "usable") return currentAuth;
        if (access !== "refresh") {
            if (access.discard) {
                await removeUserLxnsAuth(
                    ctx.paths,
                    store,
                    uid,
                    expectedAccountId,
                    currentAuth,
                    clock
                );
            }
            throw access.error;
        }

        // 6. Refresh: assert lock held, deep copy user with stored authorization.
        handle.assertHeld();
        const userCopy = structuredClone(user);
        userCopy.lxns = {
            ...(userCopy.lxns ?? { id: null, name: null }),
            auth: { ...currentAuth },
        };

        const refreshToken = currentAuth.refreshToken!;
        if (attempted.has(refreshToken)) throw new LxnsRefreshSkippedError("UPSTREAM_ERROR");
        attempted.add(refreshToken);
        let newAuth: LXNSAuth;
        try {
            newAuth = await refreshLXNSOAuthToken(userCopy, {
                config: toCoreConfig(ctx.config.values),
                fetch: ctx.http({ retry: false }),
            });
        } catch (error) {
            // 8. LXNSTokenError with invalid_grant
            if (error instanceof LXNSTokenError && error.oauthError === "invalid_grant") {
                if (!retried) {
                    const freshCreds = readCredentials(ctx.paths);
                    const freshEntry = freshCreds.users[uid];
                    const freshAuth = matchingLxnsAuthorization(freshEntry, expectedAccountId) as
                        | LXNSAuth
                        | undefined;
                    if (
                        freshAuth &&
                        typeof freshAuth.refreshToken === "string" &&
                        freshAuth.refreshToken !== currentAuth.refreshToken
                    ) {
                        retried = true;
                        currentAuth = freshAuth;
                        continue;
                    }
                }

                return requireReauthorization(currentAuth, "已失效或已被撤销");
            }

            // 9. The identity error: new token for another account.
            if (error instanceof Error && error.message === LXNS_IDENTITY_CHANGED_MESSAGE) {
                return requireReauthorization(currentAuth, "属于另一个落雪账号");
            }

            // 10. Any other error
            if (error instanceof CliError) {
                throw error;
            }

            if (error instanceof LXNSTokenError) {
                throw new CliError("UPSTREAM_ERROR", error.message, { cause: error });
            }

            throw error;
        }

        // 7. Success: assert lock held, write credentials atomically first, then log and return.
        handle.assertHeld();
        const writeNow = clock();
        await updateCredentials(
            ctx.paths,
            store,
            current => {
                const storedEntry = current.users[uid];
                const storedAuth = matchingLxnsAuthorization(storedEntry, expectedAccountId) as
                    | LXNSAuth
                    | undefined;
                if (!storedAuth || storedAuth.refreshToken !== currentAuth.refreshToken) {
                    return current;
                }
                const userEntry = { ...storedEntry };
                userEntry.lxnsAuthorization = {
                    accessToken: newAuth.accessToken,
                    refreshToken: newAuth.refreshToken,
                    tokenType: newAuth.tokenType,
                    expiresAt: newAuth.expiresAt,
                };
                userEntry.lxnsAccountId = expectedAccountId;
                userEntry.lxnsIssuedAt = writeNow;
                return {
                    ...current,
                    users: {
                        ...current.users,
                        [uid]: userEntry,
                    },
                };
            },
            { now: clock }
        );

        ctx.log(`已刷新用户 ${getUserDisplayName(user)} 的落雪授权`);
        return newAuth;
    }
}
