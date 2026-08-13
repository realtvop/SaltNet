import type { ComboStatus, SyncStatus } from "@/components/data/maiTypes";

export const SCORE_HISTORY_SCHEMA_VERSION = 1 as const;
export const SCORE_HISTORY_PAGE_SIZE = 30;

export const ScoreHistoryChange = {
    Achievements: 1,
    DxScore: 2,
    ComboStatus: 4,
    SyncStatus: 8,
    PlayCount: 16,
} as const;

export type ScoreHistorySource = "inGame" | "lxns" | "divingFishImport" | "divingFishPublic";

export interface ScoreHistoryStateV1 {
    achievements: number;
    dxScore: number;
    fc: ComboStatus;
    fs: SyncStatus;
    playCount: number | null;
}

export interface ScoreHistoryCandidate {
    chartKey: string;
    observedAt: number;
    kind: "initial" | "change";
    changedMask: number;
    before: ScoreHistoryStateV1 | null;
    after: ScoreHistoryStateV1;
    previousObservedAt: number | null;
}

export interface ScoreHistoryEventV1 {
    id: string;
    schemaVersion: typeof SCORE_HISTORY_SCHEMA_VERSION;
    generationId: string;
    batchId: string;
    userUid: string;
    chartKey: string;
    observedAt: number;
    sequence: number;
    source: ScoreHistorySource;
    kind: "initial" | "change";
    changedMask: number;
    state: ScoreHistoryStateV1;
}

export interface ScoreHistoryTimelineEntry {
    event: ScoreHistoryEventV1;
    before: ScoreHistoryStateV1 | null;
    after: ScoreHistoryStateV1;
}

export interface ScoreHistoryPage {
    entries: ScoreHistoryTimelineEntry[];
    nextOffset: number | null;
}

export interface ScoreHistoryBatch {
    batchId: string;
    userUid: string;
    source: ScoreHistorySource;
    candidates: ScoreHistoryCandidate[];
}

export interface PendingScoreHistoryImport {
    generationId: string;
    usersJson: string;
}
