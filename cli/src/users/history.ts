/** Builds score-history timelines before any window or display filter is applied. */
import type { ScoreHistoryEventV1, ScoreHistoryTimelineEntry } from "@core/user/scoreHistory/type";
import type { Store } from "../store/store";
import { ScoreHistoryChange } from "@core/user/scoreHistory/type";
import { readScoreEvents } from "./repository";

export interface ScoreRecordLink {
    readonly recordKey: string;
    readonly chartKey: string | null;
}

export interface StoredScoreHistory {
    readonly events: readonly ScoreHistoryEventV1[];
    /** Every detailed-score row, including rows that could not be matched to the current catalog. */
    readonly links: readonly ScoreRecordLink[];
}

export interface KeyedScoreHistoryEntry {
    readonly recordKey: string;
    readonly entry: ScoreHistoryTimelineEntry;
}

interface ScoreLinkDbRow {
    record_key: string;
    chart_key: string | null;
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function ascending(left: ScoreHistoryEventV1, right: ScoreHistoryEventV1): number {
    if (left.observedAt !== right.observedAt) return left.observedAt < right.observedAt ? -1 : 1;
    if (left.sequence !== right.sequence) return left.sequence - right.sequence;
    return compareText(left.id, right.id);
}

/** Reads the events and the record-key links from one consistent database view. */
export function readStoredScoreHistory(store: Store, userUid: string): StoredScoreHistory {
    return store.read(() => {
        const events = readScoreEvents(store, userUid);
        const rows = store.db
            .prepare(
                `SELECT record_key, chart_key
                 FROM scores
                 WHERE user_uid = ?
                 ORDER BY record_key`
            )
            .all(userUid) as unknown as ScoreLinkDbRow[];
        return {
            events,
            links: rows.map(row => ({ recordKey: row.record_key, chartKey: row.chart_key })),
        };
    });
}

/**
 * Reproduces the web dialog's per-key timeline: each event sees the state immediately before it.
 * Event id is the deterministic final order when imported data gives two events the same time and
 * sequence.
 */
export function buildScoreHistoryTimeline(
    events: readonly ScoreHistoryEventV1[]
): KeyedScoreHistoryEntry[] {
    const byKey = new Map<string, ScoreHistoryEventV1[]>();
    for (const event of events) {
        const found = byKey.get(event.chartKey);
        if (found) found.push(event);
        else byKey.set(event.chartKey, [event]);
    }

    const timeline: KeyedScoreHistoryEntry[] = [];
    for (const [recordKey, unordered] of byKey) {
        const ordered = [...unordered].sort(ascending);
        ordered.forEach((event, index) => {
            timeline.push({
                recordKey,
                entry: {
                    event,
                    before: index === 0 ? null : ordered[index - 1].state,
                    after: event.state,
                },
            });
        });
    }
    return timeline;
}

/** Applies the two history options only after every entry's previous state has been found. */
export function filterScoreHistory(
    timeline: readonly KeyedScoreHistoryEntry[],
    options: { readonly since?: number; readonly allChanges: boolean }
): KeyedScoreHistoryEntry[] {
    return timeline.filter(({ entry }) => {
        if (options.since !== undefined && entry.event.observedAt < options.since) return false;
        return (
            options.allChanges ||
            entry.event.kind === "initial" ||
            entry.event.changedMask !== ScoreHistoryChange.PlayCount
        );
    });
}

/** Newest first across every key; event id breaks an otherwise exact tie in ascending order. */
export function sortScoreHistoryNewest(
    timeline: readonly KeyedScoreHistoryEntry[]
): KeyedScoreHistoryEntry[] {
    return [...timeline].sort((left, right) => {
        const a = left.entry.event;
        const b = right.entry.event;
        if (a.observedAt !== b.observedAt) return a.observedAt > b.observedAt ? -1 : 1;
        if (a.sequence !== b.sequence) return b.sequence - a.sequence;
        return compareText(a.id, b.id);
    });
}

/** Resolves the stored score record key for one chart key. */
export function chartRecordKey(links: readonly ScoreRecordLink[], chartKey: string): string {
    for (const link of links) {
        if (link.chartKey === chartKey) return link.recordKey;
    }
    return chartKey;
}

/** Reads and builds the score-history timeline entries of one chart. */
export function readChartScoreHistoryEntries(
    store: Store,
    userUid: string,
    chartKey: string,
    options: { readonly since?: number; readonly allChanges: boolean } = { allChanges: false }
): ScoreHistoryTimelineEntry[] {
    const stored = readStoredScoreHistory(store, userUid);
    const recordKey = chartRecordKey(stored.links, chartKey);
    const events = stored.events.filter(event => event.chartKey === recordKey);
    const timeline = buildScoreHistoryTimeline(events);
    const filtered = filterScoreHistory(timeline, options);
    return sortScoreHistoryNewest(filtered).map(item => item.entry);
}
