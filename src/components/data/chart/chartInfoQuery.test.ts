/*
 * Snapshot tests for the chart info dialog calculations (getChartRatingTables,
 * getAvailableRatingDisplayModes, resolveRatingDisplayMode, selectDisplayedRaTable,
 * getLowestRaInSection, getLowestRaInChartOrSection).
 * They exercise the rating stage tables, display modes and B50 floor calculations
 * across charts and scores on fixed data: the trimmed SaltMeta fixture plus synthetic
 * scores and users from a seeded generator. The snapshots record what the chart info
 * dialog showed when the calculations were extracted from it.
 */

import type { DivingFishB50, DivingFishFullRecord } from "@core/integrations/diving-fish/type";
import type { Chart, ChartScore } from "@core/music/type";
import type { User } from "@core/user/type";
import type { ChartRatingTables, RatingDisplayMode, RatingTableEntry } from "./chartInfoQuery";
import { createFixtureMusicList } from "@core/fixtures/saltmeta";
import { ComboStatus, RankRate, SyncStatus } from "@core/mai/types";
import { describe, expect, it } from "vitest";
import {
    getAvailableRatingDisplayModes,
    getChartRatingTables,
    getLowestRaInChartOrSection,
    getLowestRaInSection,
    ratingModeOrder,
    resolveRatingDisplayMode,
    selectDisplayedRaTable,
} from "./chartInfoQuery";

// MARK: seeded generator and fixed test data

/**
 * mulberry32, a tiny seeded generator, identical to the one in songs.test.ts.
 * The increment is its usual 0x6D2B79F5, written in decimal.
 */
function createRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 1831565813) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function makeRecord(songId: number, ra: number, isNew: boolean): DivingFishFullRecord {
    return {
        achievements: 100.0,
        ds: 14.0,
        dxScore: 1000,
        fc: ComboStatus.None,
        fs: SyncStatus.None,
        level: "14",
        level_index: 3,
        level_label: "Master",
        ra,
        rate: RankRate.sss,
        song_id: songId,
        title: `Test Song ${songId}`,
        type: isNew ? "DX" : "SD",
    };
}

function makeUser(b50?: DivingFishB50): User {
    return {
        divingFish: { name: "test-user" },
        settings: { manuallyUpdate: false },
        data: {
            updateTime: 1_700_000_000_000,
            name: "test-user",
            rating: 15000,
            b50,
        },
    } as User;
}

// A complete score, shaped like the ones the dialog gets: `props.chart.score` from the songs page,
// or `chartScoreFromDF` of the user's record for another difficulty, which copies `achievements`
// and `ra` as they are (so `null`, `0` or a missing rating can reach the calculations). Only
// `achievements` and `deluxeRating` are read; the rest has to be there.
function makeScore(achievements: number | null, deluxeRating: number | undefined): ChartScore {
    return {
        rankRate: RankRate.sss,
        achievements,
        comboStatus: ComboStatus.None,
        syncStatus: SyncStatus.None,
        deluxeScore: 1000,
        deluxeRating: deluxeRating as number,
        playCount: 3,
        lastChangedAt: 1_700_000_000_000,
    };
}

