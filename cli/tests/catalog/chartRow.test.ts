import type { ChartStats } from "@core/integrations/diving-fish/type";
import type { Chart } from "@core/music/type";
import { describe, expect, it } from "vitest";
import {
    chartDetails,
    chartNotes,
    chartRow,
    chartStats,
    constantOf,
} from "../../src/catalog/chartRow";
import { songCharts } from "../../src/catalog/songs";
import { fixtureSongCatalog } from "../fixtureCatalog";

const catalog = fixtureSongCatalog();

function getChartEntry(key: string) {
    const entry = catalog.chartByKey.get(key);
    if (!entry) throw new Error(`Chart key ${key} not found in fixture catalog`);
    return entry;
}

const EXPECTED_CHART_ROW_KEYS = [
    "chartKey",
    "musicId",
    "title",
    "type",
    "difficulty",
    "level",
    "constant",
    "fitConstant",
    "version",
    "score",
    "b50",
];

const EXPECTED_NOTES_KEYS = ["tap", "hold", "slide", "touch", "break", "total"];

const EXPECTED_STATS_KEYS = [
    "samples",
    "avgAchievements",
    "avgDxScore",
    "stdDevAchievements",
    "rankDist",
    "comboDist",
];

const EXPECTED_RANK_DIST_KEYS = [
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
];

const EXPECTED_COMBO_DIST_KEYS = ["none", "FC", "FC+", "AP", "AP+"];

