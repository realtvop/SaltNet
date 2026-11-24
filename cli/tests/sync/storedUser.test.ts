import type { SyncUpdate } from "@core/sync/type";
import type { User } from "@core/user/type";
import { applySyncUpdate } from "@core/sync/apply";
import { describe, expect, it } from "vitest";
import { applySyncToStoredUser } from "../../src/sync/storedUser";
import { allFixtureRecords, recordOf, user } from "../scoreUsers";

const NOW = 1_800_000_000_000;
const now = () => NOW;

const { charts } = allFixtureRecords();
const [chartA, chartB, chartC] = charts;
const keyA = `${chartA.music.id}-${chartA.info.grade}`;
const keyB = `${chartB.music.id}-${chartB.info.grade}`;
const keyC = `${chartC.music.id}-${chartC.info.grade}`;
const recA = recordOf(chartA, 0);
const recB = recordOf(chartB, 1);
const improvedA = { ...recA, achievements: 100.5 };
/** Core calls `toUpperCase` on `type`, so it cannot read this record. */
const unreadable = { ...recordOf(chartC, 2), type: null } as unknown as typeof recA;

const fullUpdate: SyncUpdate = {
    rating: 14100,
    name: "ＮＥＷ",
    b50: { sd: [improvedA], dx: [] },
    updateTime: NOW - 1000,
    scoreHistorySource: "lxns",
    detailed: { [keyA]: improvedA },
};
/** The public B50 of Diving Fish: no `detailed`. */
const publicUpdate: SyncUpdate = {
    rating: 14100,
    name: "ＮＥＷ",
    b50: { sd: [improvedA], dx: [] },
    updateTime: NOW - 1000,
    scoreHistorySource: "divingFishPublic",
};

function storedUser(data: Record<string, unknown>): User {
    const made = user("u0", "ＯＬＤ", { rating: 14000, updateTime: 1000, ...data });
    made.inGame = { id: 12345678, name: "ＯＬＤ", enabled: true, useFastUpdate: false };
    return made;
}

/** What the web app stores: core applied to the user as stored. */
function webResult(raw: User, update: SyncUpdate) {
    const copy = structuredClone(raw);
    const result = applySyncUpdate(copy, update, now);
    return { ...result, user: copy };
}

describe("applySyncToStoredUser", () => {
    it("gives a user the web app wrote exactly what the web app stores", () => {
        const raw = storedUser({
            detailed: { [keyA]: recA, [keyB]: recB },
            b50: { sd: [recA], dx: [recB] },
            ratingHistory: [{ time: 1000, rating: 14000 }],
        });
        for (const update of [fullUpdate, publicUpdate]) {
            expect(applySyncToStoredUser(raw, update, now)).toEqual(webResult(raw, update));
        }
    });

    it("replaces the stored records when the update has them, also those core cannot read", () => {
        const raw = storedUser({ detailed: { [keyA]: recA, [keyB]: recB, [keyC]: unreadable } });
        const result = applySyncToStoredUser(raw, fullUpdate, now);
        expect(result.user.data.detailed).toEqual({ [keyA]: improvedA });
        expect(result.candidates.map(candidate => candidate.chartKey)).toEqual([keyA]);
    });

    it("keeps every stored record when the update has none (the public B50)", () => {
        const detailed = { [keyA]: recA, [keyC]: unreadable };
        const raw = storedUser({ detailed, b50: { sd: [recA, unreadable], dx: [] } });
        const result = applySyncToStoredUser(raw, publicUpdate, now);
        expect(result.user.data.detailed).toEqual(detailed);
        expect(result.user.data.b50).toEqual(publicUpdate.b50);
    });

    it("keeps the stored B50, readable or not, when the update has none", () => {
        const b50 = { sd: [recA, unreadable], dx: [recB] };
        const raw = storedUser({ detailed: { [keyA]: recA }, b50 });
        const { b50: _dropped, ...withoutB50 } = fullUpdate;
        const result = applySyncToStoredUser(raw, withoutB50 as SyncUpdate, now);
        expect(result.user.data.b50).toEqual(b50);
        expect(result.user.data.detailed).toEqual({ [keyA]: improvedA });
    });

    it("changes the rating history only when the update brings a finite rating", () => {
        const history = [{ time: 1000, rating: 14000 }, "not an entry"];
        const raw = storedUser({ ratingHistory: history });

        const noRating = applySyncToStoredUser(raw, { ...fullUpdate, rating: Number.NaN }, now);
        expect(noRating.user.data.ratingHistory).toEqual(history);

        const rated = applySyncToStoredUser(raw, fullUpdate, now);
        expect(rated.user.data.ratingHistory).toEqual([
            { time: 1000, rating: 14000 },
            { time: fullUpdate.updateTime, rating: 14100 },
        ]);
    });

    it("leaves a stored user without those parts without them", () => {
        const raw = storedUser({});
        const result = applySyncToStoredUser(
            raw,
            { ...publicUpdate, rating: Number.NaN } as SyncUpdate,
            now
        );
        expect(Object.hasOwn(result.user.data, "detailed")).toBe(false);
        expect(Object.hasOwn(result.user.data, "ratingHistory")).toBe(false);
    });

    it("does not change the user it is given", () => {
        const raw = storedUser({ detailed: { [keyA]: recA, [keyC]: unreadable } });
        const before = structuredClone(raw);
        const result = applySyncToStoredUser(raw, fullUpdate, now);
        expect(raw).toEqual(before);
        expect(result.user.inGame.name).toBe("ＮＥＷ");
    });
});
