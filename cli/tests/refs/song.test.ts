import type { Music } from "@core/music/type";
import { ChartType } from "@core/mai/types";
import { indexMusicSearchData } from "@core/music/search";
import { describe, expect, it } from "vitest";
import { buildSongCatalog } from "../../src/catalog/songs";
import { MAX_AMBIGUOUS_CANDIDATES, resolveSong } from "../../src/refs/song";
import { caught } from "../caught";
import { fixtureSongCatalog } from "../fixtureCatalog";

const catalog = fixtureSongCatalog();

const idOf = (ref: string): number => resolveSong(catalog, ref).id;
function refsOf(error: { candidates?: readonly { ref: string }[] }): string[] {
    return (error.candidates ?? []).map(candidate => candidate.ref);
}

/** A catalog of made-up songs, for the cases the fixed fixture has no example of. */
function catalogOf(entries: { id: number; title: string; aliases?: string[] }[]) {
    const musicList: Record<number, Music> = {};
    for (const entry of entries) {
        musicList[entry.id] = {
            id: entry.id,
            info: {
                id: entry.id,
                title: entry.title,
                aliases: entry.aliases,
                artist: "someone",
                genre: "舞萌" as never,
                bpm: 120,
                from: "舞萌DX" as never,
                isNew: false,
                type: ChartType.Standard,
            },
            charts: [],
        };
    }
    return buildSongCatalog(indexMusicSearchData({ musicList, chartList: {} }));
}

describe("a number", () => {
    it("is a music id", () => {
        expect(idOf("17")).toBe(17);
        expect(resolveSong(catalog, "17").title).toBe("Future");
    });

    it("gives the same song for the SD id and the DX id", () => {
        expect(resolveSong(catalog, "146")).toBe(resolveSong(catalog, "10146"));
        expect(idOf("11726")).toBe(1726);
        expect(idOf("110851")).toBe(100851);
    });

    it("ignores spaces around it", () => {
        expect(idOf("  17 ")).toBe(17);
    });

    it("is NOT_FOUND when no song has the id", () => {
        const error = caught(() => resolveSong(catalog, "9999"));

        expect(error.code).toBe("NOT_FOUND");
        expect(error.exitCode).toBe(3);
        expect(error.message).toContain("「9999」");
        expect(error.candidates).toEqual([]);
        expect(error.fix).toBe("saltnet search 9999");
    });

    it("does not look for a song titled with the number, but offers it", () => {
        const error = caught(() => resolveSong(catalog, "39"));

        expect(error.code).toBe("NOT_FOUND");
        expect(error.message).toContain("search");
        expect(error.candidates).toEqual([
            {
                ref: "146",
                title: "39",
                artist: "sasakure.UK x DECO*27",
                type: "SD+DX",
            },
        ]);
        expect(error.fix).toBe("saltnet search 39");
    });

    it("offers a song that has the number as an alias", () => {
        expect(refsOf(caught(() => resolveSong(catalog, "12")))).toEqual(["256"]);
    });

    it("offers the DX song when the offset was left off its id", () => {
        expect(refsOf(caught(() => resolveSong(catalog, "1726")))).toEqual(["11726"]);
    });

    it("is NOT_FOUND for a number too large to be an id, without repeating a long one", () => {
        expect(caught(() => resolveSong(catalog, "99999999999999999999")).code).toBe("NOT_FOUND");

        const error = caught(() => resolveSong(catalog, "1".repeat(60)));
        expect(error.code).toBe("NOT_FOUND");
        expect(error.message).not.toContain("1111");
        expect(error.fix).toBeUndefined();
    });
});

describe("a chart key", () => {
    it("names the song the chart belongs to", () => {
        expect(idOf("146-3")).toBe(146);
        expect(idOf("10146-3")).toBe(146);
        expect(idOf("110851-10")).toBe(100851);
    });

    it("is NOT_FOUND when the song has no such chart, listing the charts it has", () => {
        const error = caught(() => resolveSong(catalog, "10146-4"));

        expect(error.code).toBe("NOT_FOUND");
        expect(error.message).toContain("Re:MASTER");
        expect(refsOf(error)).toEqual([
            "146-0",
            "146-1",
            "146-2",
            "146-3",
            "146-4",
            "10146-0",
            "10146-1",
            "10146-2",
            "10146-3",
        ]);
    });

    it("is NOT_FOUND when there is no such song", () => {
        const error = caught(() => resolveSong(catalog, "9999-3"));

        expect(error.code).toBe("NOT_FOUND");
        expect(error.message).toContain("「9999」");
    });
});

