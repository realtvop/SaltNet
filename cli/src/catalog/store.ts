/**
 * The catalog tables (design 2.2): the songs, charts and versions built from SaltMeta, and the
 * collections LXNS serves. Each source is replaced as a whole in one transaction, so a reader sees
 * either the old data or the new, never a mix.
 */
import type { LXNSCollectionLists, LXNSCollectionType } from "@core/integrations/lxns/type";
import type { SaltMetaBuildResult } from "@core/music/fetch";
import type { Store } from "../store/store";
import { MUSIC_SEARCH_INDEX_VERSION } from "@core/music/search";

/**
 * Names how the stored rows were built from the upstream documents. A CLI that builds them
 * differently (a new search index, a fix in the conversion) sees a different name and rebuilds them
 * from the snapshots. Raise the number in front when the rows change; the search index version
 * follows core.
 */
export const CATALOG_BUILDER = `catalog-1/search-${MUSIC_SEARCH_INDEX_VERSION}`;

export type MetaSource = "saltmeta" | "lxns-collections";

export interface MetaState {
    source: MetaSource;
    /** Epoch milliseconds. */
    fetchedAt: number;
    upstreamVersion: string | null;
    builder: string;
    /** What the refresh found, for `status`. */
    detail: Record<string, unknown> | null;
}

interface MetaStateRow {
    source: string;
    fetched_at: number;
    upstream_version: string | null;
    builder: string;
    detail: string | null;
}

/** JSON for a column that holds what has no column of its own; NULL when there is nothing. */
function json(value: unknown): string | null {
    return value === undefined || value === null ? null : JSON.stringify(value);
}

function writeMetaState(store: Store, state: MetaState): void {
    store.db
        .prepare(
            `INSERT OR REPLACE INTO meta_state (source, fetched_at, upstream_version, builder, detail)
             VALUES (?, ?, ?, ?, ?)`
        )
        .run(
            state.source,
            state.fetchedAt,
            state.upstreamVersion,
            state.builder,
            json(state.detail)
        );
}

export function readMetaState(store: Store, source: MetaSource): MetaState | undefined {
    const row = store.db.prepare("SELECT * FROM meta_state WHERE source = ?").get(source) as
        | MetaStateRow
        | undefined;
    if (!row) return undefined;
    return {
        source,
        fetchedAt: row.fetched_at,
        upstreamVersion: row.upstream_version,
        builder: row.builder,
        detail: row.detail === null ? null : (JSON.parse(row.detail) as Record<string, unknown>),
    };
}

export interface MusicCounts {
    songs: number;
    charts: number;
    versions: number;
}

export interface MusicWrite {
    /** Epoch milliseconds. */
    fetchedAt: number;
    upstreamVersion: string;
}

/** Replaces the songs, charts and versions with the ones just built from SaltMeta. */
export function replaceMusic(
    store: Store,
    build: SaltMetaBuildResult,
    write: MusicWrite
): MusicCounts {
    const { db } = store;
    return store.transaction(() => {
        db.exec("DELETE FROM charts");
        db.exec("DELETE FROM songs");
        db.exec("DELETE FROM versions");

        const insertSong = db.prepare(
            `INSERT INTO songs (id, meta_id, title, artist, genre, bpm, version, is_new, type, aliases, search_index)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const insertChart = db.prepare(
            `INSERT INTO charts (chart_key, id, song_id, position, grade, level, constant, charter, notes, deluxe_score_max, stat, search_index)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const insertVersion = db.prepare(
            "INSERT INTO versions (position, name, word) VALUES (?, ?, ?)"
        );

        let songs = 0;
        let charts = 0;
        for (const music of Object.values(build.music.musicList)) {
            const { info } = music;
            // A DX or banquet song is its SaltMeta id plus 10000; an SD song is the id itself.
            const metaId = info.type === "SD" ? music.id : music.id - 10_000;
            insertSong.run(
                music.id,
                metaId,
                info.title,
                info.artist,
                info.genre,
                // Upstream may leave these out; the column keeps the gap instead of inventing a value.
                info.bpm ?? null,
                String(info.from),
                info.isNew ? 1 : 0,
                info.type,
                json(info.aliases),
                json(info.searchIndex)
            );
            songs++;

            music.charts.forEach((chart, position) => {
                const { info: chartInfo } = chart;
                insertChart.run(
                    `${music.id}-${chartInfo.grade}`,
                    chart.id,
                    music.id,
                    position,
                    chartInfo.grade,
                    chartInfo.level ?? "",
                    chartInfo.constant ?? null,
                    chartInfo.charter ?? null,
                    JSON.stringify(chartInfo.notes),
                    chartInfo.deluxeScoreMax,
                    json(chartInfo.stat),
                    json(chartInfo.searchIndex)
                );
                charts++;
            });
        }

        const { cnVersions } = build.metadata;
        cnVersions.forEach((version, position) =>
            insertVersion.run(position, version.name, version.word)
        );

        const counts: MusicCounts = { songs, charts, versions: cnVersions.length };
        writeMetaState(store, {
            source: "saltmeta",
            fetchedAt: write.fetchedAt,
            upstreamVersion: write.upstreamVersion,
            builder: CATALOG_BUILDER,
            detail: { ...counts, mergedDuplicates: build.merged },
        });
        return counts;
    });
}

export type CollectionCounts = Record<LXNSCollectionType, number>;

/** The list of `LXNSCollectionLists` that each kind of collection is kept in. */
export const LIST_OF_KIND = {
    trophy: "trophies",
    icon: "icons",
    plate: "plates",
    frame: "frames",
} as const satisfies Record<LXNSCollectionType, keyof LXNSCollectionLists>;

export const COLLECTION_KINDS = Object.keys(LIST_OF_KIND) as readonly LXNSCollectionType[];

export interface CollectionsWrite {
    /** Epoch milliseconds. */
    fetchedAt: number;
}

/** Replaces the collections with the four lists just downloaded from LXNS. */
export function replaceCollections(
    store: Store,
    lists: LXNSCollectionLists,
    write: CollectionsWrite
): CollectionCounts {
    const { db } = store;
    return store.transaction(() => {
        db.exec("DELETE FROM collections");
        // A repeated id keeps the later item: one odd entry must not stop the whole refresh.
        const insert = db.prepare(
            `INSERT OR REPLACE INTO collections (kind, id, position, name, genre, description, color, required, raw)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        const counts: CollectionCounts = { trophy: 0, icon: 0, plate: 0, frame: 0 };
        for (const kind of COLLECTION_KINDS) {
            const items = lists[LIST_OF_KIND[kind]];
            items.forEach((item, position) => {
                insert.run(
                    kind,
                    item.id,
                    position,
                    item.name,
                    item.genre ?? null,
                    item.description ?? null,
                    item.color ?? null,
                    json(item.required),
                    JSON.stringify(item)
                );
            });
            counts[kind] = items.length;
        }

        writeMetaState(store, {
            source: "lxns-collections",
            fetchedAt: write.fetchedAt,
            upstreamVersion: null,
            builder: CATALOG_BUILDER,
            detail: { ...counts },
        });
        return counts;
    });
}
