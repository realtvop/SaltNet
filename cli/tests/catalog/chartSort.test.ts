import type { ChartEntry } from "../../src/catalog/songs";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { describe, expect, it } from "vitest";
import { compareByChartKey, compareByGameOrder, sortCharts } from "../../src/catalog/chartSort";
import { buildCatalog } from "../../src/catalog/refresh";
import { chartKeyOf } from "../../src/catalog/songs";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { entryOf } from "../madeChart";

const catalog = fixtureSongCatalog();
const all183 = [...catalog.chartByKey.values()];
const nonBanquet175 = all183.filter(e => e.chart.info.grade !== 10);
const remUtage15 = all183.filter(e => e.chart.info.grade === 4 || e.chart.info.grade === 10);

const cnVersions = buildCatalog(getFixtureSaltMetaCompacted()).metadata.cnVersions.map(
    ({ name }) => name
);

function keysOf(entries: readonly ChartEntry[]): string[] {
    return entries.map(e => chartKeyOf(e.chart));
}

describe("compareByChartKey", () => {
    it("orders by music id ascending regardless of grade, and by grade ascending for same music", () => {
        const c2_4 = entryOf({ id: 2, grade: 4 });
        const c10_0 = entryOf({ id: 10, grade: 0 });
        expect(compareByChartKey(c2_4, c10_0)).toBeLessThan(0);
        expect(compareByChartKey(c10_0, c2_4)).toBeGreaterThan(0);

        const c146_3 = entryOf({ id: 146, grade: 3 });
        const c10146_3 = entryOf({ id: 10146, grade: 3 });
        expect(compareByChartKey(c146_3, c10146_3)).toBeLessThan(0);
        expect(compareByChartKey(c10146_3, c146_3)).toBeGreaterThan(0);

        const c8_0 = entryOf({ id: 8, grade: 0 });
        const c8_3 = entryOf({ id: 8, grade: 3 });
        expect(compareByChartKey(c8_0, c8_3)).toBeLessThan(0);
        expect(compareByChartKey(c8_3, c8_0)).toBeGreaterThan(0);

        expect(compareByChartKey(c8_0, c8_0)).toBe(0);
    });
});

describe("compareByGameOrder on fixture", () => {
    it("sorts reversed copy into all 183 charts in game order", () => {
        const reversed = [...all183].reverse();
        const sorted = reversed.sort(compareByGameOrder);
        const keys = keysOf(sorted);

        expect(keys).toHaveLength(183);
        expect(new Set(keys).size).toBe(183);

        const expectedFirst17 = [
            "110227-10",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110851-10",
            "110998-10",
            "121513-10",
            "131-4",
            "70-4",
            "58-4",
            "115-4",
            "256-4",
            "146-4",
            "17-4",
            "695-3",
            "131-3",
        ];
        const expectedLast8 = [
            "10146-0",
            "552-0",
            "10552-0",
            "17-0",
            "10030-0",
            "10225-0",
            "11726-0",
            "12025-0",
        ];

        expect(keys.slice(0, 17)).toEqual(expectedFirst17);
        expect(keys.slice(-8)).toEqual(expectedLast8);

        const tieKeys = ["10030-3", "10225-3", "11726-3", "12025-3"];
        const indices = tieKeys.map(k => keys.indexOf(k));
        expect(indices[0]).toBeLessThan(indices[1]);
        expect(indices[1]).toBeLessThan(indices[2]);
        expect(indices[2]).toBeLessThan(indices[3]);
        // Also verify they follow each other directly
        expect(indices[1]).toBe(indices[0] + 1);
        expect(indices[2]).toBe(indices[1] + 1);
        expect(indices[3]).toBe(indices[2] + 1);

        // compareByGameOrder(a, b) and compareByGameOrder(b, a) have opposite signs, never both 0 for different charts
        const sampleEntries = sorted.slice(0, 17);
        for (let i = 0; i < sampleEntries.length; i++) {
            for (let j = i + 1; j < sampleEntries.length; j++) {
                const a = sampleEntries[i];
                const b = sampleEntries[j];
                const ab = compareByGameOrder(a, b);
                const ba = compareByGameOrder(b, a);
                expect(ab).toBeLessThan(0);
                expect(ba).toBeGreaterThan(0);
                expect(Math.sign(ab)).toBe(-Math.sign(ba));
            }
        }
    });
});

