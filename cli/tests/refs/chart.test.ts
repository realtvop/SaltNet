import { describe, expect, it } from "vitest";
import { chartKeyOf } from "../../src/catalog/songs";
import { resolveChart } from "../../src/refs/chart";
import { caught } from "../caught";
import { fixtureSongCatalog } from "../fixtureCatalog";

const catalog = fixtureSongCatalog();

type Input = Parameters<typeof resolveChart>[1];

const keyOf = (input: Input): string => chartKeyOf(resolveChart(catalog, input).chart);
function refsOf(error: { candidates?: readonly { ref: string }[] }): string[] {
    return (error.candidates ?? []).map(candidate => candidate.ref);
}

describe("a chart key", () => {
    it("names the chart", () => {
        expect(keyOf({ ref: "146-3" })).toBe("146-3");
        expect(keyOf({ ref: "10146-3" })).toBe("10146-3");
        expect(keyOf({ ref: "110851-10" })).toBe("110851-10");
    });

    it("comes with the song it belongs to", () => {
        const { chart, song } = resolveChart(catalog, { ref: "10146-3" });

        expect(song.id).toBe(146);
        expect(chart.music.id).toBe(10146);
        expect(chart.info.level).toBe("12+");
    });

    it("may be followed by the difficulty it already has, in any spelling", () => {
        expect(keyOf({ ref: "146-3", difficulty: "mas" })).toBe("146-3");
        expect(keyOf({ ref: "146-3", difficulty: "紫" })).toBe("146-3");
        expect(keyOf({ ref: "146-3", difficulty: "3" })).toBe("146-3");
        expect(keyOf({ ref: "110851-10", difficulty: "宴" })).toBe("110851-10");
    });

    it("is a usage error when the difficulty after it is another one", () => {
        const error = caught(() => resolveChart(catalog, { ref: "146-3", difficulty: "exp" }));

        expect(error.code).toBe("USAGE");
        expect(error.message).toContain("不一致");
    });

    it("is NOT_FOUND when the song has no chart of that grade", () => {
        const error = caught(() => resolveChart(catalog, { ref: "10146-4" }));

        expect(error.code).toBe("NOT_FOUND");
        expect(error.message).toContain("Re:MASTER");
        expect(refsOf(error)).toHaveLength(9);
    });

    it("is NOT_FOUND when there is no such song", () => {
        expect(caught(() => resolveChart(catalog, { ref: "9999-3" })).code).toBe("NOT_FOUND");
    });
});

