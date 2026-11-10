/**
 * Charts as the commands print them (design 4.4): the row that every command listing charts
 * shares, and the details only `chart` adds (charter, note counts, statistics). A value that is
 * not known is null, never left out and never a placeholder such as 0.
 */
import type { ChartStats } from "@core/integrations/diving-fish/type";
import type { Chart } from "@core/music/type";
import type { ChartEntry } from "./songs";
import { difficultyLabel } from "../refs/difficulty";
import { comboLabel, COMBOS, rankLabel, RANKS } from "../refs/status";
import { chartKeyOf, musicType } from "./songs";

export interface ChartRow {
    readonly chartKey: string;
    readonly musicId: number;
    readonly title: string;
    readonly type: "SD" | "DX";
    readonly difficulty: string;
    readonly level: string;
    /** The internal level; null where the game has none (banquet charts, whose level is `13?`). */
    readonly constant: number | null;
    /** The level players' results suggest; null without enough of them. */
    readonly fitConstant: number | null;
    /** The CN version the song was added in. */
    readonly version: string;
    /** Null for a chart nobody played; scores come with the user data. */
    readonly score: null;
    /** Null for a chart outside the user's B50; B50 comes with the user data. */
    readonly b50: null;
}

function positive(value: number | undefined): number | null {
    return value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
}

/** Upstream's statistics carry fifteen digits; the web app shows four, and so do we. */
function round(value: number, digits: number): number {
    return Number(value.toFixed(digits));
}

/** The fit constant, to the four decimals the web app shows; null without statistics. */
function fitConstantOf(stat: ChartStats | undefined): number | null {
    const fit = positive(stat?.fit_diff);
    return fit === null ? null : round(fit, 4);
}

export function chartRow({ chart }: ChartEntry): ChartRow {
    const { info, music } = chart;
    return {
        chartKey: chartKeyOf(chart),
        musicId: music.id,
        title: music.info.title,
        type: musicType(music),
        difficulty: difficultyLabel(info.grade),
        level: info.level,
        constant: positive(info.constant),
        fitConstant: fitConstantOf(info.stat),
        version: String(music.info.from),
        score: null,
        b50: null,
    };
}

export interface ChartNotes {
    readonly tap: number | null;
    readonly hold: number | null;
    readonly slide: number | null;
    /** Null for an SD chart, which has no touch notes. */
    readonly touch: number | null;
    readonly break: number | null;
    /** Null when any count is unknown. */
    readonly total: number | null;
}

/**
 * The note counts of a chart. The data holds four numbers for an SD chart (tap, hold, slide,
 * break) and five for a DX chart (touch before break). A banquet chart's counts are unknown:
 * when tap, hold and break are all missing the chart has no note data, and the zeros the
 * conversion puts in place of its slide and touch counts are not counts either.
 */
export function chartNotes(chart: Chart): ChartNotes {
    const notes: readonly (number | null | undefined)[] = chart.info.notes;
    const count = (index: number): number | null => notes[index] ?? null;
    const hasTouch = notes.length === 5;
    const parts = {
        tap: count(0),
        hold: count(1),
        slide: count(2),
        touch: hasTouch ? count(3) : null,
        break: hasTouch ? count(4) : count(3),
    };
    if (parts.tap === null && parts.hold === null && parts.break === null) {
        return { tap: null, hold: null, slide: null, touch: null, break: null, total: null };
    }
    const known = [
        parts.tap,
        parts.hold,
        parts.slide,
        parts.break,
        ...(hasTouch ? [parts.touch] : []),
    ];
    const total = known.every(part => part !== null)
        ? known.reduce<number>((sum, part) => sum + (part ?? 0), 0)
        : null;
    return { ...parts, total };
}

export interface ChartStatsRow {
    /** How many players' results the numbers are made from. */
    readonly samples: number;
    readonly avgAchievements: number;
    readonly avgDxScore: number;
    readonly stdDevAchievements: number;
    /** Players per rank, `D` to `SSS+`. */
    readonly rankDist: Readonly<Record<string, number>>;
    /** Players per combo status: `none`, `FC`, `FC+`, `AP`, `AP+`. */
    readonly comboDist: Readonly<Record<string, number>>;
}

/** What players' results say about a chart; null for a chart without any. */
export function chartStats(stat: ChartStats | undefined): ChartStatsRow | null {
    if (!stat) return null;
    const dist = (labels: readonly string[], counts: readonly number[] | undefined) =>
        Object.fromEntries(labels.map((label, index) => [label, counts?.[index] ?? 0]));
    return {
        samples: stat.cnt,
        avgAchievements: round(stat.avg, 4),
        avgDxScore: round(stat.avg_dx, 2),
        stdDevAchievements: round(stat.std_dev, 4),
        rankDist: dist(RANKS.map(rankLabel), stat.dist),
        comboDist: dist(
            COMBOS.map(combo => comboLabel(combo) ?? "none"),
            stat.fc_dist
        ),
    };
}

export interface ChartDetails {
    /** Null where the data has none (banquet charts) or only a dash. */
    readonly charter: string | null;
    readonly notes: ChartNotes;
    readonly stats: ChartStatsRow | null;
}

/** What `chart` adds to the row. */
export function chartDetails(chart: Chart): ChartDetails {
    const charter = chart.info.charter?.trim();
    return {
        charter: charter && charter !== "-" ? charter : null,
        notes: chartNotes(chart),
        stats: chartStats(chart.info.stat),
    };
}