describe("an exact title", () => {
    it("finds the song", () => {
        expect(idOf("Future")).toBe(17);
        expect(idOf("ネコ日和。")).toBe(30);
    });

    it("finds a song whose title has two sides as one song", () => {
        const song = resolveSong(catalog, "ジングルベル");

        expect(song.id).toBe(70);
        expect(song.dx?.id).toBe(10070);
    });

    it("prefers the title as written, so that TRUST is not ambiguous with Trust", () => {
        expect(idOf("TRUST")).toBe(695);
        expect(idOf("Trust")).toBe(1726);
    });

    it("then ignores case and width", () => {
        expect(idOf("future")).toBe(17);
        expect(idOf("ＦＵＴＵＲＥ")).toBe(17);
        expect(idOf("＊ハロー、プラネット。")).toBe(185);
        expect(idOf("*ハロー、プラネット。")).toBe(185);
        expect(idOf("ﾈｺ日和｡")).toBe(30);
    });

    it("ignores spaces around the text", () => {
        expect(idOf("  Future  ")).toBe(17);
    });

    it("is AMBIGUOUS_REF when two songs share the title, listing both", () => {
        const error = caught(() => resolveSong(catalog, "Link"));

        expect(error.code).toBe("AMBIGUOUS_REF");
        expect(error.exitCode).toBe(3);
        expect(error.retryable).toBe(false);
        expect(error.message).toBe("「Link」对应 2 首歌");
        expect(error.candidates).toEqual([
            { ref: "131", title: "Link", artist: "Clean Tears feat. Youna", type: "SD" },
            {
                ref: "383",
                title: "Link",
                artist: "Circle of friends(天月-あまつき-・un:c・伊東歌詞太郎・コニー・はしやん)",
                type: "SD",
            },
        ]);
        expect(error.fix).toBeUndefined();
    });

    it("is ambiguous when only the case differs and there are two such titles", () => {
        const error = caught(() => resolveSong(catalog, "trust"));

        expect(error.code).toBe("AMBIGUOUS_REF");
        expect(error.candidates).toEqual([
            {
                ref: "695",
                title: "TRUST",
                artist: "小仏 凪(CV:佐倉 薫)",
                type: "SD",
            },
            {
                ref: "11726",
                title: "Trust",
                artist: "Massive New Krew feat. 光吉猛修",
                type: "DX",
            },
        ]);
    });

    it("finds a banquet song by its title, and by the title of the entry it was merged with", () => {
        expect(idOf("[幸]犬日和。(はっぴー歌唱Ver)")).toBe(100851);
        expect(idOf("犬日和。(はっぴー歌唱Ver)")).toBe(100851);
        expect(idOf("[宴]Oshama Scramble! (Cranky Remix)")).toBe(100998);
        expect(idOf("Oshama Scramble! (Cranky Remix)")).toBe(100998);
    });
});

describe("an exact alias", () => {
    it("finds the song", () => {
        expect(idOf("猫咪日和")).toBe(30);
        expect(idOf("快乐合成器")).toBe(44);
        expect(idOf("ew")).toBe(58);
    });

    it("ignores case and width too", () => {
        expect(idOf("EW")).toBe(58);
        expect(idOf("ＥＷ")).toBe(58);
    });

    it("is AMBIGUOUS_REF when two songs share it", () => {
        const error = caught(() => resolveSong(catalog, "cof"));

        expect(error.code).toBe("AMBIGUOUS_REF");
        expect(refsOf(error)).toEqual(["131", "383"]);
    });
});

