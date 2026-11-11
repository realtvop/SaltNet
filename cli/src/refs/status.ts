/**
 * The game's spellings of ranks, combo statuses and sync statuses (design 4.5): `SSS+`, `AP+`,
 * `FDX+`. Commands print these; the score filters of later steps accept them as well.
 */
import { ComboStatus, RANK_RATE_DISPLAY_NAMES, RankRate, SyncStatus } from "@core/mai/types";

/** Every rank, from the lowest to the highest (the order of the enum). */
export const RANKS: readonly RankRate[] = Object.values(RankRate);

/** Every combo status, from none to the best (the order of the enum). */
export const COMBOS: readonly ComboStatus[] = Object.values(ComboStatus);

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
