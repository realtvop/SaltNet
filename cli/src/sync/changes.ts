/**
 * Calculation of sync counts, changes and missing candidates (design 5.1).
 */
import type { ScoreHistoryCandidate } from "@core/user/scoreHistory/type";
import type { SongCatalog } from "../catalog/songs";
import type { StoredUserRows } from "../users/rows";
import type { UserScores } from "../users/scores";
import type { SyncChangeItem, SyncCounts } from "./types";
import { chartRow } from "../catalog/chartRow";
import { chartScoreOf } from "../catalog/chartScore";
import { COMBOS, SYNCS } from "../refs/status";

export interface ComputeSyncChangesOptions {
    readonly hadScoresBefore: boolean;
    readonly candidates: readonly ScoreHistoryCandidate[];
    readonly songCatalog: SongCatalog;
    readonly scoresBefore: UserScores | undefined;
    readonly scoresAfter: UserScores;
    readonly incomingRows: Pick<StoredUserRows, "scores" | "b50">;
}

export interface ComputedSyncChanges {
    readonly changes: readonly SyncChangeItem[];
    readonly changesTotal: number;
    readonly missing: number;
}

function numericChange(before: number, after: number): number {
    if (before === after) return 0;
    return Number.isFinite(before) && Number.isFinite(after) ? after - before : Number.NaN;
}

function statusChange<T>(order: readonly T[], before: T, after: T): number {
    if (before === after) return 0;
    const previous = order.indexOf(before);
    const next = order.indexOf(after);
    return previous >= 0 && next >= 0 ? next - previous : Number.NaN;
}

function improvedScore({ before, after }: ScoreHistoryCandidate): boolean {
    if (!before) return false;
    const changes = [
        numericChange(before.achievements, after.achievements),
        numericChange(before.dxScore, after.dxScore),
        statusChange(COMBOS, before.fc, after.fc),
        statusChange(SYNCS, before.fs, after.fs),
    ];
    return changes.every(change => change >= 0) && changes.some(change => change > 0);
}

export function countSyncChanges(
    charts: number,
    candidates: readonly ScoreHistoryCandidate[]
): SyncCounts {
    return {
        charts,
        added: candidates.filter(candidate => candidate.kind === "initial").length,
        improved: candidates.filter(improvedScore).length,
    };
}

export function computeSyncChanges(options: ComputeSyncChangesOptions): ComputedSyncChanges {
    const { hadScoresBefore, candidates, songCatalog, scoresBefore, scoresAfter, incomingRows } =
        options;

    if (!hadScoresBefore) {
        return {
            changes: [],
            changesTotal: 0,
            missing: 0,
        };
    }

    let missing = 0;
    const allChanges: {
        item: SyncChangeItem;
        ratingDiff: number;
        chartKey: string;
    }[] = [];
    const incomingByRecordKey = new Map<string, StoredUserRows["scores"][number]>();
    // The history builder takes the first occurrence in detailed, SD B50, DX B50 order.
    for (const row of [...incomingRows.scores, ...incomingRows.b50]) {
        if (!incomingByRecordKey.has(row.recordKey)) incomingByRecordKey.set(row.recordKey, row);
    }

    for (const candidate of candidates) {
        // A candidate's key is the record's key, which is not the chart key for utage records.
        const incoming = incomingByRecordKey.get(candidate.chartKey);
        const chartKey = incoming?.chartKey;
        const chartEntry = chartKey ? songCatalog.chartByKey.get(chartKey) : undefined;
        if (!incoming || !chartKey || !chartEntry) {
            missing++;
            continue;
        }

        const afterRow = chartRow(chartEntry, {
            ...scoresAfter,
            byChartKey: new Map([[chartKey, { ...incoming, chartKey, rating: incoming.ra }]]),
        });
        const beforeScore = scoresBefore ? chartScoreOf(chartEntry.chart, scoresBefore) : null;
        const afterRating = afterRow.score?.rating ?? 0;
        const beforeRating = beforeScore?.rating ?? 0;
        const ratingDiff = afterRating - beforeRating;

        allChanges.push({
            item: {
                ...afterRow,
                before: beforeScore,
            },
            ratingDiff,
            chartKey,
        });
    }

    allChanges.sort((a, b) => {
        if (b.ratingDiff !== a.ratingDiff) {
            return b.ratingDiff - a.ratingDiff;
        }
        return a.chartKey < b.chartKey ? -1 : a.chartKey > b.chartKey ? 1 : 0;
    });

    const changesTotal = allChanges.length;
    const changes = allChanges.slice(0, 20).map(c => c.item);

    return {
        changes,
        changesTotal,
        missing,
    };
}
