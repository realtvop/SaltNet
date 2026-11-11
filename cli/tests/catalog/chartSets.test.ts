import type { Collection } from "@core/collection/type";
import type { Course } from "@core/course";
import { mapLXNSCollections } from "@core/collection/map";
import { courses } from "@core/course";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { kaleidxscopeGates } from "@core/kaleidxscope";
import { describe, expect, it } from "vitest";
import { allChartEntries } from "../../src/catalog/chartQuery";
import {
    collectionCharts,
    courseCharts,
    gateCharts,
    hasSongRequirement,
    intersectChartSets,
} from "../../src/catalog/chartSets";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { entryOf } from "../madeChart";

describe("chartSets", () => {
    describe("gateCharts", () => {
        it("selects all grades of songs in key condition and pools", () => {
            const blue = kaleidxscopeGates.find(gate => gate.id === "blue")!;
            const entries = [
                entryOf({ id: 11009, grade: 0 }),
                entryOf({ id: 11009, grade: 1 }),
                entryOf({ id: 11009, grade: 2 }),
                entryOf({ id: 11009, grade: 3 }),
                entryOf({ id: 11009, grade: 10 }),
                entryOf({ id: 11740, grade: 3 }),
                entryOf({ id: 11012, grade: 3 }),
                entryOf({ id: 9, grade: 3 }),
            ];
            const blueSet = gateCharts(blue, entries);
            expect(blueSet.keys).toEqual(
                new Set(["11009-0", "11009-1", "11009-2", "11009-3", "11009-10", "11740-3"])
            );
            expect(blueSet.order).toBeUndefined();

            const purple = kaleidxscopeGates.find(gate => gate.id === "purple")!;
            const purpleSet = gateCharts(purple, [
                entryOf({ id: 328, grade: 3 }),
                entryOf({ id: 10328, grade: 3 }),
                entryOf({ id: 9, grade: 3 }),
            ]);
            expect(purpleSet.keys).toEqual(new Set(["328-3"]));

            const hope = kaleidxscopeGates.find(gate => gate.id === "hope")!;
            const hopeSet = gateCharts(hope, [
                entryOf({ id: 1736, grade: 3 }),
                entryOf({ id: 10835, grade: 3 }),
                entryOf({ id: 1819, grade: 3 }),
                entryOf({ id: 11736, grade: 3 }),
            ]);
            expect(hopeSet.keys).toEqual(new Set(["1736-3", "10835-3", "1819-3"]));

            const finalGate = kaleidxscopeGates.find(gate => gate.id === "final")!;
            const finalSet = gateCharts(finalGate, [
                entryOf({ id: 11820, grade: 3 }),
                entryOf({ id: 11821, grade: 0 }),
                entryOf({ id: 11822, grade: 3 }),
            ]);
            expect(finalSet.keys).toEqual(new Set(["11820-3", "11821-0"]));

            // 11612 is a key song of the white gate that none of its pools has; 11027 is only in a pool.
            const white = kaleidxscopeGates.find(gate => gate.id === "white")!;
            const whiteSet = gateCharts(white, [
                entryOf({ id: 11612, grade: 3 }),
                entryOf({ id: 11027, grade: 3 }),
                entryOf({ id: 9, grade: 3 }),
            ]);
            expect(whiteSet.keys).toEqual(new Set(["11612-3", "11027-3"]));

            const emptySet = gateCharts(blue, []);
            expect(emptySet.keys).toEqual(new Set());
        });
    });

    describe("courseCharts", () => {
        it("returns tracks in play order and constructs order map", () => {
            const course551010 = courses.find(course => course.id === 551010)!;
            const scrambled = [
                entryOf({ id: 227, grade: 3 }),
                entryOf({ id: 11412, grade: 3 }),
                entryOf({ id: 840, grade: 3 }),
                entryOf({ id: 11207, grade: 3 }),
                entryOf({ id: 840, grade: 2 }),
                entryOf({ id: 9, grade: 3 }),
            ];
            const set1 = courseCharts(course551010, scrambled);
            expect([...set1.keys]).toEqual(["840-3", "11207-3", "11412-3", "227-3"]);
            expect(set1.order).toEqual(
                new Map([
                    ["840-3", 0],
                    ["11207-3", 1],
                    ["11412-3", 2],
                    ["227-3", 3],
                ])
            );

            const without11207 = scrambled.filter(e => e.chart.music.id !== 11207);
            const set2 = courseCharts(course551010, without11207);
            expect([...set2.keys]).toEqual(["840-3", "11412-3", "227-3"]);
            expect(set2.order).toEqual(
                new Map([
                    ["840-3", 0],
                    ["11412-3", 1],
                    ["227-3", 2],
                ])
            );

            const setEmpty = courseCharts(course551010, []);
            expect(setEmpty.keys).toEqual(new Set());
            expect(setEmpty.order).toEqual(new Map());

            const course551111 = courses.find(course => course.id === 551111)!;
            const entries551111 = [
                entryOf({ id: 11753, grade: 3 }),
                entryOf({ id: 11223, grade: 3 }),
                entryOf({ id: 11311, grade: 3 }),
                entryOf({ id: 11745, grade: 3 }),
            ];
            const setZhen = courseCharts(course551111, entries551111);
            expect([...setZhen.keys]).toEqual(["11223-3", "11745-3", "11311-3", "11753-3"]);

            const madeUpCourse = {
                ...courses[0],
                tracks: [
                    { musicId: 1, difficulty: 3 },
                    { musicId: 2, difficulty: 3 },
                    { musicId: 1, difficulty: 3 },
                ],
            } as unknown as Course;
            const madeUpSet = courseCharts(madeUpCourse, [
                entryOf({ id: 2, grade: 3 }),
                entryOf({ id: 1, grade: 3 }),
            ]);
            expect([...madeUpSet.keys]).toEqual(["1-3", "2-3"]);
            expect(madeUpSet.order).toEqual(
                new Map([
                    ["1-3", 0],
                    ["2-3", 1],
                ])
            );
        });

        it("matches tracks on fixture data", () => {
            const fixtureEntries = allChartEntries(fixtureSongCatalog());

            const courseChu = courses.find(course => course.id === 551001)!;
            const resChu = courseCharts(courseChu, fixtureEntries);
            expect(resChu.keys).toEqual(new Set(["10256-0"]));
            expect(resChu.order).toEqual(new Map([["10256-0", 0]]));

            const courseZhenEr = courses.find(course => course.id === 551102)!;
            const resZhenEr = courseCharts(courseZhenEr, fixtureEntries);
            expect(resZhenEr.keys).toEqual(new Set(["191-2"]));
            expect(resZhenEr.order).toEqual(new Map([["191-2", 0]]));
        });
    });

    describe("collectionCharts", () => {
        it("returns charts from collection requirements on fixture data", () => {
            const fixtureEntries = allChartEntries(fixtureSongCatalog());
            const fixtureCollections = mapLXNSCollections(getFixtureLXNSCollections());

            const p6101 = fixtureCollections.plates.find(p => p.id === 6101)!;
            const res6101 = collectionCharts(p6101, fixtureEntries);
            expect(res6101.order).toBeUndefined();
            expect(res6101.keys.size).toBe(20);
            expect(res6101.keys).toEqual(
                new Set([
                    "58-3",
                    "30-3",
                    "8-3",
                    "9-3",
                    "17-3",
                    "58-2",
                    "30-2",
                    "8-2",
                    "9-2",
                    "17-2",
                    "58-1",
                    "30-1",
                    "8-1",
                    "9-1",
                    "17-1",
                    "58-0",
                    "30-0",
                    "8-0",
                    "9-0",
                    "17-0",
                ])
            );

            const p6104 = fixtureCollections.plates.find(p => p.id === 6104)!;
            const res6104 = collectionCharts(p6104, fixtureEntries);
            expect(res6104.keys.size).toBe(16);
            expect(res6104.keys).toEqual(
                new Set([
                    "115-3",
                    "188-3",
                    "191-3",
                    "256-3",
                    "115-2",
                    "188-2",
                    "191-2",
                    "256-2",
                    "115-1",
                    "188-1",
                    "191-1",
                    "256-1",
                    "115-0",
                    "188-0",
                    "191-0",
                    "256-0",
                ])
            );

            const p6148 = fixtureCollections.plates.find(p => p.id === 6148)!;
            const res6148 = collectionCharts(p6148, fixtureEntries);
            expect(res6148.keys.size).toBe(24);
            expect(res6148.keys).toEqual(
                new Set([
                    "70-4",
                    "58-4",
                    "256-4",
                    "17-4",
                    "58-3",
                    "30-3",
                    "8-3",
                    "9-3",
                    "17-3",
                    "58-2",
                    "30-2",
                    "8-2",
                    "9-2",
                    "17-2",
                    "58-1",
                    "30-1",
                    "8-1",
                    "9-1",
                    "17-1",
                    "58-0",
                    "30-0",
                    "8-0",
                    "9-0",
                    "17-0",
                ])
            );

            const t5102 = fixtureCollections.titles.find(t => t.id === 5102)!;
            const res5102 = collectionCharts(t5102, fixtureEntries);
            expect(res5102.keys.size).toBe(4);
            expect(res5102.keys).toEqual(new Set(["10146-3", "10146-2", "10146-1", "10146-0"]));

            const f109101 = fixtureCollections.frames.find(f => f.id === 109101)!;
            const res109101 = collectionCharts(f109101, fixtureEntries);
            expect(res109101.keys.size).toBe(8);
            expect(res109101.keys).toEqual(
                new Set([
                    "10191-3",
                    "10256-3",
                    "10191-2",
                    "10256-2",
                    "10191-1",
                    "10256-1",
                    "10191-0",
                    "10256-0",
                ])
            );

            const t5101 = fixtureCollections.titles.find(t => t.id === 5101)!;
            expect(collectionCharts(t5101, fixtureEntries).keys).toEqual(new Set());

            const p409506 = fixtureCollections.plates.find(p => p.id === 409506)!;
            expect(collectionCharts(p409506, fixtureEntries).keys).toEqual(new Set());
        });
    });

    describe("hasSongRequirement", () => {
        it("identifies whether a collection has song requirements", () => {
            expect(hasSongRequirement({} as Collection)).toBe(false);
            expect(hasSongRequirement({ required: [] } as unknown as Collection)).toBe(false);
            expect(
                hasSongRequirement({
                    required: [{ rate: "sss" } as never],
                } as unknown as Collection)
            ).toBe(false);
            expect(
                hasSongRequirement({
                    required: [{ songs: [] }],
                } as unknown as Collection)
            ).toBe(false);

            const oneSong = { id: 1, title: "1", type: "dx" as const };
            expect(
                hasSongRequirement({
                    required: [{ songs: [oneSong] }],
                } as unknown as Collection)
            ).toBe(true);
            expect(
                hasSongRequirement({
                    required: [{ rate: "sss" } as never, { songs: [oneSong] }],
                } as unknown as Collection)
            ).toBe(true);
        });
    });

    describe("intersectChartSets", () => {
        it("intersects multiple chart sets preserving order of first set", () => {
            expect(intersectChartSets([])).toBeUndefined();

            const single = { keys: new Set(["a", "b", "c"]) };
            const singleRes = intersectChartSets([single]);
            expect(singleRes).toEqual(new Set(["a", "b", "c"]));
            expect(singleRes).not.toBe(single.keys);

            const set1 = { keys: new Set(["a", "b", "c"]) };
            const set2 = { keys: new Set(["c", "b", "d"]) };
            const twoRes = intersectChartSets([set1, set2]);
            expect([...twoRes!]).toEqual(["b", "c"]);

            const set3 = { keys: new Set(["b", "e"]) };
            const threeRes = intersectChartSets([set1, set2, set3]);
            expect([...threeRes!]).toEqual(["b"]);

            const disjoint = { keys: new Set(["x", "y"]) };
            const disjointRes = intersectChartSets([set1, disjoint]);
            expect(disjointRes).toEqual(new Set());
        });
    });
});
