import { afterEach, describe, expect, it } from "vitest";
import type { Chart } from "../music/type";
import type { Collection, CollectionRequired, CollectionSongType } from "./type";
import { getRelatedCollectionsForChart, updateRelatedCollectionsIndex } from "./relatedCollections";

function makeChart(musicId: number, grade: number): Chart {
    return {
        id: musicId * 100 + grade,
        info: { grade },
        music: { id: musicId },
    } as Chart;
}

function makeCollection(
    id: number,
    songs: Array<{ id: number; type: CollectionSongType }>,
    difficulties?: number[]
): Collection {
    const requirement: CollectionRequired = {
        difficulties,
        songs: songs.map(song => ({ ...song, title: String(song.id) })),
    };
    return {
        type: 1,
        id,
        name: `collection-${id}`,
        description: "",
        required: [requirement],
    };
}

afterEach(() => updateRelatedCollectionsIndex([]));

describe("related collections index", () => {
    it("covers standard, dx, and utage song requirements with difficulty filtering", () => {
        const standard = makeCollection(1, [{ id: 11, type: "standard" }]);
        const dx = makeCollection(2, [{ id: 11, type: "dx" }], [3]);
        const utage = makeCollection(3, [{ id: 77, type: "utage" }], [10]);

        updateRelatedCollectionsIndex([standard, dx, utage]);

        expect(getRelatedCollectionsForChart(makeChart(11, 2))).toEqual([standard]);
        expect(getRelatedCollectionsForChart(makeChart(10011, 3))).toEqual([dx]);
        expect(getRelatedCollectionsForChart(makeChart(10011, 2))).toEqual([]);
        expect(getRelatedCollectionsForChart(makeChart(77, 10))).toEqual([utage]);
    });

    it("preserves candidate order and returns a collection only once", () => {
        const first = makeCollection(1, [
            { id: 21, type: "standard" },
            { id: 21, type: "standard" },
        ]);
        const second = makeCollection(2, [{ id: 21, type: "standard" }]);

        updateRelatedCollectionsIndex([first, second]);

        expect(getRelatedCollectionsForChart(makeChart(21, 4))).toEqual([first, second]);
    });

    it("replaces stale associations when a new collection snapshot arrives", () => {
        const previous = makeCollection(1, [{ id: 31, type: "standard" }]);
        const current = makeCollection(2, [{ id: 32, type: "standard" }]);

        updateRelatedCollectionsIndex([previous]);
        updateRelatedCollectionsIndex([current]);

        expect(getRelatedCollectionsForChart(makeChart(31, 3))).toEqual([]);
        expect(getRelatedCollectionsForChart(makeChart(32, 3))).toEqual([current]);
    });
});
