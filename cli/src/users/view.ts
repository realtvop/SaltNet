import type { UserCounts, UserListRow } from "./repository";
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

export function statusUserRow(user: UserListRow, now: Date, staleDays: number): StatusUserRow {
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
    };
}
