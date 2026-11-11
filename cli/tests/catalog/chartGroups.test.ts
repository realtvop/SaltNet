import type { ChartEntry } from "../../src/catalog/songs";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { describe, expect, it } from "vitest";
import { groupCharts } from "../../src/catalog/chartGroups";
import { allChartEntries } from "../../src/catalog/chartQuery";
import { buildCatalog } from "../../src/catalog/refresh";
import { chartKeyOf } from "../../src/catalog/songs";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { entryOf } from "../madeChart";

const catalog = fixtureSongCatalog();
const all183 = allChartEntries(catalog);
const nonBanquet175 = all183.filter(e => e.chart.info.grade !== 10);

const cnVersions = buildCatalog(getFixtureSaltMetaCompacted()).metadata.cnVersions.map(
    ({ name }) => name
);

function keysOf(entries: readonly ChartEntry[]): string[] {
    return entries.map(e => chartKeyOf(e.chart));
}

describe("groupCharts on 175 non-banquet fixture charts", () => {
    it("groups by difficulty into 5 groups", () => {
        const groups = groupCharts(nonBanquet175, "difficulty", cnVersions);
        expect(groups).toHaveLength(5);
        expect(groups.map(g => [g.key, g.entries.length])).toEqual([
            ["BASIC", 42],
            ["ADVANCED", 42],
            ["EXPERT", 42],
            ["MASTER", 42],
            ["Re:MASTER", 7],
        ]);

        const totalCharts = groups.reduce((sum, g) => sum + g.entries.length, 0);
        expect(totalCharts).toBe(175);

        // Check first keys of each group
        expect(keysOf(groups[0].entries).slice(0, 3)).toEqual(["695-0", "131-0", "431-0"]);
        expect(keysOf(groups[1].entries).slice(0, 3)).toEqual(["695-1", "131-1", "431-1"]);
        expect(keysOf(groups[2].entries).slice(0, 3)).toEqual(["695-2", "131-2", "431-2"]);
        expect(keysOf(groups[3].entries).slice(0, 3)).toEqual(["695-3", "131-3", "431-3"]);
        expect(keysOf(groups[4].entries)).toEqual([
            "131-4",
            "70-4",
            "58-4",
            "115-4",
            "256-4",
            "146-4",
            "17-4",
        ]);
    });

    it("groups by level into 21 groups", () => {
        const groups = groupCharts(nonBanquet175, "level", cnVersions);
        expect(groups).toHaveLength(21);

        const expectedLevelCounts: [string, number][] = [
            ["14+", 2],
            ["14", 4],
            ["13+", 5],
            ["13", 17],
            ["12+", 15],
            ["12", 10],
            ["11+", 1],
            ["11", 9],
            ["10+", 12],
            ["10", 4],
            ["9+", 4],
            ["9", 6],
            ["8+", 4],
            ["8", 7],
            ["7+", 13],
            ["7", 16],
            ["6", 11],
            ["5", 14],
            ["4", 12],
            ["3", 6],
            ["2", 3],
        ];
        expect(groups.map(g => [g.key, g.entries.length])).toEqual(expectedLevelCounts);

        const groupMap = new Map(groups.map(g => [g.key, g]));
        expect(keysOf(groupMap.get("14+")!.entries)).toEqual(["10070-3", "12025-3"]);
        expect(keysOf(groupMap.get("14")!.entries)).toEqual(["70-4", "431-3", "70-3", "191-3"]);
        expect(keysOf(groupMap.get("13+")!.entries)).toEqual([
            "115-4",
            "115-3",
            "283-3",
            "10030-3",
            "11726-3",
        ]);

        const allGroupedKeys = groups.flatMap(g => keysOf(g.entries));
        expect(allGroupedKeys).toHaveLength(175);
        expect(new Set(allGroupedKeys).size).toBe(175);
    });

    it("groups by version into 20 groups", () => {
        const groups = groupCharts(nonBanquet175, "version", cnVersions);
        expect(groups).toHaveLength(20);

        const expectedVersionCounts: [string, number][] = [
            ["舞萌DX 2026", 8],
            ["舞萌DX 2025", 12],
            ["舞萌DX 2024", 8],
            ["舞萌DX 2023", 4],
            ["舞萌DX 2022", 4],
            ["舞萌DX 2021", 4],
            ["舞萌DX", 12],
            ["maimai FiNALE", 4],
            ["maimai MiLK PLUS", 4],
            ["maimai MiLK", 8],
            ["maimai MURASAKi PLUS", 4],
            ["maimai MURASAKi", 8],
            ["maimai PiNK PLUS", 4],
            ["maimai PiNK", 4],
            ["maimai ORANGE PLUS", 4],
            ["maimai ORANGE", 8],
            ["maimai GreeN PLUS", 4],
            ["maimai GreeN", 22],
            ["maimai PLUS", 19],
            ["maimai", 30],
        ];
        expect(groups.map(g => [g.key, g.entries.length])).toEqual(expectedVersionCounts);

        const groupMap = new Map(groups.map(g => [g.key, g]));
        expect(keysOf(groupMap.get("舞萌DX 2026")!.entries).slice(0, 4)).toEqual([
            "10030-3",
            "12025-3",
            "10030-2",
            "12025-2",
        ]);
        expect(keysOf(groupMap.get("maimai PLUS")!.entries).slice(0, 4)).toEqual([
            "131-4",
            "58-4",
            "146-4",
            "131-3",
        ]);
        expect(keysOf(groupMap.get("maimai")!.entries).slice(0, 4)).toEqual([
            "70-4",
            "17-4",
            "70-3",
            "30-3",
        ]);
    });

    it("groups by constant into 60 groups", () => {
        const groups = groupCharts(nonBanquet175, "constant", cnVersions);
        expect(groups).toHaveLength(60);

        const expectedFirst10: [string, number][] = [
            ["14.8", 1],
            ["14.6", 1],
            ["14.4", 2],
            ["14.2", 1],
            ["14.1", 1],
            ["13.8", 2],
            ["13.7", 2],
            ["13.6", 1],
            ["13.5", 1],
            ["13.4", 5],
        ];
        const expectedLast6: [string, number][] = [
            ["6.5", 1],
            ["6.0", 9],
            ["5.0", 14],
            ["4.0", 12],
            ["3.0", 6],
            ["2.0", 3],
        ];

        expect(groups.slice(0, 10).map(g => [g.key, g.entries.length])).toEqual(expectedFirst10);
        expect(groups.slice(-6).map(g => [g.key, g.entries.length])).toEqual(expectedLast6);

        const groupMap = new Map(groups.map(g => [g.key, g]));
        expect(keysOf(groupMap.get("12.8")!.entries)).toEqual([
            "650-3",
            "10188-3",
            "10044-3",
            "185-3",
            "10185-3",
            "10146-3",
        ]);
        expect(keysOf(groupMap.get("14.4")!.entries)).toEqual(["431-3", "70-3"]);
        expect(keysOf(groupMap.get("13.8")!.entries)).toEqual(["115-4", "115-3"]);

        const allGroupedKeys = groups.flatMap(g => keysOf(g.entries));
        expect(allGroupedKeys).toHaveLength(175);
        expect(new Set(allGroupedKeys).size).toBe(175);
    });
});

