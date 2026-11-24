/*
 * Snapshot tests for the B50 query helpers (selectB50Charts, createMusicChartMap,
 * recordsHaveLastChangedAt, sumChartRatings, convertDFRecordToChart, sortCharts,
 * calculateRating, normalizeConstant, filterByComboStatus, getSourceRecords).
 * They exercise each page mode (default, fit, nb, ap, fc, pc) across user data variants
 * on fixed data: the trimmed SaltMeta fixture plus synthetic records and fit constants
 * from a seeded generator.
 */

import type { DivingFishFullRecord } from "../integrations/diving-fish/type";
import type { Chart } from "../music/type";
import type { User } from "../user/type";
import type { B50QueryOptions } from "./b50";
import { describe, expect, it } from "vitest";
import { isUtageGrade } from "../chart/difficulty";
import { createFixtureMusicList } from "../fixtures/saltmeta";
import { ComboStatus, RankRate, SyncStatus } from "../mai/types";
import {
    calculateRating,
    convertDFRecordToChart,
    createMusicChartMap,
    filterByComboStatus,
    getSourceRecords,
    normalizeConstant,
    recordsHaveLastChangedAt,
    selectB50Charts,
    sortCharts,
    sumChartRatings,
} from "./b50";

// MARK: seeded generator and fixed test data

