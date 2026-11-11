import type { CollectionRequired, Title } from "@core/collection/type";
import type { Course } from "@core/course";
import type { KaleidxscopeGate } from "@core/kaleidxscope";
import type { CollectionEntry } from "../../src/refs/collection";
import { mapLXNSCollections } from "@core/collection/map";
import { CollectionKind, TitleColor } from "@core/collection/type";
import { courses } from "@core/course";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { kaleidxscopeGates } from "@core/kaleidxscope";
import { ComboStatus, RankRate, SyncStatus } from "@core/mai/types";
import { describe, expect, it } from "vitest";
import { allChartEntries } from "../../src/catalog/chartQuery";
import { courseCharts, gateCharts } from "../../src/catalog/chartSets";
import { collectionChartEntries } from "../../src/catalog/collectionView";
import { relatedTo } from "../../src/catalog/relatedView";
import { chartKeyOf, songCharts } from "../../src/catalog/songs";
import { collectionRef, listCollections } from "../../src/refs/collection";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { entryOf } from "../madeChart";

const BMEM = ["BASIC", "ADVANCED", "EXPERT", "MASTER"] as const;

const PLATE_6101_ROW = {
    ref: "plate:6101",
    kind: "plate" as const,
    id: 6101,
    name: "真極",
    genre: "実績",
    color: null,
    description: "maimai PLUSまでの全曲/BASIC～MASTER/FULL COMBO",
    songCount: 5,
    owned: null,
    progress: null,
};

const PLATE_6102_ROW = {
    ref: "plate:6102",
    kind: "plate" as const,
    id: 6102,
    name: "真神",
    genre: "実績",
    color: null,
    description: "maimai PLUSまでの全曲/BASIC～MASTER/ALL PERFECT",
    songCount: 5,
    owned: null,
    progress: null,
};

const PLATE_6103_ROW = {
    ref: "plate:6103",
    kind: "plate" as const,
    id: 6103,
    name: "真舞舞",
    genre: "実績",
    color: null,
    description: "maimai PLUSまでの全曲/BASIC～MASTER/FULL SYNC DX",
    songCount: 5,
    owned: null,
    progress: null,
};

const PLATE_6104_ROW = {
    ref: "plate:6104",
    kind: "plate" as const,
    id: 6104,
    name: "超極",
    genre: "実績",
    color: null,
    description: "maimai GreeN 全曲/BASIC～MASTER/FULL COMBO",
    songCount: 4,
    owned: null,
    progress: null,
};

const PLATE_6105_ROW = {
    ref: "plate:6105",
    kind: "plate" as const,
    id: 6105,
    name: "超将",
    genre: "実績",
    color: null,
    description: "maimai GreeN 全曲/BASIC～MASTER/RANK SSS",
    songCount: 4,
    owned: null,
    progress: null,
};

const PLATE_6106_ROW = {
    ref: "plate:6106",
    kind: "plate" as const,
    id: 6106,
    name: "超神",
    genre: "実績",
    color: null,
    description: "maimai GreeN 全曲/BASIC～MASTER/ALL PERFECT",
    songCount: 4,
    owned: null,
    progress: null,
};

const PLATE_6107_ROW = {
    ref: "plate:6107",
    kind: "plate" as const,
    id: 6107,
    name: "超舞舞",
    genre: "実績",
    color: null,
    description: "maimai GreeN 全曲/BASIC～MASTER/FULL SYNC DX",
    songCount: 4,
    owned: null,
    progress: null,
};

const PLATE_6148_ROW = {
    ref: "plate:6148",
    kind: "plate" as const,
    id: 6148,
    name: "覇者",
    genre: "実績",
    color: null,
    description: "全曲/BASIC～Re:MASTER/CLEAR",
    songCount: 7,
    owned: null,
    progress: null,
};

const TITLE_5102_ROW = {
    ref: "title:5102",
    kind: "title" as const,
    id: 5102,
    name: "39",
    genre: "niconicoボーカロイド",
    color: "Gold",
    description: "39[でらっくす]/全難易度/ALL PERFECT",
    songCount: 1,
    owned: null,
    progress: null,
};

const FRAME_109101_ROW = {
    ref: "frame:109101",
    kind: "frame" as const,
    id: 109101,
    name: "PERFECT Jewel [Diamond]",
    genre: "実績",
    color: null,
    description: "舞萌DX 全曲/BASIC～MASTER/ALL PERFECT",
    songCount: 2,
    owned: null,
    progress: null,
};

const COURSE_551001_INFO = {
    id: 551001,
    name: "初段",
    mode: "段位认定",
    locked: false,
    unlockCourse: null,
    trackCount: 4,
    life: {
        initial: 350,
        recovery: 20,
        damage: { perfect: 0, great: 0, good: 2, miss: 5 },
    },
};

const COURSE_551102_INFO = {
    id: 551102,
    name: "真二段",
    mode: "真段位认定",
    locked: true,
    unlockCourse: { id: 551010, name: "十段" },
    trackCount: 4,
    life: {
        initial: 50,
        recovery: 10,
        damage: { perfect: 0, great: 2, good: 3, miss: 5 },
    },
};

