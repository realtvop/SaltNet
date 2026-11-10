/**
 * The game's spellings of ranks and combo statuses (design 4.5): `SSS+`, `AP+`. Commands print
 * these; the score filters of later steps accept them as well.
 */
import { ComboStatus, RANK_RATE_DISPLAY_NAMES, RankRate } from "@core/mai/types";

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
