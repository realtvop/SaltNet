/**
 * Refresh LXNS tokens safely under sync lock (design 5.2, 5.3).
 *
 * Returns an LXNS authorization of this user whose access token is valid for at least another
 * minute, refreshing it first when needed. Every caller (sync, upload, the LXNS bind) holds this
 * user's sync lock, and that lock is what keeps two saltnet processes from using the same refresh
 * token at once: refresh tokens rotate, so the second refresh with the old one would fail with
 * invalid_grant.
 */
import type { LXNSAuth } from "@core/integrations/lxns/type";
import type { User } from "@core/user/type";
import type { CommandContext } from "../commands/registry";
import type { RuntimePaths } from "../runtime/paths";
import type { Store } from "../store/store";
import type { SyncLockHandle } from "./lock";
import { LXNSTokenError, refreshLXNSOAuthToken } from "@core/integrations/lxns/token";
import { getUserDisplayName } from "@core/user/type";
import { CliError } from "../errors";
import { toCoreConfig } from "../runtime/config";
import {
    lxnsAccountIdOf,
    matchingLxnsAuthorization,
    readCredentials,
    updateCredentials,
} from "../runtime/credentials";
import { listUsers } from "../users/repository";
import { quoteArg } from "../util/shell";
import { syncUserRef } from "./sources";

/** Refresh this long before the access token expires, as the web app does. */
export const LXNS_ACCESS_MARGIN_MS = 60_000;

/** Message thrown by `applyLXNSAuth` in `@core/integrations/lxns/token.ts` when token payload id differs. */
const LXNS_IDENTITY_CHANGED_MESSAGE = "LXNS token identity changed unexpectedly";

async function removeUserLxnsAuth(
    paths: RuntimePaths,
    store: Store,
    uid: string,
    expectedAccountId: unknown,
    failedRefreshToken: string,
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
            if (!storedAuth || storedAuth.refreshToken !== failedRefreshToken) {
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

export async function lxnsAccessToken(
    ctx: Pick<CommandContext, "paths" | "config" | "http" | "log" | "io">,
    store: Store,
    handle: SyncLockHandle,
    user: User
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
    const userRef = targetUserRow ? syncUserRef(targetUserRow) : quoteArg(uid);

    // 2. Read credentials.json now, while the lock is held, never from an earlier read.
    const credentials = readCredentials(ctx.paths);

    // 3. Take the authorization only under the account rule.
    const expectedAccountId = lxnsAccountIdOf(user);
    const entry = credentials.users[uid];
    const initialAuth = matchingLxnsAuthorization(entry, expectedAccountId) as LXNSAuth | undefined;
    if (!initialAuth) {
        throw new CliError("NOT_BOUND", `用户 ${getUserDisplayName(user)} 尚未绑定落雪账号`, {
            fix: `saltnet user bind ${userRef} lxns`,
        });
    }

    let currentAuth = initialAuth;
    let retried = false;

    while (true) {
        // 4. expiresAt a finite number more than LXNS_ACCESS_MARGIN_MS after now() and an access token present.
        const nowMs = ctx.io.now().getTime();
        if (
            typeof currentAuth.expiresAt === "number" &&
            Number.isFinite(currentAuth.expiresAt) &&
            currentAuth.expiresAt - nowMs > LXNS_ACCESS_MARGIN_MS &&
            typeof currentAuth.accessToken === "string" &&
            currentAuth.accessToken.length > 0
        ) {
            return currentAuth;
        }

        // 5. No refresh token: LXNS_REAUTH_REQUIRED.
        if (typeof currentAuth.refreshToken !== "string" || currentAuth.refreshToken.length === 0) {
            throw new CliError(
                "LXNS_REAUTH_REQUIRED",
                `用户 ${getUserDisplayName(user)} 的落雪授权缺少刷新令牌，需要重新授权`,
                {
                    fix: `saltnet user bind ${userRef} lxns`,
                }
            );
        }

        // 6. Refresh: assert lock held, deep copy user with stored authorization.
        handle.assertHeld();
        const userCopy = structuredClone(user);
        userCopy.lxns = {
            ...(userCopy.lxns ?? { id: null, name: null }),
            auth: { ...currentAuth },
        };

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

                await removeUserLxnsAuth(
                    ctx.paths,
                    store,
                    uid,
                    expectedAccountId,
                    currentAuth.refreshToken,
                    () => ctx.io.now().getTime()
                );
                throw new CliError(
                    "LXNS_REAUTH_REQUIRED",
                    `用户 ${getUserDisplayName(user)} 的落雪授权已失效或已被撤销，需要重新授权`,
                    {
                        fix: `saltnet user bind ${userRef} lxns`,
                    }
                );
            }

            // 9. The identity error: new token for another account.
            if (error instanceof Error && error.message === LXNS_IDENTITY_CHANGED_MESSAGE) {
                await removeUserLxnsAuth(
                    ctx.paths,
                    store,
                    uid,
                    expectedAccountId,
                    currentAuth.refreshToken,
                    () => ctx.io.now().getTime()
                );
                throw new CliError(
                    "LXNS_REAUTH_REQUIRED",
                    `用户 ${getUserDisplayName(user)} 的落雪授权属于另一个落雪账号，需要重新授权`,
                    {
                        fix: `saltnet user bind ${userRef} lxns`,
                    }
                );
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
        const writeNow = ctx.io.now().getTime();
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
            { now: () => writeNow }
        );

        ctx.log(`已刷新用户 ${getUserDisplayName(user)} 的落雪授权`);
        return newAuth;
    }
}
