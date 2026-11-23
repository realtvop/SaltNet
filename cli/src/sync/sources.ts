/**
 * Source resolution, credentials preparation and expiry checking (design 5.1).
 */
import type { LXNSAuth } from "@core/integrations/lxns/type";
import type { User } from "@core/user/type";
import type { RuntimePaths } from "../runtime/paths";
import type { UserListRow } from "../users/repository";
import type { UserTarget } from "../util/printedCommand";
import type {
    CliSyncSource,
    ResolvedSyncSource,
    SyncPlan,
    SyncResultError,
    SyncUserMeta,
    UploadTarget,
} from "./types";
import { chooseSyncSource } from "@core/sync/sync";
import { getUserDisplayName } from "@core/user/type";
import { CliError, usageError } from "../errors";
import {
    lxnsAccountIdOf,
    matchingLxnsAuthorization,
    readCredentials,
} from "../runtime/credentials";
import { userForCoreScores } from "../users/rows";
import {
    dfNameBindCommand,
    userBindCommand,
    userOptionWords,
    userRefWord,
} from "../util/printedCommand";
import { joinCommandLine } from "../util/shell";
import { LXNS_ACCESS_MARGIN_MS } from "./lxnsToken";

export function usesGame(user: UserListRow, source: CliSyncSource = "auto"): boolean {
    return source === "ingame" || (source === "auto" && user.inGameEnabled);
}

export function assertGameQrSource(isGame: boolean, qr: "-" | undefined): void {
    if (qr && !isGame) throw usageError("--qr - 只能用于舞萌同步");
}

export function syncUserMeta(user: UserListRow): SyncUserMeta {
    return { uid: user.uid, index: user.index, name: user.displayName };
}

export function syncResultError({ code, message, fix }: CliError): SyncResultError {
    return { code, message, ...(fix ? { fix } : {}) };
}

export function plannedMode(source: ResolvedSyncSource, qr: boolean): SyncPlan["mode"] {
    if (source === "ingame") return qr ? "full" : "fast";
    return source === "df-name" ? null : "full";
}

export function syncUploadTargets(
    user: User,
    source: ResolvedSyncSource,
    upload: boolean
): UploadTarget[] {
    if (source !== "ingame" || !upload) return [];
    const targets: UploadTarget[] = [];
    if (user.divingFish.importToken) targets.push("diving-fish");
    if (user.lxns?.auth?.accessToken) targets.push("lxns");
    return targets;
}

export function assertGameId(user: User, target: UserTarget): void {
    if (!user.inGame.id) {
        throw new CliError("QR_REQUIRED", "首次舞萌同步需要二维码", {
            fix: joinCommandLine([
                "saltnet",
                "sync",
                ...userOptionWords(target),
                "--source",
                "ingame",
                "--qr",
                "-",
            ]),
        });
    }
}

/** The deterministic part of lxnsAccessToken, before it makes a refresh request. */
export function assertLxnsRefreshAvailable(user: User, target: UserTarget, now: number): void {
    const auth = user.lxns?.auth;
    if (!auth) return;
    const accessValid =
        typeof auth.expiresAt === "number" &&
        Number.isFinite(auth.expiresAt) &&
        auth.expiresAt - now > LXNS_ACCESS_MARGIN_MS &&
        typeof auth.accessToken === "string" &&
        auth.accessToken.length > 0;
    if (!accessValid && !(typeof auth.refreshToken === "string" && auth.refreshToken.length > 0)) {
        throw new CliError(
            "LXNS_REAUTH_REQUIRED",
            `用户 ${getUserDisplayName(user)} 的落雪授权缺少刷新令牌，需要重新授权`,
            { fix: userBindCommand(userRefWord(target), "lxns") }
        );
    }
}

/**
 * Builds a working copy of the stored user with credentials attached for core.
 * Adheres strictly to the rule that an LXNS authorization is used only for the LXNS
 * account it was issued for (`matchingLxnsAuthorization`).
 * Never mutates the stored user and never exposes tokens.
 */
