import type { SaltMetaMusicMetadataNext } from "./saltmeta";
import { describe, expect, it } from "vitest";
import { getFixtureSaltMetaCompacted } from "../fixtures/saltmeta";
import { mergeDuplicateMusics } from "./duplicates";
import {
    convertSaltMetaNextCompactedToNormal,
    convertSaltMetaNextToSavedMusicList,
} from "./saltmeta";

type Music = SaltMetaMusicMetadataNext["musics"][number];
type Chart = Music["charts"][number];

function fixtureMetadata(): SaltMetaMusicMetadataNext {
    return convertSaltMetaNextCompactedToNormal(getFixtureSaltMetaCompacted());
}

function chart(overrides: Partial<Chart> = {}): Chart {
    return {
        type: "dx",
        difficulty: 3,
        noteDesigner: "Charter",
        noteCounts: { tap: 10, hold: 2, slide: 3, touch: 1, break: 4, total: 20 },
        regions: { cn: { level: "13", internalLevel: 13.2, version: "舞萌DX 2025" } },
        ...overrides,
    };
}

function music(overrides: Partial<Music> = {}): Music {
    return {
        id: 1,
        title: "Song",
        artist: "Artist",
        bpm: 150,
        category: "maimai",
        isLocked: false,
        charts: [chart()],
        ...overrides,
    };
}

function document(...musics: Music[]): SaltMetaMusicMetadataNext {
    return { musics, versions: [] };
}

