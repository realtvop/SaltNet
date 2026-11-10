import type { Store } from "../../src/store/store";
import { mapLXNSCollections } from "@core/collection/map";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { buildSaltMetaMusicList } from "@core/music/fetch";
import { matchesMusicSearchIndex } from "@core/music/search";
import { afterEach, describe, expect, it } from "vitest";
import { loadCollectionLists, loadCollections, loadMusic } from "../../src/catalog/load";
import { replaceCollections, replaceMusic } from "../../src/catalog/store";
import { openStore } from "../../src/store/store";
import { useTempHome } from "../tempHome";

const home = useTempHome();
const opened: Store[] = [];

afterEach(() => {
    for (const store of opened.splice(0)) store.close();
});

function open(): Store {
    const store = openStore(home());
    opened.push(store);
    return store;
}

function buildMusic() {
    return buildSaltMetaMusicList(getFixtureSaltMetaCompacted(), { mergeDuplicates: true });
}

function filled(): Store {
    const store = open();
    replaceMusic(store, buildMusic(), { fetchedAt: 1000, upstreamVersion: "1" });
    replaceCollections(store, getFixtureLXNSCollections(), { fetchedAt: 2000 });
    return store;
}

describe("loading the music", () => {
    it("finds nothing before the first refresh", () => {
        const store = open();
        expect(loadMusic(store)).toBeUndefined();
        expect(loadCollections(store)).toBeUndefined();
    });

    it("gives back exactly what the web app builds from the same document", () => {
        const store = filled();
        const built = buildMusic();
        const loaded = loadMusic(store);

        expect(loaded?.music).toEqual(built.music);
        expect(loaded?.metadata).toEqual(built.metadata);
        expect(loaded?.fetchedAt).toBe(1000);
    });

    it("links every chart to its song, and lists every chart by id", () => {
        const loaded = loadMusic(filled());
        if (!loaded) throw new Error("nothing was loaded");
        const { musicList, chartList } = loaded.music;

        expect(Object.keys(musicList)).toHaveLength(50);
        expect(Object.keys(chartList)).toHaveLength(183);
        expect(chartList[800].music).toBe(musicList[8]);
        for (const music of Object.values(musicList)) {
            for (const chart of music.charts) {
                expect(chart.music).toBe(music);
                expect(chartList[chart.id]).toBe(chart);
            }
        }
    });

    it("keeps the charts of a song in their order", () => {
        const loaded = loadMusic(filled());
        expect(loaded?.music.musicList[17].charts.map(chart => chart.info.grade)).toEqual([
            0, 1, 2, 3, 4,
        ]);
    });

    it("keeps what upstream left out of a banquet song as null, as the web app does", () => {
        const loaded = loadMusic(filled());
        const song = loaded?.music.musicList[110851];
        const [chart] = song?.charts ?? [];

        expect(song?.info.bpm).toBeNull();
        expect(chart.info.charter).toBeNull();
        expect(chart.info.notes).toEqual([null, null, 0, 0, null]);
        expect(chart.info.level).toBe("13?");
    });

    it("leaves out the optional fields a song or chart does not have", () => {
        const loaded = loadMusic(filled());
        const withStat = Object.values(loaded?.music.chartList ?? {}).filter(
            chart => chart.info.stat
        );

        expect(withStat).toHaveLength(22);
        const [plain] = Object.values(loaded?.music.chartList ?? {}).filter(
            chart => !chart.info.stat
        );
        expect("stat" in plain.info).toBe(false);
        expect(plain.score).toBeUndefined();
    });

    it("keeps the search index, so a search finds the song by an alias", () => {
        const loaded = loadMusic(filled());
        const song = loaded?.music.musicList[8];

        expect(song?.info.searchIndex?.length).toBeGreaterThan(0);
        expect(matchesMusicSearchIndex(song?.info.searchIndex, "会员制餐厅")).toBe(true);
        expect(matchesMusicSearchIndex(song?.info.searchIndex, "没有这首歌")).toBe(false);
    });

    it("hands out a new copy each time, so one command cannot change what the next one reads", () => {
        const store = filled();
        const first = loadMusic(store);
        if (!first) throw new Error("nothing was loaded");
        first.music.musicList[8].info.title = "改过了";

        expect(loadMusic(store)?.music.musicList[8].info.title).toBe("True Love Song");
    });

    it("reads what the latest refresh wrote, not what was there before", () => {
        const store = filled();
        const smaller = buildSaltMetaMusicList(
            {
                ...getFixtureSaltMetaCompacted(),
                musics: getFixtureSaltMetaCompacted().musics.slice(0, 3),
            },
            { mergeDuplicates: true }
        );
        replaceMusic(store, smaller, { fetchedAt: 3000, upstreamVersion: "1" });

        const loaded = loadMusic(store);
        expect(loaded?.music).toEqual(smaller.music);
        expect(loaded?.fetchedAt).toBe(3000);
    });
});

describe("loading the collections", () => {
    it("gives back the four lists as LXNS served them", () => {
        expect(loadCollectionLists(filled())).toEqual(getFixtureLXNSCollections());
    });

    it("maps them as the web app does, version plates included", () => {
        const loaded = loadCollections(filled());

        expect(loaded?.collections).toEqual(mapLXNSCollections(getFixtureLXNSCollections()));
        expect(loaded?.fetchedAt).toBe(2000);
        expect(loaded?.collections.versionPlates["極"].length).toBeGreaterThan(0);
    });

    it("keeps the order of each list", () => {
        const loaded = loadCollections(filled());
        const lists = getFixtureLXNSCollections();

        expect(loaded?.collections.titles.map(title => title.id)).toEqual(
            lists.trophies.map(trophy => trophy.id)
        );
        expect(loaded?.collections.plates.map(plate => plate.id)).toEqual(
            lists.plates.map(plate => plate.id)
        );
    });

    it("loads the music and the collections independently of each other", () => {
        const store = open();
        replaceCollections(store, getFixtureLXNSCollections(), { fetchedAt: 2000 });

        expect(loadMusic(store)).toBeUndefined();
        expect(loadCollections(store)?.fetchedAt).toBe(2000);
    });
});
