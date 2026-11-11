/**
 * The charts a gate, a course, a plate or a collection stands for (design 3.3), worked out by the
 * same core functions the web app uses. Each comes as a set of chart keys, so a query can ask for
 * the charts that are in all of the sets it was given.
 */
import type { Collection } from "@core/collection/type";
import type { Course } from "@core/course";
import type { KaleidxscopeGate } from "@core/kaleidxscope";
import type { ChartEntry } from "./songs";
import { getCollectionCharts } from "@core/collection/versionPlate";
import { getCourseCharts } from "@core/course";
import { chartKeyOf } from "./songs";

export interface ChartSet {
    readonly keys: ReadonlySet<string>;
    /** Where each chart comes when the set has an order of its own (the tracks of a course). */
    readonly order?: ReadonlyMap<string, number>;
}

/**
 * Every chart of every song the gate asks for: its key condition and the pools its tracks draw
 * from. The difficulty is left to the caller, as it is for every other filter.
 */
export function gateCharts(gate: KaleidxscopeGate, entries: readonly ChartEntry[]): ChartSet {
    const musicIds = new Set([
        ...gate.keyCondition.songs.map(song => song.musicId),
        ...gate.selectionPools.flatMap(pool => pool.songs.map(song => song.musicId)),
    ]);
    const keys = entries.filter(({ chart }) => musicIds.has(chart.music.id)).map(entryKey);
    return { keys: new Set(keys) };
}

/** The tracks of the course, in the order they are played; a track the catalog lacks is left out. */
export function courseCharts(course: Course, entries: readonly ChartEntry[]): ChartSet {
    const order = new Map<string, number>();
    for (const chart of getCourseCharts(
        course,
        entries.map(({ chart }) => chart)
    )) {
        const key = chartKeyOf(chart);
        if (!order.has(key)) order.set(key, order.size);
    }
    return { keys: new Set(order.keys()), order };
}

/** The charts one of the requirements of the collection names, with their difficulties. */
export function collectionCharts(collection: Collection, entries: readonly ChartEntry[]): ChartSet {
    const charts = getCollectionCharts(
        collection,
        entries.map(({ chart }) => chart)
    );
    return { keys: new Set(charts.map(chart => chartKeyOf(chart))) };
}

/** Whether the collection has any song in its conditions; without one it names no chart. */
export function hasSongRequirement(collection: Collection): boolean {
    return (collection.required ?? []).some(requirement => (requirement.songs?.length ?? 0) > 0);
}

/** The chart keys that are in every set, or undefined when there are no sets to ask. */
export function intersectChartSets(sets: readonly ChartSet[]): ReadonlySet<string> | undefined {
    if (sets.length === 0) return undefined;
    const [first, ...rest] = sets;
    return new Set([...first.keys].filter(key => rest.every(set => set.keys.has(key))));
}

function entryKey({ chart }: ChartEntry): string {
    return chartKeyOf(chart);
}
