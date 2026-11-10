import type { LXNSCollectionLists } from "@core/integrations/lxns/type";
import type { Store } from "../../src/store/store";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { buildSaltMetaMusicList } from "@core/music/fetch";
import { afterEach, describe, expect, it } from "vitest";
import {
    CATALOG_BUILDER,
    readMetaState,
    replaceCollections,
    replaceMusic,
} from "../../src/catalog/store";
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

function build(
    documentChange?: (document: ReturnType<typeof getFixtureSaltMetaCompacted>) => void
) {
    const document = getFixtureSaltMetaCompacted();
    documentChange?.(document);
    return buildSaltMetaMusicList(document, { mergeDuplicates: true });
}

function rows<T = Record<string, unknown>>(store: Store, sql: string, ...params: string[]): T[] {
    return store.db.prepare(sql).all(...params) as T[];
}

function count(store: Store, table: string): number {
    return rows<{ n: number }>(store, `SELECT count(*) AS n FROM ${table}`)[0].n;
}

describe("the catalog tables", () => {
    it("exist once the store is opened", () => {
        const names = rows<{ name: string }>(
            open(),
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        ).map(row => row.name);

        expect(names).toEqual(
            expect.arrayContaining([
                "charts",
                "collections",
                "locks",
                "meta_state",
                "songs",
                "versions",
            ])
        );
    });
});

