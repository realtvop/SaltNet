/** Shapes the selected user's stored copies as the score and B50 parts of a chart row. */
import type { ComboStatus, RankRate, SyncStatus } from "@core/mai/types";
import type { Chart } from "@core/music/type";
import type { B50Place, StoredChartScore, UserScores } from "../users/scores";
import { getDeluxeScoreTier } from "@core/chart/dxScore";
import { comboLabel, COMBOS, rankLabel, RANKS, syncLabel, SYNCS } from "../refs/status";
import { formatLocalTime } from "../util/time";
import { chartKeyOf } from "./songs";

export interface ChartScoreRow {
    readonly achievements: number | null;
    readonly rank: string | null;
    readonly combo: string | null;
    readonly sync: string | null;
    readonly dxScore: number | null;
    readonly dxScoreMax: number | null;
    readonly dxStars: number | null;
    readonly rating: number | null;
    readonly playCount: number | null;
    readonly playCountEstimated: boolean;
    readonly changedAt: string | null;
}

function oneOf<T extends string>(values: readonly T[], value: string | null): T | undefined {
    return value !== null && values.includes(value as T) ? (value as T) : undefined;
}

function positive(value: number | undefined): number | null {
    return value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
}

function changedAt(value: number | null): string | null {
    if (value === null || value <= 0) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : formatLocalTime(date);
}

function scoreRow(chart: Chart, row: StoredChartScore, scores: UserScores): ChartScoreRow {
    const rank = oneOf(RANKS, row.rate);
    const combo = oneOf(COMBOS, row.fc);
    const sync = oneOf(SYNCS, row.fs);
    const dxScoreMax = positive(chart.info.deluxeScoreMax);
    const estimate = scores.playCountByRecordKey.get(row.recordKey);
    const estimated = row.playCount === null ? estimate : undefined;
    const playCount = row.playCount ?? estimated?.playCount ?? null;
    return {
        achievements: row.achievements,
        rank: rank === undefined ? null : rankLabel(rank as RankRate),
        combo: combo === undefined ? null : comboLabel(combo as ComboStatus),
        sync: sync === undefined ? null : syncLabel(sync as SyncStatus),
        dxScore: row.dxScore,
        dxScoreMax,
        dxStars:
            row.dxScore === null || dxScoreMax === null
                ? null
                : getDeluxeScoreTier(row.dxScore, dxScoreMax),
        rating: row.rating,
        playCount,
        playCountEstimated: row.playCount === null && estimated?.isEstimated === true,
        changedAt: changedAt(row.lastChangedAt),
    };
}

export interface ChartUserParts {
    readonly score: ChartScoreRow | null;
    readonly b50: B50Place | null;
}

/** Null parts without a selected user; otherwise lookups by the catalog chart key. */
export function chartUserParts(chart: Chart, scores?: UserScores): ChartUserParts {
    if (!scores) return { score: null, b50: null };
    const key = chartKeyOf(chart);
    const stored = scores.byChartKey.get(key);
    return {
        score: stored ? scoreRow(chart, stored, scores) : null,
        b50: scores.b50ByChartKey.get(key) ?? null,
    };
}