describe("groupCharts with all 183 charts (including banquet)", () => {
    it("groups by difficulty into 6 groups with UTAGE last", () => {
        const groups = groupCharts(all183, "difficulty", cnVersions);
        expect(groups).toHaveLength(6);
        expect(groups[5].key).toBe("UTAGE");
        expect(groups[5].entries).toHaveLength(8);
        expect(keysOf(groups[5].entries)).toEqual([
            "110227-10",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110851-10",
            "110998-10",
            "121513-10",
        ]);
    });

    it("groups by level into 27 groups with correct ordering for banquet question mark levels", () => {
        const groups = groupCharts(all183, "level", cnVersions);
        expect(groups).toHaveLength(27);

        const expectedLevelCounts: [string, number][] = [
            ["14+", 2],
            ["14+?", 2],
            ["14", 4],
            ["14?", 1],
            ["13+", 5],
            ["13", 17],
            ["13?", 2],
            ["12+", 15],
            ["12+?", 1],
            ["12", 10],
            ["12?", 1],
            ["11+", 1],
            ["11", 9],
            ["11?", 1],
            ["10+", 12],
            ["10", 4],
            ["9+", 4],
            ["9", 6],
            ["8+", 4],
            ["8", 7],
            ["7+", 13],
            ["7", 16],
            ["6", 11],
            ["5", 14],
            ["4", 12],
            ["3", 6],
            ["2", 3],
        ];
        expect(groups.map(g => [g.key, g.entries.length])).toEqual(expectedLevelCounts);
    });

    it("groups by constant into 60 constant groups plus null group last", () => {
        const groups = groupCharts(all183, "constant", cnVersions);
        expect(groups).toHaveLength(61);

        const lastGroup = groups[groups.length - 1];
        expect(lastGroup.key).toBeNull();
        expect(lastGroup.entries).toHaveLength(8);
        expect(keysOf(lastGroup.entries)).toEqual([
            "110227-10",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110851-10",
            "110998-10",
            "121513-10",
        ]);
    });
});

