import type { RatingHistoryEntry, User } from "./type";

/**
 * The user's rating history, valid entries only, oldest first. A user with no valid entry but a
 * current rating gets one entry made from it, timed at the last update or, without one, at `now()`.
 */
export function normalizeRatingHistory(
    user: User,
    now: () => number = () => Date.now()
): RatingHistoryEntry[] {
    const history = Array.isArray(user.data.ratingHistory)
        ? user.data.ratingHistory
              .filter(
                  entry =>
                      typeof entry.time === "number" &&
                      Number.isFinite(entry.time) &&
                      typeof entry.rating === "number" &&
                      Number.isFinite(entry.rating)
              )
              .map(entry => ({
                  time: entry.time,
                  rating: entry.rating,
              }))
        : [];

    if (!history.length && typeof user.data.rating === "number") {
        history.push({
            time:
                typeof user.data.updateTime === "number" && Number.isFinite(user.data.updateTime)
                    ? user.data.updateTime
                    : now(),
            rating: user.data.rating,
        });
    }

    return history.sort((a, b) => a.time - b.time);
}

export function appendRatingHistory(user: User, nextRating: unknown, time?: number | null) {
    if (typeof nextRating !== "number" || !Number.isFinite(nextRating)) return;

    const history = normalizeRatingHistory(user);
    const last = history[history.length - 1];
    if (last?.rating === nextRating) {
        user.data.ratingHistory = history;
        return;
    }

    history.push({
        time: typeof time === "number" && Number.isFinite(time) ? time : Date.now(),
        rating: nextRating,
    });
    user.data.ratingHistory = history;
}