describe("chartRow", () => {
    it("returns exactly the 11 expected keys in the specified order", () => {
        const entry = getChartEntry("146-3");
        const row = chartRow(entry);
        expect(Object.keys(row)).toEqual(EXPECTED_CHART_ROW_KEYS);
    });

    it("populates chartRow correctly for fixture facts", () => {
        const e146_0 = getChartEntry("146-0");
        expect(chartRow(e146_0)).toEqual({
            chartKey: "146-0",
            musicId: 146,
            title: "39",
            type: "SD",
            difficulty: "BASIC",
            level: "5",
            constant: 5,
            fitConstant: 5.21,
            version: String(e146_0.chart.music.info.from),
            score: null,
            b50: null,
        });

        const e146_1 = getChartEntry("146-1");
        expect(chartRow(e146_1)).toMatchObject({
            chartKey: "146-1",
            musicId: 146,
            type: "SD",
            difficulty: "ADVANCED",
            level: "8+",
            constant: 8.6,
            fitConstant: 9.089,
            score: null,
            b50: null,
        });

        const e146_2 = getChartEntry("146-2");
        expect(chartRow(e146_2)).toMatchObject({
            chartKey: "146-2",
            musicId: 146,
            type: "SD",
            difficulty: "EXPERT",
            level: "11",
            constant: 11.2,
            fitConstant: 11.716,
            score: null,
            b50: null,
        });

        const e146_3 = getChartEntry("146-3");
        expect(chartRow(e146_3)).toMatchObject({
            chartKey: "146-3",
            musicId: 146,
            type: "SD",
            difficulty: "MASTER",
            level: "13",
            constant: 13,
            fitConstant: 13.6,
            score: null,
            b50: null,
        });

        const e146_4 = getChartEntry("146-4");
        expect(chartRow(e146_4)).toMatchObject({
            chartKey: "146-4",
            musicId: 146,
            type: "SD",
            difficulty: "Re:MASTER",
            level: "13",
            constant: 13.4,
            fitConstant: 13.087,
            score: null,
            b50: null,
        });

        const e10146_0 = getChartEntry("10146-0");
        expect(chartRow(e10146_0)).toMatchObject({
            chartKey: "10146-0",
            musicId: 10146,
            type: "DX",
            difficulty: "BASIC",
            level: "3",
            constant: 3,
            fitConstant: 3.251,
            score: null,
            b50: null,
        });

        const e10146_1 = getChartEntry("10146-1");
        expect(chartRow(e10146_1)).toMatchObject({
            chartKey: "10146-1",
            musicId: 10146,
            type: "DX",
            difficulty: "ADVANCED",
            level: "7",
            constant: 7.2,
            fitConstant: 7.324,
            score: null,
            b50: null,
        });

        const e10146_2 = getChartEntry("10146-2");
        expect(chartRow(e10146_2)).toMatchObject({
            chartKey: "10146-2",
            musicId: 10146,
            type: "DX",
            difficulty: "EXPERT",
            level: "9",
            constant: 9.3,
            fitConstant: 9.48,
            score: null,
            b50: null,
        });

        const e10146_3 = getChartEntry("10146-3");
        expect(chartRow(e10146_3)).toMatchObject({
            chartKey: "10146-3",
            musicId: 10146,
            type: "DX",
            difficulty: "MASTER",
            level: "12+",
            constant: 12.8,
            fitConstant: 12.784,
            score: null,
            b50: null,
        });

        const e8_0 = getChartEntry("8-0");
        const e8_1 = getChartEntry("8-1");
        const e8_2 = getChartEntry("8-2");
        const e8_3 = getChartEntry("8-3");
        expect([e8_0, e8_1, e8_2, e8_3].map(e => chartRow(e).level)).toEqual([
            "5",
            "7",
            "10",
            "12",
        ]);
        expect([e8_0, e8_1, e8_2, e8_3].map(e => chartRow(e).constant)).toEqual([
            5, 7.2, 10.2, 12.4,
        ]);
        expect([e8_0, e8_1, e8_2, e8_3].map(e => chartRow(e).fitConstant)).toEqual([
            5.021, 6.959, 10.216, 11.98,
        ]);

        const e11726_0 = getChartEntry("11726-0");
        const e11726_1 = getChartEntry("11726-1");
        const e11726_2 = getChartEntry("11726-2");
        const e11726_3 = getChartEntry("11726-3");
        expect([e11726_0, e11726_1, e11726_2, e11726_3].map(e => chartRow(e).level)).toEqual([
            "3",
            "7",
            "11",
            "13+",
        ]);
        expect([e11726_0, e11726_1, e11726_2, e11726_3].map(e => chartRow(e).constant)).toEqual([
            3, 7, 11.2, 13.6,
        ]);
        expect([e11726_0, e11726_1, e11726_2, e11726_3].map(e => chartRow(e).fitConstant)).toEqual([
            3.222, 7.1, 11.293, 13.407,
        ]);

        const e110018_10 = getChartEntry("110018-10");
        expect(chartRow(e110018_10)).toMatchObject({
            chartKey: "110018-10",
            musicId: 110018,
            type: "DX",
            difficulty: "UTAGE",
            level: "12?",
            constant: null,
            fitConstant: null,
            score: null,
            b50: null,
        });

        const e77_2 = getChartEntry("77-2");
        expect(chartRow(e77_2)).toMatchObject({
            chartKey: "77-2",
            musicId: 77,
            type: "SD",
            difficulty: "EXPERT",
            level: "10+",
            constant: 10.6,
            fitConstant: null,
            score: null,
            b50: null,
        });
    });

    it("rounds fitConstant to 4 decimals when given more digits", () => {
        const dummyChart = {
            music: { id: 1, info: { title: "Test", from: "Test" } },
            info: {
                grade: 0,
                level: "1",
                constant: 1,
                stat: { fit_diff: 13.599516294254812 },
            },
        } as unknown as Chart;
        const row = chartRow({ chart: dummyChart, song: {} as never });
        expect(row.fitConstant).toBe(13.5995);
    });

    it("turns a constant or fit constant that is not a positive number into null", () => {
        const rowOf = (constant: number, fit: number) =>
            chartRow({
                chart: {
                    music: { id: 1, info: { title: "Test", from: "Test" } },
                    info: { grade: 0, level: "1", constant, stat: { fit_diff: fit } },
                } as unknown as Chart,
                song: {} as never,
            });

        for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            const row = rowOf(bad, bad);
            expect(row.constant, String(bad)).toBeNull();
            expect(row.fitConstant, String(bad)).toBeNull();
        }
        expect(rowOf(0.1, 0.1)).toMatchObject({ constant: 0.1, fitConstant: 0.1 });
    });
});

