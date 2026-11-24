import { describe, expect, it } from "vitest";
import {
    closestDifficulties,
    DIFFICULTIES,
    difficultyLabel,
    parseDifficulty,
} from "../../src/refs/difficulty";

describe("parseDifficulty", () => {
    it.each([
        ["bas", 0],
        ["adv", 1],
        ["exp", 2],
        ["mas", 3],
        ["rem", 4],
        ["utage", 10],
    ])("reads the short name %s as grade %i", (text, grade) => {
        expect(parseDifficulty(text)?.grade).toBe(grade);
    });

    it.each([
        ["basic", 0],
        ["advanced", 1],
        ["expert", 2],
        ["master", 3],
        ["re:master", 4],
        ["remaster", 4],
    ])("reads the English name %s as grade %i", (text, grade) => {
        expect(parseDifficulty(text)?.grade).toBe(grade);
    });

    it.each([
        ["0", 0],
        ["1", 1],
        ["2", 2],
        ["3", 3],
        ["4", 4],
        ["10", 10],
    ])("reads the grade number %s", (text, grade) => {
        expect(parseDifficulty(text)?.grade).toBe(grade);
    });

    it.each([
        ["绿", 0],
        ["黄", 1],
        ["红", 2],
        ["紫", 3],
        ["白", 4],
        ["宴", 10],
        ["綠", 0],
        ["黃", 1],
        ["紅", 2],
    ])("reads the color %s", (text, grade) => {
        expect(parseDifficulty(text)?.grade).toBe(grade);
    });

    it("ignores case, width and surrounding spaces", () => {
        expect(parseDifficulty("MAS")?.grade).toBe(3);
        expect(parseDifficulty("Re:MASTER")?.grade).toBe(4);
        expect(parseDifficulty("ＵＴＡＧＥ")?.grade).toBe(10);
        expect(parseDifficulty("  mas ")?.grade).toBe(3);
        expect(parseDifficulty("１０")?.grade).toBe(10);
    });

    it("does not guess at anything else", () => {
        for (const text of ["", "5", "9", "11", "masterr", "re", "m", "-1", "3.0", "紫红"]) {
            expect(parseDifficulty(text), text).toBeUndefined();
        }
    });

    it("has one value and one grade for each difficulty", () => {
        expect(new Set(DIFFICULTIES.map(entry => entry.value)).size).toBe(DIFFICULTIES.length);
        expect(new Set(DIFFICULTIES.map(entry => entry.grade)).size).toBe(DIFFICULTIES.length);
        for (const entry of DIFFICULTIES) {
            expect(parseDifficulty(entry.value)).toBe(entry);
            for (const alias of entry.aliases) expect(parseDifficulty(alias)).toBe(entry);
        }
    });
});

describe("difficultyLabel", () => {
    it("is the name the game shows", () => {
        expect([0, 1, 2, 3, 4, 10].map(difficultyLabel)).toEqual([
            "BASIC",
            "ADVANCED",
            "EXPERT",
            "MASTER",
            "Re:MASTER",
            "UTAGE",
        ]);
    });

    it("does not pass an unknown grade off as MASTER", () => {
        expect(difficultyLabel(7)).toBe("7");
    });
});

describe("closestDifficulties", () => {
    it("names the short value of what was probably meant", () => {
        expect(closestDifficulties("mastr")).toEqual(["mas"]);
        expect(closestDifficulties("expart")).toEqual(["exp"]);
        expect(closestDifficulties("remastr")).toEqual(["rem"]);
    });

    it("finds nothing for something far off", () => {
        expect(closestDifficulties("zzzzzzzz")).toEqual([]);
    });
});