describe("writing the music", () => {
    it("stores every song, chart and version of the build", () => {
        const store = open();
        const counts = replaceMusic(store, build(), { fetchedAt: 1000, upstreamVersion: "1" });

        expect(counts).toEqual({ songs: 50, charts: 183, versions: 20 });
        expect(count(store, "songs")).toBe(50);
        expect(count(store, "charts")).toBe(183);
        expect(count(store, "versions")).toBe(20);
        expect(rows(store, "SELECT name, word FROM versions ORDER BY position LIMIT 2")).toEqual([
            { name: "maimai", word: "真" },
            { name: "maimai PLUS", word: "真" },
        ]);
    });

    it("keeps a song's fields, with the lists as JSON", () => {
        const store = open();
        replaceMusic(store, build(), { fetchedAt: 1000, upstreamVersion: "1" });

        const [song] = rows<Record<string, unknown>>(store, "SELECT * FROM songs WHERE id = 8");
        expect(song).toMatchObject({
            id: 8,
            meta_id: 8,
            title: "True Love Song",
            artist: "Kai/クラシック「G線上のアリア」",
            genre: "舞萌",
            bpm: 150,
            version: "maimai",
            is_new: 0,
            type: "SD",
        });
        expect(JSON.parse(song.aliases as string)).toEqual([
            "true love song",
            "会员制餐厅",
            "真的爱情歌",
        ]);
        expect(JSON.parse(song.search_index as string)).toHaveLength(13);
    });

    it("works out the SaltMeta id of a song from its type", () => {
        const store = open();
        replaceMusic(store, build(), { fetchedAt: 1000, upstreamVersion: "1" });

        const sd = rows<{ id: number; meta_id: number }>(
            store,
            "SELECT id, meta_id FROM songs WHERE type = 'SD'"
        );
        expect(sd.length).toBe(29);
        for (const song of sd) expect(song.meta_id).toBe(song.id);

        const dx = rows<{ id: number; meta_id: number }>(
            store,
            "SELECT id, meta_id FROM songs WHERE type = 'DX'"
        );
        expect(dx.length).toBe(21);
        for (const song of dx) expect(song.meta_id).toBe(song.id - 10_000);

        expect(rows(store, "SELECT id, meta_id FROM songs WHERE id = 110851")).toEqual([
            { id: 110851, meta_id: 100851 },
        ]);
    });

    it("keeps a chart's fields and the order of a song's charts", () => {
        const store = open();
        replaceMusic(store, build(), { fetchedAt: 1000, upstreamVersion: "1" });

        const [chart] = rows<Record<string, unknown>>(
            store,
            "SELECT * FROM charts WHERE chart_key = '8-0'"
        );
        expect(chart).toMatchObject({
            chart_key: "8-0",
            id: 800,
            song_id: 8,
            position: 0,
            grade: 0,
        });
        expect(JSON.parse(chart.notes as string)).toHaveLength(4);

        const ordered = rows<{ position: number; grade: number }>(
            store,
            "SELECT position, grade FROM charts WHERE song_id = 17 ORDER BY position"
        );
        expect(ordered).toEqual([0, 1, 2, 3, 4].map(n => ({ position: n, grade: n })));
    });

    it("keeps the fit constants and the distribution of a chart that has them", () => {
        const store = open();
        replaceMusic(store, build(), { fetchedAt: 1000, upstreamVersion: "1" });

        expect(count(store, "charts WHERE stat IS NOT NULL")).toBe(22);
        const [chart] = rows<{ stat: string }>(
            store,
            "SELECT stat FROM charts WHERE stat IS NOT NULL LIMIT 1"
        );
        expect(JSON.parse(chart.stat)).toMatchObject({ cnt: 5456, fit_diff: 5.021 });
    });

    it("keeps the gaps of a banquet song instead of inventing values", () => {
        const store = open();
        replaceMusic(store, build(), { fetchedAt: 1000, upstreamVersion: "1" });

        const [song] = rows<Record<string, unknown>>(
            store,
            "SELECT * FROM songs WHERE id = 110851"
        );
        expect(song).toMatchObject({ bpm: null, type: "DX", version: "舞萌DX 2026" });

        const [chart] = rows<Record<string, unknown>>(
            store,
            "SELECT * FROM charts WHERE song_id = 110851"
        );
        expect(chart).toMatchObject({
            chart_key: "110851-10",
            id: 11085110,
            grade: 10,
            level: "13?",
            constant: 0,
            charter: null,
            notes: "[null,null,0,0,null]",
        });
    });

    it("has one row for each banquet song that upstream lists twice", () => {
        const store = open();
        replaceMusic(store, build(), { fetchedAt: 1000, upstreamVersion: "1" });

        expect(
            rows(store, "SELECT id, title FROM songs WHERE meta_id IN (100851, 100998) ORDER BY id")
        ).toEqual([
            { id: 110851, title: "[幸]犬日和。(はっぴー歌唱Ver)" },
            { id: 110998, title: "[宴]Oshama Scramble! (Cranky Remix)" },
        ]);
    });

    it("records when the data was fetched and what was found", () => {
        const store = open();
        replaceMusic(store, build(), { fetchedAt: 1234, upstreamVersion: "1" });

        const state = readMetaState(store, "saltmeta");
        expect(state).toMatchObject({
            source: "saltmeta",
            fetchedAt: 1234,
            upstreamVersion: "1",
            builder: CATALOG_BUILDER,
        });
        expect(state?.detail).toMatchObject({ songs: 50, charts: 183, versions: 20 });
        expect(state?.detail?.mergedDuplicates).toEqual([
            {
                id: 100851,
                title: "[幸]犬日和。(はっぴー歌唱Ver)",
                mergedTitles: ["犬日和。(はっぴー歌唱Ver)"],
            },
            {
                id: 100998,
                title: "[宴]Oshama Scramble! (Cranky Remix)",
                mergedTitles: ["Oshama Scramble! (Cranky Remix)"],
            },
        ]);
        expect(readMetaState(store, "lxns-collections")).toBeUndefined();
    });

    it("replaces what was stored before instead of adding to it", () => {
        const store = open();
        replaceMusic(store, build(), { fetchedAt: 1000, upstreamVersion: "1" });
        const smaller = build(document => {
            document.musics = document.musics.slice(0, 3);
        });
        const counts = replaceMusic(store, smaller, { fetchedAt: 2000, upstreamVersion: "1" });

        expect(counts.songs).toBe(Object.keys(smaller.music.musicList).length);
        expect(count(store, "songs")).toBe(counts.songs);
        expect(count(store, "charts")).toBe(counts.charts);
        expect(readMetaState(store, "saltmeta")?.fetchedAt).toBe(2000);
    });

    it("leaves the old rows and the old state alone when the write fails", () => {
        const store = open();
        replaceMusic(store, build(), { fetchedAt: 1000, upstreamVersion: "1" });

        // Two charts with the same key make the second insert fail halfway through the write.
        const broken = build();
        const [first] = Object.values(broken.music.musicList);
        first.charts.push(first.charts[0]);

        expect(() =>
            replaceMusic(store, broken, { fetchedAt: 2000, upstreamVersion: "1" })
        ).toThrow();
        expect(count(store, "songs")).toBe(50);
        expect(count(store, "charts")).toBe(183);
        expect(readMetaState(store, "saltmeta")?.fetchedAt).toBe(1000);
    });
});