describe("merging songs that upstream lists twice", () => {
    it("folds the two duplicate banquet songs of the fixture into one entry each", () => {
        const { metadata, merged } = mergeDuplicateMusics(fixtureMetadata());

        expect(merged).toEqual([
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
        const ids = metadata.musics.map(entry => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toHaveLength(fixtureMetadata().musics.length - 2);
    });

    it("keeps the title with the prefix, the other title as an alias and the original aliases", () => {
        const { metadata } = mergeDuplicateMusics(fixtureMetadata());
        const kept = metadata.musics.find(entry => entry.id === 100851);

        expect(kept?.title).toBe("[幸]犬日和。(はっぴー歌唱Ver)");
        expect(kept?.aliases?.cn).toEqual([
            "[幸]犬日和。(はっぴー歌唱ver)",
            "犬日和。(はっぴー歌唱Ver)",
        ]);
        expect(kept?.comment).toBe("HOLDだけでがんばろうとした。");
    });

    it("leaves one chart per difficulty, with the regions of both entries", () => {
        const { metadata } = mergeDuplicateMusics(fixtureMetadata());
        const kept = metadata.musics.find(entry => entry.id === 100998);

        expect(kept?.charts).toHaveLength(1);
        expect(Object.keys(kept?.charts[0].regions ?? {}).sort()).toEqual([
            "cn",
            "intl",
            "jp",
            "us",
        ]);
    });

    it("turns the collision on the converted chart id into a single chart", () => {
        const { metadata } = mergeDuplicateMusics(fixtureMetadata());
        const { musicList, chartList } = convertSaltMetaNextToSavedMusicList(metadata);

        for (const id of [110851, 110998]) {
            expect(musicList[id].charts).toHaveLength(1);
            expect(chartList[id * 100 + 10]).toBe(musicList[id].charts[0]);
            expect(chartList[id * 100 + 10].music).toBe(musicList[id]);
        }
        expect(musicList[110851].info.title).toBe("[幸]犬日和。(はっぴー歌唱Ver)");
        expect(musicList[110851].info.aliases).toContain("犬日和。(はっぴー歌唱Ver)");
    });

    it("does not touch any other entry and keeps the document order", () => {
        const before = fixtureMetadata();
        const { metadata } = mergeDuplicateMusics(before);

        const untouched = before.musics.filter(entry => ![100851, 100998].includes(entry.id));
        expect(metadata.musics.filter(entry => ![100851, 100998].includes(entry.id))).toEqual(
            untouched
        );
        // The merged entry takes the place of the first of its group.
        const order = metadata.musics.map(entry => entry.id);
        expect(order.indexOf(100851)).toBe(before.musics.findIndex(entry => entry.id === 100851));
    });

    it("does not modify its input", () => {
        const before = fixtureMetadata();
        const snapshot = JSON.parse(JSON.stringify(before));
        mergeDuplicateMusics(before);
        expect(before).toEqual(snapshot);
    });

    it("finds nothing more to merge in its own output", () => {
        const once = mergeDuplicateMusics(fixtureMetadata());
        const twice = mergeDuplicateMusics(once.metadata);

        expect(twice.merged).toEqual([]);
        expect(twice.metadata.musics).toEqual(once.metadata.musics);
    });

    it("reports nothing when no song is listed twice", () => {
        const { metadata, merged } = mergeDuplicateMusics(
            document(music({ id: 1 }), music({ id: 2 }))
        );

        expect(merged).toEqual([]);
        expect(metadata.musics.map(entry => entry.id)).toEqual([1, 2]);
    });

    it("prefers the prefixed title whichever entry comes first", () => {
        const plain = music({ id: 9, title: "Plain" });
        const prefixed = music({ id: 9, title: "【宴】Plain" });

        expect(mergeDuplicateMusics(document(plain, prefixed)).metadata.musics[0].title).toBe(
            "【宴】Plain"
        );
        expect(mergeDuplicateMusics(document(prefixed, plain)).metadata.musics[0].title).toBe(
            "【宴】Plain"
        );
    });

    it("falls back to the entry that knows more regions, then to the first", () => {
        const wide = music({
            id: 9,
            title: "Wide",
            charts: [chart({ regions: { cn: chart().regions.cn, jp: chart().regions.cn } })],
        });
        const narrow = music({ id: 9, title: "Narrow" });
        expect(mergeDuplicateMusics(document(narrow, wide)).metadata.musics[0].title).toBe("Wide");

        const first = music({ id: 9, title: "First" });
        const second = music({ id: 9, title: "Second" });
        expect(mergeDuplicateMusics(document(first, second)).metadata.musics[0].title).toBe(
            "First"
        );
    });

    it("combines the charts of both entries and lets the kept one win a conflict", () => {
        const kept = music({
            id: 9,
            title: "[宴]Song",
            charts: [
                chart({
                    noteDesigner: "",
                    regions: { cn: { level: "13", internalLevel: 13.2, version: 1 } },
                }),
            ],
        });
        const other = music({
            id: 9,
            title: "Song",
            artist: "",
            charts: [
                chart({
                    noteDesigner: "Other charter",
                    regions: {
                        cn: { level: "14", internalLevel: 14, version: 2 },
                        jp: { level: "14", internalLevel: 14.1, version: 2 },
                    },
                    fitDiffDF: {
                        cnt: 1,
                        diff: "13",
                        fitDiff: 13.1,
                        avg: 99,
                        avgDx: 1,
                        stdDev: 1,
                        dist: [1],
                        fcDist: [1],
                    },
                }),
                chart({ difficulty: 4 }),
            ],
        });

        const [result] = mergeDuplicateMusics(document(kept, other)).metadata.musics;

        expect(result.charts.map(entry => entry.difficulty)).toEqual([3, 4]);
        expect(result.charts[0].regions.cn?.level).toBe("13");
        expect(result.charts[0].regions.jp?.level).toBe("14");
        expect(result.charts[0].noteDesigner).toBe("Other charter");
        expect(result.charts[0].fitDiffDF?.fitDiff).toBe(13.1);
        expect(result.artist).toBe("Artist");
        expect(result.aliases?.cn).toEqual(["Song"]);
    });

    it("keeps three entries of one id together", () => {
        const { metadata, merged } = mergeDuplicateMusics(
            document(
                music({ id: 5, title: "A" }),
                music({ id: 5, title: "[x]A" }),
                music({ id: 5, title: "A (2)" })
            )
        );

        expect(metadata.musics).toHaveLength(1);
        expect(merged).toEqual([{ id: 5, title: "[x]A", mergedTitles: ["A", "A (2)"] }]);
        expect(metadata.musics[0].aliases?.cn).toEqual(["A", "A (2)"]);
    });
});
