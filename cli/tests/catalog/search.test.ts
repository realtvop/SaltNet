import { describe, expect, it } from "vitest";
import { MATCH_KINDS, NAME_MATCH_KINDS, searchSongs } from "../../src/catalog/search";
import { songCharts } from "../../src/catalog/songs";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { catalogOf } from "../madeCatalog";

describe("searchSongs match kinds and basic options", () => {
    it("defines MATCH_KINDS and NAME_MATCH_KINDS with expected values in order.", () => {
        expect(MATCH_KINDS).toEqual([
            "id",
            "title",
            "alias",
            "pinyin",
            "romaji",
            "artist",
            "charter",
        ]);
        expect(NAME_MATCH_KINDS).toEqual(["title", "alias", "pinyin", "romaji"]);
    });

    it("returns an empty list when given a blank or whitespace-only query.", () => {
        const catalog = fixtureSongCatalog();
        expect(searchSongs(catalog, "")).toEqual([]);
        expect(searchSongs(catalog, "   ")).toEqual([]);
        expect(searchSongs(catalog, "\t\n")).toEqual([]);
    });

    it("finds songs even when their search index has not been precomputed.", () => {
        const unindexed = catalogOf([{ id: 1, title: "abc" }], { indexed: false });
        const matches = searchSongs(unindexed, "bc");
        expect(matches).toHaveLength(1);
        expect(matches[0].song).toBe(unindexed.songs[0]);
        expect(matches[0].song.id).toBe(1);
        expect(matches[0].matchedBy).toContain("title");
    });
});