function buildFixedData() {
    const random = createRandom(20261116);
    const { chartList } = createFixtureMusicList();
    const allCharts = Object.values(chartList);

    // Group charts by constant to pick at least 60 charts with different constants
    const byConstant = new Map<number, Chart[]>();
    for (const chart of allCharts) {
        const list = byConstant.get(chart.info.constant) ?? [];
        list.push(chart);
        byConstant.set(chart.info.constant, list);
    }

    const sortedConstants = [...byConstant.keys()].sort((a, b) => a - b);
    const selectedCharts: Chart[] = [];
    for (const c of sortedConstants) {
        const chartsWithConstant = byConstant.get(c)!;
        const picked = chartsWithConstant[Math.floor(random() * chartsWithConstant.length)]!;
        selectedCharts.push(picked);
    }

    // Build users: missing B50, short B50, full B50 (35 and 15 entries)
    const userMissingB50 = makeUser(undefined);

    // Short B50: 10 sd, 5 dx entries
    const shortSdRecords: DivingFishFullRecord[] = [];
    for (let i = 0; i < 10; i++) {
        shortSdRecords.push(makeRecord(100 + i, 310 - i * 3, false));
    }
    const shortDxRecords: DivingFishFullRecord[] = [];
    for (let i = 0; i < 5; i++) {
        shortDxRecords.push(makeRecord(200 + i, 320 - i * 4, true));
    }
    const userShortB50 = makeUser({
        sd: shortSdRecords,
        dx: shortDxRecords,
    });

    // Full B50: 35 sd, 15 dx entries
    const fullSdRecords: DivingFishFullRecord[] = [];
    for (let i = 0; i < 35; i++) {
        fullSdRecords.push(makeRecord(1000 + i, 330 - i * 2, false));
    }
    const fullDxRecords: DivingFishFullRecord[] = [];
    for (let i = 0; i < 15; i++) {
        fullDxRecords.push(makeRecord(2000 + i, 335 - i * 3, true));
    }
    const userFullB50 = makeUser({
        sd: fullSdRecords,
        dx: fullDxRecords,
    });

    // Representative old chart and new chart
    const oldChart = allCharts.find(c => !c.music.info.isNew && c.info.constant > 0)!;
    const newChart = allCharts.find(c => c.music.info.isNew && c.info.constant > 0)!;
    // An old song with a DX chart: its floor comes from the old (sd) list, whatever its type.
    const oldDxChart = allCharts.find(
        c => !c.music.info.isNew && c.music.info.type === "DX" && c.info.constant > 0
    )!;

    // Both lists end with a record rated 0.
    const userB50EndingAtZero = makeUser({
        sd: [
            makeRecord(3000, 250, false),
            makeRecord(3001, 120, false),
            makeRecord(3002, 0, false),
        ],
        dx: [makeRecord(4000, 260, true), makeRecord(4001, 0, true)],
    });

    return {
        selectedCharts,
        userMissingB50,
        userShortB50,
        userFullB50,
        userB50EndingAtZero,
        oldChart,
        newChart,
        oldDxChart,
    };
}

const fixed = buildFixedData();

// MARK: formatting helpers

function chartKey(chart: Chart): string {
    return `${chart.music.id}-${chart.info.grade}`;
}

function formatStage(stage: RatingTableEntry): string {
    return `${stage.achievements.toFixed(4)}% ${stage.rank} ${stage.rating} ds ${stage.ds}`;
}

function formatTableInline(table: RatingTableEntry[]): string {
    if (table.length === 0) return "(empty)";
    return `(${table.length}) ${table.map(formatStage).join(", ")}`;
}

function sameTable(a: RatingTableEntry[], b: RatingTableEntry[]): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

// A table as it relates to the chart's full table: equal to it, the tail of it from a stage on
// (1-based), or listed in full when it is neither.
function describeAgainstAll(table: RatingTableEntry[], all: RatingTableEntry[]): string {
    if (sameTable(table, all)) return "= all";
    if (table.length === 0) return "(empty)";
    for (let start = 1; start < all.length; start++) {
        if (sameTable(table, all.slice(start)))
            return `= all from stage ${start + 1} (${table.length} rows)`;
    }
    return formatTableInline(table);
}

function describeCurrent(tables: ChartRatingTables): string {
    const isAll = sameTable(tables.current, tables.all);
    const isFiltered = sameTable(tables.current, tables.filtered);
    if (isAll && isFiltered) return "= all = filtered";
    if (isAll) return "= all";
    if (isFiltered) return "= filtered";
    return formatTableInline(tables.current);
}

// MARK: snapshot scenarios

