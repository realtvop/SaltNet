/**
 * The game's spellings of ranks, combo statuses and sync statuses (design 4.5): `SSS+`, `AP+`,
 * `FDX+`. Commands print these, and the score filters accept the same spellings without regard
 * to case.
 */
import {
    ACHIEVEMENT_RATE_THRESHOLDS,
    ComboStatus,
    RANK_RATE_DISPLAY_NAMES,
    RankRate,
    SyncStatus,
} from "@core/mai/types";
import { usageError } from "../errors";

/** Every rank, from the lowest to the highest (the order of the enum). */
export const RANKS: readonly RankRate[] = Object.values(RankRate);

/** Every combo status, from none to the best (the order of the enum). */
export const COMBOS: readonly ComboStatus[] = Object.values(ComboStatus);

/** Every sync status, from none to the best (the order of the enum). */
export const SYNCS: readonly SyncStatus[] = Object.values(SyncStatus);

/** `D` to `SSS+`. */
export function rankLabel(rank: RankRate): string {
    return RANK_RATE_DISPLAY_NAMES[rank];
}

const COMBO_LABELS: Readonly<Record<ComboStatus, string | null>> = {
    [ComboStatus.None]: null,
    [ComboStatus.FullCombo]: "FC",
    [ComboStatus.FullComboPlus]: "FC+",
    [ComboStatus.AllPerfect]: "AP",
    [ComboStatus.AllPerfectPlus]: "AP+",
};

/** `FC`, `FC+`, `AP` or `AP+`; null for no combo. */
export function comboLabel(combo: ComboStatus): string | null {
    return COMBO_LABELS[combo];
}

const SYNC_LABELS: Readonly<Record<SyncStatus, string | null>> = {
    [SyncStatus.None]: null,
    [SyncStatus.Sync]: "SYNC",
    [SyncStatus.FullSync]: "FS",
    [SyncStatus.FullSyncPlus]: "FS+",
    [SyncStatus.FullSyncDX]: "FDX",
    [SyncStatus.FullSyncDXPlus]: "FDX+",
};

/** `SYNC`, `FS`, `FS+`, `FDX` or `FDX+`; null for no sync. */
export function syncLabel(sync: SyncStatus): string | null {
    return SYNC_LABELS[sync];
}

export type ScoreCondition =
    | { readonly kind: "rank"; readonly value: RankRate }
    | { readonly kind: "clear" }
    | { readonly kind: "combo"; readonly value: ComboStatus }
    | { readonly kind: "sync"; readonly value: SyncStatus };

export const SCORE_CONDITIONS = [
    ...RANKS.map(rankLabel).map(value => value.toLowerCase()),
    "clear",
    ...COMBOS.map(comboLabel)
        .filter((value): value is string => value !== null)
        .map(value => value.toLowerCase()),
    ...SYNCS.map(syncLabel)
        .filter((value): value is string => value !== null)
        .map(value => value.toLowerCase()),
] as const;

/** One `--achieved` or `--missing` threshold, in the game's spelling or internal enum spelling. */
export function parseScoreCondition(text: string): ScoreCondition {
    const folded = text.trim().toLowerCase();
    if (folded === "clear") return { kind: "clear" };

    const rank = RANKS.find(
        value => value.toLowerCase() === folded || rankLabel(value).toLowerCase() === folded
    );
    if (rank !== undefined) return { kind: "rank", value: rank };
    const combo = COMBOS.find(
        value =>
            value !== ComboStatus.None &&
            (value.toLowerCase() === folded || comboLabel(value)?.toLowerCase() === folded)
    );
    if (combo !== undefined) return { kind: "combo", value: combo };
    const sync = SYNCS.find(
        value =>
            value !== SyncStatus.None &&
            (value.toLowerCase() === folded || syncLabel(value)?.toLowerCase() === folded)
    );
    if (sync !== undefined) return { kind: "sync", value: sync };

    throw usageError(`成绩条件「${text}」无效；可用：${SCORE_CONDITIONS.join("、")}`);
}

function reaches<T extends string>(
    current: string | null,
    required: T,
    order: readonly T[]
): boolean {
    const currentIndex = order.indexOf(current as T);
    const requiredIndex = order.indexOf(required);
    return currentIndex >= 0 && requiredIndex >= 0 && currentIndex >= requiredIndex;
}

/** Whether a stored score reaches a parsed threshold, using the version-plate ordering. */
export function scoreReachesCondition(
    score:
        | {
              readonly achievements: number | null;
              readonly rate: string | null;
              readonly fc: string | null;
              readonly fs: string | null;
          }
        | undefined,
    condition: ScoreCondition
): boolean {
    if (!score || typeof score.achievements !== "number") return false;
    switch (condition.kind) {
        case "clear":
            return score.achievements >= 80;
        case "rank":
            return reaches(score.rate, condition.value, RANKS);
        case "combo":
            return reaches(score.fc, condition.value, COMBOS);
        case "sync":
            return reaches(score.fs, condition.value, SYNCS);
    }
}

/** Parses a target rank (any case) or numeric achievement rate (0 to 101) into an achievement rate number. */
export function parseTargetRate(text: string): number {
    const folded = text.trim().toLowerCase();
    const rank = RANKS.find(
        value => value.toLowerCase() === folded || rankLabel(value).toLowerCase() === folded
    );
    if (rank !== undefined) {
        if (rank === RankRate.d) return 0;
        const found = ACHIEVEMENT_RATE_THRESHOLDS.find(t => t.rank === rank);
        if (found) return found.threshold;
    }
    if (/^\d+(?:\.\d+)?$/.test(text.trim())) {
        const numVal = Number(text.trim());
        if (numVal >= 0 && numVal <= 101) {
            return numVal;
        }
    }
    throw usageError(`目标「${text}」无效；应为评级（如 sss+）或 0 到 101 之间的达成率`);
}