describe("searchSongs ranking tiers", () => {
    it("ranks exact title above folded title.", () => {
        const catalog = catalogOf([
            { id: 2, title: "ABC" },
            { id: 3, title: "Abc" },
        ]);
        const results = searchSongs(catalog, "Abc");
        expect(results.map(r => r.song.id)).toEqual([3, 2]);
        expect(results[0].score).toBeGreaterThan(results[1].score);
        expect(results[0].song).toBe(catalog.songs.find(s => s.id === 3));
        expect(results[1].song).toBe(catalog.songs.find(s => s.id === 2));
    });

    it("ranks exact title above folded title and music id.", () => {
        const catalog = catalogOf([
            { id: 12, title: "zzz" },
            { id: 20, title: "１２" },
            { id: 30, title: "12" },
        ]);
        const results = searchSongs(catalog, "12");
        expect(results.map(r => r.song.id)).toEqual([30, 20, 12]);
        expect(results[0].score).toBeGreaterThan(results[1].score);
        expect(results[1].score).toBeGreaterThan(results[2].score);
    });

    it("ranks music id above exact alias.", () => {
        const catalog = catalogOf([
            { id: 5, title: "x", aliases: ["12"] },
            { id: 12, title: "zzz" },
        ]);
        const results = searchSongs(catalog, "12");
        expect(results.map(r => r.song.id)).toEqual([12, 5]);
        expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("ranks exact alias above folded alias.", () => {
        const catalog = catalogOf([
            { id: 8, title: "x", aliases: ["ABC"] },
            { id: 9, title: "y", aliases: ["Abc"] },
        ]);
        const results = searchSongs(catalog, "Abc");
        expect(results.map(r => r.song.id)).toEqual([9, 8]);
        expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("ranks folded alias above title normalized equality.", () => {
        const catalog = catalogOf([
            { id: 5, title: "a-b-c" },
            { id: 6, title: "q", aliases: ["ABC"] },
        ]);
        const results = searchSongs(catalog, "abc");
        expect(results.map(r => r.song.id)).toEqual([6, 5]);
        expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("ranks title normalized equality above alias normalized equality.", () => {
        const catalog = catalogOf([
            { id: 3, title: "q", aliases: ["a.b.c"] },
            { id: 4, title: "abc!" },
        ]);
        const results = searchSongs(catalog, "abc");
        expect(results.map(r => r.song.id)).toEqual([4, 3]);
        expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("ranks alias normalized equality above title prefix match.", () => {
        const catalog = catalogOf([
            { id: 2, title: "abcdef" },
            { id: 3, title: "q", aliases: ["a.b.c"] },
        ]);
        const results = searchSongs(catalog, "abc");
        expect(results.map(r => r.song.id)).toEqual([3, 2]);
        expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("ranks title prefix match above title containment.", () => {
        const catalog = catalogOf([
            { id: 2, title: "xabc" },
            { id: 3, title: "abcx" },
        ]);
        const results = searchSongs(catalog, "abc");
        expect(results.map(r => r.song.id)).toEqual([3, 2]);
        expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("ranks title containment above alias containment.", () => {
        const catalog = catalogOf([
            { id: 2, title: "q", aliases: ["abcd"] },
            { id: 3, title: "xabcx" },
        ]);
        const results = searchSongs(catalog, "abc");
        expect(results.map(r => r.song.id)).toEqual([3, 2]);
        expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("ranks alias containment above sound match in title or alias.", () => {
        const catalog = catalogOf([
            { id: 2, title: "世界" },
            { id: 3, title: "q", aliases: ["xshix"] },
        ]);
        const results = searchSongs(catalog, "shi");
        expect(results.map(r => r.song.id)).toEqual([3, 2]);
        expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("ranks sound match in title or alias above artist containment.", () => {
        const catalog = catalogOf([
            { id: 2, title: "q", artist: "bshib" },
            { id: 3, title: "世界" },
        ]);
        const results = searchSongs(catalog, "shi");
        expect(results.map(r => r.song.id)).toEqual([3, 2]);
        expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("ranks artist containment above charter containment.", () => {
        const catalog = catalogOf([
            { id: 3, title: "r", artist: "x", charter: "kamo" },
            { id: 9, title: "q", artist: "kamo" },
        ]);
        const results = searchSongs(catalog, "kamo");
        expect(results.map(r => r.song.id)).toEqual([9, 3]);
        expect(results[0].matchedBy).toEqual(["artist"]);
        expect(results[1].matchedBy).toEqual(["charter"]);
        expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("sorts songs with equal scores in ascending order of music id.", () => {
        const catalog = catalogOf([
            { id: 9, title: "abc1" },
            { id: 4, title: "abc2" },
            { id: 6, title: "abc3" },
        ]);
        const results = searchSongs(catalog, "abc");
        expect(results.map(r => r.song.id)).toEqual([4, 6, 9]);
    });

    it("matches punctuation-only text only by exact or folded equality.", () => {
        const catalog = catalogOf([{ id: 1, title: "!!!" }]);
        expect(searchSongs(catalog, "!!!")).toHaveLength(1);
        expect(searchSongs(catalog, "!!")).toHaveLength(0);

        const fixture = fixtureSongCatalog();
        expect(searchSongs(fixture, "...")).toHaveLength(0);
    });
});

describe("searchSongs fixture queries", () => {
    const catalog = fixtureSongCatalog();

    it("finds songs matching both title and alias in ascending music id order.", () => {
        const matches = searchSongs(catalog, "Link");
        expect(matches).toHaveLength(2);
        expect(matches.map(m => m.song.musicId)).toEqual([131, 383]);
        expect(matches[0].matchedBy).toEqual(["title", "alias"]);
        expect(matches[1].matchedBy).toEqual(["title", "alias"]);
    });

    it("prioritizes exact case matches over folded case and falls back to music id.", () => {
        const trustUpper = searchSongs(catalog, "TRUST");
        expect(trustUpper.slice(0, 2).map(r => r.song.musicId)).toEqual([695, 11726]);

        const trustMixed = searchSongs(catalog, "Trust");
        expect(trustMixed.slice(0, 2).map(r => r.song.musicId)).toEqual([11726, 695]);

        const trustLower = searchSongs(catalog, "trust");
        expect(trustLower.slice(0, 2).map(r => r.song.musicId)).toEqual([695, 11726]);
    });

    it("finds songs by full-width or half-width title spellings.", () => {
        const future = searchSongs(catalog, "ＦＵＴＵＲＥ");
        expect(future[0].song.musicId).toBe(17);
        expect(future[0].matchedBy).toContain("title");

        const neko = searchSongs(catalog, "ﾈｺ日和｡");
        expect(neko[0].song.musicId).toBe(30);
        expect(neko[0].matchedBy).toContain("title");
    });

    it("finds songs by normalized title or traditional-script alias.", () => {
        const love = searchSongs(catalog, "true love");
        expect(love[0].song.musicId).toBe(8);
        expect(love[0].matchedBy).toContain("title");

        const restaurant = searchSongs(catalog, "會員制餐廳");
        expect(restaurant[0].song.musicId).toBe(8);
        expect(restaurant[0].matchedBy).toContain("alias");
    });

    it("finds songs by alias initials.", () => {
        const cmw = searchSongs(catalog, "cmw");
        expect(cmw[0].song.musicId).toBe(9);
        expect(cmw[0].matchedBy).toEqual(["alias"]);
    });

    it("finds songs by romaji, pinyin, or pinyin initials.", () => {
        const romaji = searchSongs(catalog, "yubikiri");
        expect(romaji).toHaveLength(1);
        expect(romaji[0].song.musicId).toBe(236);
        expect(romaji[0].matchedBy).toEqual(["romaji"]);

        const pinyin = searchSongs(catalog, "lagougou");
        expect(pinyin).toHaveLength(1);
        expect(pinyin[0].song.musicId).toBe(236);
        expect(pinyin[0].matchedBy).toEqual(["pinyin"]);

        const initials = searchSongs(catalog, "lgg");
        const match236 = initials.find(m => m.song.musicId === 236);
        expect(match236).toBeDefined();
        expect(match236?.matchedBy).toContain("pinyin");

        const nekoResults = searchSongs(catalog, "neko");
        const match30 = nekoResults.find(m => m.song.musicId === 30);
        expect(match30).toBeDefined();
        expect(match30?.matchedBy).toContain("romaji");
    });

    it("finds songs by artist name.", () => {
        const youna = searchSongs(catalog, "Youna");
        expect(youna).toHaveLength(1);
        expect(youna[0].song.musicId).toBe(131);
        expect(youna[0].matchedBy).toEqual(["artist"]);

        const sasakure = searchSongs(catalog, "sasakure");
        expect(sasakure).toHaveLength(2);
        expect(sasakure.map(m => m.song.musicId)).toEqual([146, 185]);
        expect(sasakure[0].matchedBy).toEqual(["artist"]);
        expect(sasakure[1].matchedBy).toEqual(["artist"]);

        const tpaz = searchSongs(catalog, "t+pazolite");
        expect(tpaz).toHaveLength(2);
        expect(tpaz.map(m => m.song.musicId)).toEqual([431, 110227]);
        expect(tpaz[0].matchedBy).toEqual(["artist"]);
        expect(tpaz[1].matchedBy).toEqual(["artist"]);
    });

    it("finds songs by charter name in ascending music id order.", () => {
        const expectedSongs = catalog.songs
            .filter(song => songCharts(song).some(chart => chart.info.charter === "Luxizhel"))
            .sort((a, b) => a.musicId - b.musicId);
        expect(expectedSongs.length).toBeGreaterThanOrEqual(3);

        const matches = searchSongs(catalog, "Luxizhel");
        expect(matches.length).toBe(expectedSongs.length);
        expect(matches.map(m => m.song.musicId)).toEqual(expectedSongs.map(s => s.musicId));
        for (const match of matches) {
            expect(match.matchedBy).toEqual(["charter"]);
        }
    });

    it("finds songs by SD or DX music id.", () => {
        const match8 = searchSongs(catalog, "8");
        expect(match8[0].song.musicId).toBe(8);
        expect(match8[0].matchedBy).toContain("id");

        const match10146 = searchSongs(catalog, "10146");
        expect(match10146[0].song.musicId).toBe(146);
        expect(match10146[0].matchedBy).toContain("id");

        const match146 = searchSongs(catalog, "146");
        expect(match146[0].song.musicId).toBe(146);
        expect(match146[0].matchedBy).toContain("id");

        const match11726 = searchSongs(catalog, "11726");
        expect(match11726).toHaveLength(1);
        expect(match11726[0].song.id).toBe(1726);
        expect(match11726[0].matchedBy).toEqual(["id"]);

        const match110018 = searchSongs(catalog, "110018");
        expect(match110018).toHaveLength(1);
        expect(match110018[0].song.id).toBe(100018);
        expect(match110018[0].matchedBy).toEqual(["id"]);

        const match1726 = searchSongs(catalog, "1726");
        expect(match1726.some(m => m.matchedBy.includes("id"))).toBe(false);
        expect(match1726.some(m => m.song.id === 1726)).toBe(false);
        expect(match1726).toHaveLength(0);
    });

    it("ranks title match over music id when the title is a number.", () => {
        const match39 = searchSongs(catalog, "39");
        expect(match39[0].song.musicId).toBe(146);
        expect(match39[0].matchedBy).toContain("title");
    });

    it("maintains invariant match properties across diverse search queries.", () => {
        const queries = ["o", "a", "love", "trust", "t", "の", "11726", "Link"];

        for (const query of queries) {
            const matches1 = searchSongs(catalog, query);
            const matches2 = searchSongs(catalog, query);

            expect(matches1).toEqual(matches2);

            const seenSongs = new Set<number>();
            let previousScore = Number.POSITIVE_INFINITY;

            for (const match of matches1) {
                expect(match.matchedBy.length).toBeGreaterThan(0);
                expect(new Set(match.matchedBy).size).toBe(match.matchedBy.length);

                let previousKindIndex = -1;
                for (const kind of match.matchedBy) {
                    const kindIndex = MATCH_KINDS.indexOf(kind);
                    expect(kindIndex).toBeGreaterThan(previousKindIndex);
                    previousKindIndex = kindIndex;
                }

                expect(match.score).toBeLessThanOrEqual(previousScore);
                previousScore = match.score;

                expect(seenSongs.has(match.song.id)).toBe(false);
                seenSongs.add(match.song.id);
            }
        }
    });
});