describe("chart info query snapshots", () => {
    it("rating stage tables and available modes across charts, scores and modes", () => {
        const scores: Array<{ label: string; score: ChartScore | null }> = [
            { label: "none", score: null },
            { label: "0", score: makeScore(0, 0) },
            { label: "null", score: makeScore(null, 0) },
            { label: "97", score: makeScore(97, 180) },
            { label: "99.5", score: makeScore(99.5, 250) },
            { label: "100.5", score: makeScore(100.5, 300) },
            { label: "101", score: makeScore(101, 310) },
        ];
        const modes: RatingDisplayMode[] = ["简洁", "吃分", "完整"];

        const lines: string[] = [];

        // The full table depends only on the constant and `filtered` only on the score, so each is
        // printed once and every mode says which of them `current` is. A table that differs from
        // what it should equal is printed in full where it occurs.
        for (const chart of fixed.selectedCharts) {
            const all = getChartRatingTables(chart, null, "完整").all;
            lines.push(
                `chart ${chart.music.id}-${chart.info.grade} (constant ${chart.info.constant}):`
            );
            lines.push(`  all ${formatTableInline(all)}`);
            for (const { label, score } of scores) {
                // compute available modes once for this chart and score
                const sampleTables = getChartRatingTables(chart, score, "简洁");
                const available = getAvailableRatingDisplayModes(sampleTables);
                const filtered = describeAgainstAll(sampleTables.filtered, all);
                lines.push(
                    `  score ${label}: available ${available.join(", ")}; filtered ${filtered}`
                );

                for (const mode of modes) {
                    const tables = getChartRatingTables(chart, score, mode);
                    const notes: string[] = [];
                    if (!sameTable(tables.all, all))
                        notes.push(`all ${formatTableInline(tables.all)}`);
                    if (!sameTable(tables.filtered, sampleTables.filtered))
                        notes.push(`filtered ${describeAgainstAll(tables.filtered, all)}`);
                    const extra = notes.map(note => `; ${note}`).join("");
                    lines.push(`    mode ${mode}: current ${describeCurrent(tables)}${extra}`);
                }
            }
        }

        expect(lines.join("\n")).toMatchSnapshot();
    });

    it("selectDisplayedRaTable across modes and base rating floors", () => {
        // Select a few tables: empty (ds 0), short, medium, long (hardest ds 14.8)
        const tablesToTest: Array<{ label: string; table: RatingTableEntry[] }> = [
            {
                label: "empty (ds 0)",
                table: getChartRatingTables(
                    fixed.selectedCharts.find(c => c.info.constant === 0)!,
                    null,
                    "完整"
                ).all,
            },
            {
                label: "short (ds 5.0, score 100.5)",
                table: getChartRatingTables(
                    fixed.selectedCharts.find(c => c.info.constant === 5)!,
                    { achievements: 100.5 } as ChartScore,
                    "简洁"
                ).filtered,
            },
            {
                label: "medium (ds 12.4, score 97)",
                table: getChartRatingTables(
                    fixed.selectedCharts.find(c => c.info.constant === 12.4)!,
                    { achievements: 97 } as ChartScore,
                    "简洁"
                ).filtered,
            },
            {
                label: "long (ds 14.8, no score)",
                table: getChartRatingTables(
                    fixed.selectedCharts.find(c => c.info.constant === 14.8)!,
                    null,
                    "完整"
                ).all,
            },
        ];

        const modes: RatingDisplayMode[] = ["简洁", "吃分", "完整"];
        const lines: string[] = [];

        for (const { label, table } of tablesToTest) {
            lines.push(`table ${label} (${table.length} stages):`);
            const minRating = table.length > 0 ? table[table.length - 1]!.rating : 0;
            const maxRating = table.length > 0 ? table[0]!.rating : 0;
            const midIndex = Math.floor(table.length / 2);
            const midRating = table.length > 0 ? table[midIndex]!.rating : 0;

            const floorScenarios: Array<{
                name: string;
                floor: number | null;
            }> = [
                { name: "below all stages", floor: Math.max(0, minRating - 20) },
                {
                    name: "inside table",
                    floor: table.length > 2 ? midRating - 1 : 50,
                },
                { name: "above all stages", floor: maxRating + 20 },
                { name: "exactly equal to a stage", floor: midRating },
                { name: "zero", floor: 0 },
                { name: "none (null)", floor: null },
            ];

            for (const mode of modes) {
                lines.push(`  mode ${mode}:`);
                for (const { name, floor } of floorScenarios) {
                    const displayed = selectDisplayedRaTable(table, mode, () => floor);
                    lines.push(`    floor ${name} (${floor}): ${displayed.length} stages`);
                    for (const stage of displayed) {
                        lines.push(`      ${formatStage(stage)}`);
                    }
                }
            }
        }

        expect(lines.join("\n")).toMatchSnapshot();
    });

    it("getLowestRaInSection and getLowestRaInChartOrSection across chart and user variants", () => {
        const chartVariants: Array<{ label: string; chart: Chart | null }> = [
            { label: `old SD ${chartKey(fixed.oldChart)}`, chart: fixed.oldChart },
            { label: `old DX ${chartKey(fixed.oldDxChart)}`, chart: fixed.oldDxChart },
            { label: `new DX ${chartKey(fixed.newChart)}`, chart: fixed.newChart },
            { label: "null chart", chart: null },
        ];

        const userVariants: Array<{ label: string; user: User | null }> = [
            { label: "full B50 (35 sd, 15 dx)", user: fixed.userFullB50 },
            { label: "short B50 (10 sd, 5 dx)", user: fixed.userShortB50 },
            { label: "B50 ending at 0 (3 sd, 2 dx)", user: fixed.userB50EndingAtZero },
            { label: "missing B50", user: fixed.userMissingB50 },
            { label: "null user", user: null },
        ];

        const scoreVariants: Array<{ label: string; score: ChartScore | null | undefined }> = [
            { label: "no score (null)", score: null },
            { label: "score undefined", score: undefined },
            { label: "score ra 0", score: makeScore(100.5, 0) },
            { label: "score ra 200", score: makeScore(98, 200) },
            { label: "score ra 300", score: makeScore(100.5, 300) },
            { label: "score without ra", score: makeScore(97, undefined) },
        ];

        const lines: string[] = [];

        for (const { label: chartLabel, chart } of chartVariants) {
            lines.push(`chart ${chartLabel}:`);
            for (const { label: userLabel, user } of userVariants) {
                const sectionLowest = getLowestRaInSection(user, chart);
                lines.push(`  user ${userLabel}: sectionLowest = ${sectionLowest}`);

                for (const { label: scoreLabel, score } of scoreVariants) {
                    const chartOrSection = getLowestRaInChartOrSection(chart, score, sectionLowest);
                    lines.push(`    score ${scoreLabel}: chartOrSection = ${chartOrSection}`);
                }
            }
        }

        expect(lines.join("\n")).toMatchSnapshot();
    });
});

