import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import localForage from "localforage";
import { ComboStatus, RankRate, SyncStatus } from "../../maiTypes";
import type { DivingFishFullRecord } from "@/components/integrations/diving-fish/type";
import { convertDetailed, type User } from "../type";
import {
    ScoreHistoryChange,
    activateStagedScoreHistoryImport,
    appendScoreHistoryBatch,
    clearScoreHistory,
    createScoreHistoryCandidates,
    createUserDataBackup,
    decodeUserDataBackup,
    exportScoreHistoryEvents,
    getExistingScoreData,
    getScoreHistoryPage,
    hasStrongIdentityChanged,
    getScoreHistoryDisplayChanges,
    formatScoreHistorySource,
    formatPlayCount,
    calculatePlayCountEstimate,
    calculateUserPlayCountEstimates,
    getChartPlayCountEstimate,
    getUserPlayCountEstimates,
    isPlayCountOnlyHistory,
    recoverPendingUserDataImport,
    resetScoreHistoryDatabaseForTests,
    resetUserForNewIdentity,
    stageScoreHistoryImport,
    type ScoreHistoryBatch,
    type ScoreHistoryEventV1,
} from ".";

function createRecord(overrides: Partial<DivingFishFullRecord> = {}): DivingFishFullRecord {
    return {
        achievements: 100.5,
        ds: 13.7,
        dxScore: 2_500,
        fc: ComboStatus.FullCombo,
        fs: SyncStatus.FullSync,
        level: "13+",
        level_index: 3,
        level_label: "Master",
        play_count: 10,
        ra: 300,
        rate: RankRate.sssp,
        song_id: 1,
        title: "Test song",
        type: "DX",
        ...overrides,
    };
}

function createUser(uid = "user-1"): User {
    return {
        uid,
        divingFish: { name: null },
        inGame: { id: null },
        settings: { manuallyUpdate: false },
        data: { updateTime: null, name: null, rating: null },
    };
}

function encode(value: unknown): string {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    return btoa(String.fromCharCode(...bytes));
}

beforeEach(async () => {
    await resetScoreHistoryDatabaseForTests();
    await localForage.clear();
});

describe("score history candidates", () => {
    it("records a new score as an initial event", () => {
        const [candidate] = createScoreHistoryCandidates(undefined, [createRecord()], 1_000);
        expect(candidate).toMatchObject({
            kind: "initial",
            changedMask: 0,
            observedAt: 1_000,
            before: null,
        });
    });

    it("records all five score fields and ignores metadata-only changes", () => {
        const existing = convertDetailed([createRecord({ lastChangedAt: 500 })]);
        expect(
            createScoreHistoryCandidates(
                existing,
                [createRecord({ ds: 14, ra: 350, title: "Renamed" })],
                1_000
            )
        ).toEqual([]);

        const [candidate] = createScoreHistoryCandidates(
            existing,
            [
                createRecord({
                    achievements: 99,
                    dxScore: 2_000,
                    fc: ComboStatus.None,
                    fs: SyncStatus.None,
                    play_count: 11,
                }),
            ],
            1_000
        );
        expect(candidate.changedMask).toBe(
            ScoreHistoryChange.Achievements |
                ScoreHistoryChange.DxScore |
                ScoreHistoryChange.ComboStatus |
                ScoreHistoryChange.SyncStatus |
                ScoreHistoryChange.PlayCount
        );
        expect(candidate.previousObservedAt).toBe(500);
    });

    it("deduplicates detailed and B50 records with detailed taking precedence", () => {
        const detailedRecord = createRecord({ achievements: 100.6 });
        const b50Record = createRecord({ achievements: 99 });
        const existing = getExistingScoreData(convertDetailed([detailedRecord]), {
            sd: [],
            dx: [b50Record],
        });
        expect(existing?.["10001-3"].achievements).toBe(100.6);

        const [candidate] = createScoreHistoryCandidates(
            undefined,
            [detailedRecord, b50Record],
            1_000
        );
        expect(candidate.after.achievements).toBe(100.6);
    });
});

