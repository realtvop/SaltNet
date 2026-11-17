import type { ScoreHistoryBatch, ScoreHistoryCandidate, ScoreHistoryStateV1 } from "./type";
import { describe, expect, it } from "vitest";
import { ComboStatus, SyncStatus } from "../../mai/types";
import { buildScoreHistoryBatchEvents } from "./batch";
import { SCORE_HISTORY_SCHEMA_VERSION, ScoreHistoryChange } from "./type";

function createState(overrides: Partial<ScoreHistoryStateV1> = {}): ScoreHistoryStateV1 {
    return {
        achievements: 100.5,
        dxScore: 2500,
        fc: ComboStatus.FullCombo,
        fs: SyncStatus.FullSync,
        playCount: 10,
        ...overrides,
    };
}

describe("buildScoreHistoryBatchEvents", () => {
    it("returns empty array for an empty batch", () => {
        const batch: ScoreHistoryBatch = {
            batchId: "batch-1",
            userUid: "user-1",
            source: "inGame",
            candidates: [],
        };
        expect(buildScoreHistoryBatchEvents(batch, "gen-1", new Set())).toEqual([]);
    });

    it("gives one event with sequence 0 for an initial candidate", () => {
        const state = createState();
        const candidate: ScoreHistoryCandidate = {
            chartKey: "1-3",
            observedAt: 1000,
            kind: "initial",
            changedMask: 0,
            before: null,
            after: state,
            previousObservedAt: null,
        };
        const batch: ScoreHistoryBatch = {
            batchId: "batch-1",
            userUid: "user-1",
            source: "inGame",
            candidates: [candidate],
        };
        expect(buildScoreHistoryBatchEvents(batch, "gen-1", new Set())).toEqual([
            {
                id: "gen-1:batch-1:1-3:initial",
                schemaVersion: SCORE_HISTORY_SCHEMA_VERSION,
                generationId: "gen-1",
                batchId: "batch-1",
                userUid: "user-1",
                chartKey: "1-3",
                observedAt: 1000,
                sequence: 0,
                source: "inGame",
                kind: "initial",
                changedMask: 0,
                state,
            },
        ]);
    });

    it("gives baseline and change with sequence 0 when baseline time differs from change time for chart not in existing keys", () => {
        const before = createState({ achievements: 99 });
        const after = createState({ achievements: 100.5 });
        const candidate: ScoreHistoryCandidate = {
            chartKey: "1-3",
            observedAt: 1000,
            kind: "change",
            changedMask: ScoreHistoryChange.Achievements,
            before,
            after,
            previousObservedAt: 500,
        };
        const batch: ScoreHistoryBatch = {
            batchId: "batch-1",
            userUid: "user-1",
            source: "inGame",
            candidates: [candidate],
        };
        expect(buildScoreHistoryBatchEvents(batch, "gen-1", new Set())).toEqual([
            {
                id: "gen-1:batch-1:1-3:baseline",
                schemaVersion: SCORE_HISTORY_SCHEMA_VERSION,
                generationId: "gen-1",
                batchId: "batch-1",
                userUid: "user-1",
                chartKey: "1-3",
                observedAt: 500,
                sequence: 0,
                source: "inGame",
                kind: "initial",
                changedMask: 0,
                state: before,
            },
            {
                id: "gen-1:batch-1:1-3:change",
                schemaVersion: SCORE_HISTORY_SCHEMA_VERSION,
                generationId: "gen-1",
                batchId: "batch-1",
                userUid: "user-1",
                chartKey: "1-3",
                observedAt: 1000,
                sequence: 0,
                source: "inGame",
                kind: "change",
                changedMask: ScoreHistoryChange.Achievements,
                state: after,
            },
        ]);
    });

    it("gives baseline and change with sequence 1 when previousObservedAt is null (baseline time equals change time)", () => {
        const before = createState({ achievements: 99 });
        const after = createState({ achievements: 100.5 });
        const candidate: ScoreHistoryCandidate = {
            chartKey: "1-3",
            observedAt: 1000,
            kind: "change",
            changedMask: ScoreHistoryChange.Achievements,
            before,
            after,
            previousObservedAt: null,
        };
        const batch: ScoreHistoryBatch = {
            batchId: "batch-1",
            userUid: "user-1",
            source: "inGame",
            candidates: [candidate],
        };
        expect(buildScoreHistoryBatchEvents(batch, "gen-1", new Set())).toEqual([
            {
                id: "gen-1:batch-1:1-3:baseline",
                schemaVersion: SCORE_HISTORY_SCHEMA_VERSION,
                generationId: "gen-1",
                batchId: "batch-1",
                userUid: "user-1",
                chartKey: "1-3",
                observedAt: 1000,
                sequence: 0,
                source: "inGame",
                kind: "initial",
                changedMask: 0,
                state: before,
            },
            {
                id: "gen-1:batch-1:1-3:change",
                schemaVersion: SCORE_HISTORY_SCHEMA_VERSION,
                generationId: "gen-1",
                batchId: "batch-1",
                userUid: "user-1",
                chartKey: "1-3",
                observedAt: 1000,
                sequence: 1,
                source: "inGame",
                kind: "change",
                changedMask: ScoreHistoryChange.Achievements,
                state: after,
            },
        ]);
    });

    it("gives only the change with sequence 0 when the chart is in existing keys", () => {
        const before = createState({ achievements: 99 });
        const after = createState({ achievements: 100.5 });
        const candidate: ScoreHistoryCandidate = {
            chartKey: "1-3",
            observedAt: 1000,
            kind: "change",
            changedMask: ScoreHistoryChange.Achievements,
            before,
            after,
            previousObservedAt: 500,
        };
        const batch: ScoreHistoryBatch = {
            batchId: "batch-1",
            userUid: "user-1",
            source: "inGame",
            candidates: [candidate],
        };
        const existingKeys = new Set(["1-3"]);
        expect(buildScoreHistoryBatchEvents(batch, "gen-1", existingKeys)).toEqual([
            {
                id: "gen-1:batch-1:1-3:change",
                schemaVersion: SCORE_HISTORY_SCHEMA_VERSION,
                generationId: "gen-1",
                batchId: "batch-1",
                userUid: "user-1",
                chartKey: "1-3",
                observedAt: 1000,
                sequence: 0,
                source: "inGame",
                kind: "change",
                changedMask: ScoreHistoryChange.Achievements,
                state: after,
            },
        ]);
    });

    it("gives no baseline when a change candidate has no before", () => {
        const after = createState({ achievements: 100.5 });
        const candidate: ScoreHistoryCandidate = {
            chartKey: "1-3",
            observedAt: 1000,
            kind: "change",
            changedMask: ScoreHistoryChange.Achievements,
            before: null,
            after,
            previousObservedAt: null,
        };
        const batch: ScoreHistoryBatch = {
            batchId: "batch-1",
            userUid: "user-1",
            source: "inGame",
            candidates: [candidate],
        };
        expect(buildScoreHistoryBatchEvents(batch, "gen-1", new Set())).toEqual([
            {
                id: "gen-1:batch-1:1-3:change",
                schemaVersion: SCORE_HISTORY_SCHEMA_VERSION,
                generationId: "gen-1",
                batchId: "batch-1",
                userUid: "user-1",
                chartKey: "1-3",
                observedAt: 1000,
                sequence: 0,
                source: "inGame",
                kind: "change",
                changedMask: ScoreHistoryChange.Achievements,
                state: after,
            },
        ]);
    });
});