// MARK: explicit cases

describe("resolveRatingDisplayMode", () => {
    it("keeps preferred mode if available, falls back to nearest earlier mode in ratingModeOrder, or first available", () => {
        const modes: RatingDisplayMode[] = ["简洁", "吃分", "完整"];
        const allPossibleAvailable: RatingDisplayMode[][] = [
            [],
            ["简洁"],
            ["吃分"],
            ["完整"],
            ["简洁", "吃分"],
            ["简洁", "完整"],
            ["吃分", "完整"],
            ["简洁", "吃分", "完整"],
        ];

        for (const preferred of modes) {
            for (const available of allPossibleAvailable) {
                const resolved = resolveRatingDisplayMode(preferred, available);
                if (available.includes(preferred)) {
                    expect(resolved).toBe(preferred);
                } else {
                    const prefIdx = ratingModeOrder.indexOf(preferred);
                    let expectedFallback: RatingDisplayMode | undefined;
                    for (let i = prefIdx - 1; i >= 0; i--) {
                        if (available.includes(ratingModeOrder[i]!)) {
                            expectedFallback = ratingModeOrder[i];
                            break;
                        }
                    }
                    if (!expectedFallback) {
                        expectedFallback = available[0] ?? "简洁";
                    }
                    expect(resolved).toBe(expectedFallback);
                }
            }
        }

        // Key concrete combinations
        expect(resolveRatingDisplayMode("完整", ["简洁", "吃分"])).toBe("吃分");
        expect(resolveRatingDisplayMode("完整", ["简洁"])).toBe("简洁");
        expect(resolveRatingDisplayMode("吃分", ["简洁", "完整"])).toBe("简洁");
        expect(resolveRatingDisplayMode("吃分", ["完整"])).toBe("完整");
        expect(resolveRatingDisplayMode("简洁", ["吃分", "完整"])).toBe("吃分");
        expect(resolveRatingDisplayMode("简洁", [])).toBe("简洁");

        // The fallback walks ratingModeOrder back from the preferred mode, whatever order
        // `available` lists the modes in; only when no earlier mode is available does it take the
        // first one listed.
        expect(resolveRatingDisplayMode("吃分", ["完整", "简洁"])).toBe("简洁");
        expect(resolveRatingDisplayMode("完整", ["吃分", "简洁"])).toBe("吃分");
        expect(resolveRatingDisplayMode("简洁", ["完整", "吃分"])).toBe("完整");
    });
});

