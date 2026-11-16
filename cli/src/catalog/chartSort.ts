/**
 * The orders `charts` can sort by (design 3.3). Every key has a natural direction, highest or
 * newest first, which `--asc` turns around. A chart whose value for the key is unknown (a
 * banquet chart has no constant, a version the list does not know has no place) comes last
 * whichever way the sort goes. Most equal values use the chart key; `recent` first uses the web
 * app's achievements/rating/constant chain, and score-aware `default` uses game order. Every path
 * ends at the chart key, so the same data and options always give the same order (design 4.5).
 */
import type { UserScores } from "../users/scores";
import type { ChartEntry } from "./songs";
import MusicSort from "@core/music/sort.json";
import { createGameOrderComparator } from "@core/query/songs";
import { constantOf } from "./chartRow";
import { chartChangedAt, chartScoreOf } from "./chartScore";
import { chartKeyOf } from "./songs";

export const SORT_KEYS = [
    "default",
    "constant",
    "achievements",
    "rating",
    "playcount",
    "version",
    "recent",
] as const;
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
    readonly scores?: UserScores;
    /**
     * The order a selection has of its own, by chart key (the tracks of a course). `default` takes
     * it in place of the game's order: the first track first, and `--asc` the last.
     */
    readonly order?: ReadonlyMap<string, number>;
}

/** A copy of `entries` in the requested order. */
export function sortCharts(entries: readonly ChartEntry[], sort: ChartSort): ChartEntry[] {
    const { key, ascending, versions, order, scores } = sort;
    const versionIndex = new Map(versions.map((name, index) => [name, index]));
    const placeOf = (entry: ChartEntry) => order?.get(chartKeyOf(entry.chart)) ?? null;
    const scoreOf = (entry: ChartEntry) => chartScoreOf(entry.chart, scores);
    const scoreValue = (entry: ChartEntry): number | null => {
        const score = scoreOf(entry);
        switch (key) {
            case "achievements":
                return score?.achievements ?? null;
            case "rating":
                return score?.rating ?? null;
            case "playcount":
                return score?.playCount ?? null;
            case "recent":
                return chartChangedAt(entry.chart, scores);
            default:
                return null;
        }
    };
    const recentTie = (a: ChartEntry, b: ChartEntry): number => {
        const scoreA = scoreOf(a);
        const scoreB = scoreOf(b);
        return (
            compareKnown(scoreA?.achievements ?? null, scoreB?.achievements ?? null, false) ||
            compareKnown(scoreA?.rating ?? null, scoreB?.rating ?? null, false) ||
            compareKnown(constantOf(a.chart), constantOf(b.chart), false)
        );
    };
    const defaultOrder = (a: ChartEntry, b: ChartEntry): number => {
        if (order) return compareKnown(placeOf(a), placeOf(b), !ascending);
        const achievementsA = scoreOf(a)?.achievements ?? null;
        const achievementsB = scoreOf(b)?.achievements ?? null;
        const playedA = achievementsA !== null;
        const playedB = achievementsB !== null;
        if (playedA !== playedB) return playedA ? -1 : 1;
        if (playedA && playedB) {
            return (
                compareKnown(achievementsA, achievementsB, ascending) || compareByGameOrder(a, b)
            );
        }
        return ascending ? -gameOrder(a.chart, b.chart) : gameOrder(a.chart, b.chart);
    };
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
            case "achievements":
            case "rating":
            case "playcount":
                return compareKnown(scoreValue(a), scoreValue(b), ascending);
            case "recent":
                return compareKnown(scoreValue(a), scoreValue(b), ascending) || recentTie(a, b);
            default:
                return defaultOrder(a, b);
        }
    };
    return [...entries].sort((a, b) => primary(a, b) || compareByChartKey(a, b));
}
