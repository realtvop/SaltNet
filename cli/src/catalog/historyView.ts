/** Shapes a score-history timeline entry with the same chart row every chart-list command uses. */
import type { ComboStatus, SyncStatus } from "@core/mai/types";
import type { ScoreHistoryStateV1, ScoreHistoryTimelineEntry } from "@core/user/scoreHistory/type";
import type { UserScores } from "../users/scores";
import type { ChartRow } from "./chartRow";
import type { ChartEntry } from "./songs";
import { ScoreHistoryChange } from "@core/user/scoreHistory/type";
import { comboLabel, COMBOS, syncLabel, SYNCS } from "../refs/status";
import { formatLocalTime } from "../util/time";
import { chartRow } from "./chartRow";

export type HistoryField = "achievements" | "dxScore" | "combo" | "sync" | "playCount";
export type HistoryValue = number | string | null;

export interface HistoryChange {
    readonly field: HistoryField;
    readonly before: HistoryValue;
    readonly after: HistoryValue;
}

export interface ChartHistoryEntry {
    readonly eventId: string;
    readonly time: string | null;
    readonly source: "inGame" | "lxns" | "divingFishImport" | "divingFishPublic";
    readonly kind: "initial" | "change";
    readonly changes: readonly HistoryChange[];
}

export interface HistoryItem extends ChartRow, ChartHistoryEntry {}

function known<T extends string>(values: readonly T[], value: string): T | undefined {
    return values.includes(value as T) ? (value as T) : undefined;
}

function valueOf(state: ScoreHistoryStateV1, field: HistoryField): HistoryValue {
    if (field === "combo") {
        const value = known(COMBOS, state.fc);
        return value === undefined ? null : comboLabel(value as ComboStatus);
    }
    if (field === "sync") {
        const value = known(SYNCS, state.fs);
        return value === undefined ? null : syncLabel(value as SyncStatus);
    }
    return state[field];
}

const FIELDS = [
    ["achievements", ScoreHistoryChange.Achievements],
    ["dxScore", ScoreHistoryChange.DxScore],
    ["combo", ScoreHistoryChange.ComboStatus],
    ["sync", ScoreHistoryChange.SyncStatus],
    ["playCount", ScoreHistoryChange.PlayCount],
] as const satisfies readonly (readonly [HistoryField, number])[];

/** The fields and order shown by `getScoreHistoryDisplayChanges` in the web app. */
export function historyChanges(entry: ScoreHistoryTimelineEntry): HistoryChange[] {
    return FIELDS.filter(
        ([, bit]) => entry.event.kind === "initial" || (entry.event.changedMask & bit) > 0
    ).map(([field]) => ({
        field,
        before:
            entry.event.kind === "initial" || entry.before === null
                ? null
                : valueOf(entry.before, field),
        after: valueOf(entry.after, field),
    }));
}

function eventTime(value: number): string | null {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : formatLocalTime(date);
}

export function chartHistoryEntry(entry: ScoreHistoryTimelineEntry): ChartHistoryEntry {
    return {
        eventId: entry.event.id,
        time: eventTime(entry.event.observedAt),
        source: entry.event.source,
        kind: entry.event.kind,
        changes: historyChanges(entry),
    };
}

export function historyItem(
    chart: ChartEntry,
    entry: ScoreHistoryTimelineEntry,
    scores?: UserScores
): HistoryItem {
    return {
        ...chartRow(chart, scores),
        ...chartHistoryEntry(entry),
    };
}