describe("score history repository", () => {
    it("writes an initial event idempotently and queries it", async () => {
        const batch: ScoreHistoryBatch = {
            batchId: "batch-1",
            userUid: "user-1",
            source: "inGame",
            candidates: createScoreHistoryCandidates(undefined, [createRecord()], 1_000),
        };
        await appendScoreHistoryBatch(batch);
        await appendScoreHistoryBatch(batch);

        const page = await getScoreHistoryPage("user-1", batch.candidates[0].chartKey);
        expect(page.entries).toHaveLength(1);
        expect(page.entries[0].event.kind).toBe("initial");
        expect(page.entries[0].before).toBeNull();
    });

    it("creates a lazy baseline before the first observed change", async () => {
        const oldRecord = createRecord({ lastChangedAt: 500 });
        const candidates = createScoreHistoryCandidates(
            convertDetailed([oldRecord]),
            [createRecord({ achievements: 100.6 })],
            1_000
        );
        await appendScoreHistoryBatch({
            batchId: "batch-2",
            userUid: "user-1",
            source: "lxns",
            candidates,
        });

        const page = await getScoreHistoryPage("user-1", candidates[0].chartKey);
        expect(page.entries.map(entry => entry.event.kind)).toEqual(["change", "initial"]);
        expect(page.entries[0].before?.achievements).toBe(100.5);
        expect(page.entries[0].after.achievements).toBe(100.6);
        expect(page.entries[1].event.observedAt).toBe(500);
    });

    it("hides play-count-only changes unless requested", async () => {
        const existing = convertDetailed([createRecord({ lastChangedAt: 500 })]);
        const candidates = createScoreHistoryCandidates(
            existing,
            [createRecord({ play_count: 11 })],
            1_000
        );
        await appendScoreHistoryBatch({
            batchId: "batch-3",
            userUid: "user-1",
            source: "divingFishImport",
            candidates,
        });

        expect((await getScoreHistoryPage("user-1", candidates[0].chartKey)).entries).toHaveLength(
            1
        );
        expect(
            (
                await getScoreHistoryPage("user-1", candidates[0].chartKey, {
                    includePlayCountOnly: true,
                })
            ).entries
        ).toHaveLength(2);
    });

    it("replaces the active generation", async () => {
        const candidates = createScoreHistoryCandidates(undefined, [createRecord()], 1_000);
        await appendScoreHistoryBatch({
            batchId: "old",
            userUid: "user-1",
            source: "inGame",
            candidates,
        });
        const oldEvent = (await exportScoreHistoryEvents())[0];
        const imported: ScoreHistoryEventV1 = { ...oldEvent, id: "imported", batchId: "import" };
        const pending = await stageScoreHistoryImport([imported], JSON.stringify([createUser()]));
        await activateStagedScoreHistoryImport(pending.generationId);

        const events = await exportScoreHistoryEvents();
        expect(events).toHaveLength(1);
        expect(events[0].batchId).toBe("import");

        await clearScoreHistory();
        expect(await exportScoreHistoryEvents()).toEqual([]);
    });

    it("completes a staged import after restart recovery", async () => {
        const candidates = createScoreHistoryCandidates(undefined, [createRecord()], 1_000);
        await appendScoreHistoryBatch({
            batchId: "pending-source",
            userUid: "user-1",
            source: "inGame",
            candidates,
        });
        const sourceEvent = (await exportScoreHistoryEvents())[0];
        const users = [createUser()];
        await stageScoreHistoryImport(
            [{ ...sourceEvent, id: "pending-event", batchId: "pending" }],
            JSON.stringify(users)
        );

        await recoverPendingUserDataImport();

        expect(await localForage.getItem<User[]>("users")).toEqual(users);
        expect((await exportScoreHistoryEvents()).map(event => event.batchId)).toEqual(["pending"]);
    });
});

