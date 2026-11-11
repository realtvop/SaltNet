import MusicSort from "@core/music/sort.json";
import { describe, expect, it } from "vitest";
import { allChartEntries, filterCharts } from "../../src/catalog/chartQuery";
import { chartKeyOf } from "../../src/catalog/songs";
import { fixtureSongCatalog } from "../fixtureCatalog";

const catalog = fixtureSongCatalog();

describe("allChartEntries", () => {
    it("returns 183 entries, each chart key once, matching catalog.chartByKey", () => {
        const entries = allChartEntries(catalog);
        expect(entries).toHaveLength(183);

        const keys = entries.map(e => chartKeyOf(e.chart));
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(183);
        expect(uniqueKeys).toEqual(new Set(catalog.chartByKey.keys()));
    });

    it("orders by grade descending, then MusicSort index descending", () => {
        const entries = allChartEntries(catalog);
        for (let i = 1; i < entries.length; i++) {
            const prev = entries[i - 1].chart;
            const curr = entries[i].chart;
            const prevIndex = MusicSort.indexOf(prev.music.id);
            const currIndex = MusicSort.indexOf(curr.music.id);
            const prevScore = prev.info.grade * 100000 + prevIndex;
            const currScore = curr.info.grade * 100000 + currIndex;
            if (prevIndex === -1 && currIndex === -1 && prev.info.grade === curr.info.grade) {
                expect(prevScore).toBeGreaterThanOrEqual(currScore);
            } else {
                expect(prevScore).toBeGreaterThan(currScore);
            }
        }

        const banquetKeys = [
            "110227-10",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110851-10",
            "110998-10",
            "121513-10",
        ];
        expect(entries.slice(0, 8).map(e => chartKeyOf(e.chart))).toEqual(banquetKeys);

        const nonBanquet = entries.filter(e => e.chart.info.grade !== 10);
        expect(nonBanquet).toHaveLength(175);
        expect(nonBanquet.slice(0, 9).map(e => chartKeyOf(e.chart))).toEqual([
            "131-4",
            "70-4",
            "58-4",
            "115-4",
            "256-4",
            "146-4",
            "17-4",
            "695-3",
            "131-3",
        ]);
    });
});

describe("filterCharts", () => {
    const entries = allChartEntries(catalog);

    it("returns 175 non-banquet charts when no filters are given", () => {
        const result = filterCharts(catalog, entries, {});
        expect(result).toHaveLength(175);
        expect(result.every(e => e.chart.info.grade !== 10)).toBe(true);
    });

    it("filters by grade", () => {
        const banquet = filterCharts(catalog, entries, { grades: [10] });
        expect(banquet.map(e => chartKeyOf(e.chart))).toEqual([
            "110227-10",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110851-10",
            "110998-10",
            "121513-10",
        ]);

        const masRem = filterCharts(catalog, entries, { grades: [3, 4] });
        expect(masRem).toHaveLength(49);
    });

    it("filters by levels", () => {
        const level13Plus = filterCharts(catalog, entries, { levels: { from: 13.5, to: 13.5 } });
        expect(level13Plus.map(e => chartKeyOf(e.chart))).toEqual([
            "115-4",
            "115-3",
            "283-3",
            "10030-3",
            "11726-3",
        ]);

        const level13To14Keys = [
            "131-4",
            "70-4",
            "58-4",
            "115-4",
            "146-4",
            "695-3",
            "431-3",
            "70-3",
            "58-3",
            "10242-3",
            "236-3",
            "115-3",
            "113-3",
            "225-3",
            "359-3",
            "188-3",
            "283-3",
            "191-3",
            "146-3",
            "552-3",
            "10552-3",
            "10030-3",
            "10225-3",
            "11726-3",
            "431-2",
            "113-2",
        ];
        const level13To14 = filterCharts(catalog, entries, { levels: { from: 13, to: 14 } });
        expect(level13To14.map(e => chartKeyOf(e.chart))).toEqual(level13To14Keys);
        expect(level13To14).toHaveLength(26);

        const level13To14Plus = filterCharts(catalog, entries, { levels: { from: 13, to: 14.5 } });
        expect(level13To14Plus.map(e => chartKeyOf(e.chart))).toEqual([
            ...level13To14Keys.slice(0, 8),
            "10070-3",
            ...level13To14Keys.slice(8, 24),
            "12025-3",
            ...level13To14Keys.slice(24),
        ]);
        expect(level13To14Plus).toHaveLength(28);

        const level14Plus = filterCharts(catalog, entries, { levels: { from: 14, to: null } });
        expect(level14Plus.map(e => chartKeyOf(e.chart))).toEqual([
            "70-4",
            "431-3",
            "70-3",
            "10070-3",
            "191-3",
            "12025-3",
        ]);

        const levelUpTo10Plus = filterCharts(catalog, entries, {
            levels: { from: null, to: 10.5 },
        });
        expect(levelUpTo10Plus).toHaveLength(112);
        expect(chartKeyOf(levelUpTo10Plus[0].chart)).toBe("17-3");
        expect(chartKeyOf(levelUpTo10Plus[levelUpTo10Plus.length - 1].chart)).toBe("12025-0");
    });

    it("filters by constants", () => {
        const range135To139 = filterCharts(catalog, entries, {
            constants: { from: 13.5, to: 13.9 },
        });
        expect(range135To139.map(e => chartKeyOf(e.chart))).toEqual([
            "131-4",
            "115-4",
            "115-3",
            "283-3",
            "10030-3",
            "11726-3",
        ]);

        const exact128 = filterCharts(catalog, entries, { constants: { from: 12.8, to: 12.8 } });
        expect(exact128.map(e => chartKeyOf(e.chart))).toEqual([
            "650-3",
            "10188-3",
            "10044-3",
            "185-3",
            "10185-3",
            "10146-3",
        ]);

        const banquetWithConstantFilter = filterCharts(catalog, entries, {
            grades: [10],
            constants: { from: null, to: null },
        });
        expect(banquetWithConstantFilter).toEqual([]);

        const nonBanquetWithConstantFilter = filterCharts(catalog, entries, {
            constants: { from: null, to: null },
        });
        expect(nonBanquetWithConstantFilter).toHaveLength(175);
    });

    it("filters by versions", () => {
        const zhen = filterCharts(catalog, entries, { versions: ["maimai", "maimai PLUS"] });
        expect(zhen).toHaveLength(49);
        expect(chartKeyOf(zhen[0].chart)).toBe("131-4");

        const empty = filterCharts(catalog, entries, { versions: [] });
        expect(empty).toEqual([]);

        const nonexistent = filterCharts(catalog, entries, { versions: ["nonexistent version"] });
        expect(nonexistent).toEqual([]);
    });

    it("filters by search", () => {
        const tls = filterCharts(catalog, entries, { search: "True Love Song" });
        expect(tls.map(e => chartKeyOf(e.chart))).toEqual(["8-3", "8-2", "8-1", "8-0"]);

        const nothing = filterCharts(catalog, entries, { search: "nonexistent query" });
        expect(nothing).toEqual([]);

        // A blank text finds nothing; it is not the same as no search at all.
        expect(filterCharts(catalog, entries, { search: "" })).toEqual([]);
        expect(filterCharts(catalog, entries, { search: "   " })).toEqual([]);

        const banquetTitle = catalog.chartByKey.get("110227-10")!.song.title;
        const banquetSearch = filterCharts(catalog, entries, {
            grades: [10],
            search: banquetTitle,
        });
        expect(banquetSearch.map(e => chartKeyOf(e.chart))).toContain("110227-10");
    });

    it("combines filters with AND and preserves input order", () => {
        const combined = filterCharts(catalog, entries, {
            versions: ["maimai", "maimai PLUS"],
            levels: { from: 13, to: null },
            grades: [4],
        });
        expect(combined.map(e => chartKeyOf(e.chart))).toEqual(["131-4", "70-4", "58-4", "146-4"]);

        const reversedEntries = [...entries].reverse();
        const reversedCombined = filterCharts(catalog, reversedEntries, {
            versions: ["maimai", "maimai PLUS"],
            levels: { from: 13, to: null },
            grades: [4],
        });
        expect(reversedCombined.map(e => chartKeyOf(e.chart))).toEqual([
            "146-4",
            "58-4",
            "70-4",
            "131-4",
        ]);
    });
});

