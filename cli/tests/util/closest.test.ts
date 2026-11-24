import { describe, expect, it } from "vitest";
import { closestItems, closestMatches, editDistance } from "../../src/util/closest";

describe("editDistance", () => {
    it("counts insertions, deletions and substitutions", () => {
        expect(editDistance("", "")).toBe(0);
        expect(editDistance("abc", "abc")).toBe(0);
        expect(editDistance("abc", "")).toBe(3);
        expect(editDistance("", "abc")).toBe(3);
        expect(editDistance("limit", "limt")).toBe(1);
        expect(editDistance("kitten", "sitting")).toBe(3);
    });

    it("counts swapping two neighbours as one edit", () => {
        expect(editDistance("demo", "dmeo")).toBe(1);
        expect(editDistance("lmiit", "limit")).toBe(1);
        expect(editDistance("ab", "ba")).toBe(1);
    });

    it("handles Chinese text", () => {
        expect(editDistance("熊極", "熊極")).toBe(0);
        expect(editDistance("熊極", "熊")).toBe(1);
    });
});

describe("closestMatches", () => {
    const names = ["limit", "offset", "level", "group-by", "format", "fields"];

    it("returns the nearest names first", () => {
        expect(closestMatches("lmit", names)).toEqual(["limit"]);
        expect(closestMatches("limt", names)).toEqual(["limit"]);
        expect(closestMatches("levl", names)).toEqual(["level"]);
    });

    it("matches the start of a longer name", () => {
        expect(closestMatches("group", names)).toEqual(["group-by"]);
        expect(closestMatches("off", names)).toEqual(["offset"]);
    });

    it("ignores case", () => {
        expect(closestMatches("LIMIT", names)).toEqual(["limit"]);
    });

    it("does not treat a single letter as the start of everything", () => {
        expect(closestMatches("l", names)).toEqual([]);
    });

    it("returns nothing when nothing is close", () => {
        expect(closestMatches("zzzzzzzz", names)).toEqual([]);
        expect(closestMatches("", names)).toEqual([]);
        expect(closestMatches("limit", [])).toEqual([]);
    });

    it("keeps the order of the candidates on a tie and honors the limit", () => {
        expect(closestMatches("fo", ["foo", "fob", "fox", "foz"], 2)).toEqual(["foo", "fob"]);
        expect(closestMatches("fo", ["foo", "fob", "fox", "foz"])).toEqual(["foo", "fob", "fox"]);
    });
});

describe("closestItems", () => {
    const songs = [
        { id: 1, names: ["Link", "cof"] },
        { id: 2, names: ["Linkage"] },
        { id: 3, names: ["Trust", "足控"] },
        { id: 4, names: ["Future"] },
    ];
    const namesOf = (song: (typeof songs)[number]) => song.names;

    it("returns the items themselves, not their names", () => {
        expect(closestItems("Linkk", songs, namesOf)).toEqual([songs[0]]);
    });

    it("counts an item by its nearest name", () => {
        expect(closestItems("足空", songs, namesOf).map(song => song.id)).toEqual([3]);
        expect(closestItems("cog", songs, namesOf).map(song => song.id)).toEqual([1]);
    });

    it("puts exact starts first and keeps the order of the items among equals", () => {
        expect(closestItems("link", songs, namesOf).map(song => song.id)).toEqual([1, 2]);
    });

    it("stops at the limit", () => {
        expect(closestItems("link", songs, namesOf, 1).map(song => song.id)).toEqual([1]);
    });

    it("finds nothing when no name is near", () => {
        expect(closestItems("zzzzzzzz", songs, namesOf)).toEqual([]);
    });

    it("answers closestMatches the same way", () => {
        expect(closestMatches("lmit", ["limit", "offset"])).toEqual(["limit"]);
    });
});
