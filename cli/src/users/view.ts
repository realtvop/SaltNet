import type { UserCredentials } from "../runtime/credentials";
import type { UserCounts, UserListRow } from "./repository";
import { matchingLxnsAuthorization } from "../runtime/credentials";
import { formatLocalTime } from "../util/time";

export interface UserRow {
    index: number;
    uid: string;
    name: string;
    remark: string | null;
    playerName: string | null;
    rating: number | null;
    scoresUpdatedAt: string | null;
    manualUpdate: boolean;
    inGame: {
        id: number | null;
        name: string | null;
        enabled: boolean;
        fastUpdate: boolean;
    };
    lxns: {
        id: number | null;
        name: string | null;
    } | null;
    divingFish: {
        name: string | null;
    };
}

export interface UserDetail extends UserRow {
    counts: UserCounts;
}

export type ScoresState = "fresh" | "stale" | "missing";

export interface StatusUserRow {
    index: number;
    uid: string;
    name: string;
    scoresUpdatedAt: string | null;
    scoresState: ScoresState;
}

export interface UserCredentialState {
    divingFish: "present" | "missing";
    lxns: "valid" | "expiring" | "expired" | "unknown" | "missing";
    lxnsRefreshExpiresAt: string | null;
}

export interface StatusUserRowWithCredentials extends StatusUserRow {
    credentials: UserCredentialState;
}

export function userCredentialState(
    entry: UserCredentials | undefined,
    lxnsAccountId: unknown,
    now: Date,
    settings: { refreshTokenDays: number; expiringWarnDays: number }
): UserCredentialState {
    const nowMs = now.getTime();
    const divingFish =
        typeof entry?.divingFishImportToken === "string" && entry.divingFishImportToken.length > 0
            ? "present"
            : "missing";

    const auth = matchingLxnsAuthorization(entry, lxnsAccountId);
    if (!auth) {
        return {
            divingFish,
            lxns: "missing",
            lxnsRefreshExpiresAt: null,
        };
    }

    const issuedAt = entry?.lxnsIssuedAt;
    if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt)) {
        return {
            divingFish,
            lxns: "unknown",
            lxnsRefreshExpiresAt: null,
        };
    }

    const refreshLifetimeMs = settings.refreshTokenDays * 24 * 60 * 60 * 1000;
    const expiringWithinMs = settings.expiringWarnDays * 24 * 60 * 60 * 1000;
    const refreshExpiresAt = issuedAt + refreshLifetimeMs;
    const timeLeft = refreshExpiresAt - nowMs;
    const lxns = timeLeft <= 0 ? "expired" : timeLeft < expiringWithinMs ? "expiring" : "valid";

    return {
        divingFish,
        lxns,
        lxnsRefreshExpiresAt: formatLocalTime(new Date(refreshExpiresAt)),
    };
}

export function userRow(user: UserListRow): UserRow {
    return {
        index: user.index,
        uid: user.uid,
        name: user.displayName,
        remark: user.remark,
        playerName: user.dataName,
        rating: user.rating,
        scoresUpdatedAt: user.updatedAt === null ? null : formatLocalTime(new Date(user.updatedAt)),
        manualUpdate: user.manuallyUpdate,
        inGame: {
            id: user.inGameId,
            name: user.inGameName,
            enabled: user.inGameEnabled,
            fastUpdate: user.inGameFastUpdate,
        },
        lxns: user.hasLxns ? { id: user.lxnsId, name: user.lxnsName } : null,
        divingFish: { name: user.divingFishName },
    };
}

export function userDetail(user: UserListRow, counts: UserCounts): UserDetail {
    return { ...userRow(user), counts };
}

export function statusUserRow(
    user: UserListRow,
    now: Date,
    staleDays: number,
    credentials: UserCredentialState
): StatusUserRowWithCredentials {
    const updatedAt = user.updatedAt;
    const scoresState: ScoresState =
        updatedAt === null
            ? "missing"
            : now.getTime() - updatedAt < staleDays * 24 * 60 * 60 * 1000
              ? "fresh"
              : "stale";
    return {
        index: user.index,
        uid: user.uid,
        name: user.displayName,
        scoresUpdatedAt: updatedAt === null ? null : formatLocalTime(new Date(updatedAt)),
        scoresState,
        credentials,
    };
}
