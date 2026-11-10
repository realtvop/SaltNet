/**
 * Reading the catalog back from the store (design 1.2). The tables turn into the same in-memory
 * structures the web app keeps, so the same core functions give the same answers; SQLite is only
 * where the data rests between two runs of the command.
 */
import type { MappedCollections } from "@core/collection/map";
import type { ChartStats } from "@core/integrations/diving-fish/type";
import type { LXNSCollectionItem, LXNSCollectionLists } from "@core/integrations/lxns/type";
import type { ChartType, MusicGenre, MusicOrigin } from "@core/mai/types";
import type {
    Chart,
    ChartInfo,
    Music,
    MusicInfo,
    MusicMetadataState,
    SavedMusicList,
} from "@core/music/type";
import type { Store } from "../store/store";
import { mapLXNSCollections } from "@core/collection/map";
import { restoreCachedMusicData } from "@core/music/cache";
import { MUSIC_SEARCH_INDEX_VERSION } from "@core/music/search";
import { COLLECTION_KINDS, LIST_OF_KIND, readMetaState } from "./store";

interface SongRow {
    id: number;
    title: string;
    artist: string;
    genre: string;
    bpm: number | null;
    version: string;
    is_new: number;
    type: string;
    aliases: string | null;
    search_index: string | null;
}

interface ChartRow {
    id: number;
    song_id: number;
    grade: number;
    level: string;
    constant: number | null;
    charter: string | null;
    notes: string;
    deluxe_score_max: number;
    stat: string | null;
    search_index: string | null;
}

export interface LoadedMusic {
    /** What the web app keeps after it restores its cache: songs, charts and the links between them. */
    music: SavedMusicList;
    metadata: MusicMetadataState;
    /** When the data was downloaded, in epoch milliseconds. */
    fetchedAt: number;
}

export interface LoadedCollections {
    collections: MappedCollections;
    /** When the lists were downloaded, in epoch milliseconds. */
    fetchedAt: number;
}

function parseJson<T>(text: string): T {
    return JSON.parse(text) as T;
}

function buildChart(row: ChartRow, music: Music): Chart {
    const info: ChartInfo = {
        notes: parseJson<ChartInfo["notes"]>(row.notes),
        // Banquet charts have no designer. The type says string, as it does in the web app, but
        // the converted data carries the gap upstream left, and so does this.
        charter: row.charter as string,
        level: row.level,
        grade: row.grade,
        constant: row.constant as number,
        deluxeScoreMax: row.deluxe_score_max,
    };
    if (row.search_index !== null) info.searchIndex = parseJson<string[]>(row.search_index);
    if (row.stat !== null) info.stat = parseJson<ChartStats>(row.stat);
    return { id: row.id, info, music };
}

/**
 * The songs, charts and versions as the web app has them after restoring its cache, or undefined
 * when nothing has been fetched yet. The rows must have been built by this version of the CLI
 * (`CATALOG_BUILDER`); `ensureMetadata` sees to that before a command reads them.
 */
export function loadMusic(store: Store): LoadedMusic | undefined {
    const state = readMetaState(store, "saltmeta");
    if (!state) return undefined;
    const { db } = store;

    const songs = db.prepare("SELECT * FROM songs ORDER BY id").all() as unknown as SongRow[];
    const charts = db
        .prepare("SELECT * FROM charts ORDER BY song_id, position")
        .all() as unknown as ChartRow[];

    const musicList: Record<number, Music> = {};
    for (const row of songs) {
        const info: MusicInfo = {
            id: row.id,
            title: row.title,
            artist: row.artist,
            genre: row.genre as MusicGenre,
            // Banquet songs have no BPM; see the note on `charter`.
            bpm: row.bpm as number,
            from: row.version as unknown as MusicOrigin,
            isNew: row.is_new === 1,
            type: row.type as ChartType,
        };
        if (row.aliases !== null) info.aliases = parseJson<string[]>(row.aliases);
        if (row.search_index !== null) info.searchIndex = parseJson<string[]>(row.search_index);
        musicList[row.id] = { id: row.id, info, charts: [] };
    }
    for (const row of charts) {
        const music = musicList[row.song_id];
        if (music) music.charts.push(buildChart(row, music));
    }

    const versions = db
        .prepare("SELECT name, word FROM versions ORDER BY position")
        .all() as unknown as MusicMetadataState["cnVersions"];

    return {
        music: restoreCachedMusicData({
            musicList,
            chartList: {},
            region: "cn",
            cachedAt: state.fetchedAt,
            searchIndexVersion: MUSIC_SEARCH_INDEX_VERSION,
        }),
        metadata: { cnVersions: versions.map(({ name, word }) => ({ name, word })) },
        fetchedAt: state.fetchedAt,
    };
}

/** The LXNS lists as downloaded, rebuilt from the whole items the rows keep. */
export function loadCollectionLists(store: Store): LXNSCollectionLists {
    const lists: LXNSCollectionLists = { trophies: [], icons: [], plates: [], frames: [] };
    const rows = store.db
        .prepare(
            `SELECT kind, raw FROM collections
             WHERE kind IN (${COLLECTION_KINDS.map(() => "?").join(", ")})
             ORDER BY kind, position`
        )
        .all(...COLLECTION_KINDS) as unknown as { kind: keyof typeof LIST_OF_KIND; raw: string }[];
    for (const row of rows)
        lists[LIST_OF_KIND[row.kind]].push(parseJson<LXNSCollectionItem>(row.raw));
    return lists;
}

/**
 * The collections as the web app maps them (including the version plates), or undefined when
 * nothing has been fetched yet.
 */
export function loadCollections(store: Store): LoadedCollections | undefined {
    const state = readMetaState(store, "lxns-collections");
    if (!state) return undefined;
    return {
        collections: mapLXNSCollections(loadCollectionLists(store)),
        fetchedAt: state.fetchedAt,
    };
}
