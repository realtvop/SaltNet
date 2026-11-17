/**
 * The sole repository that reads and writes migration 5's favorites tables.
 */
import type { Store } from "../store/store";
import { usageError } from "../errors";

export interface FavoriteEntry {
    readonly musicId: number;
    readonly grade: number;
}

export interface FavoriteRow {
    readonly name: string;
    readonly count: number;
    readonly musicIds: readonly number[];
}

export interface StoredFavorite extends FavoriteRow {
    readonly id: number;
    readonly position: number;
    readonly entries: readonly FavoriteEntry[];
}

interface FavoriteDbRow {
    id: number;
    position: number;
    name: string;
}

interface FavoriteChartDbRow {
    favorite_id: number;
    position: number;
    music_id: number;
    grade: number;
}

export function listFavorites(store: Store): StoredFavorite[] {
    return store.read(() => {
        const favRows = store.db
            .prepare("SELECT id, position, name FROM favorites ORDER BY position")
            .all() as unknown as FavoriteDbRow[];
        const chartRows = store.db
            .prepare(
                "SELECT favorite_id, position, music_id, grade FROM favorite_charts ORDER BY favorite_id, position"
            )
            .all() as unknown as FavoriteChartDbRow[];

        const map = new Map<number, FavoriteEntry[]>();
        for (const row of chartRows) {
            let list = map.get(row.favorite_id);
            if (!list) {
                list = [];
                map.set(row.favorite_id, list);
            }
            list.push({ musicId: row.music_id, grade: row.grade });
        }

        return favRows.map(fav => {
            const entries = map.get(fav.id) ?? [];
            return {
                id: fav.id,
                position: fav.position,
                name: fav.name,
                count: entries.length,
                musicIds: entries.map(entry => entry.musicId),
                entries,
            };
        });
    });
}

export function getFavoriteByName(store: Store, name: string): StoredFavorite | undefined {
    return listFavorites(store).find(favorite => favorite.name === name);
}

export function hasFavoriteName(store: Store, name: string): boolean {
    const row = store.db.prepare("SELECT 1 FROM favorites WHERE name = ?").get(name);
    return row !== undefined;
}

export function createFavorite(store: Store, rawName: string): StoredFavorite {
    const name = rawName.trim();
    if (name.length === 0) throw usageError("收藏夹名称不能为空");

    return store.transaction(() => {
        if (hasFavoriteName(store, name)) {
            throw usageError(`收藏夹「${name}」已存在`);
        }
        const maxPosRow = store.db.prepare("SELECT max(position) AS val FROM favorites").get() as {
            val: number | null;
        };
        const position = maxPosRow.val === null ? 0 : maxPosRow.val + 1;
        const result = store.db
            .prepare("INSERT INTO favorites (position, name) VALUES (?, ?)")
            .run(position, name);
        const id = Number(result.lastInsertRowid);
        return {
            id,
            position,
            name,
            count: 0,
            musicIds: [],
            entries: [],
        };
    });
}

export function renameFavorite(
    store: Store,
    id: number,
    rawNewName: string
): { previousName: string; name: string } {
    const newName = rawNewName.trim();
    if (newName.length === 0) throw usageError("收藏夹名称不能为空");

    return store.transaction(() => {
        const favorite = listFavorites(store).find(fav => fav.id === id);
        if (!favorite) throw new Error(`favorite with id ${id} not found`);
        if (favorite.name === newName) {
            return { previousName: favorite.name, name: newName };
        }
        if (hasFavoriteName(store, newName)) {
            throw usageError(`收藏夹「${newName}」已存在`);
        }
        store.db.prepare("UPDATE favorites SET name = ? WHERE id = ?").run(newName, id);
        return { previousName: favorite.name, name: newName };
    });
}

function setFavoritePositions(store: Store, ids: readonly number[]): void {
    if (ids.length === 0) return;
    const maxVal = (
        store.db.prepare("SELECT max(position) AS val FROM favorites").get() as { val: number }
    ).val;
    store.db.prepare("UPDATE favorites SET position = position + ?").run(maxVal + 1);
    const update = store.db.prepare("UPDATE favorites SET position = ? WHERE id = ?");
    ids.forEach((id, position) => update.run(position, id));
}

function setEntryPositions(store: Store, favoriteId: number, musicIds: readonly number[]): void {
    if (musicIds.length === 0) return;
    const maxVal = (
        store.db
            .prepare("SELECT max(position) AS val FROM favorite_charts WHERE favorite_id = ?")
            .get(favoriteId) as { val: number }
    ).val;
    store.db
        .prepare("UPDATE favorite_charts SET position = position + ? WHERE favorite_id = ?")
        .run(maxVal + 1, favoriteId);
    const update = store.db.prepare(
        "UPDATE favorite_charts SET position = ? WHERE favorite_id = ? AND music_id = ?"
    );
    musicIds.forEach((musicId, position) => update.run(position, favoriteId, musicId));
}

export function deleteFavorite(store: Store, id: number): boolean {
    return store.transaction(() => {
        const { changes } = store.db.prepare("DELETE FROM favorites WHERE id = ?").run(id);
        if (changes === 0) return false;

        const remaining = store.db
            .prepare("SELECT id FROM favorites ORDER BY position")
            .all() as unknown as { id: number }[];
        setFavoritePositions(
            store,
            remaining.map(r => r.id)
        );
        return true;
    });
}

export function addChartToFavorite(
    store: Store,
    favoriteId: number,
    musicId: number,
    grade: number
): boolean {
    return store.transaction(() => {
        const existing = store.db
            .prepare("SELECT 1 FROM favorite_charts WHERE favorite_id = ? AND music_id = ?")
            .get(favoriteId, musicId);
        if (existing) {
            return false;
        }

        const maxPosRow = store.db
            .prepare("SELECT max(position) AS val FROM favorite_charts WHERE favorite_id = ?")
            .get(favoriteId) as { val: number | null };
        const position = maxPosRow.val === null ? 0 : maxPosRow.val + 1;
        store.db
            .prepare(
                "INSERT INTO favorite_charts (favorite_id, position, music_id, grade) VALUES (?, ?, ?, ?)"
            )
            .run(favoriteId, position, musicId, grade);

        return true;
    });
}

export function removeChartFromFavorite(
    store: Store,
    favoriteId: number,
    musicId: number
): boolean {
    return store.transaction(() => {
        const result = store.db
            .prepare("DELETE FROM favorite_charts WHERE favorite_id = ? AND music_id = ?")
            .run(favoriteId, musicId);
        if (result.changes === 0) {
            return false;
        }

        const entries = store.db
            .prepare("SELECT music_id FROM favorite_charts WHERE favorite_id = ? ORDER BY position")
            .all(favoriteId) as unknown as { music_id: number }[];
        setEntryPositions(
            store,
            favoriteId,
            entries.map(e => e.music_id)
        );

        return true;
    });
}
