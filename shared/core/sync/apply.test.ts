import type { DivingFishFullRecord } from "../integrations/diving-fish/type";
import type { User } from "../user/type";
import type { SyncUpdate } from "./type";
import { describe, expect, it } from "vitest";
import { ComboStatus, RankRate, SyncStatus } from "../mai/types";
import { ScoreHistoryChange } from "../user/scoreHistory/type";
import { convertDetailed } from "../user/type";
import { applySyncUpdate } from "./apply";

function createRecord(overrides: Partial<DivingFishFullRecord> = {}): DivingFishFullRecord {
    return {
        achievements: 100.5,
        ds: 13.7,
        dxScore: 2500,
        fc: ComboStatus.FullCombo,
        fs: SyncStatus.FullSync,
        level: "13+",
        level_index: 3,
        level_label: "Master",
        play_count: 10,
        ra: 300,
        rate: RankRate.sssp,
        song_id: 1,
        title: "Test Song",
        type: "DX",
        ...overrides,
    };
}

function createUser(overrides: Partial<User> = {}): User {
    return {
        uid: "test-uid",
        divingFish: { name: null },
        inGame: { id: null },
        settings: { manuallyUpdate: false },
        data: {
            updateTime: null,
            name: null,
            rating: null,
        },
        ...overrides,
    };
}

