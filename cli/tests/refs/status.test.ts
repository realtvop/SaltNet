import { ComboStatus, RankRate, SyncStatus } from "@core/mai/types";
import { describe, expect, it } from "vitest";
import { comboLabel, COMBOS, rankLabel, RANKS, syncLabel } from "../../src/refs/status";

const EXPECTED_RANKS = [
    "d",
    "c",
    "b",
    "bb",
    "bbb",
    "a",
    "aa",
    "aaa",
    "s",
    "sp",
    "ss",
    "ssp",
    "sss",
    "sssp",
] as const;

const EXPECTED_RANK_LABELS = [
    "D",
    "C",
    "B",
    "BB",
    "BBB",
    "A",
    "AA",
    "AAA",
    "S",
    "S+",
    "SS",
    "SS+",
    "SSS",
    "SSS+",
] as const;

const EXPECTED_COMBOS = [
    ComboStatus.None,
    ComboStatus.FullCombo,
    ComboStatus.FullComboPlus,
    ComboStatus.AllPerfect,
    ComboStatus.AllPerfectPlus,
] as const;

const EXPECTED_COMBO_LABELS = [null, "FC", "FC+", "AP", "AP+"] as const;

describe("the RANKS list and rankLabel", () => {
    it("contains the 14 RankRate values in enum order", () => {
        expect(RANKS).toEqual(EXPECTED_RANKS);
        expect(RANKS).toEqual(Object.values(RankRate));
        expect(RANKS).toHaveLength(14);
    });

    it("maps each rank to the game's display spelling", () => {
        expect(RANKS.map(rankLabel)).toEqual(EXPECTED_RANK_LABELS);
    });

    it("gives the exact label for each individual rank", () => {
        for (let i = 0; i < RANKS.length; i++) {
            expect(rankLabel(RANKS[i])).toBe(EXPECTED_RANK_LABELS[i]);
        }
    });
});

describe("the COMBOS list and comboLabel", () => {
    it("contains the five ComboStatus values in enum order", () => {
        expect(COMBOS).toEqual(EXPECTED_COMBOS);
        expect(COMBOS).toEqual(Object.values(ComboStatus));
        expect(COMBOS).toHaveLength(5);
    });

    it("maps each combo status to the expected label in order", () => {
        expect(COMBOS.map(comboLabel)).toEqual(EXPECTED_COMBO_LABELS);
    });

    it("returns null for no combo and short label for combos", () => {
        expect(comboLabel(ComboStatus.None)).toBeNull();
        expect(comboLabel(ComboStatus.FullCombo)).toBe("FC");
        expect(comboLabel(ComboStatus.FullComboPlus)).toBe("FC+");
        expect(comboLabel(ComboStatus.AllPerfect)).toBe("AP");
        expect(comboLabel(ComboStatus.AllPerfectPlus)).toBe("AP+");
    });
});

const EXPECTED_SYNC_LABELS = [null, "SYNC", "FS", "FS+", "FDX", "FDX+"] as const;

describe("the sync labels", () => {
    it("maps all six SyncStatus values in enum order to the expected labels", () => {
        expect(Object.values(SyncStatus).map(syncLabel)).toEqual(EXPECTED_SYNC_LABELS);
    });

    it("gives the exact label for each individual sync status", () => {
        expect(syncLabel(SyncStatus.None)).toBeNull();
        expect(syncLabel(SyncStatus.Sync)).toBe("SYNC");
        expect(syncLabel(SyncStatus.FullSync)).toBe("FS");
        expect(syncLabel(SyncStatus.FullSyncPlus)).toBe("FS+");
        expect(syncLabel(SyncStatus.FullSyncDX)).toBe("FDX");
        expect(syncLabel(SyncStatus.FullSyncDXPlus)).toBe("FDX+");
    });
});
