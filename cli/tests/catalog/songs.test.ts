import type { Music, SavedMusicList } from "@core/music/type";
import { ChartType } from "@core/mai/types";
import { describe, expect, it } from "vitest";
import {
    buildSongCatalog,
    chartKey,
    chartKeyOf,
    musicType,
    songCharts,
    songType,
} from "../../src/catalog/songs";
import { fixtureSongCatalog } from "../fixtureCatalog";

const catalog = fixtureSongCatalog();

function song(musicId: number) {
    const found = catalog.songOfMusic.get(musicId);
    if (!found) throw new Error(`the fixture has no music ${musicId}`);
    return found;
}

describe("buildSongCatalog", () => {
    it("puts the SD and the DX side of a song together", () => {
        const both = song(146);

        expect(both.id).toBe(146);
        expect(both.musicId).toBe(146);
        expect(both.title).toBe("39");
        expect(both.artist).toBe("sasakure.UK x DECO*27");
        expect(both.sd?.id).toBe(146);
        expect(both.dx?.id).toBe(10146);
        expect(songType(both)).toBe("SD+DX");
    });

    it("gives the SD id and the DX id of a song the same song", () => {
        expect(song(10146)).toBe(song(146));
        expect(song(10030)).toBe(song(30));
    });

    it("knows a song with only SD charts", () => {
        const sdOnly = song(131);

        expect(sdOnly.dx).toBeUndefined();
        expect(sdOnly.sd?.id).toBe(131);
        expect(songType(sdOnly)).toBe("SD");
    });

    it("knows a song with only DX charts by its DX music id", () => {
        const dxOnly = song(11726);

        expect(dxOnly.id).toBe(1726);
        expect(dxOnly.musicId).toBe(11726);
        expect(dxOnly.sd).toBeUndefined();
        expect(songType(dxOnly)).toBe("DX");
        expect(catalog.songOfMusic.has(1726)).toBe(false);
    });

    it("counts a banquet song as DX, with an id above 100000", () => {
        const banquet = song(110851);

        expect(banquet.id).toBe(100851);
        expect(banquet.musicId).toBe(110851);
        expect(songType(banquet)).toBe("DX");
        expect(banquet.title).toBe("[幸]犬日和。(はっぴー歌唱Ver)");
    });

    it("lists songs by ascending id, one per SaltMeta entry", () => {
        const ids = catalog.songs.map(entry => entry.id);

        expect(ids).toEqual([...ids].sort((a, b) => a - b));
        expect(new Set(ids).size).toBe(ids.length);
        // 50 music objects, 11 of them the DX side of a song that also has an SD side.
        expect(catalog.songs).toHaveLength(39);
        expect(catalog.songOfMusic.size).toBe(50);
    });

    it("merges the aliases of both sides without repeating them", () => {
        expect(song(146).aliases).toEqual(["39", "标39", "初音未来"]);
    });

    it("indexes every chart once, by its key", () => {
        const total = catalog.songs.reduce(
            (count, entry) =>
                count + (entry.sd?.charts.length ?? 0) + (entry.dx?.charts.length ?? 0),
            0
        );

        expect(total).toBeGreaterThan(100);
        expect(catalog.chartByKey.size).toBe(total);
        expect(catalog.chartByKey.get("146-3")?.chart.info.level).toBe("13");
        expect(catalog.chartByKey.get("10146-3")?.chart.info.level).toBe("12+");
        expect(catalog.chartByKey.get("110851-10")?.song.id).toBe(100851);
        expect(catalog.chartByKey.get("146-10")).toBeUndefined();
    });

    it("finds songs by title as written, and again with case and width folded", () => {
        expect(catalog.byTitle.get("TRUST")?.map(entry => entry.id)).toEqual([695]);
        expect(catalog.byTitle.get("trust")).toBeUndefined();
        expect(catalog.byFoldedTitle.get("trust")?.map(entry => entry.id)).toEqual([695, 1726]);
        expect(catalog.byFoldedTitle.get("link")?.map(entry => entry.id)).toEqual([131, 383]);
        expect(catalog.byFoldedTitle.get("＊ハロー、プラネット。")).toBeUndefined();
        expect(catalog.byFoldedTitle.get("*ハロー、プラネット。")?.map(entry => entry.id)).toEqual([
            185,
        ]);
    });

    it("finds songs by alias as written, and again with case and width folded", () => {
        expect(catalog.byAlias.get("cof")?.map(entry => entry.id)).toEqual([131, 383]);
        expect(catalog.byAlias.get("COF")).toBeUndefined();
        expect(catalog.byFoldedAlias.get("cof")?.map(entry => entry.id)).toEqual([131, 383]);
        expect(catalog.byAlias.get("猫咪日和")?.map(entry => entry.id)).toEqual([30]);
    });

    it("does not list a song twice when its title and its alias are the same", () => {
        expect(catalog.byTitle.get("39")).toHaveLength(1);
        expect(catalog.byAlias.get("39")).toHaveLength(1);
    });
});

describe("songCharts", () => {
    it("lists the SD charts and then the DX charts, each from the easiest", () => {
        expect(songCharts(song(146)).map(chartKeyOf)).toEqual([
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

    it("lists only the side a song has", () => {
        expect(songCharts(song(131)).map(chartKeyOf)).toEqual([
            "131-0",
            "131-1",
            "131-2",
            "131-3",
            "131-4",
        ]);
        expect(songCharts(song(110851)).map(chartKeyOf)).toEqual(["110851-10"]);
    });
});

describe("chart keys and types", () => {
    it("writes a key as the music id and the grade", () => {
        expect(chartKey(11451, 3)).toBe("11451-3");
        expect(chartKey(110851, 10)).toBe("110851-10");
        expect(chartKeyOf(song(131).sd!.charts[2])).toBe("131-2");
    });

    it("types a music object, counting a banquet song as DX", () => {
        expect(musicType(song(146).sd!)).toBe("SD");
        expect(musicType(song(146).dx!)).toBe("DX");
        expect(musicType(song(110851).dx!)).toBe("DX");
    });
});

describe("a catalog with unusual data", () => {
    function music(id: number, type: ChartType, extra: Partial<Music["info"]> = {}): Music {
        return {
            id,
            info: {
                id,
                title: `song ${id}`,
                artist: "someone",
                genre: "舞萌" as never,
                bpm: 120,
                from: "舞萌DX" as never,
                isNew: false,
                type,
                ...extra,
            },
            charts: [],
        };
    }

    it("copes with an empty list", () => {
        const empty = buildSongCatalog({ musicList: {}, chartList: {} });

        expect(empty.songs).toEqual([]);
        expect(empty.chartByKey.size).toBe(0);
    });

    it("ignores blank aliases", () => {
        const list: SavedMusicList = {
            musicList: { 5: music(5, ChartType.Standard, { aliases: ["", "  ", "five"] }) },
            chartList: {},
        };

        expect(buildSongCatalog(list).songs[0].aliases).toEqual(["five"]);
    });

    it("takes the title of the SD side when both sides are present", () => {
        const list: SavedMusicList = {
            musicList: {
                10005: music(10005, ChartType.Deluxe, { title: "five (DX)" }),
                5: music(5, ChartType.Standard, { title: "five" }),
            },
            chartList: {},
        };

        const [only] = buildSongCatalog(list).songs;

        expect(only.title).toBe("five");
        expect(only.musicId).toBe(5);
    });
});
