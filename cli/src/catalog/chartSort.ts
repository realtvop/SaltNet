/**
 * The orders `charts` can sort by (design 3.3). Every key has a natural direction, highest or
 * newest first, which `--asc` turns around. A chart whose value for the key is unknown (a
 * banquet chart has no constant, a version the list does not know has no place) comes last
 * whichever way the sort goes. Charts that are equal for the key are told apart by their chart
 * key, so the same data and the same options always give the same order (design 4.5).
 */
import type { ChartEntry } from "./songs";
import MusicSort from "@core/music/sort.json";
import { createGameOrderComparator } from "@core/query/songs";
import { constantOf } from "./chartRow";

/** What is on offer until the user data arrives: scores bring `achievements` and the others. */
export const SORT_KEYS = ["default", "constant", "version"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

const gameOrder = createGameOrderComparator(MusicSort);

/** Ascending by music id and then grade: the order of chart keys such as `146-3`. */
export function compareByChartKey(a: ChartEntry, b: ChartEntry): number {
    return a.chart.music.id - b.chart.music.id || a.chart.info.grade - b.chart.info.grade;
}

/**
 * The game's order, the one the web app starts with: the hardest difficulty first and, within it,
 * the newest song first.
 */
export function compareByGameOrder(a: ChartEntry, b: ChartEntry): number {
    return gameOrder(a.chart, b.chart) || compareByChartKey(a, b);
}

/** Numbers, highest first or lowest first; null (unknown) goes after every number. */
function compareKnown(a: number | null, b: number | null, ascending: boolean): number {
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return ascending ? a - b : b - a;
}

export interface ChartSort {
    readonly key: SortKey;
    /** Lowest first, oldest first, or the game's order backwards. */
    readonly ascending: boolean;
    /** The CN version names, oldest first. */
    readonly versions: readonly string[];
}

/** A copy of `entries` in the requested order. */
export function sortCharts(entries: readonly ChartEntry[], sort: ChartSort): ChartEntry[] {
    const { key, ascending, versions } = sort;
    const versionIndex = new Map(versions.map((name, index) => [name, index]));
    const primary = (a: ChartEntry, b: ChartEntry): number => {
        switch (key) {
            case "constant":
                return compareKnown(constantOf(a.chart), constantOf(b.chart), ascending);
            case "version":
                return compareKnown(
                    versionIndex.get(String(a.chart.music.info.from)) ?? null,
                    versionIndex.get(String(b.chart.music.info.from)) ?? null,
                    ascending
                );
            default:
                return ascending ? -gameOrder(a.chart, b.chart) : gameOrder(a.chart, b.chart);
        }
    };
    return [...entries].sort((a, b) => primary(a, b) || compareByChartKey(a, b));
}
