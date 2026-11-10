import type { CachedMusicData, Music, SavedMusicList } from "./type";
import { describe, expect, it } from "vitest";
import { restoreCachedMusicData } from "./cache";
import { convertSaltMetaNextToSavedMusicList } from "./saltmeta";
import { MUSIC_SEARCH_INDEX_VERSION } from "./search";

function makeSavedList(): SavedMusicList {
    return convertSaltMetaNextToSavedMusicList({
        versions: [],
        musics: [
            {
                id: 1,
                title: "世界计划",
                artist: "星空",
                bpm: 120,
                category: "maimai",
                isLocked: false,
                charts: [
                    {
                        type: "sd",
                        difficulty: 0,
                        noteDesigner: "ほしぞら",
                        noteCounts: { tap: 1, hold: 0, slide: 0, touch: null, break: 1, total: 2 },
                        regions: { cn: { level: "1", internalLevel: 1, version: 2026 } },
                    },
                    {
                        type: "sd",
                        difficulty: 1,
                        noteDesigner: "ほしぞら",
                        noteCounts: { tap: 2, hold: 0, slide: 0, touch: null, break: 1, total: 3 },
                        regions: { cn: { level: "2", internalLevel: 2, version: 2026 } },
                    },
                ],
            },
        ],
    });
}

/** What the browser keeps: charts that no longer point back at their music. */
function makeCache(searchIndexVersion?: number): CachedMusicData {
    const saved = makeSavedList();
    const musicList: Record<number, Music> = {};
    for (const [id, music] of Object.entries(saved.musicList)) {
        musicList[Number(id)] = {
            ...music,
            charts: music.charts.map(chart => ({ ...chart, music: undefined as never })),
        };
    }
    return {
        musicList,
        chartList: {},
        region: "cn",
        cachedAt: 1,
        searchIndexVersion,
    };
}

describe("cached music restoration", () => {
    it("links every chart back to its music and rebuilds the chart list", () => {
        const restored = restoreCachedMusicData(makeCache(MUSIC_SEARCH_INDEX_VERSION));
        const music = restored.musicList[1]!;

        expect(Object.keys(restored.chartList)).toHaveLength(2);
        for (const chart of music.charts) {
            expect(chart.music).toBe(music);
            expect(restored.chartList[chart.id]).toBe(chart);
        }
    });

    it("keeps the stored search index when its version is current", () => {
        const cache = makeCache(MUSIC_SEARCH_INDEX_VERSION);
        cache.musicList[1]!.info.searchIndex = ["stored"];

        expect(restoreCachedMusicData(cache).musicList[1]!.info.searchIndex).toEqual(["stored"]);
    });

    it("rebuilds the search index when the stored version is missing or outdated", () => {
        for (const version of [undefined, MUSIC_SEARCH_INDEX_VERSION - 1]) {
            const cache = makeCache(version);
            cache.musicList[1]!.info.searchIndex = ["stale"];

            const music = restoreCachedMusicData(cache).musicList[1]!;

            expect(music.info.searchIndex).not.toEqual(["stale"]);
            expect(music.info.searchIndex?.length).toBeGreaterThan(0);
        }
    });
});
