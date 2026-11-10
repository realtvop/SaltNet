import { describe, expect, it } from "vitest";
import { cellOf, columnsOf } from "../../src/output/table";

describe("columnsOf", () => {
    it("lists every leaf key, writing nested objects as dotted names", () => {
        expect(
            columnsOf([{ chartKey: "1-3", score: { rank: "S", dxScore: 1 }, b50: { part: "B15" } }])
        ).toEqual(["chartKey", "score.rank", "score.dxScore", "b50.part"]);
    });

    it("takes the inner keys of an object that is null in some rows", () => {
        expect(
            columnsOf([
                { chartKey: "1-3", score: null, level: "13" },
                { chartKey: "2-3", score: { rank: "S" }, level: "14" },
            ])
        ).toEqual(["chartKey", "score.rank", "level"]);
    });

    it("keeps a null column as one column when no row fills it in", () => {
        expect(
            columnsOf([
                { a: 1, score: null },
                { a: 2, score: null },
            ])
        ).toEqual(["a", "score"]);
    });

    it("unites the keys of rows that differ, in the order they are first met", () => {
        expect(
            columnsOf([
                { a: 1, b: 2 },
                { b: 3, c: 4 },
                { d: 5, a: 6 },
            ])
        ).toEqual(["a", "b", "c", "d"]);
    });

    it("treats lists and empty objects as values, not as something to look into", () => {
        expect(columnsOf([{ tags: ["a"], extra: {}, n: 1 }])).toEqual(["tags", "extra", "n"]);
    });

    it("gives no columns for no rows or rows that are not objects", () => {
        expect(columnsOf([])).toEqual([]);
        expect(columnsOf(["x", 1, null])).toEqual([]);
    });
});

describe("cellOf", () => {
    const row = { chartKey: "1-3", score: { rank: "S" }, none: null, tags: ["a", "b"] };

    it("reads a plain or dotted column", () => {
        expect(cellOf(row, "chartKey")).toBe("1-3");
        expect(cellOf(row, "score.rank")).toBe("S");
        expect(cellOf(row, "tags")).toEqual(["a", "b"]);
    });

    it("gives null when the row has no value there", () => {
        expect(cellOf(row, "none")).toBeNull();
        expect(cellOf(row, "none.rank")).toBeNull();
        expect(cellOf(row, "missing")).toBeNull();
        expect(cellOf(null, "a")).toBeNull();
    });
});