describe("groupCharts with made-up charts", () => {
    it("groups constants by one decimal and puts constant 0 into null group", () => {
        const charts = [
            entryOf({ id: 1, grade: 0, constant: 13.46 }),
            entryOf({ id: 2, grade: 0, constant: 13.51 }),
            entryOf({ id: 3, grade: 0, constant: 13.44 }),
            entryOf({ id: 4, grade: 0, constant: 0 }),
        ];

        const groups = groupCharts(charts, "constant", []);
        expect(groups.map(g => [g.key, keysOf(g.entries)])).toEqual([
            ["13.5", ["1-0", "2-0"]],
            ["13.4", ["3-0"]],
            [null, ["4-0"]],
        ]);
    });

    it("groups versions with unknown versions ranked below known versions in alphabetical order", () => {
        const versions = ["a", "b"];
        const charts1 = [
            entryOf({ id: 1, grade: 0, from: "b" }),
            entryOf({ id: 2, grade: 0, from: "a" }),
            entryOf({ id: 3, grade: 0, from: "zz" }),
            entryOf({ id: 4, grade: 0, from: "m" }),
        ];
        const charts2 = [
            entryOf({ id: 3, grade: 0, from: "zz" }),
            entryOf({ id: 4, grade: 0, from: "m" }),
            entryOf({ id: 1, grade: 0, from: "b" }),
            entryOf({ id: 2, grade: 0, from: "a" }),
        ];

        const g1 = groupCharts(charts1, "version", versions);
        const g2 = groupCharts(charts2, "version", versions);

        expect(g1.map(g => g.key)).toEqual(["b", "a", "m", "zz"]);
        expect(g2.map(g => g.key)).toEqual(["b", "a", "m", "zz"]);
    });

    it("groups levels correctly with non-levels ranked last by text", () => {
        const charts = [
            entryOf({ id: 1, grade: 0, level: "13?" }),
            entryOf({ id: 2, grade: 0, level: "13" }),
            entryOf({ id: 3, grade: 0, level: "13+" }),
            entryOf({ id: 4, grade: 0, level: "1" }),
            entryOf({ id: 5, grade: 0, level: "abc" }),
            entryOf({ id: 6, grade: 0, level: "" }),
        ];

        const groups = groupCharts(charts, "level", []);
        expect(groups.map(g => g.key)).toEqual(["13+", "13", "13?", "1", "", "abc"]);
    });

    it("groups difficulties: grades 10, 4, 0 give BASIC, Re:MASTER, UTAGE", () => {
        const charts = [
            entryOf({ id: 1, grade: 10 }),
            entryOf({ id: 2, grade: 4 }),
            entryOf({ id: 3, grade: 0 }),
        ];

        const groups = groupCharts(charts, "difficulty", []);
        expect(groups.map(g => g.key)).toEqual(["BASIC", "Re:MASTER", "UTAGE"]);
    });
});

describe("groupCharts invariants", () => {
    it("preserves input order within each group, and reversing input reverses items within groups", () => {
        const scrambled = [...nonBanquet175].reverse();
        const groupsScrambled = groupCharts(scrambled, "difficulty", cnVersions);

        for (const group of groupsScrambled) {
            const expectedKeys = scrambled
                .filter(e => keysOf([e])[0].endsWith(`-${group.entries[0].chart.info.grade}`))
                .map(e => chartKeyOf(e.chart));
            expect(keysOf(group.entries)).toEqual(expectedKeys);
        }

        const reversed = [...nonBanquet175].reverse();
        const gForward = groupCharts(nonBanquet175, "difficulty", cnVersions);
        const gReversed = groupCharts(reversed, "difficulty", cnVersions);

        expect(gReversed.map(g => g.key)).toEqual(gForward.map(g => g.key));
        for (let i = 0; i < gForward.length; i++) {
            expect(keysOf(gReversed[i].entries)).toEqual(
                [...keysOf(gForward[i].entries)].reverse()
            );
        }
    });

    it("returns empty array for empty input", () => {
        expect(groupCharts([], "constant", cnVersions)).toEqual([]);
        expect(groupCharts([], "version", cnVersions)).toEqual([]);
        expect(groupCharts([], "level", cnVersions)).toEqual([]);
        expect(groupCharts([], "difficulty", cnVersions)).toEqual([]);
    });
});