describe("sortCharts on 175 non-banquet fixture charts", () => {
    const scrambled = [...nonBanquet175].reverse();

    it("sorts by constant descending", () => {
        const sorted = sortCharts(scrambled, {
            key: "constant",
            ascending: false,
            versions: cnVersions,
        });
        const keys = keysOf(sorted);

        expect(keys).toHaveLength(175);
        expect(new Set(keys)).toEqual(new Set(keysOf(nonBanquet175)));

        const expectedFirst14 = [
            "12025-3",
            "10070-3",
            "70-3",
            "431-3",
            "70-4",
            "191-3",
            "115-3",
            "115-4",
            "283-3",
            "10030-3",
            "11726-3",
            "131-4",
            "58-4",
            "113-3",
        ];
        const expectedNext8 = [
            "146-4",
            "225-3",
            "10225-3",
            "188-3",
            "236-3",
            "10242-3",
            "359-3",
            "552-3",
        ];
        const expectedLast5 = ["10552-0", "11726-0", "10030-0", "10185-0", "10256-0"];

        expect(keys.slice(0, 14)).toEqual(expectedFirst14);
        expect(keys.slice(14, 22)).toEqual(expectedNext8);
        expect(keys.slice(-5)).toEqual(expectedLast5);
    });

    it("sorts by constant ascending", () => {
        const sorted = sortCharts(scrambled, {
            key: "constant",
            ascending: true,
            versions: cnVersions,
        });
        const keys = keysOf(sorted);

        expect(keys).toHaveLength(175);
        expect(new Set(keys)).toEqual(new Set(keysOf(nonBanquet175)));

        const expectedFirst14 = [
            "10030-0",
            "10185-0",
            "10256-0",
            "185-0",
            "10044-0",
            "10146-0",
            "10188-0",
            "10552-0",
            "11726-0",
            "9-0",
            "113-0",
            "188-0",
            "225-0",
            "228-0",
        ];
        const expectedLast5 = ["70-4", "70-3", "431-3", "10070-3", "12025-3"];

        expect(keys.slice(0, 14)).toEqual(expectedFirst14);
        expect(keys.slice(-5)).toEqual(expectedLast5);
    });

    it("sorts by version descending", () => {
        const sorted = sortCharts(scrambled, {
            key: "version",
            ascending: false,
            versions: cnVersions,
        });
        const keys = keysOf(sorted);

        expect(keys).toHaveLength(175);
        expect(new Set(keys)).toEqual(new Set(keysOf(nonBanquet175)));

        const expectedFirst14 = [
            "10030-0",
            "10030-1",
            "10030-2",
            "10030-3",
            "12025-0",
            "12025-1",
            "12025-2",
            "12025-3",
            "10044-0",
            "10044-1",
            "10044-2",
            "10044-3",
            "10225-0",
            "10225-1",
        ];
        const expectedLast6 = ["70-3", "70-4", "77-0", "77-1", "77-2", "77-3"];

        expect(keys.slice(0, 14)).toEqual(expectedFirst14);
        expect(keys.slice(-6)).toEqual(expectedLast6);
    });

    it("sorts by version ascending", () => {
        const sorted = sortCharts(scrambled, {
            key: "version",
            ascending: true,
            versions: cnVersions,
        });
        const keys = keysOf(sorted);

        expect(keys).toHaveLength(175);
        expect(new Set(keys)).toEqual(new Set(keysOf(nonBanquet175)));

        const expectedFirst14 = [
            "8-0",
            "8-1",
            "8-2",
            "8-3",
            "9-0",
            "9-1",
            "9-2",
            "9-3",
            "17-0",
            "17-1",
            "17-2",
            "17-3",
            "17-4",
            "30-0",
        ];
        const expectedLast6 = ["10030-2", "10030-3", "12025-0", "12025-1", "12025-2", "12025-3"];

        expect(keys.slice(0, 14)).toEqual(expectedFirst14);
        expect(keys.slice(-6)).toEqual(expectedLast6);
    });

    it("sorts by default descending (game order)", () => {
        const sorted = sortCharts(scrambled, {
            key: "default",
            ascending: false,
            versions: cnVersions,
        });
        const keys = keysOf(sorted);

        expect(keys).toHaveLength(175);
        expect(new Set(keys)).toEqual(new Set(keysOf(nonBanquet175)));

        const expectedFirst9 = [
            "131-4",
            "70-4",
            "58-4",
            "115-4",
            "256-4",
            "146-4",
            "17-4",
            "695-3",
            "131-3",
        ];
        expect(keys.slice(0, 9)).toEqual(expectedFirst9);
    });

    it("sorts by default ascending", () => {
        const sorted = sortCharts(scrambled, {
            key: "default",
            ascending: true,
            versions: cnVersions,
        });
        const keys = keysOf(sorted);

        expect(keys).toHaveLength(175);
        expect(new Set(keys)).toEqual(new Set(keysOf(nonBanquet175)));

        const expectedFirst14 = [
            "10030-0",
            "10225-0",
            "11726-0",
            "12025-0",
            "17-0",
            "10552-0",
            "552-0",
            "10146-0",
            "146-0",
            "10185-0",
            "185-0",
            "10256-0",
            "256-0",
            "10044-0",
        ];
        const expectedLast5 = ["256-4", "115-4", "58-4", "70-4", "131-4"];

        expect(keys.slice(0, 14)).toEqual(expectedFirst14);
        expect(keys.slice(-5)).toEqual(expectedLast5);
    });
});