describe("a music id and a difficulty", () => {
    it("takes the chart of that id's own type", () => {
        expect(keyOf({ ref: "146", difficulty: "mas" })).toBe("146-3");
        expect(keyOf({ ref: "10146", difficulty: "mas" })).toBe("10146-3");
        expect(resolveChart(catalog, { ref: "146", difficulty: "mas" }).chart.info.level).toBe(
            "13"
        );
        expect(resolveChart(catalog, { ref: "10146", difficulty: "mas" }).chart.info.level).toBe(
            "12+"
        );
    });

    it("takes any spelling of the difficulty", () => {
        for (const difficulty of ["mas", "MASTER", "master", "3", "紫", "Mas"]) {
            expect(keyOf({ ref: "131", difficulty }), difficulty).toBe("131-3");
        }
        expect(keyOf({ ref: "131", difficulty: "Re:MASTER" })).toBe("131-4");
        expect(keyOf({ ref: "131", difficulty: "白" })).toBe("131-4");
        expect(keyOf({ ref: "131", difficulty: "bas" })).toBe("131-0");
        expect(keyOf({ ref: "131", difficulty: "绿" })).toBe("131-0");
    });

    it("does not reach over to the other side of the song", () => {
        // 146 has Re:MASTER on its SD side only.
        expect(keyOf({ ref: "146", difficulty: "rem" })).toBe("146-4");

        const error = caught(() => resolveChart(catalog, { ref: "10146", difficulty: "rem" }));

        expect(error.code).toBe("NOT_FOUND");
        expect(error.message).toBe("「39」的 DX 部分没有 Re:MASTER 谱面");
        expect(refsOf(error)).toContain("146-4");
    });

    it("names the side that was looked at only when the song has another", () => {
        const error = caught(() => resolveChart(catalog, { ref: "30", difficulty: "rem" }));

        expect(error.code).toBe("NOT_FOUND");
        // 30 has two sides, so the side is named...
        expect(error.message).toBe("「ネコ日和。」的 SD 部分没有 Re:MASTER 谱面");

        const single = caught(() => resolveChart(catalog, { ref: "8", difficulty: "rem" }));

        // ...and 8 has one, so it is not.
        expect(single.message).toBe("「True Love Song」没有 Re:MASTER 谱面");
    });

    it("is NOT_FOUND for a number that is a title, pointing at the song", () => {
        const error = caught(() => resolveChart(catalog, { ref: "39", difficulty: "mas" }));

        expect(error.code).toBe("NOT_FOUND");
        expect(refsOf(error)).toEqual(["146"]);
        expect(error.fix).toBe("saltnet search 39");
    });

    it("is NOT_FOUND for an unknown id", () => {
        expect(caught(() => resolveChart(catalog, { ref: "9999", difficulty: "mas" })).code).toBe(
            "NOT_FOUND"
        );
    });

    it("finds a banquet chart by its music id", () => {
        expect(keyOf({ ref: "110851", difficulty: "utage" })).toBe("110851-10");
        expect(keyOf({ ref: "110851", difficulty: "10" })).toBe("110851-10");
        expect(keyOf({ ref: "110851", difficulty: "宴" })).toBe("110851-10");
    });
});

describe("a title or alias and a difficulty", () => {
    it("takes the only chart of that difficulty", () => {
        // Only the SD side of these has Re:MASTER.
        expect(keyOf({ ref: "Future", difficulty: "rem" })).toBe("17-4");
        expect(keyOf({ ref: "いーあるふぁんくらぶ", difficulty: "rem" })).toBe("256-4");
        expect(keyOf({ ref: "ジングルベル", difficulty: "rem" })).toBe("70-4");
    });

    it("is AMBIGUOUS_REF when the SD side and the DX side both have it, listing both keys", () => {
        const error = caught(() => resolveChart(catalog, { ref: "ネコ日和。", difficulty: "mas" }));

        expect(error.code).toBe("AMBIGUOUS_REF");
        expect(error.exitCode).toBe(3);
        expect(error.message).toContain("--type");
        expect(error.candidates).toEqual([
            {
                ref: "30-3",
                title: "ネコ日和。",
                type: "SD",
                difficulty: "MASTER",
                level: "12+",
            },
            {
                ref: "10030-3",
                title: "ネコ日和。",
                type: "DX",
                difficulty: "MASTER",
                level: "13+",
            },
        ]);
    });

    it("takes the side --type asks for", () => {
        expect(keyOf({ ref: "ネコ日和。", difficulty: "mas", type: "sd" })).toBe("30-3");
        expect(keyOf({ ref: "ネコ日和。", difficulty: "mas", type: "dx" })).toBe("10030-3");
        expect(keyOf({ ref: "猫咪日和", difficulty: "紫", type: "dx" })).toBe("10030-3");
    });

    it("is NOT_FOUND when the side --type asks for lacks the difficulty", () => {
        const error = caught(() =>
            resolveChart(catalog, { ref: "いーあるふぁんくらぶ", difficulty: "rem", type: "dx" })
        );

        expect(error.code).toBe("NOT_FOUND");
        expect(error.message).toBe("「いーあるふぁんくらぶ」的 DX 部分没有 Re:MASTER 谱面");
    });

    it("is NOT_FOUND when neither side has it, listing the charts the song has", () => {
        const error = caught(() => resolveChart(catalog, { ref: "ネコ日和。", difficulty: "rem" }));

        expect(error.code).toBe("NOT_FOUND");
        expect(error.message).toBe("「ネコ日和。」没有 Re:MASTER 谱面");
        expect(refsOf(error)).toEqual([
            "30-0",
            "30-1",
            "30-2",
            "30-3",
            "10030-0",
            "10030-1",
            "10030-2",
            "10030-3",
        ]);
    });

    it("finds a banquet chart, which counts as DX", () => {
        expect(keyOf({ ref: "[幸]犬日和。(はっぴー歌唱Ver)", difficulty: "utage" })).toBe(
            "110851-10"
        );
        expect(keyOf({ ref: "犬日和。(はっぴー歌唱Ver)", difficulty: "宴", type: "dx" })).toBe(
            "110851-10"
        );
        expect(
            caught(() =>
                resolveChart(catalog, {
                    ref: "犬日和。(はっぴー歌唱Ver)",
                    difficulty: "宴",
                    type: "sd",
                })
            ).code
        ).toBe("NOT_FOUND");
    });

    it("passes on an ambiguous or unknown song as it is", () => {
        const ambiguous = caught(() => resolveChart(catalog, { ref: "link", difficulty: "mas" }));

        expect(ambiguous.code).toBe("AMBIGUOUS_REF");
        expect(refsOf(ambiguous)).toEqual(["131", "383"]);
        expect(
            caught(() => resolveChart(catalog, { ref: "zzzzzzzzzz", difficulty: "mas" })).code
        ).toBe("NOT_FOUND");
    });
});

