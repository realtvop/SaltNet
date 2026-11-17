import type { Store } from "../../src/store/store";
import { afterEach, describe, expect, it } from "vitest";
import {
    addChartToFavorite,
    createFavorite,
    deleteFavorite,
    getFavoriteByName,
    hasFavoriteName,
    listFavorites,
    removeChartFromFavorite,
    renameFavorite,
} from "../../src/favorites/repository";
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

describe("favorites repository", () => {
    it("lists favorites in position order and returns empty array on fresh database", () => {
        const store = open();
        expect(listFavorites(store)).toEqual([]);
    });

    it("creates favorites with trimmed names and contiguous positions", () => {
        const store = open();
        const f1 = createFavorite(store, "  练习一  ");
        expect(f1).toEqual({
            id: expect.any(Number),
            name: "练习一",
            position: 0,
            count: 0,
            musicIds: [],
            entries: [],
        });
        const f2 = createFavorite(store, "练习二");
        expect(f2.position).toBe(1);

        const list = listFavorites(store);
        expect(list.map(f => ({ name: f.name, position: f.position }))).toEqual([
            { name: "练习一", position: 0 },
            { name: "练习二", position: 1 },
        ]);
    });

    it("rejects empty names and duplicate names on create", () => {
        const store = open();
        expect(() => createFavorite(store, "   ")).toThrow(/收藏夹名称不能为空/);
        createFavorite(store, "练习");
        expect(hasFavoriteName(store, "练习")).toBe(true);
        expect(hasFavoriteName(store, "别的")).toBe(false);
        expect(() => createFavorite(store, "练习")).toThrow(/收藏夹「练习」已存在/);
    });

    it("renames a favorite and enforces name checks", () => {
        const store = open();
        const f1 = createFavorite(store, "练习一");
        createFavorite(store, "练习二");

        expect(() => renameFavorite(store, f1.id, "   ")).toThrow(/收藏夹名称不能为空/);
        expect(() => renameFavorite(store, f1.id, "练习二")).toThrow(/收藏夹「练习二」已存在/);

        // Renaming to current name succeeds and does nothing
        renameFavorite(store, f1.id, "练习一");
        expect(getFavoriteByName(store, "练习一")?.name).toBe("练习一");

        // Renaming to new unique name
        renameFavorite(store, f1.id, "  备选一  ");
        expect(getFavoriteByName(store, "练习一")).toBeUndefined();
        const updated = getFavoriteByName(store, "备选一");
        expect(updated?.name).toBe("备选一");
    });

    it("deletes a favorite, cascades deletion to its entries, and repacks positions", () => {
        const store = open();
        createFavorite(store, "f1");
        const f2 = createFavorite(store, "f2");
        createFavorite(store, "f3");

        addChartToFavorite(store, f2.id, 100, 3);
        addChartToFavorite(store, f2.id, 101, 3);

        expect(deleteFavorite(store, f2.id)).toBe(true);
        expect(deleteFavorite(store, 99999)).toBe(false);

        const list = listFavorites(store);
        expect(list.map(f => ({ name: f.name, position: f.position }))).toEqual([
            { name: "f1", position: 0 },
            { name: "f3", position: 1 },
        ]);

        // Entries of deleted favorite were removed by cascade
        const rawEntries = store.read(() =>
            store.db.prepare("SELECT * FROM favorite_charts WHERE favorite_id = ?").all(f2.id)
        );
        expect(rawEntries).toEqual([]);
    });

    it("adds and removes charts from a favorite, and ignores duplicates/missing", () => {
        const store = open();
        const f = createFavorite(store, "练习");

        // Add first chart
        const added1 = addChartToFavorite(store, f.id, 146, 3);
        expect(added1).toBe(true);
        let current = getFavoriteByName(store, "练习")!;
        expect(current.count).toBe(1);
        expect(current.musicIds).toEqual([146]);
        expect(current.entries).toEqual([{ musicId: 146, grade: 3 }]);

        // Add second chart
        const added2 = addChartToFavorite(store, f.id, 11451, 4);
        expect(added2).toBe(true);
        current = getFavoriteByName(store, "练习")!;
        expect(current.count).toBe(2);
        expect(current.musicIds).toEqual([146, 11451]);
        expect(current.entries).toEqual([
            { musicId: 146, grade: 3 },
            { musicId: 11451, grade: 4 },
        ]);

        // Add same musicId again with different grade: returns false and changes nothing
        const addedAgain = addChartToFavorite(store, f.id, 146, 2);
        expect(addedAgain).toBe(false);
        current = getFavoriteByName(store, "练习")!;
        expect(current.count).toBe(2);
        expect(current.musicIds).toEqual([146, 11451]);
        expect(current.entries[0]).toEqual({ musicId: 146, grade: 3 });

        // Remove non-existent chart: returns false and changes nothing
        const removedMissing = removeChartFromFavorite(store, f.id, 99999);
        expect(removedMissing).toBe(false);
        current = getFavoriteByName(store, "练习")!;
        expect(current.count).toBe(2);

        // Remove first chart: returns true, and repacks entry positions
        const removedFirst = removeChartFromFavorite(store, f.id, 146);
        expect(removedFirst).toBe(true);
        current = getFavoriteByName(store, "练习")!;
        expect(current.count).toBe(1);
        expect(current.musicIds).toEqual([11451]);
        expect(current.entries).toEqual([{ musicId: 11451, grade: 4 }]);
    });
});
