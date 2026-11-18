/**
 * Applies a sync update to a stored user the way the web app does (design 5.1: a sync replaces the
 * scores).
 */
import type { SyncUpdate } from "@core/sync/type";
import type { ScoreHistoryCandidate, ScoreHistorySource } from "@core/user/scoreHistory/type";
import type { User } from "@core/user/type";
import { applySyncUpdate } from "@core/sync/apply";
import { userForCoreScores } from "../users/rows";

export interface StoredSyncResult {
    /** The user to store: what the web app would keep after this update. */
    readonly user: User;
    readonly candidates: ScoreHistoryCandidate[];
    readonly observedAt: number;
    readonly source: ScoreHistorySource;
}

/**
 * Core applies the update to `userForCoreScores` of the user, a copy without the raw records and
 * rating history entries it cannot read. The web app applies it to the user as stored, so each part
 * of `data` the update does not replace is taken back from the stored user as it was: `detailed` and
 * `b50` are replaced only when the update has them (the public B50 has no `detailed`), and the rating
 * history changes only when the update brings a finite rating (`appendRatingHistory`). `raw` itself
 * is not changed.
 */
export function applySyncToStoredUser(
    raw: User,
    update: SyncUpdate,
    now: () => number
): StoredSyncResult {
    const working = userForCoreScores(structuredClone(raw));
    const result = applySyncUpdate(working, update, now);

    const rawData = { ...(raw.data as unknown as Record<string, unknown> | undefined) };
    const data = { ...(working.data as unknown as Record<string, unknown>) };
    // When the stored user lacks the key, so does the working copy: core adds none of these
    // three unless the update has it.
    const keepStored = (key: string) => {
        if (Object.hasOwn(rawData, key)) data[key] = rawData[key];
    };
    if (!Object.hasOwn(update, "detailed")) keepStored("detailed");
    if (!Object.hasOwn(update, "b50")) keepStored("b50");
    if (typeof update.rating !== "number" || !Number.isFinite(update.rating)) {
        keepStored("ratingHistory");
    }

    return { ...result, user: { ...working, data: data as unknown as User["data"] } };
}