describe("user data backup validation", () => {
    it("accepts version 0 and supplies missing uids", () => {
        const decoded = decodeUserDataBackup({
            version: 0,
            users: encode([{ ...createUser(), uid: undefined }]),
        });
        expect(decoded.users[0].uid).toBeTruthy();
        expect(decoded.events).toEqual([]);
    });

    it("repairs duplicate uids in legacy backups", () => {
        const decoded = decodeUserDataBackup({
            version: 0,
            users: encode([createUser("duplicate"), createUser("duplicate")]),
        });
        expect(new Set(decoded.users.map(user => user.uid)).size).toBe(2);
    });

    it("round-trips version 1 users and history", async () => {
        const candidates = createScoreHistoryCandidates(undefined, [createRecord()], 1_000);
        await appendScoreHistoryBatch({
            batchId: "backup",
            userUid: "user-1",
            source: "inGame",
            candidates,
        });
        const backup = await createUserDataBackup([createUser()]);
        const decoded = decodeUserDataBackup(backup);
        expect(decoded.users[0].uid).toBe("user-1");
        expect(decoded.events).toHaveLength(1);
        expect(decoded.events[0].state.achievements).toBe(100.5);
    });

    it("rejects duplicate uids in a version 1 backup with history", () => {
        expect(() =>
            decodeUserDataBackup({
                version: 1,
                exportedAt: 1_000,
                users: encode([createUser("duplicate"), createUser("duplicate")]),
                scoreHistory: {
                    schemaVersion: 1,
                    encoding: "base64-json",
                    eventCount: 0,
                    data: encode([]),
                },
            })
        ).toThrow("用户数据包含重复 uid");
    });

    it("rejects history that references an unknown user", () => {
        const user = createUser();
        const event = {
            id: "event",
            schemaVersion: 1,
            generationId: "old",
            batchId: "batch",
            userUid: "other-user",
            chartKey: "10001-3",
            observedAt: 1_000,
            sequence: 0,
            source: "inGame",
            kind: "initial",
            changedMask: 0,
            state: {
                achievements: 100.5,
                dxScore: 2_500,
                fc: ComboStatus.FullCombo,
                fs: SyncStatus.FullSync,
                playCount: 10,
            },
        };
        expect(() =>
            decodeUserDataBackup({
                version: 1,
                exportedAt: 1_000,
                users: encode([user]),
                scoreHistory: {
                    schemaVersion: 1,
                    encoding: "base64-json",
                    eventCount: 1,
                    data: encode([event]),
                },
            })
        ).toThrow("成绩历史事件字段无效");
    });
});

describe("score history presentation", () => {
    it("formats changed fields with before and after values", async () => {
        const candidates = createScoreHistoryCandidates(
            convertDetailed([createRecord({ lastChangedAt: 500 })]),
            [createRecord({ achievements: 100.6, dxScore: 2_600 })],
            1_000
        );
        await appendScoreHistoryBatch({
            batchId: "presentation",
            userUid: "user-1",
            source: "lxns",
            candidates,
        });
        const [entry] = (await getScoreHistoryPage("user-1", candidates[0].chartKey)).entries;
        expect(getScoreHistoryDisplayChanges(entry)).toEqual([
            { label: "达成率", before: "100.5000%", after: "100.6000%" },
            { label: "DX 分", before: "2500", after: "2600" },
        ]);
        expect(formatScoreHistorySource(entry.event.source)).toBe("落雪更新");
        expect(isPlayCountOnlyHistory(entry)).toBe(false);
    });
});

describe("score history user identity", () => {
    it("detects strong-account replacement and resets local score data", () => {
        const existing = { ...createUser(), inGame: { id: 12_345_678 } };
        const incoming = { ...existing, inGame: { id: 87_654_321 } };
        expect(hasStrongIdentityChanged(existing, incoming)).toBe(true);

        const reset = resetUserForNewIdentity({
            ...incoming,
            data: { ...incoming.data, rating: 15_000, detailed: convertDetailed([createRecord()]) },
        });
        expect(reset.uid).not.toBe(existing.uid);
        expect(reset.data).toEqual({ updateTime: null, name: null, rating: null });
        expect(reset.inGame.id).toBe(87_654_321);
    });
});