describe("getAvailableRatingDisplayModes", () => {
    function makeDummyTables(filteredCount: number): ChartRatingTables {
        const dummyStage: RatingTableEntry = {
            ds: 12.0,
            achievements: 100.0,
            rating: 250,
            rank: RankRate.sss,
        };
        const filtered = Array.from({ length: filteredCount }, () => dummyStage);
        return {
            all: filtered,
            filtered,
            current: filtered,
        };
    }

    it("offers 吃分 only when filtered length > 3 (three is not enough)", () => {
        expect(getAvailableRatingDisplayModes(makeDummyTables(0))).toEqual(["简洁", "完整"]);
        expect(getAvailableRatingDisplayModes(makeDummyTables(1))).toEqual(["简洁", "完整"]);
        expect(getAvailableRatingDisplayModes(makeDummyTables(2))).toEqual(["简洁", "完整"]);
        expect(getAvailableRatingDisplayModes(makeDummyTables(3))).toEqual(["简洁", "完整"]);
        expect(getAvailableRatingDisplayModes(makeDummyTables(4))).toEqual([
            "简洁",
            "吃分",
            "完整",
        ]);
        expect(getAvailableRatingDisplayModes(makeDummyTables(5))).toEqual([
            "简洁",
            "吃分",
            "完整",
        ]);
    });
});

describe("selectDisplayedRaTable in 简洁 mode", () => {
    function stage(ach: number, ra: number): RatingTableEntry {
        return {
            ds: 14.0,
            achievements: ach,
            rating: ra,
            rank: RankRate.sssp,
        };
    }

    it("shows entire table when length <= 3", () => {
        const table1 = [stage(101, 330)];
        const table2 = [stage(101, 330), stage(100, 310)];
        const table3 = [stage(101, 330), stage(100, 310), stage(99, 290)];

        expect(selectDisplayedRaTable(table1, "简洁", () => 200)).toEqual(table1);
        expect(selectDisplayedRaTable(table2, "简洁", () => 200)).toEqual(table2);
        expect(selectDisplayedRaTable(table3, "简洁", () => 200)).toEqual(table3);
    });

    it("shows first and last two stages when baseRa is null or not a number", () => {
        const table = [
            stage(101, 330),
            stage(100.5, 320),
            stage(100, 310),
            stage(99.5, 300),
            stage(99, 290),
        ];
        expect(selectDisplayedRaTable(table, "简洁", () => null)).toEqual([
            stage(101, 330),
            stage(99.5, 300),
            stage(99, 290),
        ]);
    });

    it("inserts the last bonus stage (> floor) at index 1 when not already present", () => {
        const s0 = stage(101, 330);
        const s1 = stage(100.5, 320);
        const s2 = stage(100, 310);
        const s3 = stage(99.5, 300);
        const s4 = stage(99, 290);
        const table = [s0, s1, s2, s3, s4];

        const result = selectDisplayedRaTable(table, "简洁", () => 305);
        expect(result).toEqual([s0, s2, s3, s4]);
    });

    it("does not insert last bonus stage twice when it is already one of the first or last two", () => {
        const s0 = stage(101, 330);
        const s1 = stage(100.5, 320);
        const s2 = stage(100, 310);
        const s3 = stage(99.5, 300);
        const s4 = stage(99, 290);
        const table = [s0, s1, s2, s3, s4];

        // floor 280: last bonus is s4 (290), already in displayItems
        expect(selectDisplayedRaTable(table, "简洁", () => 280)).toEqual([s0, s3, s4]);

        // floor 295: last bonus is s3 (300), already in displayItems
        expect(selectDisplayedRaTable(table, "简洁", () => 295)).toEqual([s0, s3, s4]);

        // floor 325: last bonus is s0 (330), already in displayItems
        expect(selectDisplayedRaTable(table, "简洁", () => 325)).toEqual([s0, s3, s4]);

        // floor 350: no stage > 350
        expect(selectDisplayedRaTable(table, "简洁", () => 350)).toEqual([s0, s3, s4]);
    });
});

describe("getBaseRa invocation count", () => {
    function stage(ach: number, ra: number): RatingTableEntry {
        return {
            ds: 14.0,
            achievements: ach,
            rating: ra,
            rank: RankRate.sssp,
        };
    }

    it("calls getBaseRa only in 简洁 mode for tables longer than 3 rows", () => {
        const shortTable = [stage(101, 330), stage(100, 310), stage(99, 290)];
        const longTable = [stage(101, 330), stage(100.5, 320), stage(100, 310), stage(99, 290)];

        let calls = 0;
        const getBaseRa = () => {
            calls++;
            return 300;
        };

        // 吃分 mode with long table: 0 calls
        calls = 0;
        selectDisplayedRaTable(longTable, "吃分", getBaseRa);
        expect(calls).toBe(0);

        // 完整 mode with long table: 0 calls
        calls = 0;
        selectDisplayedRaTable(longTable, "完整", getBaseRa);
        expect(calls).toBe(0);

        // 简洁 mode with short table (<= 3): 0 calls
        calls = 0;
        selectDisplayedRaTable(shortTable, "简洁", getBaseRa);
        expect(calls).toBe(0);

        // 简洁 mode with empty table (0): 0 calls
        calls = 0;
        selectDisplayedRaTable([], "简洁", getBaseRa);
        expect(calls).toBe(0);

        // 简洁 mode with long table (> 3): exactly 1 call
        calls = 0;
        selectDisplayedRaTable(longTable, "简洁", getBaseRa);
        expect(calls).toBe(1);
    });
});