describe("the order of the steps", () => {
    const made = catalogOf([
        { id: 1, title: "alpha" },
        { id: 2, title: "Beta", aliases: ["ALPHA", "Gamma"] },
        { id: 3, title: "Gamma ray" },
        { id: 4, title: "GAMMA" },
        { id: 5, title: "gamma" },
    ]);

    it("takes a title ignoring case before an alias as written", () => {
        expect(resolveSong(made, "ALPHA").id).toBe(1);
    });

    it("takes a title as written before a title ignoring case", () => {
        expect(resolveSong(made, "GAMMA").id).toBe(4);
        expect(resolveSong(made, "gamma").id).toBe(5);
    });

    it("stops at the titles even when an alias would have settled it", () => {
        // "Gamma" is the exact alias of song 2, but two titles match it ignoring case.
        const error = caught(() => resolveSong(made, "Gamma"));

        expect(error.code).toBe("AMBIGUOUS_REF");
        expect(refsOf(error)).toEqual(["4", "5"]);
    });

    it("takes an alias before the index", () => {
        const aliased = catalogOf([
            { id: 1, title: "x", aliases: ["ab"] },
            { id: 2, title: "abc" },
        ]);

        // The index would find "ab" inside both songs.
        expect(resolveSong(aliased, "ab").id).toBe(1);
        expect(resolveSong(aliased, "AB").id).toBe(1);
    });

    it("only reaches the index when no name is exact", () => {
        expect(resolveSong(made, "ray").id).toBe(3);
    });
});

describe("the search index", () => {
    it("finds a song by a romanization of its title", () => {
        expect(idOf("yubikiri")).toBe(236);
        expect(idOf("neko")).toBe(30);
    });

    it("finds a song by the pinyin of an alias", () => {
        expect(idOf("lagougou")).toBe(236);
    });

    it("finds a song by the traditional form of an alias", () => {
        expect(idOf("會員制餐廳")).toBe(8);
    });

    it("finds a song by part of a title, ignoring spaces and punctuation", () => {
        expect(idOf("true love")).toBe(8);
        expect(idOf("trueloves")).toBe(8);
    });

    it("does not take an artist's name for the name of a song", () => {
        for (const artist of ["Youna", "sasakure", "t+pazolite"]) {
            expect(caught(() => resolveSong(catalog, artist)).code, artist).toBe("NOT_FOUND");
        }
    });

    it("is AMBIGUOUS_REF when several songs match, listing at most ten", () => {
        const error = caught(() => resolveSong(catalog, "o"));

        expect(error.code).toBe("AMBIGUOUS_REF");
        expect(error.candidates).toHaveLength(MAX_AMBIGUOUS_CANDIDATES);
        expect(error.message).toMatch(/^「o」对应 \d+ 首歌，只列出前 10 首$/);
        expect(error.fix).toBe("saltnet search o");
        // In order of id.
        const ids = refsOf(error).map(Number);
        expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    it("counts a song once although both of its sides match", () => {
        // Both the SD and the DX side of ジングルベル carry the name; it is still one song.
        expect(idOf("jingurube")).toBe(70);
    });
});

describe("nothing matches", () => {
    it("is NOT_FOUND with the nearest songs", () => {
        const error = caught(() => resolveSong(catalog, "Linkk"));

        expect(error.code).toBe("NOT_FOUND");
        expect(error.message).toBe("找不到曲目「Linkk」");
        expect(refsOf(error)).toEqual(["131", "383"]);
        expect(error.fix).toBe("saltnet search Linkk");
        expect(error.candidates?.[0]).toMatchObject({ title: "Link", type: "SD" });
    });

    it("offers a song for a slip in an alias too", () => {
        expect(refsOf(caught(() => resolveSong(catalog, "猫咪日合")))).toEqual(["30"]);
    });

    it("lists no candidates when nothing is near, and still suggests search", () => {
        const error = caught(() => resolveSong(catalog, "zzzzzzzzzz"));

        expect(error.code).toBe("NOT_FOUND");
        expect(error.candidates).toEqual([]);
        expect(error.fix).toBe("saltnet search zzzzzzzzzz");
    });

    it("does not repeat text it cannot be sure is harmless", () => {
        const error = caught(() => resolveSong(catalog, "True Love Sing"));

        expect(error.code).toBe("NOT_FOUND");
        expect(error.message).not.toContain("Sing");
        expect(error.fix).toBeUndefined();
        expect(refsOf(error)).toEqual(["8"]);
    });

    it("is NOT_FOUND for text with nothing in it to look up", () => {
        expect(caught(() => resolveSong(catalog, "!!!")).code).toBe("NOT_FOUND");
    });
});

describe("an empty reference", () => {
    it("is a usage error", () => {
        for (const text of ["", "   "]) {
            const error = caught(() => resolveSong(catalog, text));

            expect(error.code).toBe("USAGE");
            expect(error.exitCode).toBe(2);
        }
    });
});