describe("play count estimation", () => {
    it("formats play count properly for exact and estimated values", () => {
        expect(formatPlayCount(null)).toBe("未知");
        expect(formatPlayCount(undefined)).toBe("未知");
        expect(formatPlayCount(5, false)).toBe("5 次");
        expect(formatPlayCount(5, true)).toBe("≥ 5 次");
    });

    it("returns exact play count when no uncounted score changes exist", () => {
        const estimate = calculatePlayCountEstimate([], 10);
        expect(estimate).toEqual({
            recordedPlayCount: 10,
            uncountedScoreChanges: 0,
            playCount: 10,
            isEstimated: false,
            displayText: "10 次",
        });
    });

    it("adds uncounted score changes and marks as estimated (≥ n 次)", () => {
        const initialEvent: ScoreHistoryEventV1 = {
            id: "1",
            schemaVersion: 1,
            generationId: "default",
            batchId: "b1",
            userUid: "user-1",
            chartKey: "10001-3",
            observedAt: 1_000,
            sequence: 0,
            source: "inGame",
            kind: "initial",
            changedMask: 0,
            state: {
                achievements: 98,
                dxScore: 2000,
                fc: ComboStatus.None,
                fs: SyncStatus.None,
                playCount: 5,
            },
        };
        const change1: ScoreHistoryEventV1 = {
            id: "2",
            schemaVersion: 1,
            generationId: "default",
            batchId: "b2",
            userUid: "user-1",
            chartKey: "10001-3",
            observedAt: 2_000,
            sequence: 0,
            source: "lxns",
            kind: "change",
            changedMask: ScoreHistoryChange.Achievements,
            state: {
                achievements: 99,
                dxScore: 2000,
                fc: ComboStatus.None,
                fs: SyncStatus.None,
                playCount: 5,
            },
        };
        const change2: ScoreHistoryEventV1 = {
            id: "3",
            schemaVersion: 1,
            generationId: "default",
            batchId: "b3",
            userUid: "user-1",
            chartKey: "10001-3",
            observedAt: 3_000,
            sequence: 0,
            source: "divingFishPublic",
            kind: "change",
            changedMask: ScoreHistoryChange.DxScore | ScoreHistoryChange.ComboStatus,
            state: {
                achievements: 99,
                dxScore: 2100,
                fc: ComboStatus.FullCombo,
                fs: SyncStatus.None,
                playCount: 5,
            },
        };

        const estimate = calculatePlayCountEstimate([initialEvent, change1, change2], 5);
        expect(estimate).toEqual({
            recordedPlayCount: 5,
            uncountedScoreChanges: 2,
            playCount: 7,
            isEstimated: true,
            displayText: "≥ 7 次",
        });
    });

    it("resets uncounted accumulator when playCount is updated officially", () => {
        const initialEvent: ScoreHistoryEventV1 = {
            id: "1",
            schemaVersion: 1,
            generationId: "default",
            batchId: "b1",
            userUid: "user-1",
            chartKey: "10001-3",
            observedAt: 1_000,
            sequence: 0,
            source: "inGame",
            kind: "initial",
            changedMask: 0,
            state: {
                achievements: 98,
                dxScore: 2000,
                fc: ComboStatus.None,
                fs: SyncStatus.None,
                playCount: 5,
            },
        };
        const change1: ScoreHistoryEventV1 = {
            id: "2",
            schemaVersion: 1,
            generationId: "default",
            batchId: "b2",
            userUid: "user-1",
            chartKey: "10001-3",
            observedAt: 2_000,
            sequence: 0,
            source: "lxns",
            kind: "change",
            changedMask: ScoreHistoryChange.Achievements,
            state: {
                achievements: 99,
                dxScore: 2000,
                fc: ComboStatus.None,
                fs: SyncStatus.None,
                playCount: 5,
            },
        };
        const officialUpdate: ScoreHistoryEventV1 = {
            id: "3",
            schemaVersion: 1,
            generationId: "default",
            batchId: "b3",
            userUid: "user-1",
            chartKey: "10001-3",
            observedAt: 3_000,
            sequence: 0,
            source: "inGame",
            kind: "change",
            changedMask: ScoreHistoryChange.PlayCount | ScoreHistoryChange.Achievements,
            state: {
                achievements: 100,
                dxScore: 2200,
                fc: ComboStatus.FullCombo,
                fs: SyncStatus.None,
                playCount: 10,
            },
        };
        const laterChange: ScoreHistoryEventV1 = {
            id: "4",
            schemaVersion: 1,
            generationId: "default",
            batchId: "b4",
            userUid: "user-1",
            chartKey: "10001-3",
            observedAt: 4_000,
            sequence: 0,
            source: "divingFishImport",
            kind: "change",
            changedMask: ScoreHistoryChange.Achievements,
            state: {
                achievements: 100.5,
                dxScore: 2200,
                fc: ComboStatus.FullCombo,
                fs: SyncStatus.None,
                playCount: 10,
            },
        };

        const estimateAfterOfficial = calculatePlayCountEstimate(
            [initialEvent, change1, officialUpdate],
            10
        );
        expect(estimateAfterOfficial).toEqual({
            recordedPlayCount: 10,
            uncountedScoreChanges: 0,
            playCount: 10,
            isEstimated: false,
            displayText: "10 次",
        });

        const estimateAfterLaterChange = calculatePlayCountEstimate(
            [initialEvent, change1, officialUpdate, laterChange],
            10
        );
        expect(estimateAfterLaterChange).toEqual({
            recordedPlayCount: 10,
            uncountedScoreChanges: 1,
            playCount: 11,
            isEstimated: true,
            displayText: "≥ 11 次",
        });
    });

    it("handles null base play count with score changes", () => {
        const initialEvent: ScoreHistoryEventV1 = {
            id: "1",
            schemaVersion: 1,
            generationId: "default",
            batchId: "b1",
            userUid: "user-1",
            chartKey: "10001-3",
            observedAt: 1_000,
            sequence: 0,
            source: "divingFishPublic",
            kind: "initial",
            changedMask: 0,
            state: {
                achievements: 98,
                dxScore: 2000,
                fc: ComboStatus.None,
                fs: SyncStatus.None,
                playCount: null,
            },
        };
        const change1: ScoreHistoryEventV1 = {
            id: "2",
            schemaVersion: 1,
            generationId: "default",
            batchId: "b2",
            userUid: "user-1",
            chartKey: "10001-3",
            observedAt: 2_000,
            sequence: 0,
            source: "divingFishPublic",
            kind: "change",
            changedMask: ScoreHistoryChange.Achievements,
            state: {
                achievements: 99,
                dxScore: 2000,
                fc: ComboStatus.None,
                fs: SyncStatus.None,
                playCount: null,
            },
        };

        const estimate = calculatePlayCountEstimate([initialEvent, change1], null);
        expect(estimate).toEqual({
            recordedPlayCount: null,
            uncountedScoreChanges: 1,
            playCount: 2,
            isEstimated: true,
            displayText: "≥ 2 次",
        });
    });

    it("queries user play count estimates from repository IndexedDB", async () => {
        const existing = convertDetailed([createRecord({ play_count: 5, lastChangedAt: 500 })]);
        const candidates = createScoreHistoryCandidates(
            existing,
            [createRecord({ achievements: 100.6, play_count: 5 })],
            1_000
        );
        await appendScoreHistoryBatch({
            batchId: "est-batch",
            userUid: "user-1",
            source: "divingFishImport",
            candidates,
        });

        const singleEstimate = await getChartPlayCountEstimate("user-1", candidates[0].chartKey, 5);
        expect(singleEstimate.isEstimated).toBe(true);
        expect(singleEstimate.playCount).toBe(6);
        expect(singleEstimate.displayText).toBe("≥ 6 次");

        const pureMap = calculateUserPlayCountEstimates(
            [
                {
                    id: "e1",
                    schemaVersion: 1,
                    generationId: "default",
                    batchId: "b1",
                    userUid: "user-1",
                    chartKey: candidates[0].chartKey,
                    observedAt: 1_000,
                    sequence: 0,
                    source: "divingFishImport",
                    kind: "change",
                    changedMask: ScoreHistoryChange.Achievements,
                    state: {
                        achievements: 100.6,
                        dxScore: 2500,
                        fc: ComboStatus.None,
                        fs: SyncStatus.None,
                        playCount: 5,
                    },
                },
            ],
            existing
        );
        expect(pureMap.get(candidates[0].chartKey)?.displayText).toBe("≥ 6 次");

        const userEstimates = await getUserPlayCountEstimates("user-1", existing);
        const chartEst = userEstimates.get(candidates[0].chartKey);
        expect(chartEst?.isEstimated).toBe(true);
        expect(chartEst?.playCount).toBe(6);
        expect(chartEst?.displayText).toBe("≥ 6 次");
    });
});
