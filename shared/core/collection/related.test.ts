import type { Chart } from "../music/type";
import type { Collection, CollectionRequired, CollectionSongType } from "./type";
import { describe, expect, it } from "vitest";
import { buildRelatedCollectionsIndex, getRelatedCollections } from "./related";

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

describe("related collections index builder", () => {
    it("maps standard, dx and utage requirements to the music ids used by charts", () => {
        const standard = makeCollection(1, [{ id: 11, type: "standard" }]);
        const dx = makeCollection(2, [{ id: 11, type: "dx" }]);
        const utage = makeCollection(3, [{ id: 77, type: "utage" }]);

        const index = buildRelatedCollectionsIndex([standard, dx, utage]);

        expect([...index.keys()].sort((a, b) => a - b)).toEqual([11, 77, 10011]);
        expect([...(index.get(11)?.keys() ?? [])]).toEqual([standard]);
        expect([...(index.get(10011)?.keys() ?? [])]).toEqual([dx]);
        expect([...(index.get(77)?.keys() ?? [])]).toEqual([utage]);
    });

    it("filters by difficulty and returns each collection once in input order", () => {
        const dx = makeCollection(1, [{ id: 11, type: "dx" }], [3]);
        const first = makeCollection(2, [
            { id: 21, type: "standard" },
            { id: 21, type: "standard" },
        ]);
        const second = makeCollection(3, [{ id: 21, type: "standard" }]);
        const utage = makeCollection(4, [{ id: 77, type: "utage" }], [10]);

        const index = buildRelatedCollectionsIndex([dx, first, second, utage]);

        expect(getRelatedCollections(index, makeChart(10011, 3))).toEqual([dx]);
        expect(getRelatedCollections(index, makeChart(10011, 2))).toEqual([]);
        expect(getRelatedCollections(index, makeChart(21, 4))).toEqual([first, second]);
        expect(getRelatedCollections(index, makeChart(77, 10))).toEqual([utage]);
        expect(getRelatedCollections(index, makeChart(77, 9))).toEqual([]);
    });

    it("returns nothing for unknown music and for an empty snapshot", () => {
        const index = buildRelatedCollectionsIndex([makeCollection(1, [{ id: 1, type: "dx" }])]);

        expect(getRelatedCollections(index, makeChart(999, 3))).toEqual([]);
        expect(getRelatedCollections(buildRelatedCollectionsIndex([]), makeChart(1, 3))).toEqual(
            []
        );
    });

    it("tolerates collections without requirements or songs", () => {
        const bare: Collection = { type: 1, id: 9, name: "bare", description: "" };
        const noSongs: Collection = { ...bare, id: 10, required: [{ difficulties: [3] }] };

        const index = buildRelatedCollectionsIndex([bare, noSongs]);

        expect(index.size).toBe(0);
    });

    it("builds a fresh index for every snapshot", () => {
        const previous = makeCollection(1, [{ id: 31, type: "standard" }]);
        const current = makeCollection(2, [{ id: 32, type: "standard" }]);

        const before = buildRelatedCollectionsIndex([previous]);
        const after = buildRelatedCollectionsIndex([current]);

        expect(getRelatedCollections(before, makeChart(31, 3))).toEqual([previous]);
        expect(getRelatedCollections(after, makeChart(31, 3))).toEqual([]);
        expect(getRelatedCollections(after, makeChart(32, 3))).toEqual([current]);
    });
});
