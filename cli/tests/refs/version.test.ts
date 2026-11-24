import type { Version } from "../../src/refs/version";
import { describe, expect, it } from "vitest";
import { resolveVersions } from "../../src/refs/version";
import { caught } from "../caught";

const versions: Version[] = [
    { name: "maimai", word: "真" },
    { name: "maimai PLUS", word: "真" },
    { name: "maimai GreeN", word: "超" },
    { name: "maimai GreeN PLUS", word: "檄" },
    { name: "舞萌DX", word: "熊" },
    { name: "舞萌DX 2021", word: "爽" },
    { name: "舞萌DX 2022", word: "宙" },
];

describe("resolveVersions", () => {
    it("matches the full name ignoring case and width, and exact name wins over longer names", () => {
        expect(resolveVersions(versions, "MAIMAI plus")).toEqual(["maimai PLUS"]);
        expect(resolveVersions(versions, "maimai")).toEqual(["maimai"]);
        expect(resolveVersions(versions, "ＭＡＩＭＡＩ")).toEqual(["maimai"]);
    });

    it("takes an exact name over the longer names that contain it", () => {
        expect(resolveVersions(versions, "舞萌DX")).toEqual(["舞萌DX"]);
        expect(resolveVersions(versions, "maimai GreeN")).toEqual(["maimai GreeN"]);
    });

    it("ignores spaces around the text", () => {
        expect(resolveVersions(versions, "  熊 ")).toEqual(["舞萌DX"]);
        expect(resolveVersions(versions, " maimai plus  ")).toEqual(["maimai PLUS"]);
    });

    it("matches the name without its front", () => {
        expect(resolveVersions(versions, "green")).toEqual(["maimai GreeN"]);
        expect(resolveVersions(versions, "plus")).toEqual(["maimai PLUS"]);
        expect(resolveVersions(versions, "green plus")).toEqual(["maimai GreeN PLUS"]);
        expect(resolveVersions(versions, "dx")).toEqual(["舞萌DX"]);
        expect(resolveVersions(versions, "dx 2021")).toEqual(["舞萌DX 2021"]);
    });

    it("matches a plate character giving every version that has it in list order", () => {
        expect(resolveVersions(versions, "真")).toEqual(["maimai", "maimai PLUS"]);
        expect(resolveVersions(versions, "熊")).toEqual(["舞萌DX"]);
    });

    it("matches a part that only one name has", () => {
        expect(resolveVersions(versions, "2022")).toEqual(["舞萌DX 2022"]);
    });

    it("fails with AMBIGUOUS_REF when a part matches several names", () => {
        const error = caught(() => resolveVersions(versions, "ree"));
        expect(error.code).toBe("AMBIGUOUS_REF");
        expect(error.exitCode).toBe(3);
        expect(error.message).toContain("2 个版本");
        expect(error.message).toContain("「ree」");
        expect(error.candidates?.map(c => c.ref)).toEqual(["maimai GreeN", "maimai GreeN PLUS"]);
    });

    it("limits AMBIGUOUS_REF candidates to 8", () => {
        const tenVersions: Version[] = Array.from({ length: 10 }, (_, i) => ({
            name: `version-x-${i}`,
            word: "字",
        }));
        const error = caught(() => resolveVersions(tenVersions, "x"));
        expect(error.code).toBe("AMBIGUOUS_REF");
        expect(error.message).toContain("10 个版本");
        expect(error.candidates).toHaveLength(8);
        expect(error.candidates?.map(c => c.ref)).toEqual(tenVersions.slice(0, 8).map(v => v.name));
    });

    it("fails with NOT_FOUND and lists suggestions when nothing matches", () => {
        const errorTypo = caught(() => resolveVersions(versions, "grean"));
        expect(errorTypo.code).toBe("NOT_FOUND");
        expect(errorTypo.exitCode).toBe(3);
        expect(errorTypo.candidates?.[0].ref).toBe("maimai GreeN");

        const errorFar = caught(() => resolveVersions(versions, "qqqqqq"));
        expect(errorFar.code).toBe("NOT_FOUND");
        expect(errorFar.candidates?.map(c => c.ref)).toEqual(versions.map(v => v.name));

        const tenVersions: Version[] = Array.from({ length: 10 }, (_, i) => ({
            name: `v-${i}`,
            word: "字",
        }));
        const errorFarTen = caught(() => resolveVersions(tenVersions, "qqqqqq"));
        expect(errorFarTen.candidates?.map(c => c.ref)).toEqual(
            tenVersions.slice(-8).map(v => v.name)
        );
    });

    it("suggests up to 8 of the versions near a text that matches none", () => {
        const similar: Version[] = Array.from({ length: 9 }, (_, i) => ({
            name: `abcd${i + 1}`,
            word: "字",
        }));
        const error = caught(() => resolveVersions(similar, "abcdx"));
        expect(error.code).toBe("NOT_FOUND");
        expect(error.candidates?.map(c => c.ref)).toEqual(similar.slice(0, 8).map(v => v.name));
    });

    it("gives NOT_FOUND message without text when echo does not allow it", () => {
        const error = caught(() => resolveVersions(versions, "a b!"));
        expect(error.code).toBe("NOT_FOUND");
        expect(error.message).toBe("找不到这个写法对应的版本");
    });

    it("preserves list order when several versions match", () => {
        expect(resolveVersions(versions, "真")).toEqual(["maimai", "maimai PLUS"]);
    });
});
