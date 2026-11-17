import type { ScoreHistoryCandidate, ScoreHistorySource } from "../user/scoreHistory/type";
import type { User } from "../user/type";
import type { SyncUpdate } from "./type";
import { appendRatingHistory } from "../user/ratingHistory";
import {
    createScoreHistoryCandidates,
    getExistingScoreData,
} from "../user/scoreHistory/candidates";

export function applySyncUpdate(
    user: User,
    update: SyncUpdate,
    now: () => number = Date.now
): { observedAt: number; candidates: ScoreHistoryCandidate[]; source: ScoreHistorySource } {
    const {
        lxns,
        scoreHistorySource,
        userId,
        ...nextData
    }: {
        lxns?: User["lxns"];
        scoreHistorySource: ScoreHistorySource;
        userId?: number | null;
        [key: string]: unknown;
    } = update as unknown as {
        lxns?: User["lxns"];
        scoreHistorySource: ScoreHistorySource;
        userId?: number | null;
        [key: string]: unknown;
    };
    const existing = getExistingScoreData(user.data.detailed, user.data.b50);
    const incomingDetailed = nextData.detailed
        ? Object.values(nextData.detailed as NonNullable<User["data"]["detailed"]>)
        : [];
    const incomingB50 = nextData.b50
        ? [
              ...(nextData.b50 as NonNullable<User["data"]["b50"]>).sd,
              ...(nextData.b50 as NonNullable<User["data"]["b50"]>).dx,
          ]
        : [];
    const incoming = [...incomingDetailed, ...incomingB50];
    const observedAt = typeof nextData.updateTime === "number" ? nextData.updateTime : now();
    const candidates = createScoreHistoryCandidates(existing, incoming, observedAt);
    appendRatingHistory(user, nextData.rating, observedAt);

    user.data = {
        ...user.data,
        ...(nextData as Partial<User["data"]>),
        ...(userId !== undefined ? { userId } : {}),
    };
    if (lxns) {
        user.lxns = { ...user.lxns, ...lxns };
    }
    if (userId) {
        user.inGame.id = userId;
    }
    if (
        user.inGame.id &&
        typeof user.inGame.id === "number" &&
        user.inGame.id.toString().length === 8
    ) {
        user.inGame.name = (update as { name?: string }).name;
    }

    return {
        observedAt,
        candidates,
        source: scoreHistorySource,
    };
}