describe("sortCharts with banquet charts (--diff rem,utage)", () => {
    const scrambled = [...remUtage15].reverse();

    it("sorts by constant descending", () => {
        const sorted = sortCharts(scrambled, {
            key: "constant",
            ascending: false,
            versions: cnVersions,
        });
        expect(keysOf(sorted)).toEqual([
            "70-4",
            "115-4",
            "131-4",
            "58-4",
            "146-4",
            "17-4",
            "256-4",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110227-10",
            "110851-10",
            "110998-10",
            "121513-10",
        ]);
    });

    it("sorts by constant ascending", () => {
        const sorted = sortCharts(scrambled, {
            key: "constant",
            ascending: true,
            versions: cnVersions,
        });
        expect(keysOf(sorted)).toEqual([
            "17-4",
            "256-4",
            "58-4",
            "146-4",
            "131-4",
            "115-4",
            "70-4",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110227-10",
            "110851-10",
            "110998-10",
            "121513-10",
        ]);
    });

    it("sorts by version descending", () => {
        const sorted = sortCharts(scrambled, {
            key: "version",
            ascending: false,
            versions: cnVersions,
        });
        expect(keysOf(sorted)).toEqual([
            "110851-10",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110227-10",
            "110998-10",
            "121513-10",
            "115-4",
            "256-4",
            "58-4",
            "131-4",
            "146-4",
            "17-4",
            "70-4",
        ]);
    });

    it("sorts by version ascending", () => {
        const sorted = sortCharts(scrambled, {
            key: "version",
            ascending: true,
            versions: cnVersions,
        });
        expect(keysOf(sorted)).toEqual([
            "17-4",
            "70-4",
            "58-4",
            "131-4",
            "146-4",
            "115-4",
            "256-4",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110227-10",
            "110998-10",
            "121513-10",
            "110851-10",
        ]);
    });

    it("sorts by default ascending", () => {
        const sorted = sortCharts(scrambled, {
            key: "default",
            ascending: true,
            versions: cnVersions,
        });
        expect(keysOf(sorted)).toEqual([
            "17-4",
            "146-4",
            "256-4",
            "115-4",
            "58-4",
            "70-4",
            "131-4",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110851-10",
            "110998-10",
            "121513-10",
            "110227-10",
        ]);
    });
});