/**
 * mulberry32 seeded generator, identical to the one in songs.test.ts.
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

const ACHIEVEMENTS = [
    101.0, 100.5, 100.5, 100.0, 100.0, 99.5, 99.0, 98.5, 98.0, 97.0, 95.0, 90.0, 80.0,
];
const COMBOS = [
    ComboStatus.None,
    ComboStatus.None,
    ComboStatus.FullCombo,
    ComboStatus.FullComboPlus,
    ComboStatus.AllPerfect,
    ComboStatus.AllPerfectPlus,
];
const SYNCS = [
    SyncStatus.None,
    SyncStatus.None,
    SyncStatus.Sync,
    SyncStatus.FullSync,
    SyncStatus.FullSyncPlus,
    SyncStatus.FullSyncDX,
    SyncStatus.FullSyncDXPlus,
];
const PLAY_COUNTS = [undefined, 1, 5, 10, 10, 25, 50, 100, 100];
const CHANGE_TIMES = [
    undefined,
    0,
    1_700_000_000_000,
    1_700_000_000_000,
    1_700_086_400_000,
    1_700_172_800_000,
];

function buildSyntheticMusicList(random: () => number) {
    const raw = createFixtureMusicList();
    const chartList: Record<number, Chart> = {};
    const musicList: Record<number, Chart["music"]> = {};

    for (const [idStr, music] of Object.entries(raw.musicList)) {
        musicList[Number(idStr)] = {
            ...music,
            info: { ...music.info },
            charts: [],
        };
    }

    for (const [idStr, chart] of Object.entries(raw.chartList)) {
        const music = musicList[chart.music.id] ?? chart.music;
        let stat = chart.info.stat ? { ...chart.info.stat } : undefined;

        const roll = random();
        if (roll < 0.35) {
            // Above constant
            const delta = Math.round((0.1 + random() * 0.7) * 100) / 100;
            stat = {
                cnt: 1000,
                diff: chart.info.level,
                fit_diff: Math.round((chart.info.constant + delta) * 100) / 100,
                avg: 99.5,
                avg_dx: 800,
                std_dev: 1.5,
                dist: [],
                fc_dist: [],
                ...stat,
            };
            stat.fit_diff = Math.round((chart.info.constant + delta) * 100) / 100;
        } else if (roll < 0.65) {
            // Below constant
            const delta = Math.round((0.1 + random() * 0.7) * 100) / 100;
            stat = {
                cnt: 1000,
                diff: chart.info.level,
                fit_diff: Math.max(1, Math.round((chart.info.constant - delta) * 100) / 100),
                avg: 99.5,
                avg_dx: 800,
                std_dev: 1.5,
                dist: [],
                fc_dist: [],
                ...stat,
            };
            stat.fit_diff = Math.max(1, Math.round((chart.info.constant - delta) * 100) / 100);
        } else if (roll < 0.85) {
            // Keep untouched stat if any
        } else {
            // Missing stat
            stat = undefined;
        }

        const newChart: Chart = {
            ...chart,
            info: {
                ...chart.info,
                stat,
            },
            music,
        };
        chartList[Number(idStr)] = newChart;
        music.charts.push(newChart);
    }

    return { musicList, chartList };
}

function buildFixedData() {
    const random = createRandom(20261116);
    function pick<T>(items: readonly T[]): T {
        return items[Math.floor(random() * items.length)] as T;
    }

    const untouched = createFixtureMusicList();
    const synthetic = buildSyntheticMusicList(random);

    const untouchedCharts = Object.values(untouched.chartList);
    const syntheticCharts = Object.values(synthetic.chartList);

    const untouchedMap = createMusicChartMap(untouchedCharts);
    const syntheticMap = createMusicChartMap(syntheticCharts);

    const detailedRecords: Record<string, DivingFishFullRecord> = {};
    const oldRecords: DivingFishFullRecord[] = [];
    const newRecords: DivingFishFullRecord[] = [];

    for (const chart of syntheticCharts) {
        // Include most charts, but keep a seeded subset
        if (chart.music.info.isNew === false && random() < 0.15) {
            continue;
        }

        const chartType: "DX" | "SD" = chart.music.id >= 10000 ? "DX" : "SD";
        const songId =
            chart.music.id >= 100000
                ? chart.music.id
                : chart.music.id >= 10000
                  ? chart.music.id - 10000
                  : chart.music.id;

        const achievements = pick(ACHIEVEMENTS);
        const dsRoll = random();
        const ds = dsRoll < 0.08 ? Number.NaN : chart.info.constant;
        const ra = calculateRating(achievements, Number.isFinite(ds) ? ds : chart.info.constant);

        const record: DivingFishFullRecord = {
            song_id: songId,
            type: chartType,
            level_index: chart.info.grade,
            level_label:
                ["Basic", "Advanced", "Expert", "Master", "Re:Master"][chart.info.grade] ?? "Utage",
            level: chart.info.level,
            title: chart.music.info.title,
            achievements,
            ds,
            dxScore: Math.floor(random() * 1500),
            fc: pick(COMBOS),
            fs: pick(SYNCS),
            rate:
                achievements >= 100.5
                    ? RankRate.sssp
                    : achievements >= 100
                      ? RankRate.sss
                      : achievements >= 99.5
                        ? RankRate.ssp
                        : RankRate.ss,
            ra,
            play_count: pick(PLAY_COUNTS),
            lastChangedAt: pick(CHANGE_TIMES),
        };

        const key = `${chart.music.id}-${chart.info.grade}`;
        detailedRecords[key] = record;

        if (chart.music.info.isNew) {
            newRecords.push(record);
        } else {
            oldRecords.push(record);
        }
    }

    // A few records whose song is not in the music list
    const ghostRecords: DivingFishFullRecord[] = [
        {
            song_id: 99991,
            type: "SD",
            level_index: 3,
            level_label: "Master",
            level: "14",
            title: "Ghost Standard Song",
            achievements: 100.5,
            ds: 14.0,
            dxScore: 1000,
            fc: ComboStatus.AllPerfect,
            fs: SyncStatus.FullSyncDX,
            rate: RankRate.sssp,
            ra: 308,
            play_count: 50,
            lastChangedAt: 1_700_000_000_000,
        },
        {
            song_id: 99992,
            type: "DX",
            level_index: 3,
            level_label: "Master",
            level: "13+",
            title: "Ghost Deluxe Song",
            achievements: 100.0,
            ds: 13.7,
            dxScore: 900,
            fc: ComboStatus.FullCombo,
            fs: SyncStatus.FullSync,
            rate: RankRate.sss,
            ra: 280,
            play_count: 20,
            lastChangedAt: 1_700_000_000_000,
        },
        {
            song_id: 99993,
            type: "DX",
            level_index: 4,
            level_label: "Re:Master",
            level: "14+",
            title: "Ghost DX Re:Master",
            achievements: 99.5,
            ds: 14.8,
            dxScore: 1200,
            fc: ComboStatus.None,
            fs: SyncStatus.None,
            rate: RankRate.ssp,
            ra: 300,
            play_count: 15,
            lastChangedAt: 1_700_000_000_000,
        },
    ];

    for (const ghost of ghostRecords) {
        detailedRecords[`${ghost.song_id}-${ghost.level_index}`] = ghost;
    }

    // Stored B50 lists: sd > 35 records, dx > 15 records
    const b50Sd = [...oldRecords.slice(0, 38), ghostRecords[0] as DivingFishFullRecord];
    const b50Dx = [
        ...newRecords,
        ghostRecords[1] as DivingFishFullRecord,
        ghostRecords[2] as DivingFishFullRecord,
        ...newRecords.map(r => ({ ...r, song_id: r.song_id + 80000 })),
    ].slice(0, 20);

    // Variants
    const detailedOnlyData: User["data"] = {
        updateTime: 1_700_000_000_000,
        name: "SaltNetPlayer",
        rating: 15500,
        detailed: detailedRecords,
    };

    const b50OnlyData: User["data"] = {
        updateTime: 1_700_000_000_000,
        name: "SaltNetPlayer",
        rating: 15500,
        b50: { sd: b50Sd, dx: b50Dx },
    };

    const bothData: User["data"] = {
        updateTime: 1_700_000_000_000,
        name: "SaltNetPlayer",
        rating: 15500,
        detailed: detailedRecords,
        b50: { sd: b50Sd, dx: b50Dx },
    };

    const emptyDetailedData: User["data"] = {
        updateTime: 1_700_000_000_000,
        name: "SaltNetPlayer",
        rating: 15500,
        detailed: {},
        b50: { sd: b50Sd, dx: b50Dx },
    };

    const noUserData: User["data"] | undefined = undefined;

    // Variant without any lastChangedAt
    const detailedWithoutLastChangedAt: Record<string, DivingFishFullRecord> = {};
    for (const [k, r] of Object.entries(detailedRecords)) {
        detailedWithoutLastChangedAt[k] = { ...r, lastChangedAt: undefined };
    }
    const b50SdWithoutLastChangedAt = b50Sd.map(r => ({ ...r, lastChangedAt: 0 }));
    const b50DxWithoutLastChangedAt = b50Dx.map(r => ({ ...r, lastChangedAt: undefined }));

    const noLastChangedAtData: User["data"] = {
        updateTime: 1_700_000_000_000,
        name: "SaltNetPlayer",
        rating: 15500,
        detailed: detailedWithoutLastChangedAt,
        b50: { sd: b50SdWithoutLastChangedAt, dx: b50DxWithoutLastChangedAt },
    };

    return {
        untouchedMap,
        syntheticMap,
        variants: [
            { name: "detailed only", data: detailedOnlyData },
            { name: "b50 only", data: b50OnlyData },
            { name: "both detailed and b50", data: bothData },
            { name: "empty detailed with b50", data: emptyDetailedData },
            { name: "no data", data: noUserData },
            { name: "without lastChangedAt", data: noLastChangedAtData },
        ],
        bothData,
    };
}

const fixedData = buildFixedData();

// MARK: compact snapshot summary formatter

function formatChartSummary(chart: Chart): string {
    const key = `${chart.music.id}-${chart.info.grade}`;
    const rating = chart.score?.deluxeRating ?? 0;
    const achievements = chart.score?.achievements ?? "-";
    const playCount = chart.score?.playCount ?? "-";
    const fit = (chart.score as unknown as Record<string, unknown> | undefined)?.fitConstant;
    const fitStr = typeof fit === "number" ? ` fit ${fit}` : "";
    const converted = [
        `fc ${JSON.stringify(chart.score?.comboStatus ?? null)}`,
        `fs ${JSON.stringify(chart.score?.syncStatus ?? null)}`,
        `rate ${JSON.stringify(chart.score?.rankRate ?? null)}`,
        `dx ${JSON.stringify(chart.score?.deluxeScore ?? null)}`,
        `at ${JSON.stringify(chart.score?.lastChangedAt ?? null)}`,
    ].join(" ");
    return `  ${key} rating ${rating} ach ${achievements} pc ${playCount}${fitStr} | ${converted}`;
}

function formatB50Summary(result: { old: Chart[]; newer: Chart[] }): string {
    const lines: string[] = [];
    const oldSum = sumChartRatings(result.old);
    const newerSum = sumChartRatings(result.newer);

    lines.push(`old (${result.old.length}):`);
    for (const chart of result.old) {
        lines.push(formatChartSummary(chart));
    }
    lines.push(`old sum: ${oldSum}`);

    lines.push(`newer (${result.newer.length}):`);
    for (const chart of result.newer) {
        lines.push(formatChartSummary(chart));
    }
    lines.push(`newer sum: ${newerSum}`);
    lines.push(`total sum: ${oldSum + newerSum}`);

    return lines.join("\n");
}

type PageMode = "default" | "fit" | "nb" | "ap" | "fc" | "pc";

function buildOptionsForMode(mode: PageMode, data: User["data"] | undefined): B50QueryOptions {
    switch (mode) {
        case "default":
            return { fitDiff: false, nb50: false, comboFilter: null, pc50: false };
        case "fit":
            return { fitDiff: true, nb50: false, comboFilter: null, pc50: false };
        case "nb":
            return { fitDiff: false, nb50: true, comboFilter: null, pc50: false };
        case "ap":
            return { fitDiff: false, nb50: false, comboFilter: "ap", pc50: false };
        case "fc":
            return { fitDiff: false, nb50: false, comboFilter: "fc", pc50: false };
        case "pc":
            return {
                fitDiff: false,
                nb50: false,
                comboFilter: null,
                pc50: recordsHaveLastChangedAt(data),
            };
    }
}

// MARK: snapshot scenarios

describe("b50Query snapshots", () => {
    const modes: PageMode[] = ["default", "fit", "nb", "ap", "fc", "pc"];

    describe("synthetic fixture across data variants and modes", () => {
        for (const variant of fixedData.variants) {
            for (const mode of modes) {
                it(`synthetic fixture - ${variant.name} - ${mode} mode`, () => {
                    const options = buildOptionsForMode(mode, variant.data);
                    const result = selectB50Charts(variant.data, fixedData.syntheticMap, options);
                    expect(formatB50Summary(result)).toMatchSnapshot();
                });
            }
        }
    });

    describe("untouched fixture across modes", () => {
        for (const mode of modes) {
            it(`untouched fixture - both data - ${mode} mode`, () => {
                const options = buildOptionsForMode(mode, fixedData.bothData);
                const result = selectB50Charts(fixedData.bothData, fixedData.untouchedMap, options);
                expect(formatB50Summary(result)).toMatchSnapshot();
            });
        }
    });
});

// MARK: explicit cases

function makeStubChart(options: {
    musicId: number;
    grade: number;
    isNew: boolean;
    constant?: number;
    fitDiff?: number;
    rating?: number;
    achievements?: number;
    playCount?: number;
    fitConstant?: number;
}): Chart {
    const chart: Chart = {
        id: options.musicId * 10 + options.grade,
        info: {
            grade: options.grade,
            constant: options.constant ?? 13.0,
            level: "13",
            deluxeScoreMax: 3000,
            notes: [100, 20, 30, 0, 10],
            charter: "Tester",
            stat:
                typeof options.fitDiff === "number"
                    ? {
                          cnt: 1000,
                          diff: "13",
                          fit_diff: options.fitDiff,
                          avg: 99.0,
                          avg_dx: 700,
                          std_dev: 1.0,
                          dist: [],
                          fc_dist: [],
                      }
                    : undefined,
        },
        music: {
            id: options.musicId,
            info: {
                id: options.musicId,
                title: `Song ${options.musicId}`,
                artist: "Artist",
                genre: "POPS & ANIME" as unknown as Chart["music"]["info"]["genre"],
                bpm: 180,
                from: "舞萌DX 2026" as unknown as Chart["music"]["info"]["from"],
                isNew: options.isNew,
                type: 0 as unknown as Chart["music"]["info"]["type"],
            },
            charts: [],
        },
        score: {
            rankRate: RankRate.sssp,
            achievements: options.achievements ?? 100.5,
            comboStatus: ComboStatus.AllPerfect,
            syncStatus: SyncStatus.FullSyncDX,
            deluxeRating: options.rating ?? 300,
            deluxeScore: 2500,
            playCount: options.playCount,
        },
    };
    if (typeof options.fitConstant === "number") {
        (chart.score as unknown as Record<string, unknown>).fitConstant = options.fitConstant;
    }
    return chart;
}

function makeStubDFRecord(
    chart: Chart,
    overrides?: Partial<DivingFishFullRecord>
): DivingFishFullRecord {
    const chartType: "DX" | "SD" = chart.music.id >= 10000 ? "DX" : "SD";
    const songId =
        chart.music.id >= 100000
            ? chart.music.id
            : chart.music.id >= 10000
              ? chart.music.id - 10000
              : chart.music.id;

    return {
        song_id: songId,
        type: chartType,
        level_index: chart.info.grade,
        level_label: "Master",
        level: chart.info.level,
        title: chart.music.info.title,
        achievements: chart.score?.achievements ?? 100.5,
        ds: chart.info.constant,
        dxScore: 1000,
        fc: chart.score?.comboStatus ?? ComboStatus.AllPerfect,
        fs: chart.score?.syncStatus ?? SyncStatus.FullSyncDX,
        rate: chart.score?.rankRate ?? RankRate.sssp,
        ra: chart.score?.deluxeRating ?? 300,
        play_count: chart.score?.playCount,
        lastChangedAt: chart.score?.lastChangedAt,
        ...overrides,
    };
}

describe("b50Query explicit cases", () => {
    describe("the 35 and 15 limits and tie-break ordering", () => {
        it("limits old charts to exactly 35 and new charts to exactly 15", () => {
            const oldCharts: Chart[] = [];
            const newCharts: Chart[] = [];
            const records: Record<string, DivingFishFullRecord> = {};

            for (let i = 1; i <= 40; i++) {
                const chart = makeStubChart({
                    musicId: i,
                    grade: 3,
                    isNew: false,
                    rating: 200 + i,
                });
                oldCharts.push(chart);
                records[`${chart.music.id}-${chart.info.grade}`] = makeStubDFRecord(chart);
            }

            for (let i = 101; i <= 120; i++) {
                const chart = makeStubChart({
                    musicId: i + 10000,
                    grade: 3,
                    isNew: true,
                    rating: 200 + i,
                });
                newCharts.push(chart);
                records[`${chart.music.id}-${chart.info.grade}`] = makeStubDFRecord(chart);
            }

            const map = createMusicChartMap([...oldCharts, ...newCharts]);
            const user: User["data"] = {
                updateTime: 0,
                name: "Test",
                rating: 0,
                detailed: records,
            };

            const result = selectB50Charts(user, map, {
                fitDiff: false,
                nb50: false,
                comboFilter: null,
                pc50: false,
            });

            expect(result.old).toHaveLength(35);
            expect(result.newer).toHaveLength(15);
            // Verify top ratings are kept
            expect(result.old[0]?.score?.deluxeRating).toBe(240);
            expect(result.old[34]?.score?.deluxeRating).toBe(206);
            expect(result.newer[0]?.score?.deluxeRating).toBe(320);
            expect(result.newer[14]?.score?.deluxeRating).toBe(306);
        });

        it("tie-breaks: play count only in pc50 mode, then rating, achievements, fitConstant/constant", () => {
            // 1. Play count tie break: higher play count wins when sortByPlayCount is true
            const cHighPc = makeStubChart({
                musicId: 1,
                grade: 3,
                isNew: false,
                rating: 200,
                playCount: 100,
            });
            const cLowPcHighRating = makeStubChart({
                musicId: 2,
                grade: 3,
                isNew: false,
                rating: 320,
                playCount: 5,
            });
            expect(sortCharts([cLowPcHighRating, cHighPc], 2, true).map(c => c.music.id)).toEqual([
                1, 2,
            ]);

            // When sortByPlayCount is false, rating takes priority regardless of play count
            expect(sortCharts([cHighPc, cLowPcHighRating], 2, false).map(c => c.music.id)).toEqual([
                2, 1,
            ]);

            // 2. Rating tie break: when play count ties (or sortByPlayCount is false), higher rating wins
            const cHighRating = makeStubChart({
                musicId: 3,
                grade: 3,
                isNew: false,
                rating: 300,
                achievements: 99.0,
                playCount: 10,
            });
            const cLowRating = makeStubChart({
                musicId: 4,
                grade: 3,
                isNew: false,
                rating: 280,
                achievements: 100.5,
                playCount: 10,
            });
            expect(sortCharts([cLowRating, cHighRating], 2, true).map(c => c.music.id)).toEqual([
                3, 4,
            ]);

            // 3. Achievements tie break: when rating ties, higher achievements wins
            const cHighAch = makeStubChart({
                musicId: 5,
                grade: 3,
                isNew: false,
                rating: 300,
                achievements: 100.5,
                constant: 13.0,
            });
            const cLowAch = makeStubChart({
                musicId: 6,
                grade: 3,
                isNew: false,
                rating: 300,
                achievements: 100.0,
                constant: 14.0,
            });
            expect(sortCharts([cLowAch, cHighAch], 2, false).map(c => c.music.id)).toEqual([5, 6]);

            // 4. Fit constant tie break: when rating and achievements tie, higher fitConstant wins
            const cHighFit = makeStubChart({
                musicId: 7,
                grade: 3,
                isNew: false,
                rating: 300,
                achievements: 100.0,
                constant: 13.0,
                fitConstant: 14.5,
            });
            const cLowFit = makeStubChart({
                musicId: 8,
                grade: 3,
                isNew: false,
                rating: 300,
                achievements: 100.0,
                constant: 14.0,
                fitConstant: 14.1,
            });
            expect(sortCharts([cLowFit, cHighFit], 2, false).map(c => c.music.id)).toEqual([7, 8]);

            // 5. Fallback to constant when fitConstant is missing or NaN
            const cConstHigh = makeStubChart({
                musicId: 9,
                grade: 3,
                isNew: false,
                rating: 300,
                achievements: 100.0,
                constant: 13.8,
            });
            const cConstLow = makeStubChart({
                musicId: 10,
                grade: 3,
                isNew: false,
                rating: 300,
                achievements: 100.0,
                constant: 13.2,
            });
            expect(sortCharts([cConstLow, cConstHigh], 2, false).map(c => c.music.id)).toEqual([
                9, 10,
            ]);

            const cFitNaNHigh = makeStubChart({
                musicId: 11,
                grade: 3,
                isNew: false,
                rating: 300,
                achievements: 100.0,
                constant: 14.2,
                fitConstant: Number.NaN,
            });
            const cFitNaNLow = makeStubChart({
                musicId: 12,
                grade: 3,
                isNew: false,
                rating: 300,
                achievements: 100.0,
                constant: 13.5,
                fitConstant: Number.NaN,
            });
            expect(sortCharts([cFitNaNLow, cFitNaNHigh], 2, false).map(c => c.music.id)).toEqual([
                11, 12,
            ]);
        });

        it("keeps the incoming order of charts that tie on every key, also at the limit", () => {
            // sortCharts has no final ID comparison: charts that tie on every key keep the order
            // they came in (Array.prototype.sort is stable), here a descending chart ID order.
            const tied = [30, 20, 10].map(musicId =>
                makeStubChart({
                    musicId,
                    grade: 3,
                    isNew: false,
                    rating: 300,
                    achievements: 100.5,
                    constant: 13.0,
                    playCount: 5,
                })
            );
            expect(sortCharts(tied, 3, false).map(c => c.music.id)).toEqual([30, 20, 10]);
            expect(sortCharts(tied, 3, true).map(c => c.music.id)).toEqual([30, 20, 10]);
            expect(sortCharts(tied, 2, false).map(c => c.music.id)).toEqual([30, 20]);

            // The same through selectB50Charts: 36 tied old charts, the last one past the limit.
            const charts = Array.from({ length: 36 }, (_, i) =>
                makeStubChart({
                    musicId: 36 - i,
                    grade: 3,
                    isNew: false,
                    rating: 300,
                    achievements: 100.5,
                    constant: 13.0,
                })
            );
            const detailed = Object.fromEntries(
                charts.map(chart => [
                    `${chart.music.id}-${chart.info.grade}`,
                    makeStubDFRecord(chart),
                ])
            );
            const result = selectB50Charts(
                { updateTime: 0, name: "Test", rating: 0, detailed },
                createMusicChartMap(charts),
                { fitDiff: false, nb50: false, comboFilter: null, pc50: false }
            );
            expect(result.old.map(c => c.music.id)).toEqual(
                Array.from({ length: 35 }, (_, i) => 36 - i)
            );
        });
    });

    describe("calculateRating", () => {
        it("returns 0 for missing achievements and for missing or NaN constant", () => {
            expect(calculateRating(null, 13.5)).toBe(0);
            expect(calculateRating(undefined as unknown as number, 13.5)).toBe(0);
            expect(calculateRating(100.5, undefined)).toBe(0);
            expect(calculateRating(100.5, Number.NaN)).toBe(0);
            expect(calculateRating(null, undefined)).toBe(0);
            expect(calculateRating(100.5, 14.0)).toBeGreaterThan(0);
        });
    });

    describe("normalizeConstant", () => {
        it("rounds to one decimal and returns undefined for non-finite values", () => {
            expect(normalizeConstant(13.74)).toBe(13.7);
            expect(normalizeConstant(13.75)).toBe(13.8);
            expect(normalizeConstant(13.76)).toBe(13.8);
            expect(normalizeConstant(14.0)).toBe(14.0);
            expect(normalizeConstant(undefined)).toBeUndefined();
            expect(normalizeConstant(null)).toBeUndefined();
            expect(normalizeConstant(Number.NaN)).toBeUndefined();
            expect(normalizeConstant(Number.POSITIVE_INFINITY)).toBeUndefined();
            expect(normalizeConstant(Number.NEGATIVE_INFINITY)).toBeUndefined();
        });
    });

    describe("record and utage filtering", () => {
        it("leaves out records whose song is not in the map and utage records", () => {
            const normalChart = makeStubChart({ musicId: 1, grade: 3, isNew: false });
            const utageChart = makeStubChart({ musicId: 2, grade: 10, isNew: false });
            expect(isUtageGrade(utageChart.info.grade)).toBe(true);

            const map = createMusicChartMap([normalChart, utageChart]);

            const recNormal = makeStubDFRecord(normalChart);
            const recUtage = makeStubDFRecord(utageChart);
            const recGhost = makeStubDFRecord(normalChart, { song_id: 999999 });

            // convertDFRecordToChart behavior directly
            expect(convertDFRecordToChart(recNormal, map)).not.toBeNull();
            expect(convertDFRecordToChart(recGhost, map)).toBeNull();
            expect(convertDFRecordToChart(recUtage, map)).not.toBeNull();

            // selectB50Charts filters out both ghost and utage
            const user: User["data"] = {
                updateTime: 0,
                name: "Test",
                rating: 0,
                detailed: {
                    "1-3": recNormal,
                    "2-10": recUtage,
                    "999999-3": recGhost,
                },
            };

            const result = selectB50Charts(user, map, {
                fitDiff: false,
                nb50: false,
                comboFilter: null,
                pc50: false,
            });

            expect(result.old).toHaveLength(1);
            expect(result.old[0]?.id).toBe(normalChart.id);
            expect(result.newer).toHaveLength(0);
        });
    });

    describe("nb50 mode requirements", () => {
        it("keeps only charts whose fit_diff is strictly above the constant and rates them by fit constant", () => {
            // Chart A: fit_diff > constant (13.5 > 13.0) -> kept
            const chartAbove = makeStubChart({
                musicId: 1,
                grade: 3,
                isNew: false,
                constant: 13.0,
                fitDiff: 13.5,
            });
            // Chart B: fit_diff == constant (13.0 == 13.0) -> left out
            const chartEqual = makeStubChart({
                musicId: 2,
                grade: 3,
                isNew: false,
                constant: 13.0,
                fitDiff: 13.0,
            });
            // Chart C: fit_diff < constant (12.5 < 13.0) -> left out
            const chartBelow = makeStubChart({
                musicId: 3,
                grade: 3,
                isNew: false,
                constant: 13.0,
                fitDiff: 12.5,
            });
            // Chart D: fit_diff missing -> left out
            const chartMissing = makeStubChart({
                musicId: 4,
                grade: 3,
                isNew: false,
                constant: 13.0,
            });

            const map = createMusicChartMap([chartAbove, chartEqual, chartBelow, chartMissing]);
            const user: User["data"] = {
                updateTime: 0,
                name: "Test",
                rating: 0,
                detailed: {
                    "1-3": makeStubDFRecord(chartAbove, { achievements: 100.5, ra: 200 }),
                    "2-3": makeStubDFRecord(chartEqual, { achievements: 100.5, ra: 200 }),
                    "3-3": makeStubDFRecord(chartBelow, { achievements: 100.5, ra: 200 }),
                    "4-3": makeStubDFRecord(chartMissing, { achievements: 100.5, ra: 200 }),
                },
            };

            const result = selectB50Charts(user, map, {
                fitDiff: false,
                nb50: true,
                comboFilter: null,
                pc50: false,
            });

            expect(result.old).toHaveLength(1);
            expect(result.old[0]?.music.id).toBe(1);
            // Rated by the fit constant (13.5, not 13.0)
            const expectedRating = calculateRating(100.5, 13.5);
            expect(result.old[0]?.score?.deluxeRating).toBe(expectedRating);
            expect((result.old[0]?.score as unknown as Record<string, unknown>).fitConstant).toBe(
                13.5
            );
        });

        it("compares fit_diff with the chart's constant, never with the record's ds", () => {
            // fit_diff above the chart's constant but below the record's ds -> kept
            const keptChart = makeStubChart({
                musicId: 1,
                grade: 3,
                isNew: false,
                constant: 13.0,
                fitDiff: 13.5,
            });
            // fit_diff below the chart's constant but above the record's ds -> left out
            const droppedChart = makeStubChart({
                musicId: 2,
                grade: 3,
                isNew: false,
                constant: 14.0,
                fitDiff: 13.5,
            });
            const map = createMusicChartMap([keptChart, droppedChart]);
            const user: User["data"] = {
                updateTime: 0,
                name: "Test",
                rating: 0,
                detailed: {
                    "1-3": makeStubDFRecord(keptChart, { achievements: 100.5, ds: 14 }),
                    "2-3": makeStubDFRecord(droppedChart, { achievements: 100.5, ds: 13 }),
                },
            };

            const result = selectB50Charts(user, map, {
                fitDiff: false,
                nb50: true,
                comboFilter: null,
                pc50: false,
            });

            expect(result.old.map(c => c.music.id)).toEqual([1]);
            // fit_diff comes before the record's ds in the fit constant chain
            expect((result.old[0]?.score as unknown as Record<string, unknown>).fitConstant).toBe(
                13.5
            );
        });
    });

    describe("fit-diff and nb50 fallback chain with constant normalization", () => {
        it("takes record ds when fit_diff is absent, and falls back to chart constant when ds is NaN", () => {
            // Chart 1: no stat.fit_diff, record has ds = 14.24 -> normalizeConstant(14.24) = 14.2
            const chartWithDs = makeStubChart({
                musicId: 1,
                grade: 3,
                isNew: false,
                constant: 13.0,
            });
            // Chart 2: no stat.fit_diff, record ds is NaN, chart constant is 13.75 -> normalizeConstant(13.75) = 13.8
            const chartWithTwoDecimals = makeStubChart({
                musicId: 2,
                grade: 3,
                isNew: false,
                constant: 13.75,
            });

            const map = createMusicChartMap([chartWithDs, chartWithTwoDecimals]);

            const rec1 = makeStubDFRecord(chartWithDs, { achievements: 100.5, ds: 14.24 });
            const rec2 = makeStubDFRecord(chartWithTwoDecimals, {
                achievements: 100.5,
                ds: Number.NaN,
            });

            const converted1 = convertDFRecordToChart(rec1, map, true);
            const converted2 = convertDFRecordToChart(rec2, map, true);

            expect(
                (converted1?.score as unknown as Record<string, unknown> | undefined)?.fitConstant
            ).toBe(14.2);
            expect(converted1?.score?.deluxeRating).toBe(calculateRating(100.5, 14.2));

            // 13.75 rounded to 13.8 shows the effect of normalizeConstant
            expect(
                (converted2?.score as unknown as Record<string, unknown> | undefined)?.fitConstant
            ).toBe(13.8);
            expect(converted2?.score?.deluxeRating).toBe(calculateRating(100.5, 13.8));
        });

        it("uses the chart's constant unrounded when fit_diff is NaN or infinite, ignoring ds", () => {
            // A NaN or infinite fit_diff is not nullish, so the chain stops there: the record's ds
            // is never consulted, and the chart's constant is taken as it is (13.75, not 13.8).
            const chartNaN = makeStubChart({
                musicId: 1,
                grade: 3,
                isNew: false,
                constant: 13.75,
                fitDiff: Number.NaN,
            });
            const chartInfinite = makeStubChart({
                musicId: 2,
                grade: 3,
                isNew: false,
                constant: 12.75,
                fitDiff: Number.POSITIVE_INFINITY,
            });
            const map = createMusicChartMap([chartNaN, chartInfinite]);

            const fromNaN = convertDFRecordToChart(
                makeStubDFRecord(chartNaN, { achievements: 100.5, ds: 14.2 }),
                map,
                true
            );
            const fromInfinite = convertDFRecordToChart(
                makeStubDFRecord(chartInfinite, { achievements: 100.5, ds: 14.2 }),
                map,
                true
            );

            expect(
                (fromNaN?.score as unknown as Record<string, unknown> | undefined)?.fitConstant
            ).toBe(13.75);
            expect(fromNaN?.score?.deluxeRating).toBe(calculateRating(100.5, 13.75));
            expect(
                (fromInfinite?.score as unknown as Record<string, unknown> | undefined)?.fitConstant
            ).toBe(12.75);
            expect(fromInfinite?.score?.deluxeRating).toBe(calculateRating(100.5, 12.75));
        });
    });

    describe("filterByComboStatus", () => {
        it("keeps AP and AP+ for ap filter, and FC, FC+, AP, AP+ for fc filter", () => {
            const records: DivingFishFullRecord[] = [
                { fc: ComboStatus.None, song_id: 1 } as DivingFishFullRecord,
                { fc: ComboStatus.FullCombo, song_id: 2 } as DivingFishFullRecord,
                { fc: ComboStatus.FullComboPlus, song_id: 3 } as DivingFishFullRecord,
                { fc: ComboStatus.AllPerfect, song_id: 4 } as DivingFishFullRecord,
                { fc: ComboStatus.AllPerfectPlus, song_id: 5 } as DivingFishFullRecord,
            ];

            expect(filterByComboStatus(records, "ap").map(r => r.song_id)).toEqual([4, 5]);
            expect(filterByComboStatus(records, "fc").map(r => r.song_id)).toEqual([2, 3, 4, 5]);
            expect(filterByComboStatus(records, null).map(r => r.song_id)).toEqual([1, 2, 3, 4, 5]);
        });
    });

    describe("modes requiring detailed records vs default mode", () => {
        it("returns nothing for B50-only data in detailed modes, while default mode uses B50 lists", () => {
            const chartOld = makeStubChart({ musicId: 1, grade: 3, isNew: false, rating: 280 });
            const chartNew = makeStubChart({
                musicId: 10002,
                grade: 3,
                isNew: true,
                rating: 290,
            });

            const map = createMusicChartMap([chartOld, chartNew]);
            const b50OnlyUser: User["data"] = {
                updateTime: 0,
                name: "B50User",
                rating: 15000,
                b50: {
                    sd: [makeStubDFRecord(chartOld)],
                    dx: [makeStubDFRecord(chartNew)],
                },
            };

            // Default mode uses B50 lists
            const defaultResult = selectB50Charts(b50OnlyUser, map, {
                fitDiff: false,
                nb50: false,
                comboFilter: null,
                pc50: false,
            });
            expect(defaultResult.old).toHaveLength(1);
            expect(defaultResult.old[0]?.music.id).toBe(1);
            expect(defaultResult.newer).toHaveLength(1);
            expect(defaultResult.newer[0]?.music.id).toBe(10002);

            // Detailed-requiring modes return empty lists
            const detailedModes: B50QueryOptions[] = [
                { fitDiff: true, nb50: false, comboFilter: null, pc50: false },
                { fitDiff: false, nb50: true, comboFilter: null, pc50: false },
                { fitDiff: false, nb50: false, comboFilter: "ap", pc50: false },
                { fitDiff: false, nb50: false, comboFilter: "fc", pc50: false },
                { fitDiff: false, nb50: false, comboFilter: null, pc50: true },
            ];

            for (const options of detailedModes) {
                const res = selectB50Charts(b50OnlyUser, map, options);
                expect(res.old).toEqual([]);
                expect(res.newer).toEqual([]);
            }
        });
    });

    describe("recordsHaveLastChangedAt", () => {
        it("looks only at detailed records when they exist, at B50 lists otherwise, and ignores 0", () => {
            // Detailed has valid lastChangedAt > 0
            expect(
                recordsHaveLastChangedAt({
                    updateTime: 0,
                    name: "",
                    rating: 0,
                    detailed: {
                        "1-3": { lastChangedAt: 1_700_000_000_000 } as DivingFishFullRecord,
                    },
                })
            ).toBe(true);

            // Detailed has 0 or undefined -> false
            expect(
                recordsHaveLastChangedAt({
                    updateTime: 0,
                    name: "",
                    rating: 0,
                    detailed: { "1-3": { lastChangedAt: 0 } as DivingFishFullRecord },
                })
            ).toBe(false);
            expect(
                recordsHaveLastChangedAt({
                    updateTime: 0,
                    name: "",
                    rating: 0,
                    detailed: { "1-3": {} as DivingFishFullRecord },
                })
            ).toBe(false);

            // Detailed exists (even if empty or has 0), so B50 is ignored
            expect(
                recordsHaveLastChangedAt({
                    updateTime: 0,
                    name: "",
                    rating: 0,
                    detailed: { "1-3": { lastChangedAt: 0 } as DivingFishFullRecord },
                    b50: {
                        sd: [{ lastChangedAt: 1_700_000_000_000 } as DivingFishFullRecord],
                        dx: [],
                    },
                })
            ).toBe(false);

            expect(
                recordsHaveLastChangedAt({
                    updateTime: 0,
                    name: "",
                    rating: 0,
                    detailed: {},
                    b50: {
                        sd: [{ lastChangedAt: 1_700_000_000_000 } as DivingFishFullRecord],
                        dx: [],
                    },
                })
            ).toBe(false);

            // Detailed is undefined -> falls back to B50
            expect(
                recordsHaveLastChangedAt({
                    updateTime: 0,
                    name: "",
                    rating: 0,
                    b50: {
                        sd: [{ lastChangedAt: 1_700_000_000_000 } as DivingFishFullRecord],
                        dx: [],
                    },
                })
            ).toBe(true);
            expect(
                recordsHaveLastChangedAt({
                    updateTime: 0,
                    name: "",
                    rating: 0,
                    b50: {
                        sd: [{ lastChangedAt: 0 } as DivingFishFullRecord],
                        dx: [{ lastChangedAt: undefined } as DivingFishFullRecord],
                    },
                })
            ).toBe(false);

            // No data
            expect(recordsHaveLastChangedAt(undefined)).toBe(false);
        });
    });

    describe("immutability of input data", () => {
        it("does not mutate the user data or chart map passed in", () => {
            const chart = makeStubChart({ musicId: 1, grade: 3, isNew: false, constant: 13.5 });
            const map = createMusicChartMap([chart]);
            const record = makeStubDFRecord(chart, { achievements: 100.5, play_count: 10 });
            const user: User["data"] = {
                updateTime: 1_700_000_000_000,
                name: "ImmTest",
                rating: 15000,
                detailed: { "1-3": record },
                b50: { sd: [record], dx: [] },
            };

            const userJsonBefore = JSON.stringify(user);
            const chartJsonBefore = JSON.stringify(chart);
            const mapSizeBefore = map.size;

            const allModes: PageMode[] = ["default", "fit", "nb", "ap", "fc", "pc"];
            for (const mode of allModes) {
                const options = buildOptionsForMode(mode, user);
                const res = selectB50Charts(user, map, options);
                sumChartRatings(res.old);
                sumChartRatings(res.newer);
            }
            recordsHaveLastChangedAt(user);
            getSourceRecords(user, true);
            getSourceRecords(user, false);

            expect(JSON.stringify(user)).toBe(userJsonBefore);
            expect(JSON.stringify(chart)).toBe(chartJsonBefore);
            expect(map.size).toBe(mapSizeBefore);
        });
    });
});
