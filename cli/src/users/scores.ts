/** Reads one user's score source once and builds the lookups shared by every chart-row command. */
import type { Chart } from "@core/music/type";
import type { PlayCountEstimate } from "@core/user/scoreHistory/estimate";
import type { User } from "@core/user/type";
import type { Store } from "../store/store";
import type { UserListRow } from "./repository";
import { createMusicChartMap, getSourceRecords, selectB50Charts } from "@core/query/b50";
import { calculateUserPlayCountEstimates } from "@core/user/scoreHistory/estimate";
import { chartKeyOf } from "../catalog/songs";
import { readScoreEvents, readUser } from "./repository";

export type ScoreSource = "detailed" | "b50" | "none";

export interface StoredChartScore {
    readonly recordKey: string;
    readonly chartKey: string;
    readonly achievements: number | null;
    readonly dxScore: number | null;
    readonly fc: string | null;
    readonly fs: string | null;
    readonly rate: string | null;
    readonly rating: number | null;
    readonly playCount: number | null;
    readonly lastChangedAt: number | null;
}

export interface B50Place {
    readonly part: "B35" | "B15";
    readonly rank: number;
}

export interface UserScores {
    readonly user: UserListRow;
    readonly source: ScoreSource;
    readonly byChartKey: ReadonlyMap<string, StoredChartScore>;
    readonly playCountByRecordKey: ReadonlyMap<string, PlayCountEstimate>;
    readonly b50ByChartKey: ReadonlyMap<string, B50Place>;
}

interface ScoreDbRow {
    record_key: string;
    chart_key: string;
    achievements: number | null;
    dx_score: number | null;
    fc: string | null;
    fs: string | null;
    rate: string | null;
    ra: number | null;
    play_count: number | null;
    last_changed_at: number | null;
}

function scoreSource(user: User): ScoreSource {
    const detailed = user.data?.detailed ? Object.values(user.data.detailed) : [];
    if (detailed.length > 0) return "detailed";
    return getSourceRecords(user.data, false).length > 0 ? "b50" : "none";
}

function scoreRows(store: Store, uid: string, source: ScoreSource): StoredChartScore[] {
    if (source === "none") return [];
    const table = source === "detailed" ? "scores" : "b50_snapshot";
    const rows = store.read(
        () =>
            store.db
                .prepare(
                    `SELECT record_key, chart_key, achievements, dx_score, fc, fs, rate, ra,
                            play_count, last_changed_at
                     FROM ${table}
                     WHERE user_uid = ? AND chart_key IS NOT NULL`
                )
                .all(uid) as unknown as ScoreDbRow[]
    );
    return rows.map(row => ({
        recordKey: row.record_key,
        chartKey: row.chart_key,
        achievements: row.achievements,
        dxScore: row.dx_score,
        fc: row.fc,
        fs: row.fs,
        rate: row.rate,
        rating: row.ra,
        playCount: row.play_count,
        lastChangedAt: row.last_changed_at,
    }));
}

function b50Places(user: User, charts: readonly Chart[]): Map<string, B50Place> {
    const selected = selectB50Charts(user.data, createMusicChartMap([...charts]), {
        fitDiff: false,
        nb50: false,
        comboFilter: null,
        pc50: false,
    });
    const result = new Map<string, B50Place>();
    selected.old.forEach((chart, index) => {
        result.set(chartKeyOf(chart), { part: "B35", rank: index + 1 });
    });
    selected.newer.forEach((chart, index) => {
        result.set(chartKeyOf(chart), { part: "B15", rank: index + 1 });
    });
    return result;
}

/** The selected user's copied score rows, play-count estimates and B50 positions. */
export function readUserScores(
    store: Store,
    user: UserListRow,
    charts: readonly Chart[]
): UserScores {
    return store.read(() => {
        const raw = readUser(store, user.uid);
        if (!raw) throw new Error(`user disappeared while reading scores: ${user.uid}`);
        const source = scoreSource(raw);
        const rows = scoreRows(store, user.uid, source);
        const events = readScoreEvents(store, user.uid);
        return {
            user,
            source,
            byChartKey: new Map(rows.map(row => [row.chartKey, row])),
            playCountByRecordKey: calculateUserPlayCountEstimates(events, raw.data.detailed),
            b50ByChartKey: b50Places(raw, charts),
        };
    });
}
