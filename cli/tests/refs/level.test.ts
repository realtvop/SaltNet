import { describe, expect, it } from "vitest";
import { levelInRange, levelValue, parseLevelRange } from "../../src/refs/level";
import { caught } from "../caught";

describe("levelValue", () => {
    it("converts valid level strings to numerical scale values", () => {
        expect(levelValue("13")).toBe(13);
        expect(levelValue("13+")).toBe(13.5);
        expect(levelValue("13?")).toBe(13);
        expect(levelValue("13+?")).toBe(13.5);
        expect(levelValue(" 7 ")).toBe(7);
        expect(levelValue("1")).toBe(1);
        expect(levelValue("15")).toBe(15);
    });

    it("returns undefined for values that are not levels", () => {
        expect(levelValue("")).toBeUndefined();
        expect(levelValue("abc")).toBeUndefined();
        expect(levelValue("13++")).toBeUndefined();
        expect(levelValue("+13")).toBeUndefined();
        expect(levelValue("13.5")).toBeUndefined();
        expect(levelValue("123")).toBeUndefined();
        expect(levelValue("-1")).toBeUndefined();
        expect(levelValue("13?+")).toBeUndefined();
    });
});

describe("parseLevelRange", () => {
    it("parses valid ranges", () => {
        expect(parseLevelRange({ from: "13", to: "14" })).toEqual({ from: 13, to: 14 });
        expect(parseLevelRange({ from: "13+", to: "13+" })).toEqual({ from: 13.5, to: 13.5 });
        expect(parseLevelRange({ from: "13", to: "13" })).toEqual({ from: 13, to: 13 });
    });

    it("leaves open ends as null", () => {
        expect(parseLevelRange({ from: "13", to: null })).toEqual({ from: 13, to: null });
        expect(parseLevelRange({ from: null, to: "12+" })).toEqual({ from: null, to: 12.5 });
        expect(parseLevelRange({ from: null, to: null })).toEqual({ from: null, to: null });
    });

    it("throws USAGE when an end is not a level", () => {
        const error = caught(() => parseLevelRange({ from: "abc", to: "14" }));
        expect(error.code).toBe("USAGE");
        expect(error.message).toContain("「abc」");
        expect(error.message).toContain("不是等级");

        const errorTo = caught(() => parseLevelRange({ from: "13", to: "xyz" }));
        expect(errorTo.code).toBe("USAGE");
        expect(errorTo.message).toContain("「xyz」");
        expect(errorTo.message).toContain("不是等级");
    });

    it("gives message without text when echo does not allow it", () => {
        const error = caught(() => parseLevelRange({ from: "a b", to: "14" }));
        expect(error.code).toBe("USAGE");
        expect(error.message).toContain("选项 --level 里有一端不是等级");
        expect(error.message).not.toContain("a b");
    });

    it("throws USAGE when range is reversed", () => {
        const error = caught(() => parseLevelRange({ from: "14", to: "13+" }));
        expect(error.code).toBe("USAGE");
        expect(error.message).toContain("下限大于上限");
    });
});

describe("levelInRange", () => {
    it("includes both ends", () => {
        const range = { from: 13, to: 14 };
        expect(levelInRange("13", range)).toBe(true);
        expect(levelInRange("13+", range)).toBe(true);
        expect(levelInRange("14", range)).toBe(true);
        expect(levelInRange("14+", range)).toBe(false);
        expect(levelInRange("12+", range)).toBe(false);
    });

    it("handles ranges ending in plus like 13..14+", () => {
        const range = { from: 13, to: 14.5 };
        expect(levelInRange("14+", range)).toBe(true);
        expect(levelInRange("15", range)).toBe(false);
    });

    it("handles open ends", () => {
        expect(levelInRange("14+", { from: 14, to: null })).toBe(true);
        expect(levelInRange("13+", { from: 14, to: null })).toBe(false);
        expect(levelInRange("10+", { from: null, to: 10.5 })).toBe(true);
        expect(levelInRange("11", { from: null, to: 10.5 })).toBe(false);
    });

    it("compares banquet levels without the ?", () => {
        expect(levelInRange("13?", { from: 13, to: 14 })).toBe(true);
        expect(levelInRange("13+?", { from: 13, to: 13.5 })).toBe(true);
        expect(levelInRange("14+?", { from: 13, to: 14 })).toBe(false);
    });

    it("returns false for invalid levels", () => {
        expect(levelInRange("invalid", { from: 1, to: 15 })).toBe(false);
        expect(levelInRange("invalid", { from: null, to: null })).toBe(false);
        expect(levelInRange("", { from: null, to: null })).toBe(false);
    });
});