describe("applySyncUpdate", () => {
    it("handles an in-game result with an 8-digit userId (sets user.data.userId, user.inGame.id and user.inGame.name)", () => {
        const user = createUser({
            inGame: { id: null, name: "old-name" },
        });
        const update: SyncUpdate = {
            userId: 12345678,
            name: "new-player",
            rating: 15000,
            updateTime: 1000,
            scoreHistorySource: "inGame",
            b50: { sd: [], dx: [] },
        };
        const result = applySyncUpdate(user, update);
        expect(result).toEqual({
            observedAt: 1000,
            candidates: [],
            source: "inGame",
        });
        expect(user).toEqual({
            uid: "test-uid",
            divingFish: { name: null },
            inGame: { id: 12345678, name: "new-player" },
            settings: { manuallyUpdate: false },
            data: {
                updateTime: 1000,
                name: "new-player",
                rating: 15000,
                ratingHistory: [{ time: 1000, rating: 15000 }],
                b50: { sd: [], dx: [] },
                userId: 12345678,
            },
        });
    });

    it("handles a 7-digit userId (the name is not set)", () => {
        const user = createUser({
            inGame: { id: 9999999, name: "old-name" },
        });
        const update: SyncUpdate = {
            userId: 1234567,
            name: "new-player",
            rating: 14000,
            updateTime: 2000,
            scoreHistorySource: "inGame",
            b50: { sd: [], dx: [] },
        };
        const result = applySyncUpdate(user, update);
        expect(result).toEqual({
            observedAt: 2000,
            candidates: [],
            source: "inGame",
        });
        expect(user).toEqual({
            uid: "test-uid",
            divingFish: { name: null },
            inGame: { id: 1234567, name: "old-name" },
            settings: { manuallyUpdate: false },
            data: {
                updateTime: 2000,
                name: "new-player",
                rating: 14000,
                ratingHistory: [{ time: 2000, rating: 14000 }],
                b50: { sd: [], dx: [] },
                userId: 1234567,
            },
        });
    });

    it("handles userId: null (written into user.data.userId, user.inGame.id unchanged)", () => {
        const user = createUser({
            inGame: { id: 12345678, name: "existing-name" },
        });
        const update: SyncUpdate = {
            userId: null,
            name: "new-player",
            rating: 14500,
            updateTime: 3000,
            scoreHistorySource: "inGame",
            b50: { sd: [], dx: [] },
        };
        const result = applySyncUpdate(user, update);
        expect(result).toEqual({
            observedAt: 3000,
            candidates: [],
            source: "inGame",
        });
        expect(user).toEqual({
            uid: "test-uid",
            divingFish: { name: null },
            inGame: { id: 12345678, name: "new-player" },
            settings: { manuallyUpdate: false },
            data: {
                updateTime: 3000,
                name: "new-player",
                rating: 14500,
                ratingHistory: [{ time: 3000, rating: 14500 }],
                b50: { sd: [], dx: [] },
                userId: null,
            },
        });
    });

    it("handles a result without userId", () => {
        const user = createUser({
            inGame: { id: 12345678, name: "old-name" },
            data: { updateTime: null, name: null, rating: null },
        });
        const update: SyncUpdate = {
            name: "df-player",
            rating: 14200,
            updateTime: 4000,
            scoreHistorySource: "divingFishPublic",
            b50: { sd: [], dx: [] },
        };
        const result = applySyncUpdate(user, update);
        expect(result).toEqual({
            observedAt: 4000,
            candidates: [],
            source: "divingFishPublic",
        });
        expect(user).toEqual({
            uid: "test-uid",
            divingFish: { name: null },
            inGame: { id: 12345678, name: "df-player" },
            settings: { manuallyUpdate: false },
            data: {
                updateTime: 4000,
                name: "df-player",
                rating: 14200,
                ratingHistory: [{ time: 4000, rating: 14200 }],
                b50: { sd: [], dx: [] },
            },
        });
        expect("userId" in user.data).toBe(false);
    });

    it("merges lxns over the old one, keeping fields the result does not have", () => {
        const user = createUser({
            lxns: {
                auth: {
                    accessToken: "tok",
                    refreshToken: "ref",
                    expiresAt: 99999,
                    tokenType: "Bearer",
                },
                id: 42,
                name: "old-lxns-name",
            },
        });
        const update: SyncUpdate = {
            name: "new-lxns-name",
            rating: 15200,
            updateTime: 5000,
            scoreHistorySource: "lxns",
            b50: { sd: [], dx: [] },
            lxns: {
                name: "new-lxns-name",
            } as User["lxns"],
        };
        const result = applySyncUpdate(user, update);
        expect(result).toEqual({
            observedAt: 5000,
            candidates: [],
            source: "lxns",
        });
        expect(user).toEqual({
            uid: "test-uid",
            divingFish: { name: null },
            inGame: { id: null },
            settings: { manuallyUpdate: false },
            lxns: {
                auth: {
                    accessToken: "tok",
                    refreshToken: "ref",
                    expiresAt: 99999,
                    tokenType: "Bearer",
                },
                id: 42,
                name: "new-lxns-name",
            },
            data: {
                updateTime: 5000,
                name: "new-lxns-name",
                rating: 15200,
                ratingHistory: [{ time: 5000, rating: 15200 }],
                b50: { sd: [], dx: [] },
            },
        });
    });

    it("preserves old user.data.detailed when update has no detailed", () => {
        const oldRecord = createRecord({ song_id: 10, achievements: 98 });
        const oldDetailed = convertDetailed([oldRecord]);
        const user = createUser({
            data: {
                updateTime: 1000,
                name: "player",
                rating: 14000,
                detailed: oldDetailed,
            },
        });
        const update: SyncUpdate = {
            name: "player",
            rating: 14100,
            updateTime: 6000,
            scoreHistorySource: "divingFishPublic",
            b50: { sd: [], dx: [] },
        };
        const result = applySyncUpdate(user, update);
        expect(result).toEqual({
            observedAt: 6000,
            candidates: [],
            source: "divingFishPublic",
        });
        expect(user).toEqual({
            uid: "test-uid",
            divingFish: { name: null },
            inGame: { id: null },
            settings: { manuallyUpdate: false },
            data: {
                updateTime: 6000,
                name: "player",
                rating: 14100,
                ratingHistory: [
                    { time: 1000, rating: 14000 },
                    { time: 6000, rating: 14100 },
                ],
                detailed: oldDetailed,
                b50: { sd: [], dx: [] },
            },
        });
    });

    it("falls back to now() when updateTime is not a number", () => {
        const user = createUser();
        const fakeNow = () => 777777;
        const update = {
            name: "player",
            rating: 14000,
            updateTime: null,
            scoreHistorySource: "inGame",
            b50: { sd: [], dx: [] },
        } as unknown as SyncUpdate;

        const result = applySyncUpdate(user, update, fakeNow);
        expect(result).toEqual({
            observedAt: 777777,
            candidates: [],
            source: "inGame",
        });
        expect(user).toEqual({
            uid: "test-uid",
            divingFish: { name: null },
            inGame: { id: null },
            settings: { manuallyUpdate: false },
            data: {
                updateTime: null,
                name: "player",
                rating: 14000,
                ratingHistory: [{ time: 777777, rating: 14000 }],
                b50: { sd: [], dx: [] },
            },
        });
    });

    it("builds candidates from both detailed and b50 against old scores (new, improved, unchanged)", () => {
        const chartAOld = createRecord({
            song_id: 1,
            type: "DX",
            level_index: 3,
            achievements: 99.0,
            lastChangedAt: 500,
        });
        const chartBOld = createRecord({
            song_id: 2,
            type: "SD",
            level_index: 3,
            achievements: 100.0,
            lastChangedAt: 600,
        });

        const user = createUser({
            data: {
                updateTime: 600,
                name: "player",
                rating: 14000,
                detailed: convertDetailed([chartAOld]),
                b50: { sd: [chartBOld], dx: [] },
            },
        });

        const chartANew = createRecord({
            song_id: 1,
            type: "DX",
            level_index: 3,
            achievements: 100.5,
        });
        const chartBNew = createRecord({
            song_id: 2,
            type: "SD",
            level_index: 3,
            achievements: 100.0,
        });
        const chartCNew = createRecord({
            song_id: 3,
            type: "DX",
            level_index: 3,
            achievements: 98.0,
        });

        const update: SyncUpdate = {
            name: "player",
            rating: 14200,
            updateTime: 1000,
            scoreHistorySource: "inGame",
            detailed: convertDetailed([chartANew]),
            b50: { sd: [chartBNew], dx: [chartCNew] },
        };

        const result = applySyncUpdate(user, update);
        expect(result.observedAt).toBe(1000);
        expect(result.source).toBe("inGame");
        expect(result.candidates).toEqual([
            {
                chartKey: "10001-3",
                observedAt: 1000,
                kind: "change",
                changedMask: ScoreHistoryChange.Achievements,
                before: {
                    achievements: 99.0,
                    dxScore: 2500,
                    fc: ComboStatus.FullCombo,
                    fs: SyncStatus.FullSync,
                    playCount: 10,
                },
                after: {
                    achievements: 100.5,
                    dxScore: 2500,
                    fc: ComboStatus.FullCombo,
                    fs: SyncStatus.FullSync,
                    playCount: 10,
                },
                previousObservedAt: 500,
            },
            {
                chartKey: "10003-3",
                observedAt: 1000,
                kind: "initial",
                changedMask: 0,
                before: null,
                after: {
                    achievements: 98.0,
                    dxScore: 2500,
                    fc: ComboStatus.FullCombo,
                    fs: SyncStatus.FullSync,
                    playCount: 10,
                },
                previousObservedAt: null,
            },
        ]);

        expect(user).toEqual({
            uid: "test-uid",
            divingFish: { name: null },
            inGame: { id: null },
            settings: { manuallyUpdate: false },
            data: {
                updateTime: 1000,
                name: "player",
                rating: 14200,
                ratingHistory: [
                    { time: 600, rating: 14000 },
                    { time: 1000, rating: 14200 },
                ],
                detailed: convertDetailed([chartANew]),
                b50: { sd: [chartBNew], dx: [chartCNew] },
            },
        });
    });

    it("adds an entry to rating history via appendRatingHistory", () => {
        const user = createUser({
            data: {
                updateTime: 1000,
                name: "player",
                rating: 14000,
                ratingHistory: [{ time: 1000, rating: 14000 }],
            },
        });
        const update: SyncUpdate = {
            name: "player",
            rating: 14500,
            updateTime: 2000,
            scoreHistorySource: "inGame",
            b50: { sd: [], dx: [] },
        };
        const result = applySyncUpdate(user, update);
        expect(result).toEqual({
            observedAt: 2000,
            candidates: [],
            source: "inGame",
        });
        expect(user).toEqual({
            uid: "test-uid",
            divingFish: { name: null },
            inGame: { id: null },
            settings: { manuallyUpdate: false },
            data: {
                updateTime: 2000,
                name: "player",
                rating: 14500,
                ratingHistory: [
                    { time: 1000, rating: 14000 },
                    { time: 2000, rating: 14500 },
                ],
                b50: { sd: [], dx: [] },
            },
        });
    });

    it("takes a chart that is only in the SD half of the B50 into the candidates", () => {
        const user = createUser();
        const sdRecord = createRecord({ song_id: 4, type: "SD", achievements: 97.0 });
        const update: SyncUpdate = {
            name: "player",
            rating: 13000,
            updateTime: 2000,
            scoreHistorySource: "divingFishPublic",
            b50: { sd: [sdRecord], dx: [] },
        };

        const result = applySyncUpdate(user, update);
        expect(result.candidates).toEqual([
            {
                chartKey: "4-3",
                observedAt: 2000,
                kind: "initial",
                changedMask: 0,
                before: null,
                after: {
                    achievements: 97.0,
                    dxScore: 2500,
                    fc: ComboStatus.FullCombo,
                    fs: SyncStatus.FullSync,
                    playCount: 10,
                },
                previousObservedAt: null,
            },
        ]);
    });
});