export function buildUserForCore(storedUser: User, paths: Pick<RuntimePaths, "credentials">): User {
    const creds = readCredentials(paths);
    const uid = storedUser.uid ?? "";
    const entry = creds.users[uid];
    const dfImportToken =
        typeof entry?.divingFishImportToken === "string" ? entry.divingFishImportToken : null;
    const matchedAuth = matchingLxnsAuthorization(entry, lxnsAccountIdOf(storedUser));

    // Core reads only the records it can look up, as in the score commands.
    const readable = userForCoreScores(storedUser);
    return {
        ...readable,
        divingFish: {
            ...storedUser.divingFish,
            importToken: dfImportToken,
        },
        lxns: storedUser.lxns
            ? {
                  ...storedUser.lxns,
                  auth: (matchedAuth as LXNSAuth) ?? null,
              }
            : undefined,
    };
}

/**
 * Finds all other bound and usable sync sources for a user, to suggest in error fixes.
 */
export function getOtherBoundSources(
    userForCore: User,
    excludeSource: ResolvedSyncSource | null
): ResolvedSyncSource[] {
    const others: ResolvedSyncSource[] = [];
    if (userForCore.inGame.enabled && userForCore.inGame.id && excludeSource !== "ingame") {
        others.push("ingame");
    }
    if (userForCore.lxns?.auth && excludeSource !== "lxns") {
        others.push("lxns");
    }
    if (userForCore.divingFish.importToken && excludeSource !== "df-token") {
        others.push("df-token");
    }
    if (userForCore.divingFish.name && excludeSource !== "df-name") {
        others.push("df-name");
    }
    return others;
}

export function formatOtherSourcesFix(
    user: UserTarget,
    otherSources: readonly ResolvedSyncSource[],
    existingFix?: string
): string | undefined {
    if (otherSources.length === 0) return existingFix;
    const commands = otherSources
        .map(source =>
            joinCommandLine(["saltnet", "sync", ...userOptionWords(user), "--source", source])
        )
        .join(" 或 ");
    if (existingFix) {
        return `${existingFix}；或尝试其他已绑定来源：${commands}`;
    }
    return `尝试其他已绑定来源：${commands}`;
}

export function resolveSyncSource(
    userForCore: User,
    target: UserTarget,
    requestedSource: CliSyncSource
): ResolvedSyncSource {
    const userRef = userRefWord(target);
    const displayName = getUserDisplayName(userForCore);

    if (requestedSource === "ingame") {
        return "ingame";
    }

    if (requestedSource === "auto") {
        const picked = chooseSyncSource(userForCore);
        if (picked === "inGame") {
            return "ingame";
        }
        if (picked === "lxns") {
            return "lxns";
        }
        if (picked === "divingFishImportToken") {
            return "df-token";
        }
        if (picked === "divingFishName") {
            return "df-name";
        }
        throw new CliError("NOT_BOUND", `用户 ${displayName} 尚未绑定任何数据源`, {
            fix: `绑定一个数据来源：${[
                userBindCommand(userRef, "ingame", [], ["--qr", "-"]),
                userBindCommand(userRef, "lxns"),
                userBindCommand(userRef, "df-token", ["-"]),
                dfNameBindCommand(userRef),
            ].join(" 或 ")}`,
        });
    }

    if (requestedSource === "lxns") {
        if (!userForCore.lxns?.auth) {
            throw new CliError("NOT_BOUND", `用户 ${displayName} 未绑定落雪账号`, {
                fix: userBindCommand(userRef, "lxns"),
            });
        }
        return "lxns";
    }

    if (requestedSource === "df-token") {
        if (!userForCore.divingFish.importToken) {
            throw new CliError("NOT_BOUND", `用户 ${displayName} 未绑定水鱼 Import-Token`, {
                fix: userBindCommand(userRef, "df-token", ["-"]),
            });
        }
        return "df-token";
    }

    if (requestedSource === "df-name") {
        if (!userForCore.divingFish.name) {
            throw new CliError("NOT_BOUND", `用户 ${displayName} 未绑定水鱼用户名`, {
                fix: dfNameBindCommand(userRef),
            });
        }
        return "df-name";
    }

    throw usageError(`未知的数据源 ${requestedSource}`);
}