describe("--type with a key or an id", () => {
    it("accepts the type the chart has", () => {
        expect(keyOf({ ref: "146-3", type: "sd" })).toBe("146-3");
        expect(keyOf({ ref: "10146-3", type: "dx" })).toBe("10146-3");
        expect(keyOf({ ref: "10146", difficulty: "mas", type: "dx" })).toBe("10146-3");
    });

    it("is NOT_FOUND for the other type, pointing at the chart of that type", () => {
        const byKey = caught(() => resolveChart(catalog, { ref: "146-3", type: "dx" }));

        expect(byKey.code).toBe("NOT_FOUND");
        expect(byKey.message).toBe("谱面 146-3 是 SD 谱面，和 --type dx 不符");
        expect(refsOf(byKey)).toEqual(["10146-3"]);

        const byId = caught(() =>
            resolveChart(catalog, { ref: "10146", difficulty: "mas", type: "sd" })
        );

        expect(refsOf(byId)).toEqual(["146-3"]);
    });

    it("has nothing to point at when the song has no chart of that type", () => {
        const error = caught(() => resolveChart(catalog, { ref: "131-3", type: "dx" }));

        expect(error.code).toBe("NOT_FOUND");
        expect(error.candidates).toEqual([]);
    });
});

describe("a missing or unknown difficulty", () => {
    it("is a usage error when a song reference has none", () => {
        for (const ref of ["Future", "146", "link"]) {
            const error = caught(() => resolveChart(catalog, { ref }));

            expect(error.code, ref).toBe("USAGE");
            expect(error.message, ref).toContain("缺少难度");
        }
    });

    it("is a usage error when the difficulty is not one, offering the nearest", () => {
        const error = caught(() => resolveChart(catalog, { ref: "Future", difficulty: "mastr" }));

        expect(error.code).toBe("USAGE");
        expect(error.message).toContain("无法识别的难度「mastr」");
        expect(refsOf(error)).toEqual(["mas"]);
    });

    it("is checked before the song is looked up", () => {
        const error = caught(() =>
            resolveChart(catalog, { ref: "zzzzzzzzzz", difficulty: "nope" })
        );

        expect(error.code).toBe("USAGE");
    });
});

describe("an empty reference", () => {
    it("is a usage error", () => {
        for (const ref of ["", "  "]) {
            expect(caught(() => resolveChart(catalog, { ref, difficulty: "mas" })).code).toBe(
                "USAGE"
            );
        }
    });
});
