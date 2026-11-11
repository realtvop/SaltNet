/**
 * The charts a `charts` query selects (design 3.3). Every filter is optional and a chart has to
 * pass all the ones given. Without any the result is every chart except the banquet ones, which
 * only `--diff utage` asks for; the order is the game's (`compareByGameOrder`): the hardest
 * difficulty first, and within it the newest song first. Sorting and grouping are `chartSort.ts`
 * and `chartGroups.ts`.
 */
import type { LevelRange } from "../refs/level";
import type { ChartEntry, SongCatalog } from "./songs";
import { UTAGE_GRADE } from "@core/chart/difficulty";
import { levelInRange } from "../refs/level";
import { constantOf } from "./chartRow";
import { compareByGameOrder } from "./chartSort";
import { searchChartEntries } from "./search";
import { chartKeyOf, songCharts } from "./songs";

export interface ChartFilters {
    /** Levels as the data writes them (`13+`, or `13?` for banquet). */
    readonly levels?: LevelRange;
    /** Internal levels; a chart without one (banquet) never passes. */
    readonly constants?: { readonly from: number | null; readonly to: number | null };
    /** The grades wanted. Without it every grade passes except the banquet one. */
    readonly grades?: readonly number[];
    /** The CN version names wanted. */
    readonly versions?: readonly string[];
    /** The text `search` would be given. */
    readonly search?: string;
    /** Only these charts, by chart key: what a gate, course, plate or collection stands for. */
    readonly within?: ReadonlySet<string>;
}

/** Every chart of the catalog in the game's order. */
export function allChartEntries(catalog: SongCatalog): ChartEntry[] {
    return catalog.songs
        .flatMap(song => songCharts(song).map(chart => ({ chart, song })))
        .sort(compareByGameOrder);
}

/** A chart without a constant (banquet) is in no range, not even an open one. */
function inConstantRange(constant: number | null, range: NonNullable<ChartFilters["constants"]>) {
    if (constant === null) return false;
    return (
        (range.from === null || constant >= range.from) &&
        (range.to === null || constant <= range.to)
    );
}

/** The charts of `entries` that pass every filter, in the order they came in. */
export function filterCharts(
    catalog: SongCatalog,
    entries: readonly ChartEntry[],
    filters: ChartFilters
): ChartEntry[] {
    const { levels, constants, grades, versions, search, within } = filters;
    const found = search === undefined ? undefined : searchChartEntries(catalog, search);
    const foundKeys = found && new Set(found.map(entry => chartKeyOf(entry.chart)));
    const gradeSet = grades && new Set(grades);
    const versionSet = versions && new Set(versions);

    return entries.filter(({ chart }) => {
        const { info, music } = chart;
        if (gradeSet ? !gradeSet.has(info.grade) : info.grade === UTAGE_GRADE) return false;
        if (levels && !levelInRange(info.level, levels)) return false;
        if (constants && !inConstantRange(constantOf(chart), constants)) return false;
        if (versionSet && !versionSet.has(String(music.info.from))) return false;
        const key = chartKeyOf(chart);
        if (within && !within.has(key)) return false;
        return !foundKeys || foundKeys.has(key);
    });
}
