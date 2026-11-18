/**
 * Calculation of sync counts, changes and missing candidates (design 5.1).
 */
import type { ScoreHistoryCandidate } from "@core/user/scoreHistory/type";
import type { ChartRow } from "../catalog/chartRow";
import type { SongCatalog } from "../catalog/songs";
import type { UserScores } from "../users/scores";
import type { SyncChangeItem, SyncCounts } from "./types";
import { chartRow } from "../catalog/chartRow";
import { chartScoreOf } from "../catalog/chartScore";

export interface ComputeSyncChangesOptions {
    readonly hadScoresBefore: boolean;
    readonly candidates: readonly ScoreHistoryCandidate[];
    readonly songCatalog: SongCatalog;
    readonly scoresBefore: UserScores | undefined;
    readonly scoresAfter: UserScores;
    readonly newScoresCount: number;
    /** The catalog chart key of each stored record after the sync (`readRecordChartKeys`). */
    readonly chartKeyByRecordKey: ReadonlyMap<string, string | null>;
}

export interface ComputedSyncChanges {
    readonly counts: SyncCounts;
    readonly changes: readonly SyncChangeItem[];
    readonly changesTotal: number;
    readonly missing: number;
}

export function computeSyncChanges(options: ComputeSyncChangesOptions): ComputedSyncChanges {
    const {
        hadScoresBefore,
        candidates,
        songCatalog,
        scoresBefore,
        scoresAfter,
        newScoresCount,
        chartKeyByRecordKey,
    } = options;

    const added = candidates.filter(c => c.kind === "initial").length;
    const improved = candidates.filter(c => c.kind === "change").length;
    const counts: SyncCounts = {
        charts: newScoresCount,
        added,
        improved,
    };

    if (!hadScoresBefore) {
        return {
            counts,
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

    for (const candidate of candidates) {
        // A candidate's key is the record's key, which is not the chart key for utage records.
        const chartKey = chartKeyByRecordKey.get(candidate.chartKey);
        const chartEntry = chartKey ? songCatalog.chartByKey.get(chartKey) : undefined;
        if (!chartKey || !chartEntry) {
            missing++;
            continue;
        }

        const afterRow: ChartRow = chartRow(chartEntry, scoresAfter);
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
        counts,
        changes,
        changesTotal,
        missing,
    };
}
