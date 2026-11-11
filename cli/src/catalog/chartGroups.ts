/**
 * The groups `charts --group-by` splits a result into (design 3.3). The groups come in a fixed
 * order, the way the web app lists them, and `--sort` only orders the charts inside each group:
 * constants from the highest, levels from the hardest, versions from the newest, difficulties from
 * BASIC. A chart goes into the group of its own value, so the banquet charts, which have no
 * constant, make a group of their own whose key is null; it comes last.
 */
import type { ChartEntry } from "./songs";
import { difficultyLabel } from "../refs/difficulty";
import { levelValue } from "../refs/level";
import { constantOf } from "./chartRow";

/** What is on offer until the user data arrives: scores bring `rank`, `combo` and `sync`. */
export const GROUP_KEYS = ["constant", "version", "level", "difficulty"] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

export interface ChartGroup {
    /** The value the charts of the group share, as `chartRow` writes it; null for no constant. */
    readonly key: string | null;
    readonly entries: readonly ChartEntry[];
}

/** The key of one chart and the place of its group among the others (the highest comes first). */
function placeOf(
    { chart }: ChartEntry,
    by: GroupKey,
    versionIndex: ReadonlyMap<string, number>
): { key: string | null; rank: number } {
    switch (by) {
        case "constant": {
            const constant = constantOf(chart);
            // One decimal, as the web app shows it.
            return constant === null
                ? { key: null, rank: Number.NEGATIVE_INFINITY }
                : { key: constant.toFixed(1), rank: Number(constant.toFixed(1)) };
        }
        case "version": {
            const key = String(chart.music.info.from);
            return { key, rank: versionIndex.get(key) ?? -1 };
        }
        case "level":
            return { key: chart.info.level, rank: levelValue(chart.info.level) ?? -1 };
        default:
            // BASIC first, so the grade counts backwards.
            return { key: difficultyLabel(chart.info.grade), rank: -chart.info.grade };
    }
}

/**
 * Splits `entries` into groups, each keeping the order its charts had. `versions` are the CN
 * version names, oldest first.
 */
export function groupCharts(
    entries: readonly ChartEntry[],
    by: GroupKey,
    versions: readonly string[]
): ChartGroup[] {
    const versionIndex = new Map(versions.map((name, index) => [name, index]));
    const found = new Map<string | null, { rank: number; entries: ChartEntry[] }>();
    for (const entry of entries) {
        const { key, rank } = placeOf(entry, by, versionIndex);
        const group = found.get(key);
        if (group) group.entries.push(entry);
        else found.set(key, { rank, entries: [entry] });
    }
    // Groups of equal rank (levels such as `13` and `13?`, versions the list does not know) are
    // told apart by their keys, so the order never depends on which chart came first.
    const text = (key: string | null) => key ?? "";
    return [...found]
        .sort(
            ([keyA, a], [keyB, b]) =>
                b.rank - a.rank || (text(keyA) < text(keyB) ? -1 : text(keyA) > text(keyB) ? 1 : 0)
        )
        .map(([key, group]) => ({ key, entries: group.entries }));
}