describe("getLowestRaInChartOrSection", () => {
    const dummyChart = fixed.oldChart;

    it("returns null without a dialog chart", () => {
        expect(
            getLowestRaInChartOrSection(null, { deluxeRating: 300 } as ChartScore, 250)
        ).toBeNull();
        expect(getLowestRaInChartOrSection(null, null, null)).toBeNull();
    });

    it("returns chart rating or floor when the other is missing or 0, higher of the two otherwise", () => {
        expect(getLowestRaInChartOrSection(dummyChart, null, 250)).toBe(250);
        expect(getLowestRaInChartOrSection(dummyChart, undefined, 250)).toBe(250);
        expect(
            getLowestRaInChartOrSection(dummyChart, { deluxeRating: 0 } as ChartScore, 250)
        ).toBe(250);
        expect(
            getLowestRaInChartOrSection(dummyChart, { deluxeRating: 300 } as ChartScore, null)
        ).toBe(300);
        expect(
            getLowestRaInChartOrSection(dummyChart, { deluxeRating: 300 } as ChartScore, 0)
        ).toBe(300);
        expect(
            getLowestRaInChartOrSection(dummyChart, { deluxeRating: 300 } as ChartScore, 250)
        ).toBe(300);
        expect(
            getLowestRaInChartOrSection(dummyChart, { deluxeRating: 200 } as ChartScore, 250)
        ).toBe(250);
        expect(getLowestRaInChartOrSection(dummyChart, null, null)).toBeNull();
        expect(getLowestRaInChartOrSection(dummyChart, { deluxeRating: 0 } as ChartScore, 0)).toBe(
            0
        );
    });
});

describe("getLowestRaInSection empty B50 list behavior", () => {
    it("throws a TypeError when the relevant B50 list is an empty array", () => {
        const userWithEmptySd = makeUser({ sd: [], dx: [makeRecord(1, 300, true)] });
        const userWithEmptyDx = makeUser({ sd: [makeRecord(1, 300, false)], dx: [] });

        // Old chart accesses user.data.b50.sd -> [] -> [][ -1 ].ra -> TypeError
        expect(() => getLowestRaInSection(userWithEmptySd, fixed.oldChart)).toThrow(TypeError);

        // New chart accesses user.data.b50.dx -> [] -> [][ -1 ].ra -> TypeError
        expect(() => getLowestRaInSection(userWithEmptyDx, fixed.newChart)).toThrow(TypeError);
    });
});

describe("immutability of arguments", () => {
    it("does not mutate any of the arguments passed to the functions", () => {
        const chart = fixed.oldChart;
        Object.freeze(chart);
        Object.freeze(chart.info);

        const score: ChartScore = Object.freeze(makeScore(99.5, 280));

        const user = fixed.userFullB50;
        const userBefore = JSON.stringify(user);

        const tables = getChartRatingTables(chart, score, "简洁");
        expect(JSON.stringify(user)).toBe(userBefore);
        expect(score.achievements).toBe(99.5);
        expect(score.deluxeRating).toBe(280);

        Object.freeze(tables);
        Object.freeze(tables.all);
        Object.freeze(tables.filtered);
        Object.freeze(tables.current);

        getAvailableRatingDisplayModes(tables);

        const availableModes: readonly RatingDisplayMode[] = Object.freeze([
            "简洁",
            "吃分",
            "完整",
        ]);
        resolveRatingDisplayMode("完整", [...availableModes]);

        const raTable = Object.freeze([...tables.all]);
        selectDisplayedRaTable(raTable as RatingTableEntry[], "简洁", () => 200);

        getLowestRaInSection(user, chart);
        expect(JSON.stringify(user)).toBe(userBefore);

        getLowestRaInChartOrSection(chart, score, 250);
        expect(score.deluxeRating).toBe(280);
    });
});
