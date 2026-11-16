import { ComboStatus, RankRate, SyncStatus } from "@core/mai/types";
import { describe, expect, it } from "vitest";
import {
    comboLabel,
    COMBOS,
    parseScoreCondition,
    rankLabel,
    RANKS,
    scoreReachesCondition,
    syncLabel,
} from "../../src/refs/status";

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

describe("score conditions", () => {
    const score = (overrides: Partial<Parameters<typeof scoreReachesCondition>[0]> = {}) => ({
        achievements: 100,
        rate: RankRate.sss,
        fc: ComboStatus.FullComboPlus,
        fs: SyncStatus.FullSyncDX,
        ...overrides,
    });

    it("parses every game spelling without regard to case", () => {
        for (const rank of RANKS) {
            expect(parseScoreCondition(rankLabel(rank).toUpperCase())).toEqual({
                kind: "rank",
                value: rank,
            });
        }
        expect(parseScoreCondition("ClEaR")).toEqual({ kind: "clear" });
        expect(parseScoreCondition("fC+")).toEqual({
            kind: "combo",
            value: ComboStatus.FullComboPlus,
        });
        expect(parseScoreCondition("FdX+")).toEqual({
            kind: "sync",
            value: SyncStatus.FullSyncDXPlus,
        });
    });

    it("uses at-least ordering and rejects unknown stored values", () => {
        expect(scoreReachesCondition(score(), parseScoreCondition("sss"))).toBe(true);
        expect(scoreReachesCondition(score(), parseScoreCondition("sss+"))).toBe(false);
        expect(scoreReachesCondition(score(), parseScoreCondition("fc"))).toBe(true);
        expect(scoreReachesCondition(score(), parseScoreCondition("ap"))).toBe(false);
        expect(scoreReachesCondition(score(), parseScoreCondition("fs"))).toBe(true);
        expect(scoreReachesCondition(score(), parseScoreCondition("fdx+"))).toBe(false);
        expect(scoreReachesCondition(score({ rate: "unknown" }), parseScoreCondition("d"))).toBe(
            false
        );
        expect(scoreReachesCondition(score({ fc: "unknown" }), parseScoreCondition("fc"))).toBe(
            false
        );
        expect(scoreReachesCondition(score({ fs: "unknown" }), parseScoreCondition("sync"))).toBe(
            false
        );
    });

    it("checks every rank, combo and sync threshold at its exact and one-below boundary", () => {
        for (let index = 0; index < RANKS.length; index++) {
            const condition = parseScoreCondition(rankLabel(RANKS[index]));
            expect(scoreReachesCondition(score({ rate: RANKS[index] }), condition)).toBe(true);
            const below = index === 0 ? "unknown" : RANKS[index - 1];
            expect(scoreReachesCondition(score({ rate: below }), condition)).toBe(false);
        }
        for (let index = 1; index < COMBOS.length; index++) {
            const condition = parseScoreCondition(comboLabel(COMBOS[index])!);
            expect(scoreReachesCondition(score({ fc: COMBOS[index] }), condition)).toBe(true);
            expect(scoreReachesCondition(score({ fc: COMBOS[index - 1] }), condition)).toBe(false);
        }
        const syncs = Object.values(SyncStatus);
        for (let index = 1; index < syncs.length; index++) {
            const condition = parseScoreCondition(syncLabel(syncs[index])!);
            expect(scoreReachesCondition(score({ fs: syncs[index] }), condition)).toBe(true);
            expect(scoreReachesCondition(score({ fs: syncs[index - 1] }), condition)).toBe(false);
        }
    });

    it("checks clear at exactly 80 and requires a numeric achievement", () => {
        expect(
            scoreReachesCondition(score({ achievements: 79.9999 }), parseScoreCondition("clear"))
        ).toBe(false);
        expect(
            scoreReachesCondition(score({ achievements: 80 }), parseScoreCondition("clear"))
        ).toBe(true);
        expect(scoreReachesCondition(score({ achievements: null }), parseScoreCondition("d"))).toBe(
            false
        );
        expect(scoreReachesCondition(undefined, parseScoreCondition("d"))).toBe(false);
    });

    it("lists every valid condition in an invalid-value USAGE error", () => {
        expect(() => parseScoreCondition("rainbow")).toThrow(/d、c、b.*sss\+、clear.*fdx\+/);
    });
});