describe("writing the collections", () => {
    it("stores the four lists in the order LXNS served them", () => {
        const store = open();
        const lists = getFixtureLXNSCollections();
        const counts = replaceCollections(store, lists, { fetchedAt: 1000 });

        expect(counts).toEqual({ title: 9, icon: 3, plate: 12, frame: 3 });
        expect(count(store, "collections")).toBe(27);

        const plates = rows<{ id: number; position: number; name: string }>(
            store,
            "SELECT id, position, name FROM collections WHERE kind = 'plate' ORDER BY position"
        );
        expect(plates.map(plate => plate.id)).toEqual(lists.plates.map(plate => plate.id));
        expect(plates.map(plate => plate.name)).toEqual(lists.plates.map(plate => plate.name));
    });

    it("keeps each item whole, and its requirements as LXNS sent them", () => {
        const store = open();
        const lists = getFixtureLXNSCollections();
        replaceCollections(store, lists, { fetchedAt: 1000 });

        const kinds: [string, LXNSCollectionLists[keyof LXNSCollectionLists]][] = [
            ["title", lists.trophies],
            ["icon", lists.icons],
            ["plate", lists.plates],
            ["frame", lists.frames],
        ];
        for (const [kind, items] of kinds) {
            const stored = rows<{ raw: string; required: string | null }>(
                store,
                "SELECT raw, required FROM collections WHERE kind = ? ORDER BY position",
                kind
            );
            expect(stored.map(row => JSON.parse(row.raw))).toEqual(items);
            expect(stored.map(row => row.required)).toEqual(
                items.map(item => (item.required == null ? null : JSON.stringify(item.required)))
            );
        }
        // The fixture has a plate with more than one requirement, so this is not trivially true.
        expect(lists.plates.some(plate => (plate.required?.length ?? 0) > 1)).toBe(true);
    });

    it("keeps the optional fields as NULL when LXNS left them out", () => {
        const store = open();
        replaceCollections(
            store,
            { trophies: [{ id: 1, name: "称号" }], icons: [], plates: [], frames: [] },
            { fetchedAt: 1000 }
        );

        expect(
            rows(store, "SELECT name, genre, description, color, required FROM collections")
        ).toEqual([{ name: "称号", genre: null, description: null, color: null, required: null }]);
    });

    it("records when the lists were fetched", () => {
        const store = open();
        replaceCollections(store, getFixtureLXNSCollections(), { fetchedAt: 4321 });

        expect(readMetaState(store, "lxns-collections")).toEqual({
            source: "lxns-collections",
            fetchedAt: 4321,
            upstreamVersion: null,
            builder: CATALOG_BUILDER,
            detail: { title: 9, icon: 3, plate: 12, frame: 3 },
        });
    });

    it("replaces what was stored before, and keeps the later of two items with one id", () => {
        const store = open();
        replaceCollections(store, getFixtureLXNSCollections(), { fetchedAt: 1000 });
        replaceCollections(
            store,
            {
                trophies: [
                    { id: 1, name: "先" },
                    { id: 1, name: "后" },
                ],
                icons: [],
                plates: [],
                frames: [],
            },
            { fetchedAt: 2000 }
        );

        expect(rows(store, "SELECT kind, id, name FROM collections")).toEqual([
            { kind: "title", id: 1, name: "后" },
        ]);
        expect(readMetaState(store, "lxns-collections")?.fetchedAt).toBe(2000);
    });

    it("leaves the old rows alone when an item cannot be stored", () => {
        const store = open();
        replaceCollections(store, getFixtureLXNSCollections(), { fetchedAt: 1000 });

        const broken = getFixtureLXNSCollections();
        broken.frames[1].name = null as unknown as string;

        expect(() => replaceCollections(store, broken, { fetchedAt: 2000 })).toThrow();
        expect(count(store, "collections")).toBe(27);
        expect(readMetaState(store, "lxns-collections")?.fetchedAt).toBe(1000);
    });
});