describe("filterCharts with within", () => {
    const entries = allChartEntries(catalog);

    it("restricts charts to within set in game order", () => {
        const res = filterCharts(catalog, entries, {
            within: new Set(["70-4", "131-4"]),
        });
        expect(res.map(e => chartKeyOf(e.chart))).toEqual(["131-4", "70-4"]);

        const empty = filterCharts(catalog, entries, { within: new Set() });
        expect(empty).toEqual([]);

        const withGrades = filterCharts(catalog, entries, {
            within: new Set(["131-4", "131-3", "70-4"]),
            grades: [3],
        });
        expect(withGrades.map(e => chartKeyOf(e.chart))).toEqual(["131-3"]);

        const withLevels = filterCharts(catalog, entries, {
            within: new Set(["131-4", "70-4", "58-4"]),
            levels: { from: 13, to: 13 },
        });
        expect(withLevels.map(e => chartKeyOf(e.chart))).toEqual(["131-4", "58-4"]);

        const banquetWithoutGrade = filterCharts(catalog, entries, {
            within: new Set(["110227-10", "131-4"]),
        });
        expect(banquetWithoutGrade.map(e => chartKeyOf(e.chart))).toEqual(["131-4"]);

        const banquetWithGrade = filterCharts(catalog, entries, {
            within: new Set(["110227-10", "131-4"]),
            grades: [10],
        });
        expect(banquetWithGrade.map(e => chartKeyOf(e.chart))).toEqual(["110227-10"]);

        const withNonexistentKey = filterCharts(catalog, entries, {
            within: new Set(["70-4", "131-4", "999999-3"]),
        });
        expect(withNonexistentKey.map(e => chartKeyOf(e.chart))).toEqual(["131-4", "70-4"]);

        const withinUndefined = filterCharts(catalog, entries, { within: undefined });
        expect(withinUndefined).toHaveLength(175);
    });

    it("still applies the other filters, the search included", () => {
        const withSearch = filterCharts(catalog, entries, {
            within: new Set(["8-3", "8-1", "58-4"]),
            search: "True Love Song",
        });
        expect(withSearch.map(e => chartKeyOf(e.chart))).toEqual(["8-3", "8-1"]);
    });
});
