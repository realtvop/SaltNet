import type { RatingHistoryEntry, User } from "./type";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendRatingHistory, normalizeRatingHistory } from "./ratingHistory";

function makeUser(data: Partial<User["data"]>): User {
    return {
        divingFish: { name: null },
        inGame: { id: null },
        settings: { manuallyUpdate: false },
        data: { updateTime: null, name: null, rating: null, ...data },
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe("normalizeRatingHistory", () => {
    it("keeps valid entries only, copies them and sorts them oldest first", () => {
        const history = [
            { time: 3000, rating: 15000 },
            { time: Number.NaN, rating: 15100 },
            { time: 1000, rating: 14800 },
            { time: 2000, rating: Number.POSITIVE_INFINITY },
            { time: "4000", rating: 15200 },
            { time: 2000, rating: 14900, extra: true },
        ] as unknown as RatingHistoryEntry[];
        const user = makeUser({ rating: 16000, updateTime: 9000, ratingHistory: history });

        expect(normalizeRatingHistory(user)).toEqual([
            { time: 1000, rating: 14800 },
            { time: 2000, rating: 14900 },
            { time: 3000, rating: 15000 },
        ]);
        expect(user.data.ratingHistory?.[0]).toEqual({ time: 3000, rating: 15000 });
    });

    it("makes one entry from the current rating at the update time when no entry is valid", () => {
        const now = vi.fn(() => 5000);
        const user = makeUser({
            rating: 15500,
            updateTime: 4000,
            ratingHistory: [{ time: Number.NaN, rating: 1 }],
        });

        expect(normalizeRatingHistory(user, now)).toEqual([{ time: 4000, rating: 15500 }]);
        expect(now).not.toHaveBeenCalled();
    });

    it("times that entry with the given clock when the update time is unknown", () => {
        expect(normalizeRatingHistory(makeUser({ rating: 15500 }), () => 5000)).toEqual([
            { time: 5000, rating: 15500 },
        ]);
        expect(
            normalizeRatingHistory(makeUser({ rating: 15500, updateTime: Number.NaN }), () => 6000)
        ).toEqual([{ time: 6000, rating: 15500 }]);
    });

    it("uses the system clock by default", () => {
        vi.useFakeTimers();
        vi.setSystemTime(7000);
        expect(normalizeRatingHistory(makeUser({ rating: 15500 }))).toEqual([
            { time: 7000, rating: 15500 },
        ]);
    });

    it("returns nothing without a valid entry or a current rating", () => {
        expect(normalizeRatingHistory(makeUser({}), () => 5000)).toEqual([]);
        expect(
            normalizeRatingHistory(makeUser({ ratingHistory: "broken" as never }), () => 5000)
        ).toEqual([]);
    });
});

describe("appendRatingHistory", () => {
    it("appends a changed rating and keeps an unchanged one as it is", () => {
        const user = makeUser({ rating: 15000, ratingHistory: [{ time: 1000, rating: 15000 }] });

        appendRatingHistory(user, 15000, 2000);
        expect(user.data.ratingHistory).toEqual([{ time: 1000, rating: 15000 }]);

        appendRatingHistory(user, 15100, 3000);
        expect(user.data.ratingHistory).toEqual([
            { time: 1000, rating: 15000 },
            { time: 3000, rating: 15100 },
        ]);

        appendRatingHistory(user, Number.NaN, 4000);
        expect(user.data.ratingHistory).toHaveLength(2);
    });
});