describe("sortCharts with made-up charts", () => {
    it("sorts constants and places unknown constant charts last in both directions", () => {
        const charts = [
            entryOf({ id: 5, grade: 3, constant: 13.5 }),
            entryOf({ id: 2, grade: 3, constant: 13.5 }),
            entryOf({ id: 2, grade: 2, constant: 13.5 }),
            entryOf({ id: 9, grade: 3, constant: 14 }),
            entryOf({ id: 7, grade: 3, constant: 0 }),
            entryOf({ id: 8, grade: 3, constant: 0 }),
        ];

        const desc = sortCharts(charts, { key: "constant", ascending: false, versions: [] });
        expect(keysOf(desc)).toEqual(["9-3", "2-2", "2-3", "5-3", "7-3", "8-3"]);

        const asc = sortCharts(charts, { key: "constant", ascending: true, versions: [] });
        expect(keysOf(asc)).toEqual(["2-2", "2-3", "5-3", "9-3", "7-3", "8-3"]);
    });

    it("sorts versions and places unknown version charts last in both directions", () => {
        const list = ["v1", "v2", "v3"];
        const charts = [
            entryOf({ id: 1, grade: 0, from: "v2" }),
            entryOf({ id: 2, grade: 0, from: "v1" }),
            entryOf({ id: 3, grade: 0, from: "v3" }),
            entryOf({ id: 4, grade: 0, from: "x" }),
            entryOf({ id: 5, grade: 0, from: "v1" }),
            entryOf({ id: 6, grade: 0, from: "y" }),
        ];

        const desc = sortCharts(charts, { key: "version", ascending: false, versions: list });
        expect(keysOf(desc)).toEqual(["3-0", "1-0", "2-0", "5-0", "4-0", "6-0"]);

        const asc = sortCharts(charts, { key: "version", ascending: true, versions: list });
        expect(keysOf(asc)).toEqual(["2-0", "5-0", "1-0", "3-0", "4-0", "6-0"]);

        // Empty version list: all versions unknown, sorted by chart key in both directions
        const emptyDesc = sortCharts(charts, { key: "version", ascending: false, versions: [] });
        expect(keysOf(emptyDesc)).toEqual(["1-0", "2-0", "3-0", "4-0", "5-0", "6-0"]);

        const emptyAsc = sortCharts(charts, { key: "version", ascending: true, versions: [] });
        expect(keysOf(emptyAsc)).toEqual(["1-0", "2-0", "3-0", "4-0", "5-0", "6-0"]);
    });
});

describe("sortCharts invariants", () => {
    it("does not mutate the input array and returns a fresh copy", () => {
        const input = [...remUtage15];
        const copyBefore = [...input];
        const res = sortCharts(input, {
            key: "constant",
            ascending: false,
            versions: cnVersions,
        });

        expect(res).not.toBe(input);
        expect(input).toEqual(copyBefore);
    });

    it("yields identical results regardless of input order", () => {
        const original = [...remUtage15];
        const reversed = [...original].reverse();
        const rotated = [...original.slice(5), ...original.slice(0, 5)];

        for (const key of ["default", "constant", "version"] as const) {
            for (const ascending of [false, true]) {
                const sortConfig = { key, ascending, versions: cnVersions };
                const resOrig = keysOf(sortCharts(original, sortConfig));
                const resRev = keysOf(sortCharts(reversed, sortConfig));
                const resRot = keysOf(sortCharts(rotated, sortConfig));

                expect(resRev).toEqual(resOrig);
                expect(resRot).toEqual(resOrig);
            }
        }
    });
});
