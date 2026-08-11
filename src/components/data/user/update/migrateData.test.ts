import { describe, expect, it } from "vitest";
import { ComboStatus, RankRate, SyncStatus } from "../../maiTypes";
import type { DivingFishFullRecord } from "@/components/integrations/diving-fish/type";
import { convertDetailed } from "..";
import { migrateRecordList } from "./migrateData";

function createRecord(overrides: Partial<DivingFishFullRecord> = {}): DivingFishFullRecord {
    return {
        achievements: 100.5,
        ds: 13.7,
        dxScore: 2_500,
        fc: ComboStatus.FullCombo,
        fs: SyncStatus.FullSync,
        level: "13+",
        level_index: 3,
        level_label: "Master",
        play_count: 10,
        ra: 300,
        rate: RankRate.sssp,
        song_id: 1,
        title: "Test song",
        type: "DX",
        ...overrides,
    };
}

describe("migrateRecordList", () => {
    it("timestamps newly tracked scores", () => {
        const changedAt = 1_000;

        const [record] = migrateRecordList(undefined, [createRecord()], changedAt);

        expect(record.lastChangedAt).toBe(changedAt);
    });

    it("preserves the timestamp when score fields are unchanged", () => {
        const existingRecord = createRecord({ lastChangedAt: 500 });
        const existing = convertDetailed([existingRecord]);
        const incoming = createRecord({ ds: 13.8, ra: 301, title: "Renamed song" });

        const [record] = migrateRecordList(existing, [incoming], 1_000);

        expect(record.lastChangedAt).toBe(500);
    });

    it.each([
        ["achievements", { achievements: 100.6 }],
        ["DX score", { dxScore: 2_600 }],
        ["combo status", { fc: ComboStatus.AllPerfect }],
        ["sync status", { fs: SyncStatus.FullSyncDX }],
        ["play count", { play_count: 11 }],
    ])("updates the timestamp when %s changes", (_name, overrides) => {
        const existingRecord = createRecord({ lastChangedAt: 500 });
        const existing = convertDetailed([existingRecord]);

        const [record] = migrateRecordList(existing, [createRecord(overrides)], 1_000);

        expect(record.lastChangedAt).toBe(1_000);
    });

    it("starts tracking legacy scores without a timestamp", () => {
        const existing = convertDetailed([createRecord()]);

        const [record] = migrateRecordList(existing, [createRecord()], 1_000);

        expect(record.lastChangedAt).toBe(1_000);
    });
});
