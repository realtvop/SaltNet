/** Counts over chart results, matching the songs page's score statistics. */
import type { UserScores } from "../users/scores";
import type { ChartEntry } from "./songs";
import { ComboStatus, SyncStatus } from "@core/mai/types";
import { chartKeyOf } from "./songs";

export interface ChartResultStats {
    readonly total: number;
    readonly played: number;
    /** Achievements at least 100, including SSS+. */
    readonly sss: number;
    readonly sssPlus: number;
    readonly fc: number;
    readonly ap: number;
    readonly fdx: number;
}

export function countChartResultStats(
    entries: readonly ChartEntry[],
    scores?: UserScores
): ChartResultStats {
    let played = 0;
    let sss = 0;
    let sssPlus = 0;
    let fc = 0;
    let ap = 0;
    let fdx = 0;
    for (const entry of entries) {
        const score = scores?.byChartKey.get(chartKeyOf(entry.chart));
        if (typeof score?.achievements === "number") {
            played += 1;
            if (score.achievements >= 100) sss += 1;
            if (score.achievements >= 100.5) sssPlus += 1;
        }
        if (
            score?.fc === ComboStatus.FullCombo ||
            score?.fc === ComboStatus.FullComboPlus ||
            score?.fc === ComboStatus.AllPerfect ||
            score?.fc === ComboStatus.AllPerfectPlus
        ) {
            fc += 1;
        }
        if (score?.fc === ComboStatus.AllPerfect || score?.fc === ComboStatus.AllPerfectPlus) {
            ap += 1;
        }
        if (score?.fs === SyncStatus.FullSyncDX || score?.fs === SyncStatus.FullSyncDXPlus) {
            fdx += 1;
        }
    }
    return { total: entries.length, played, sss, sssPlus, fc, ap, fdx };
}