describe("relatedView", () => {
    describe("fixture part", () => {
        const entries = listCollections(mapLXNSCollections(getFixtureLXNSCollections()));
        const catalog = fixtureSongCatalog();
        const sources = { collections: entries };

        const chartsOfSong = (id: number) => songCharts(catalog.songOfMusic.get(id)!);
        const chartOf = (key: string) => catalog.chartByKey.get(key)!.chart;
        const S = (id: number) => relatedTo(chartsOfSong(id), sources);

        it("matches full literal for S(146) and checks key orders", () => {
            const res = S(146);
            const expected = {
                collections: [
                    {
                        ...TITLE_5102_ROW,
                        requirements: [
                            {
                                difficulties: BMEM,
                                rank: null,
                                combo: "AP",
                                sync: null,
                                songCount: 1,
                                charts: ["10146-0", "10146-1", "10146-2", "10146-3"],
                            },
                        ],
                    },
                ],
                courses: [],
                gates: [],
            };
            expect(res).toEqual(expected);

            expect(Object.keys(res)).toEqual(["collections", "courses", "gates"]);
            expect(Object.keys(res.collections[0])).toEqual([
                "ref",
                "kind",
                "id",
                "name",
                "genre",
                "color",
                "description",
                "songCount",
                "owned",
                "progress",
                "requirements",
            ]);
            expect(Object.keys(res.collections[0].requirements[0])).toEqual([
                "difficulties",
                "rank",
                "combo",
                "sync",
                "songCount",
                "charts",
            ]);

            const s256 = S(256);
            expect(Object.keys(s256.courses[0])).toEqual([
                "id",
                "name",
                "mode",
                "locked",
                "unlockCourse",
                "trackCount",
                "life",
                "tracks",
            ]);
            expect(Object.keys(s256.courses[0].tracks[0])).toEqual([
                "track",
                "chartKey",
                "difficulty",
            ]);
        });

        it("matches refs, requirements, and courses for all fixture songs in the table", () => {
            const expectedPlateRows = [
                PLATE_6101_ROW,
                PLATE_6102_ROW,
                PLATE_6103_ROW,
                PLATE_6104_ROW,
                PLATE_6105_ROW,
                PLATE_6106_ROW,
                PLATE_6107_ROW,
                PLATE_6148_ROW,
            ];
            for (const expectedRow of expectedPlateRows) {
                const { requirements: _req, ...actualRow } = S(
                    expectedRow.id === 6148 ? 70 : expectedRow.id >= 6104 ? 115 : 8
                ).collections.find(c => c.ref === expectedRow.ref)!;
                expect(actualRow).toEqual(expectedRow);
            }

            // 8, 9
            for (const id of [8, 9]) {
                const res = S(id);
                expect(res.collections.map(c => c.ref)).toEqual([
                    "plate:6101",
                    "plate:6102",
                    "plate:6103",
                    "plate:6148",
                ]);
                const baseKeys = [`${id}-0`, `${id}-1`, `${id}-2`, `${id}-3`];
                expect(res.collections[0].requirements).toEqual([
                    {
                        difficulties: BMEM,
                        rank: null,
                        combo: "FC",
                        sync: null,
                        songCount: 5,
                        charts: baseKeys,
                    },
                ]);
                expect(res.collections[1].requirements).toEqual([
                    {
                        difficulties: BMEM,
                        rank: null,
                        combo: "AP",
                        sync: null,
                        songCount: 5,
                        charts: baseKeys,
                    },
                ]);
                expect(res.collections[2].requirements).toEqual([
                    {
                        difficulties: BMEM,
                        rank: null,
                        combo: null,
                        sync: "FDX",
                        songCount: 5,
                        charts: baseKeys,
                    },
                ]);
                expect(res.collections[3].requirements).toEqual([
                    {
                        difficulties: BMEM,
                        rank: "A",
                        combo: null,
                        sync: null,
                        songCount: 5,
                        charts: baseKeys,
                    },
                ]);
                expect(res.courses).toEqual([]);
                expect(res.gates).toEqual([]);
            }

            // 17, 58
            for (const id of [17, 58]) {
                const res = S(id);
                expect(res.collections.map(c => c.ref)).toEqual([
                    "plate:6101",
                    "plate:6102",
                    "plate:6103",
                    "plate:6148",
                ]);
                const bmemKeys = [`${id}-0`, `${id}-1`, `${id}-2`, `${id}-3`];
                expect(res.collections[0].requirements).toEqual([
                    {
                        difficulties: BMEM,
                        rank: null,
                        combo: "FC",
                        sync: null,
                        songCount: 5,
                        charts: bmemKeys,
                    },
                ]);
                expect(res.collections[1].requirements).toEqual([
                    {
                        difficulties: BMEM,
                        rank: null,
                        combo: "AP",
                        sync: null,
                        songCount: 5,
                        charts: bmemKeys,
                    },
                ]);
                expect(res.collections[2].requirements).toEqual([
                    {
                        difficulties: BMEM,
                        rank: null,
                        combo: null,
                        sync: "FDX",
                        songCount: 5,
                        charts: bmemKeys,
                    },
                ]);
                expect(res.collections[3].requirements).toEqual([
                    {
                        difficulties: BMEM,
                        rank: "A",
                        combo: null,
                        sync: null,
                        songCount: 5,
                        charts: bmemKeys,
                    },
                    {
                        difficulties: ["Re:MASTER"],
                        rank: "A",
                        combo: null,
                        sync: null,
                        songCount: 4,
                        charts: [`${id}-4`],
                    },
                ]);
                expect(res.courses).toEqual([]);
                expect(res.gates).toEqual([]);
            }

            // 30
            const res30 = S(30);
            expect(res30.collections.map(c => c.ref)).toEqual([
                "plate:6101",
                "plate:6102",
                "plate:6103",
                "plate:6148",
            ]);
            expect(res30.collections[0].requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: "FC",
                    sync: null,
                    songCount: 5,
                    charts: ["30-0", "30-1", "30-2", "30-3"],
                },
            ]);
            expect(res30.courses).toEqual([]);
            expect(res30.gates).toEqual([]);

            // 70
            const res70 = S(70);
            expect(res70.collections.map(c => c.ref)).toEqual(["plate:6148"]);
            expect(res70.collections[0].requirements).toEqual([
                {
                    difficulties: ["Re:MASTER"],
                    rank: "A",
                    combo: null,
                    sync: null,
                    songCount: 4,
                    charts: ["70-4"],
                },
            ]);
            expect(res70.courses).toEqual([]);
            expect(res70.gates).toEqual([]);

            // 115, 188
            for (const id of [115, 188]) {
                const res = S(id);
                expect(res.collections.map(c => c.ref)).toEqual([
                    "plate:6104",
                    "plate:6105",
                    "plate:6106",
                    "plate:6107",
                ]);
                const baseKeys = [`${id}-0`, `${id}-1`, `${id}-2`, `${id}-3`];
                expect(res.collections[0].requirements).toEqual([
                    {
                        difficulties: BMEM,
                        rank: null,
                        combo: "FC",
                        sync: null,
                        songCount: 4,
                        charts: baseKeys,
                    },
                ]);
                expect(res.collections[1].requirements).toEqual([
                    {
                        difficulties: BMEM,
                        rank: "SSS",
                        combo: null,
                        sync: null,
                        songCount: 4,
                        charts: baseKeys,
                    },
                ]);
                expect(res.collections[2].requirements).toEqual([
                    {
                        difficulties: BMEM,
                        rank: null,
                        combo: "AP",
                        sync: null,
                        songCount: 4,
                        charts: baseKeys,
                    },
                ]);
                expect(res.collections[3].requirements).toEqual([
                    {
                        difficulties: BMEM,
                        rank: null,
                        combo: null,
                        sync: "FDX",
                        songCount: 4,
                        charts: baseKeys,
                    },
                ]);
                expect(res.courses).toEqual([]);
                expect(res.gates).toEqual([]);
            }

            // S(191) full literal
            expect(S(191)).toEqual({
                collections: [
                    {
                        ...PLATE_6104_ROW,
                        requirements: [
                            {
                                difficulties: BMEM,
                                rank: null,
                                combo: "FC",
                                sync: null,
                                songCount: 4,
                                charts: ["191-0", "191-1", "191-2", "191-3"],
                            },
                        ],
                    },
                    {
                        ...PLATE_6105_ROW,
                        requirements: [
                            {
                                difficulties: BMEM,
                                rank: "SSS",
                                combo: null,
                                sync: null,
                                songCount: 4,
                                charts: ["191-0", "191-1", "191-2", "191-3"],
                            },
                        ],
                    },
                    {
                        ...PLATE_6106_ROW,
                        requirements: [
                            {
                                difficulties: BMEM,
                                rank: null,
                                combo: "AP",
                                sync: null,
                                songCount: 4,
                                charts: ["191-0", "191-1", "191-2", "191-3"],
                            },
                        ],
                    },
                    {
                        ...PLATE_6107_ROW,
                        requirements: [
                            {
                                difficulties: BMEM,
                                rank: null,
                                combo: null,
                                sync: "FDX",
                                songCount: 4,
                                charts: ["191-0", "191-1", "191-2", "191-3"],
                            },
                        ],
                    },
                    {
                        ...FRAME_109101_ROW,
                        requirements: [
                            {
                                difficulties: BMEM,
                                rank: null,
                                combo: "AP",
                                sync: null,
                                songCount: 2,
                                charts: ["10191-0", "10191-1", "10191-2", "10191-3"],
                            },
                        ],
                    },
                ],
                courses: [
                    {
                        ...COURSE_551102_INFO,
                        tracks: [{ track: 3, chartKey: "191-2", difficulty: "EXPERT" }],
                    },
                ],
                gates: [],
            });

            // S(256) full literal
            expect(S(256)).toEqual({
                collections: [
                    {
                        ...PLATE_6104_ROW,
                        requirements: [
                            {
                                difficulties: BMEM,
                                rank: null,
                                combo: "FC",
                                sync: null,
                                songCount: 4,
                                charts: ["256-0", "256-1", "256-2", "256-3"],
                            },
                        ],
                    },
                    {
                        ...PLATE_6105_ROW,
                        requirements: [
                            {
                                difficulties: BMEM,
                                rank: "SSS",
                                combo: null,
                                sync: null,
                                songCount: 4,
                                charts: ["256-0", "256-1", "256-2", "256-3"],
                            },
                        ],
                    },
                    {
                        ...PLATE_6106_ROW,
                        requirements: [
                            {
                                difficulties: BMEM,
                                rank: null,
                                combo: "AP",
                                sync: null,
                                songCount: 4,
                                charts: ["256-0", "256-1", "256-2", "256-3"],
                            },
                        ],
                    },
                    {
                        ...PLATE_6107_ROW,
                        requirements: [
                            {
                                difficulties: BMEM,
                                rank: null,
                                combo: null,
                                sync: "FDX",
                                songCount: 4,
                                charts: ["256-0", "256-1", "256-2", "256-3"],
                            },
                        ],
                    },
                    {
                        ...PLATE_6148_ROW,
                        requirements: [
                            {
                                difficulties: ["Re:MASTER"],
                                rank: "A",
                                combo: null,
                                sync: null,
                                songCount: 4,
                                charts: ["256-4"],
                            },
                        ],
                    },
                    {
                        ...FRAME_109101_ROW,
                        requirements: [
                            {
                                difficulties: BMEM,
                                rank: null,
                                combo: "AP",
                                sync: null,
                                songCount: 2,
                                charts: ["10256-0", "10256-1", "10256-2", "10256-3"],
                            },
                        ],
                    },
                ],
                courses: [
                    {
                        ...COURSE_551001_INFO,
                        tracks: [{ track: 1, chartKey: "10256-0", difficulty: "BASIC" }],
                    },
                ],
                gates: [],
            });
        });

        it("returns empty related for every other song in catalog", () => {
            const tableSongIds = new Set([8, 9, 17, 30, 58, 70, 115, 188, 146, 191, 256]);
            for (const song of catalog.songs) {
                const res = S(song.musicId);
                if (tableSongIds.has(song.musicId)) {
                    const hasRelations =
                        res.collections.length > 0 ||
                        res.courses.length > 0 ||
                        res.gates.length > 0;
                    expect(hasRelations).toBe(true);
                } else {
                    expect(res).toEqual({ collections: [], courses: [], gates: [] });
                }
            }
        });

        it("matches chart level table for each chart on its own", () => {
            // 146-3
            expect(relatedTo([chartOf("146-3")], sources)).toEqual({
                collections: [],
                courses: [],
                gates: [],
            });

            // 10146-3
            const r10146_3 = relatedTo([chartOf("10146-3")], sources);
            expect(r10146_3.collections.map(c => c.ref)).toEqual(["title:5102"]);
            expect(r10146_3.collections[0].requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: "AP",
                    sync: null,
                    songCount: 1,
                    charts: ["10146-3"],
                },
            ]);
            expect(r10146_3.courses).toEqual([]);

            // 58-3
            const r58_3 = relatedTo([chartOf("58-3")], sources);
            expect(r58_3.collections.map(c => c.ref)).toEqual([
                "plate:6101",
                "plate:6102",
                "plate:6103",
                "plate:6148",
            ]);
            expect(r58_3.collections[0].requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: "FC",
                    sync: null,
                    songCount: 5,
                    charts: ["58-3"],
                },
            ]);
            expect(r58_3.collections[1].requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: "AP",
                    sync: null,
                    songCount: 5,
                    charts: ["58-3"],
                },
            ]);
            expect(r58_3.collections[2].requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: null,
                    sync: "FDX",
                    songCount: 5,
                    charts: ["58-3"],
                },
            ]);
            expect(r58_3.collections[3].requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: "A",
                    combo: null,
                    sync: null,
                    songCount: 5,
                    charts: ["58-3"],
                },
            ]);
            expect(r58_3.courses).toEqual([]);

            // 58-4
            const r58_4 = relatedTo([chartOf("58-4")], sources);
            expect(r58_4.collections.map(c => c.ref)).toEqual(["plate:6148"]);
            expect(r58_4.collections[0].requirements).toEqual([
                {
                    difficulties: ["Re:MASTER"],
                    rank: "A",
                    combo: null,
                    sync: null,
                    songCount: 4,
                    charts: ["58-4"],
                },
            ]);
            expect(r58_4.courses).toEqual([]);

            // 191-2
            const r191_2 = relatedTo([chartOf("191-2")], sources);
            expect(r191_2.collections.map(c => c.ref)).toEqual([
                "plate:6104",
                "plate:6105",
                "plate:6106",
                "plate:6107",
            ]);
            expect(r191_2.collections[0].requirements[0].charts).toEqual(["191-2"]);
            expect(r191_2.courses).toEqual([
                {
                    ...COURSE_551102_INFO,
                    tracks: [{ track: 3, chartKey: "191-2", difficulty: "EXPERT" }],
                },
            ]);

            // 191-3
            const r191_3 = relatedTo([chartOf("191-3")], sources);
            expect(r191_3.collections.map(c => c.ref)).toEqual([
                "plate:6104",
                "plate:6105",
                "plate:6106",
                "plate:6107",
            ]);
            expect(r191_3.courses).toEqual([]);

            // 10191-2
            const r10191_2 = relatedTo([chartOf("10191-2")], sources);
            expect(r10191_2.collections.map(c => c.ref)).toEqual(["frame:109101"]);
            expect(r10191_2.collections[0].requirements[0].charts).toEqual(["10191-2"]);
            expect(r10191_2.courses).toEqual([]);

            // 10256-0
            const r10256_0 = relatedTo([chartOf("10256-0")], sources);
            expect(r10256_0.collections.map(c => c.ref)).toEqual(["frame:109101"]);
            expect(r10256_0.collections[0].requirements[0].charts).toEqual(["10256-0"]);
            expect(r10256_0.courses).toEqual([
                {
                    ...COURSE_551001_INFO,
                    tracks: [{ track: 1, chartKey: "10256-0", difficulty: "BASIC" }],
                },
            ]);

            // 256-0
            const r256_0 = relatedTo([chartOf("256-0")], sources);
            expect(r256_0.collections.map(c => c.ref)).toEqual([
                "plate:6104",
                "plate:6105",
                "plate:6106",
                "plate:6107",
            ]);
            expect(r256_0.collections[0].requirements[0].charts).toEqual(["256-0"]);
            expect(r256_0.courses).toEqual([]);
        });

        it("preserves collection order and given chart order", () => {
            const reversedEntries = [...entries].reverse();
            const resReversed = relatedTo(chartsOfSong(256), { collections: reversedEntries });
            expect(resReversed.collections.map(c => c.ref)).toEqual([
                "frame:109101",
                "plate:6148",
                "plate:6107",
                "plate:6106",
                "plate:6105",
                "plate:6104",
            ]);

            const reversed58Charts = [
                chartOf("58-4"),
                chartOf("58-3"),
                chartOf("58-2"),
                chartOf("58-1"),
                chartOf("58-0"),
            ];
            const res58 = relatedTo(reversed58Charts, sources);
            const plate6148 = res58.collections.find(c => c.ref === "plate:6148")!;
            expect(plate6148.requirements).toHaveLength(2);
            expect(plate6148.requirements[0].difficulties).toEqual(BMEM);
            expect(plate6148.requirements[0].charts).toEqual(["58-3", "58-2", "58-1", "58-0"]);
            expect(plate6148.requirements[1].difficulties).toEqual(["Re:MASTER"]);
            expect(plate6148.requirements[1].charts).toEqual(["58-4"]);
        });

        it("handles empty source overrides and frozen inputs", () => {
            const resNoCourses = relatedTo([chartOf("191-2")], {
                collections: entries,
                courses: [],
            });
            expect(resNoCourses.courses).toEqual([]);
            expect(resNoCourses.collections.length).toBeGreaterThan(0);

            const resNoCols = relatedTo(chartsOfSong(191), { collections: [] });
            expect(resNoCols.collections).toEqual([]);
            expect(resNoCols.courses.map(c => c.id)).toEqual([551102]);

            const resNoGates = relatedTo([entryOf({ id: 11739, grade: 3 }).chart], {
                collections: [],
                gates: [],
            });
            expect(resNoGates.gates).toEqual([]);

            const emptyChartsRes = relatedTo([], sources);
            expect(emptyChartsRes).toEqual({ collections: [], courses: [], gates: [] });

            const frozenCharts = Object.freeze([...chartsOfSong(146)]);
            const frozenEntries = Object.freeze([...entries]);
            const res1 = relatedTo(frozenCharts, { collections: frozenEntries });
            const res2 = relatedTo(frozenCharts, { collections: frozenEntries });
            expect(res1).toEqual(res2);
        });

        it("passes property tests against independently tested functions", () => {
            const all = allChartEntries(catalog);

            // Property 1
            const collectionKeySets = new Map<string, Set<string>>();
            for (const entry of entries) {
                const keys = new Set(
                    collectionChartEntries(entry.collection, all).map(e => chartKeyOf(e.chart))
                );
                collectionKeySets.set(collectionRef(entry), keys);
            }
            for (const entry of all) {
                const key = chartKeyOf(entry.chart);
                const expectedRefs = entries
                    .filter(e => collectionKeySets.get(collectionRef(e))!.has(key))
                    .map(collectionRef);
                const actualRefs = relatedTo([entry.chart], sources).collections.map(c => c.ref);
                expect(actualRefs).toEqual(expectedRefs);
            }

            // Property 2
            const courseKeySets = new Map<number, ReadonlySet<string>>();
            for (const course of courses) {
                courseKeySets.set(course.id, courseCharts(course, all).keys);
            }
            for (const entry of all) {
                const key = chartKeyOf(entry.chart);
                const expectedCourseIds = courses
                    .filter(c => courseKeySets.get(c.id)!.has(key))
                    .map(c => c.id);
                const actualCourseIds = relatedTo([entry.chart], sources).courses.map(c => c.id);
                expect(actualCourseIds).toEqual(expectedCourseIds);
            }

            // Property 3
            const allGateMusicIds = new Set<number>();
            for (const gate of kaleidxscopeGates) {
                for (const song of gate.keyCondition.songs) {
                    allGateMusicIds.add(song.musicId);
                }
                for (const pool of gate.selectionPools) {
                    for (const song of pool.songs) {
                        allGateMusicIds.add(song.musicId);
                    }
                }
            }
            expect(allGateMusicIds.size).toBe(235);
            const gateEntries = [...allGateMusicIds].map(id => entryOf({ id, grade: 3 }));
            for (const entry of gateEntries) {
                const key = chartKeyOf(entry.chart);
                const expectedGateIds = kaleidxscopeGates
                    .filter(gate => gateCharts(gate, gateEntries).keys.has(key))
                    .map(gate => gate.id);
                const actualGateIds = relatedTo([entry.chart], { collections: [] }).gates.map(
                    g => g.id
                );
                expect(actualGateIds).toEqual(expectedGateIds);
            }

            // Property 4
            for (const song of catalog.songs) {
                const charts = songCharts(song);
                const songRelated = relatedTo(charts, sources);
                const singleRelatedList = charts.map(ch => relatedTo([ch], sources));

                const allSingleRefs = new Set(
                    singleRelatedList.flatMap(r => r.collections.map(c => c.ref))
                );
                const expectedRefs = entries
                    .map(collectionRef)
                    .filter(ref => allSingleRefs.has(ref));
                expect(songRelated.collections.map(c => c.ref)).toEqual(expectedRefs);

                const allSingleCourseIds = new Set(
                    singleRelatedList.flatMap(r => r.courses.map(c => c.id))
                );
                const expectedCourseIds = courses
                    .map(c => c.id)
                    .filter(id => allSingleCourseIds.has(id));
                expect(songRelated.courses.map(c => c.id)).toEqual(expectedCourseIds);

                for (const col of songRelated.collections) {
                    const songChartKeys = col.requirements.flatMap(r => r.charts);
                    const singleChartKeys = singleRelatedList.flatMap(r => {
                        const c = r.collections.find(x => x.ref === col.ref);
                        return c ? c.requirements.flatMap(req => req.charts) : [];
                    });
                    expect(songChartKeys).toEqual(singleChartKeys);
                }
            }
        });
    });

    describe("real gates part", () => {
        function expectedGate(
            id: string,
            key: boolean,
            pools: { track: number; label: string | null }[]
        ) {
            const gate = kaleidxscopeGates.find(g => g.id === id)!;
            return {
                id: gate.id,
                name: gate.name,
                shortName: gate.shortName,
                region: gate.region,
                key,
                pools,
            };
        }

        it("matches full literal for real gates in the table", () => {
            const blueRow1 = expectedGate("blue", true, [{ track: 2, label: null }]);
            const noiseRow1 = expectedGate("noise", false, [{ track: 1, label: null }]);
            expect(
                relatedTo([entryOf({ id: 11739, grade: 3 }).chart], { collections: [] }).gates
            ).toEqual([blueRow1, noiseRow1]);

            const blueRow2 = expectedGate("blue", false, [{ track: 3, label: null }]);
            const noiseRow2 = expectedGate("noise", false, [{ track: 2, label: null }]);
            expect(
                relatedTo([entryOf({ id: 11740, grade: 3 }).chart], { collections: [] }).gates
            ).toEqual([blueRow2, noiseRow2]);

            // 11739 and 11740 together
            const blueCombined = expectedGate("blue", true, [
                { track: 2, label: null },
                { track: 3, label: null },
            ]);
            const noiseCombined = expectedGate("noise", false, [
                { track: 1, label: null },
                { track: 2, label: null },
            ]);
            expect(
                relatedTo(
                    [
                        entryOf({ id: 11739, grade: 3 }).chart,
                        entryOf({ id: 11740, grade: 3 }).chart,
                    ],
                    { collections: [] }
                ).gates
            ).toEqual([blueCombined, noiseCombined]);

            // 11821
            expect(
                relatedTo([entryOf({ id: 11821, grade: 3 }).chart], { collections: [] }).gates
            ).toEqual([expectedGate("final", false, [{ track: 2, label: "BONUS TRACK" }])]);

            // 11820
            expect(
                relatedTo([entryOf({ id: 11820, grade: 3 }).chart], { collections: [] }).gates
            ).toEqual([expectedGate("final", false, [{ track: 1, label: null }])]);

            // 11879
            expect(
                relatedTo([entryOf({ id: 11879, grade: 3 }).chart], { collections: [] }).gates
            ).toEqual([]);

            // 11529
            expect(
                relatedTo([entryOf({ id: 11529, grade: 3 }).chart], { collections: [] }).gates
            ).toEqual([
                expectedGate("white", true, []),
                expectedGate("yellow", true, [{ track: 2, label: null }]),
            ]);

            // 11300
            expect(
                relatedTo([entryOf({ id: 11300, grade: 3 }).chart], { collections: [] }).gates
            ).toEqual([expectedGate("white", true, []), expectedGate("black", true, [])]);

            // 11234
            expect(
                relatedTo([entryOf({ id: 11234, grade: 3 }).chart], { collections: [] }).gates
            ).toEqual([
                expectedGate("white", true, []),
                expectedGate("black", false, [{ track: 1, label: null }]),
            ]);

            // 328
            expect(
                relatedTo([entryOf({ id: 328, grade: 3 }).chart], { collections: [] }).gates
            ).toEqual([expectedGate("purple", true, [{ track: 1, label: null }])]);

            // 10328
            expect(
                relatedTo([entryOf({ id: 10328, grade: 3 }).chart], { collections: [] }).gates
            ).toEqual([]);

            // 1736
            expect(
                relatedTo([entryOf({ id: 1736, grade: 3 }).chart], { collections: [] }).gates
            ).toEqual([expectedGate("hope", false, [{ track: 1, label: null }])]);

            // 10835
            expect(
                relatedTo([entryOf({ id: 10835, grade: 3 }).chart], { collections: [] }).gates
            ).toEqual([expectedGate("hope", false, [{ track: 2, label: null }])]);

            // 9
            expect(
                relatedTo([entryOf({ id: 9, grade: 3 }).chart], { collections: [] }).gates
            ).toEqual([]);

            // Grades 0, 3 and 10 of 11739 all give the row of 11739
            for (const grade of [0, 3, 10]) {
                expect(
                    relatedTo([entryOf({ id: 11739, grade }).chart], { collections: [] }).gates
                ).toEqual([blueRow1, noiseRow1]);
            }
        });

        it("checks key orders of gate and pool objects", () => {
            const gates = relatedTo([entryOf({ id: 11739, grade: 3 }).chart], {
                collections: [],
            }).gates;
            expect(Object.keys(gates[0])).toEqual([
                "id",
                "name",
                "shortName",
                "region",
                "key",
                "pools",
            ]);
            expect(Object.keys(gates[0].pools[0])).toEqual(["track", "label"]);
        });
    });

    describe("made-up part", () => {
        it("handles standard, dx, and utage song types", () => {
            const dxEntry: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 1,
                    name: "DX",
                    description: "d",
                    required: [{ songs: [{ id: 8, title: "A", type: "dx" }] }],
                },
            };
            expect(
                relatedTo([entryOf({ id: 8, grade: 3 }).chart], { collections: [dxEntry] })
                    .collections
            ).toEqual([]);
            const dxRes = relatedTo([entryOf({ id: 10008, grade: 3 }).chart], {
                collections: [dxEntry],
            });
            expect(dxRes.collections).toHaveLength(1);
            expect(dxRes.collections[0].requirements[0].charts).toEqual(["10008-3"]);

            const stdEntry: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 2,
                    name: "STD",
                    description: "d",
                    required: [{ songs: [{ id: 8, title: "A", type: "standard" }] }],
                },
            };
            expect(
                relatedTo([entryOf({ id: 8, grade: 3 }).chart], { collections: [stdEntry] })
                    .collections[0].requirements[0].charts
            ).toEqual(["8-3"]);
            expect(
                relatedTo([entryOf({ id: 10008, grade: 3 }).chart], { collections: [stdEntry] })
                    .collections
            ).toEqual([]);

            const largeDxEntry: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 3,
                    name: "LargeDX",
                    description: "d",
                    required: [{ songs: [{ id: 10008, title: "A", type: "dx" }] }],
                },
            };
            expect(
                relatedTo([entryOf({ id: 10008, grade: 3 }).chart], {
                    collections: [largeDxEntry],
                }).collections[0].requirements[0].charts
            ).toEqual(["10008-3"]);

            const utageEntry: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 4,
                    name: "Utage",
                    description: "d",
                    required: [{ songs: [{ id: 110018, title: "A", type: "utage" }] }],
                },
            };
            expect(
                relatedTo([entryOf({ id: 110018, grade: 10 }).chart], {
                    collections: [utageEntry],
                }).collections[0].requirements[0].charts
            ).toEqual(["110018-10"]);
        });

        it("matches difficulties accurately", () => {
            const charts0to4 = [0, 1, 2, 3, 4].map(grade => entryOf({ id: 8, grade }).chart);

            const reqDiff3: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 10,
                    name: "Diff3",
                    description: "d",
                    required: [
                        { difficulties: [3], songs: [{ id: 8, title: "A", type: "standard" }] },
                    ],
                },
            };
            expect(
                relatedTo(charts0to4, { collections: [reqDiff3] }).collections[0].requirements[0]
                    .charts
            ).toEqual(["8-3"]);

            const reqDiff04: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 11,
                    name: "Diff04",
                    description: "d",
                    required: [
                        {
                            difficulties: [0, 4],
                            songs: [{ id: 8, title: "A", type: "standard" }],
                        },
                    ],
                },
            };
            expect(
                relatedTo(charts0to4, { collections: [reqDiff04] }).collections[0].requirements[0]
                    .charts
            ).toEqual(["8-0", "8-4"]);

            const reqDiffEmpty: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 12,
                    name: "DiffEmpty",
                    description: "d",
                    required: [
                        { difficulties: [], songs: [{ id: 8, title: "A", type: "standard" }] },
                    ],
                },
            };
            expect(
                relatedTo(charts0to4, { collections: [reqDiffEmpty] }).collections[0]
                    .requirements[0].charts
            ).toEqual(["8-0", "8-1", "8-2", "8-3", "8-4"]);

            const reqDiffAbsent: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 13,
                    name: "DiffAbsent",
                    description: "d",
                    required: [{ songs: [{ id: 8, title: "A", type: "standard" }] }],
                },
            };
            expect(
                relatedTo(charts0to4, { collections: [reqDiffAbsent] }).collections[0]
                    .requirements[0].charts
            ).toEqual(["8-0", "8-1", "8-2", "8-3", "8-4"]);
        });

        it("handles multiple conditions properly", () => {
            const r0: CollectionRequired = {
                difficulties: [3],
                rate: RankRate.sss,
                fc: ComboStatus.AllPerfect,
                fs: SyncStatus.FullSyncDX,
                songs: [{ id: 8, title: "A", type: "standard" }],
            };
            const r1: CollectionRequired = {
                rate: RankRate.s,
                songs: [{ id: 9, title: "B", type: "standard" }],
            };
            const r2: CollectionRequired = {
                difficulties: [4],
                rate: RankRate.ss,
                songs: [{ id: 8, title: "A", type: "standard" }],
            };

            const multiEntry: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 20,
                    name: "Multi",
                    description: "d",
                    required: [r0, r1, r2],
                },
            };

            const charts8 = [0, 1, 2, 3, 4].map(grade => entryOf({ id: 8, grade }).chart);
            const res8 = relatedTo(charts8, { collections: [multiEntry] });
            expect(res8.collections).toHaveLength(1);
            expect(res8.collections[0].requirements).toEqual([
                {
                    difficulties: ["MASTER"],
                    rank: "SSS",
                    combo: "AP",
                    sync: "FDX",
                    songCount: 1,
                    charts: ["8-3"],
                },
                {
                    difficulties: ["Re:MASTER"],
                    rank: "SS",
                    combo: null,
                    sync: null,
                    songCount: 1,
                    charts: ["8-4"],
                },
            ]);

            const res9 = relatedTo([entryOf({ id: 9, grade: 2 }).chart], {
                collections: [multiEntry],
            });
            expect(res9.collections[0].requirements).toEqual([
                {
                    difficulties: null,
                    rank: "S",
                    combo: null,
                    sync: null,
                    songCount: 1,
                    charts: ["9-2"],
                },
            ]);

            const res8_1 = relatedTo([entryOf({ id: 8, grade: 1 }).chart], {
                collections: [multiEntry],
            });
            expect(res8_1.collections).toEqual([]);

            const twoMatchingReqs: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 21,
                    name: "Overlap",
                    description: "d",
                    required: [
                        { difficulties: [3], songs: [{ id: 8, title: "A", type: "standard" }] },
                        { songs: [{ id: 8, title: "A", type: "standard" }] },
                    ],
                },
            };
            const resOverlap = relatedTo([entryOf({ id: 8, grade: 3 }).chart], {
                collections: [twoMatchingReqs],
            });
            expect(resOverlap.collections[0].requirements).toEqual([
                {
                    difficulties: ["MASTER"],
                    rank: null,
                    combo: null,
                    sync: null,
                    songCount: 1,
                    charts: ["8-3"],
                },
                {
                    difficulties: null,
                    rank: null,
                    combo: null,
                    sync: null,
                    songCount: 1,
                    charts: ["8-3"],
                },
            ]);
        });

        it("counts songs across requirements correctly", () => {
            const twoSongsEntry: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 30,
                    name: "TwoSongs",
                    description: "d",
                    required: [
                        {
                            songs: [
                                { id: 8, title: "A", type: "standard" },
                                { id: 9, title: "B", type: "standard" },
                            ],
                        },
                    ],
                },
            };
            const res = relatedTo([entryOf({ id: 8, grade: 2 }).chart], {
                collections: [twoSongsEntry],
            });
            expect(res.collections[0].songCount).toBe(2);
            expect(res.collections[0].requirements[0].songCount).toBe(2);
        });

        it("ignores collections with empty or invalid requirements", () => {
            const noReq: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 40,
                    name: "NoReq",
                    description: "d",
                },
            };
            const emptyReq: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 41,
                    name: "EmptyReq",
                    description: "d",
                    required: [],
                },
            };
            const noSongsInReq: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 42,
                    name: "NoSongs",
                    description: "d",
                    required: [{ rank: "SSS" } as never],
                },
            };
            const emptySongsInReq: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 43,
                    name: "EmptySongs",
                    description: "d",
                    required: [{ songs: [] }],
                },
            };
            expect(
                relatedTo([entryOf({ id: 8, grade: 3 }).chart], {
                    collections: [noReq, emptyReq, noSongsInReq, emptySongsInReq],
                }).collections
            ).toEqual([]);
        });

        it("preserves entry order without sorting by kind, id, or ref", () => {
            const c: CollectionEntry = {
                kind: "title",
                collection: {
                    type: CollectionKind.Title,
                    id: 10,
                    name: "C",
                    description: "d",
                    required: [{ songs: [{ id: 8, title: "A", type: "standard" }] }],
                },
            };
            const a: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 5,
                    name: "A",
                    description: "d",
                    required: [{ songs: [{ id: 8, title: "A", type: "standard" }] }],
                },
            };
            const b: CollectionEntry = {
                kind: "frame",
                collection: {
                    type: CollectionKind.Frame,
                    id: 1,
                    name: "B",
                    description: "d",
                    required: [{ songs: [{ id: 8, title: "A", type: "standard" }] }],
                },
            };
            const res = relatedTo([entryOf({ id: 8, grade: 3 }).chart], { collections: [c, a, b] });
            expect(res.collections.map(col => col.ref)).toEqual(["title:10", "plate:5", "frame:1"]);
        });

        it("populates kind, genre, and color in collection row", () => {
            const titleWithColor: CollectionEntry = {
                kind: "title",
                collection: {
                    type: CollectionKind.Title,
                    id: 50,
                    name: "GoldTitle",
                    genre: "niconico",
                    color: TitleColor.Gold,
                    description: "d",
                    required: [{ songs: [{ id: 8, title: "A", type: "standard" }] }],
                } as Title,
            };
            const plateNoGenre: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 51,
                    name: "NoGenre",
                    description: "d",
                    required: [{ songs: [{ id: 8, title: "A", type: "standard" }] }],
                },
            };
            const res = relatedTo([entryOf({ id: 8, grade: 3 }).chart], {
                collections: [titleWithColor, plateNoGenre],
            });
            expect(res.collections[0].color).toBe("Gold");
            expect(res.collections[0].genre).toBe("niconico");
            expect(res.collections[1].genre).toBeNull();
            expect(res.collections[1].color).toBeNull();
        });

        it("handles made-up courses accurately", () => {
            const courseA = {
                ...courses[0],
                id: 900001,
                name: "甲",
                isLocked: false,
                tracks: [
                    { musicId: 1, difficulty: 3, title: "t1" },
                    { musicId: 2, difficulty: 3, title: "t2" },
                    { musicId: 1, difficulty: 3, title: "t3" },
                ],
            } as unknown as Course;

            const resA = relatedTo([entryOf({ id: 1, grade: 3 }).chart], {
                collections: [],
                courses: [courseA],
            });
            expect(resA.courses).toHaveLength(1);
            expect(resA.courses[0].trackCount).toBe(3);
            expect(resA.courses[0].tracks).toEqual([
                { track: 1, chartKey: "1-3", difficulty: "MASTER" },
                { track: 3, chartKey: "1-3", difficulty: "MASTER" },
            ]);

            // Charts in reverse order [2-3, 1-3] gives tracks in course order 1, 2, 3
            const resA_order = relatedTo(
                [entryOf({ id: 2, grade: 3 }).chart, entryOf({ id: 1, grade: 3 }).chart],
                { collections: [], courses: [courseA] }
            );
            expect(resA_order.courses[0].tracks.map(t => t.track)).toEqual([1, 2, 3]);

            // Another difficulty is not related
            expect(
                relatedTo([entryOf({ id: 1, grade: 2 }).chart], {
                    collections: [],
                    courses: [courseA],
                }).courses
            ).toEqual([]);

            // List order preserved with [b, a]
            const courseB = {
                ...courses[0],
                id: 900002,
                name: "乙",
                isLocked: true,
                unlockCourseId: 900001,
                tracks: [
                    { musicId: 1, difficulty: 0, title: "t0" },
                    { musicId: 1, difficulty: 1, title: "t1" },
                    { musicId: 1, difficulty: 2, title: "t2" },
                    { musicId: 1, difficulty: 4, title: "t4" },
                    { musicId: 1, difficulty: 10, title: "t10" },
                ],
            } as unknown as Course;

            const resBA = relatedTo([entryOf({ id: 1, grade: 0 }).chart], {
                collections: [],
                courses: [courseB, courseA],
            });
            expect(resBA.courses.map(c => c.id)).toEqual([900002]);

            // Check difficulty labels: 0, 1, 2, 3, 4, 10
            const diffCharts = [0, 1, 2, 4, 10].map(grade => entryOf({ id: 1, grade }).chart);
            const resDiffs = relatedTo(diffCharts, {
                collections: [],
                courses: [courseB, courseA],
            });
            expect(resDiffs.courses[0].tracks.map(t => t.difficulty)).toEqual([
                "BASIC",
                "ADVANCED",
                "EXPERT",
                "Re:MASTER",
                "UTAGE",
            ]);

            // Unlock course resolution
            expect(resDiffs.courses[0].unlockCourse).toEqual({ id: 900001, name: "甲" });

            const resUnlockNotFound = relatedTo(diffCharts, {
                collections: [],
                courses: [courseB],
            });
            expect(resUnlockNotFound.courses[0].unlockCourse).toEqual({ id: 900001, name: null });
            expect(resA.courses[0].unlockCourse).toBeNull();
        });

        it("lists the courses in the order of the list it was given, not by id", () => {
            const course = (id: number, name: string) =>
                ({
                    ...courses[0],
                    id,
                    name,
                    isLocked: false,
                    tracks: [{ musicId: 7, difficulty: 3, title: "t" }],
                }) as unknown as Course;
            const low = course(900001, "甲");
            const high = course(900002, "乙");
            const chart = entryOf({ id: 7, grade: 3 }).chart;

            const highFirst = relatedTo([chart], { collections: [], courses: [high, low] });
            expect(highFirst.courses.map(c => c.id)).toEqual([900002, 900001]);
            const lowFirst = relatedTo([chart], { collections: [], courses: [low, high] });
            expect(lowFirst.courses.map(c => c.id)).toEqual([900001, 900002]);
        });

        it("handles made-up gates accurately", () => {
            const madeUpGate = {
                id: "gate-x",
                name: "Gate X",
                shortName: "GX",
                region: "Region X",
                openedAt: "2026-01-01",
                lifePhases: [],
                keyCondition: {
                    summary: "",
                    songs: [
                        { musicId: 1, title: "S1" },
                        { musicId: 2, title: "S2" },
                    ],
                },
                selectionPools: [
                    {
                        track: 1,
                        label: "A",
                        description: "",
                        selection: "random" as const,
                        songs: [{ musicId: 3, title: "S3" }],
                    },
                    {
                        track: 2,
                        description: "",
                        selection: "random" as const,
                        songs: [
                            { musicId: 2, title: "S2" },
                            { musicId: 4, title: "S4" },
                        ],
                    },
                    {
                        track: 3,
                        description: "",
                        selection: "random" as const,
                        songs: [{ musicId: 1, title: "S1" }],
                        unlistedDescription: "x",
                    },
                ],
            } as unknown as KaleidxscopeGate;

            // music 1: key true, pools [] (unlisted skipped)
            expect(
                relatedTo([entryOf({ id: 1, grade: 3 }).chart], {
                    collections: [],
                    gates: [madeUpGate],
                }).gates
            ).toEqual([
                {
                    id: "gate-x",
                    name: "Gate X",
                    shortName: "GX",
                    region: "Region X",
                    key: true,
                    pools: [],
                },
            ]);

            // music 2: key true, pools [{ track: 2, label: null }]
            expect(
                relatedTo([entryOf({ id: 2, grade: 3 }).chart], {
                    collections: [],
                    gates: [madeUpGate],
                }).gates
            ).toEqual([
                {
                    id: "gate-x",
                    name: "Gate X",
                    shortName: "GX",
                    region: "Region X",
                    key: true,
                    pools: [{ track: 2, label: null }],
                },
            ]);

            // music 3: key false, pools [{ track: 1, label: "A" }]
            expect(
                relatedTo([entryOf({ id: 3, grade: 3 }).chart], {
                    collections: [],
                    gates: [madeUpGate],
                }).gates
            ).toEqual([
                {
                    id: "gate-x",
                    name: "Gate X",
                    shortName: "GX",
                    region: "Region X",
                    key: false,
                    pools: [{ track: 1, label: "A" }],
                },
            ]);

            // music 4: key false, pools [{ track: 2, label: null }]
            expect(
                relatedTo([entryOf({ id: 4, grade: 3 }).chart], {
                    collections: [],
                    gates: [madeUpGate],
                }).gates
            ).toEqual([
                {
                    id: "gate-x",
                    name: "Gate X",
                    shortName: "GX",
                    region: "Region X",
                    key: false,
                    pools: [{ track: 2, label: null }],
                },
            ]);

            // music 5: no gate
            expect(
                relatedTo([entryOf({ id: 5, grade: 3 }).chart], {
                    collections: [],
                    gates: [madeUpGate],
                }).gates
            ).toEqual([]);

            // charts of music 1 and 3 together: key true, pools [{ track: 1, label: "A" }]
            expect(
                relatedTo(
                    [entryOf({ id: 1, grade: 3 }).chart, entryOf({ id: 3, grade: 3 }).chart],
                    {
                        collections: [],
                        gates: [madeUpGate],
                    }
                ).gates
            ).toEqual([
                {
                    id: "gate-x",
                    name: "Gate X",
                    shortName: "GX",
                    region: "Region X",
                    key: true,
                    pools: [{ track: 1, label: "A" }],
                },
            ]);

            // gate whose only match is unlisted pool is not included
            const unlistedOnlyGate = {
                id: "gate-u",
                name: "Gate U",
                shortName: "GU",
                region: "Region U",
                openedAt: "2026-01-01",
                lifePhases: [],
                keyCondition: { summary: "", songs: [] },
                selectionPools: [
                    {
                        track: 1,
                        description: "",
                        selection: "random" as const,
                        songs: [{ musicId: 99, title: "S99" }],
                        unlistedDescription: "secret",
                    },
                ],
            } as unknown as KaleidxscopeGate;
            expect(
                relatedTo([entryOf({ id: 99, grade: 3 }).chart], {
                    collections: [],
                    gates: [unlistedOnlyGate],
                }).gates
            ).toEqual([]);

            // Two gates [y, x] both related come out as [y, x]
            const madeUpGateY = {
                ...madeUpGate,
                id: "gate-y",
                name: "Gate Y",
            } as unknown as KaleidxscopeGate;
            expect(
                relatedTo([entryOf({ id: 3, grade: 3 }).chart], {
                    collections: [],
                    gates: [madeUpGateY, madeUpGate],
                }).gates.map(g => g.id)
            ).toEqual(["gate-y", "gate-x"]);

            // Same result for grades 0, 3, 10
            for (const grade of [0, 3, 10]) {
                expect(
                    relatedTo([entryOf({ id: 3, grade }).chart], {
                        collections: [],
                        gates: [madeUpGate],
                    }).gates
                ).toEqual([
                    {
                        id: "gate-x",
                        name: "Gate X",
                        shortName: "GX",
                        region: "Region X",
                        key: false,
                        pools: [{ track: 1, label: "A" }],
                    },
                ]);
            }
        });
    });
});