describe("constantOf", () => {
    const chartOf = (constant: number | undefined) => ({ info: { constant } }) as unknown as Chart;

    it("is the constant of a chart that has one", () => {
        expect(constantOf(getChartEntry("146-3").chart)).toBe(13);
        expect(constantOf(chartOf(0.1))).toBe(0.1);
    });

    it("is null where the game has none or the number is no constant", () => {
        expect(constantOf(getChartEntry("110018-10").chart)).toBeNull();
        for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
            expect(constantOf(chartOf(bad)), String(bad)).toBeNull();
        }
    });
});

describe("chartNotes", () => {
    it("returns the exact 6 keys in order", () => {
        const chart = getChartEntry("146-3").chart;
        expect(Object.keys(chartNotes(chart))).toEqual(EXPECTED_NOTES_KEYS);
    });

    it("computes note counts for SD charts with touch as null", () => {
        const c146_0 = getChartEntry("146-0").chart;
        expect(chartNotes(c146_0)).toEqual({
            tap: 86,
            hold: 31,
            slide: 5,
            touch: null,
            break: 4,
            total: 126,
        });

        const c146_1 = getChartEntry("146-1").chart;
        expect(chartNotes(c146_1)).toEqual({
            tap: 159,
            hold: 45,
            slide: 8,
            touch: null,
            break: 6,
            total: 218,
        });

        const c146_2 = getChartEntry("146-2").chart;
        expect(chartNotes(c146_2)).toEqual({
            tap: 196,
            hold: 78,
            slide: 15,
            touch: null,
            break: 8,
            total: 297,
        });

        const c146_3 = getChartEntry("146-3").chart;
        expect(chartNotes(c146_3)).toEqual({
            tap: 374,
            hold: 55,
            slide: 40,
            touch: null,
            break: 43,
            total: 512,
        });

        const c146_4 = getChartEntry("146-4").chart;
        expect(chartNotes(c146_4)).toEqual({
            tap: 380,
            hold: 66,
            slide: 90,
            touch: null,
            break: 39,
            total: 575,
        });

        const c77_2 = getChartEntry("77-2").chart;
        expect(chartNotes(c77_2)).toEqual({
            tap: 250,
            hold: 74,
            slide: 13,
            touch: null,
            break: 7,
            total: 344,
        });
    });

    it("computes note counts for DX charts including touch", () => {
        const c10146_0 = getChartEntry("10146-0").chart;
        expect(chartNotes(c10146_0)).toEqual({
            tap: 62,
            hold: 16,
            slide: 2,
            touch: 11,
            break: 2,
            total: 93,
        });

        const c10146_1 = getChartEntry("10146-1").chart;
        expect(chartNotes(c10146_1)).toEqual({
            tap: 136,
            hold: 14,
            slide: 11,
            touch: 28,
            break: 9,
            total: 198,
        });

        const c10146_2 = getChartEntry("10146-2").chart;
        expect(chartNotes(c10146_2)).toEqual({
            tap: 201,
            hold: 97,
            slide: 19,
            touch: 63,
            break: 10,
            total: 390,
        });

        const c10146_3 = getChartEntry("10146-3").chart;
        expect(chartNotes(c10146_3)).toEqual({
            tap: 352,
            hold: 35,
            slide: 78,
            touch: 104,
            break: 33,
            total: 602,
        });
    });

    it("returns null for all note fields when tap, hold, and break are all unknown (banquet)", () => {
        const c110018_10 = getChartEntry("110018-10").chart;
        expect(chartNotes(c110018_10)).toEqual({
            tap: null,
            hold: null,
            slide: null,
            touch: null,
            break: null,
            total: null,
        });

        const banquetHandbuilt = {
            info: { notes: [null, null, 0, 0, null] },
        } as unknown as Chart;
        expect(chartNotes(banquetHandbuilt)).toEqual({
            tap: null,
            hold: null,
            slide: null,
            touch: null,
            break: null,
            total: null,
        });
    });

    it("returns null total when only some note counts are unknown", () => {
        const partialSdChart = {
            info: { notes: [10, null, 2, 3] },
        } as unknown as Chart;
        expect(chartNotes(partialSdChart)).toEqual({
            tap: 10,
            hold: null,
            slide: 2,
            touch: null,
            break: 3,
            total: null,
        });

        const partialDxChart = {
            info: { notes: [10, 5, null, 3, 2] },
        } as unknown as Chart;
        expect(chartNotes(partialDxChart)).toEqual({
            tap: 10,
            hold: 5,
            slide: null,
            touch: 3,
            break: 2,
            total: null,
        });
    });
});

describe("chartStats", () => {
    it("returns null when stats are undefined", () => {
        expect(chartStats(undefined)).toBeNull();
    });

    it("extracts stats and distributions for 146-0", () => {
        const c146_0 = getChartEntry("146-0").chart;
        const stats = chartStats(c146_0.info.stat);
        expect(stats).not.toBeNull();
        expect(Object.keys(stats!)).toEqual(EXPECTED_STATS_KEYS);
        expect(stats?.samples).toBe(4839);
        expect(stats?.avgAchievements).toBe(98.447);
        expect(stats?.avgDxScore).toBe(12657.5);
        expect(stats?.stdDevAchievements).toBe(1.658);

        expect(Object.keys(stats!.rankDist)).toEqual(EXPECTED_RANK_DIST_KEYS);
        expect(stats?.rankDist).toEqual({
            D: 52,
            C: 15,
            B: 28,
            BB: 23,
            BBB: 45,
            A: 153,
            AA: 82,
            AAA: 56,
            S: 25,
            "S+": 43,
            SS: 27,
            "SS+": 49,
            SSS: 1077,
            "SSS+": 3164,
        });

        expect(Object.keys(stats!.comboDist)).toEqual(EXPECTED_COMBO_DIST_KEYS);
        expect(stats?.comboDist).toEqual({
            none: 515,
            FC: 1063,
            "FC+": 931,
            AP: 1354,
            "AP+": 976,
        });
    });

    it("rounds average and standard deviation values appropriately for hand-built stats", () => {
        const rawStat: ChartStats = {
            cnt: 1234,
            avg: 94.65561644492153,
            avg_dx: 2795.530249855953,
            diff: "12",
            dist: [1, 2],
            fc_dist: [3],
            fit_diff: 12.5,
            std_dev: 3.998852548700949,
        };
        const stats = chartStats(rawStat);
        expect(stats).not.toBeNull();
        expect(stats?.samples).toBe(1234);
        expect(stats?.avgAchievements).toBe(94.6556);
        expect(stats?.avgDxScore).toBe(2795.53);
        expect(stats?.stdDevAchievements).toBe(3.9989);

        // Missing distribution entries are padded with 0
        expect(stats?.rankDist.D).toBe(1);
        expect(stats?.rankDist.C).toBe(2);
        expect(stats?.rankDist.B).toBe(0);
        expect(stats?.rankDist["SSS+"]).toBe(0);

        expect(stats?.comboDist.none).toBe(3);
        expect(stats?.comboDist.FC).toBe(0);
        expect(stats?.comboDist["AP+"]).toBe(0);
    });
});

describe("chartDetails", () => {
    it("returns charter, notes, and stats", () => {
        const c146_3 = getChartEntry("146-3").chart;
        const details = chartDetails(c146_3);
        expect(details.charter).toBe("譜面-100号");
        expect(details.notes.total).toBe(512);
        expect(details.stats).not.toBeNull();
    });

    it("checks charter names for fixture fact charts", () => {
        expect(chartDetails(getChartEntry("146-0").chart).charter).toBeNull();
        expect(chartDetails(getChartEntry("146-1").chart).charter).toBeNull();
        expect(chartDetails(getChartEntry("146-2").chart).charter).toBe("ニャイン");
        expect(chartDetails(getChartEntry("146-3").chart).charter).toBe("譜面-100号");
        expect(chartDetails(getChartEntry("146-4").chart).charter).toBe("はっぴー");

        expect(chartDetails(getChartEntry("10146-0").chart).charter).toBeNull();
        expect(chartDetails(getChartEntry("10146-1").chart).charter).toBeNull();
        expect(chartDetails(getChartEntry("10146-2").chart).charter).toBe("はっぴー");
        expect(chartDetails(getChartEntry("10146-3").chart).charter).toBe("Jack");

        expect(chartDetails(getChartEntry("8-0").chart).charter).toBeNull();
        expect(chartDetails(getChartEntry("8-1").chart).charter).toBeNull();
        expect(chartDetails(getChartEntry("8-2").chart).charter).toBe("譜面-100号");
        expect(chartDetails(getChartEntry("8-3").chart).charter).toBe("ニャイン");

        expect(chartDetails(getChartEntry("11726-0").chart).charter).toBeNull();
        expect(chartDetails(getChartEntry("11726-1").chart).charter).toBeNull();
        expect(chartDetails(getChartEntry("11726-2").chart).charter).toBe("Jack");
        expect(chartDetails(getChartEntry("11726-3").chart).charter).toBe("Luxizhel");

        expect(chartDetails(getChartEntry("110018-10").chart).charter).toBeNull();
        expect(chartDetails(getChartEntry("77-2").chart).charter).toBe("譜面-100号");
    });

    it("checks presence of statistics across fixture charts", () => {
        expect(chartDetails(getChartEntry("146-0").chart).stats).not.toBeNull();
        expect(chartDetails(getChartEntry("10146-0").chart).stats).not.toBeNull();
        expect(chartDetails(getChartEntry("10146-0").chart).stats?.samples).toBe(5173);

        expect(chartDetails(getChartEntry("77-2").chart).stats).toBeNull();
        expect(chartDetails(getChartEntry("110018-10").chart).stats).toBeNull();
    });

    it("trims charter and turns missing/empty/- into null", () => {
        const dummyCharter = (charter?: string) =>
            chartDetails({ info: { notes: [0, 0, 0, 0], charter } } as unknown as Chart).charter;
        expect(dummyCharter(undefined)).toBeNull();
        expect(dummyCharter("")).toBeNull();
        expect(dummyCharter("   ")).toBeNull();
        expect(dummyCharter("-")).toBeNull();
        expect(dummyCharter("  Jack  ")).toBe("Jack");
    });
});

describe("properties over every chart in the fixture catalog", () => {
    it("satisfies structural invariants for every chart", () => {
        let totalCharts = 0;
        for (const song of catalog.songs) {
            const charts = songCharts(song);
            for (const chart of charts) {
                totalCharts++;
                const entry = { chart, song };
                const row = chartRow(entry);

                // chartRow has the 11 keys in order
                expect(Object.keys(row)).toEqual(EXPECTED_CHART_ROW_KEYS);

                // chartKey equals ${musicId}-${grade} of the chart
                expect(row.chartKey).toBe(`${chart.music.id}-${chart.info.grade}`);

                // score and b50 are null
                expect(row.score).toBeNull();
                expect(row.b50).toBeNull();

                // constant is null or positive number
                if (row.constant !== null) {
                    expect(row.constant).toBeGreaterThan(0);
                }

                // fitConstant is null or positive number
                if (row.fitConstant !== null) {
                    expect(row.fitConstant).toBeGreaterThan(0);
                }

                // for every chart with stat, rankDist values sum to non-negative integer and samples equals stat.cnt
                if (chart.info.stat) {
                    const stats = chartStats(chart.info.stat);
                    expect(stats).not.toBeNull();
                    expect(stats?.samples).toBe(chart.info.stat.cnt);
                    const sumRankDist = Object.values(stats!.rankDist).reduce(
                        (sum, count) => sum + count,
                        0
                    );
                    expect(sumRankDist).toBeGreaterThanOrEqual(0);
                    expect(Number.isInteger(sumRankDist)).toBe(true);
                }
            }
        }
        expect(totalCharts).toBeGreaterThan(50);
    });
});
