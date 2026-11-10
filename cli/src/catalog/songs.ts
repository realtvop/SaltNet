/**
 * Songs as the commands talk about them (design 3.1): one SaltMeta entry, with its SD and DX
 * charts together. The web app keeps the two sides of a song as separate `Music` objects whose
 * ids differ by 10000; this puts them back together and indexes the names they can be found by.
 */
import type { Chart, Music, SavedMusicList } from "@core/music/type";
import { ChartType } from "@core/mai/types";
import { SALTMETA_DX_ID_OFFSET } from "@core/music/saltmeta";
import { foldName } from "../util/fold";

export interface Song {
    /** The SaltMeta id: an SD song's music id, or a DX or banquet song's music id minus 10000. */
    readonly id: number;
    /** The music id the song is referred to by: its SD id, or its DX id when it has no SD side. */
    readonly musicId: number;
    readonly title: string;
    readonly artist: string;
    /** Every alias of either side, without repeats. */
    readonly aliases: readonly string[];
    /** The SD side, when the song has SD charts. */
    readonly sd?: Music;
    /** The DX side, which also holds a banquet song's chart, when the song has one. */
    readonly dx?: Music;
}

/** What a song is shown as: `SD+DX` when it has charts of both kinds. */
export type SongType = "SD" | "DX" | "SD+DX";

export interface ChartEntry {
    readonly chart: Chart;
    readonly song: Song;
}

export interface SongCatalog {
    /** Every song, by ascending id. */
    readonly songs: readonly Song[];
    /** The song a music id belongs to; the SD id and the DX id of a song give the same song. */
    readonly songOfMusic: ReadonlyMap<number, Song>;
    readonly chartByKey: ReadonlyMap<string, ChartEntry>;
    /** Songs by title, as written and with case and width folded; each list is by ascending id. */
    readonly byTitle: ReadonlyMap<string, readonly Song[]>;
    readonly byFoldedTitle: ReadonlyMap<string, readonly Song[]>;
    /** The same for aliases. */
    readonly byAlias: ReadonlyMap<string, readonly Song[]>;
    readonly byFoldedAlias: ReadonlyMap<string, readonly Song[]>;
}

/** The key a chart goes by in every command: its music id and grade, as in `11451-3`. */
export function chartKey(musicId: number, grade: number): string {
    return `${musicId}-${grade}`;
}

export function chartKeyOf(chart: Pick<Chart, "music" | "info">): string {
    return chartKey(chart.music.id, chart.info.grade);
}

export function songType(song: Song): SongType {
    if (song.sd && song.dx) return "SD+DX";
    return song.sd ? "SD" : "DX";
}

/** The type of one chart: banquet charts count as DX, as they do in the web app. */
export function musicType(music: Music): "SD" | "DX" {
    return music.info.type === ChartType.Standard ? "SD" : "DX";
}

/** All the charts of a song, the SD side first, each side from the easiest. */
export function songCharts(song: Song): Chart[] {
    const byGrade = (a: Chart, b: Chart) => a.info.grade - b.info.grade;
    return [...(song.sd?.charts ?? [])]
        .sort(byGrade)
        .concat([...(song.dx?.charts ?? [])].sort(byGrade));
}

function addName(names: Map<string, Song[]>, name: string, song: Song): void {
    const songs = names.get(name);
    if (!songs) names.set(name, [song]);
    else if (!songs.includes(song)) songs.push(song);
}

function aliasesOf(sides: readonly (Music | undefined)[]): string[] {
    const aliases = new Set<string>();
    for (const side of sides) {
        for (const alias of side?.info.aliases ?? []) {
            if (alias.trim()) aliases.add(alias);
        }
    }
    return [...aliases];
}

export function buildSongCatalog(music: SavedMusicList): SongCatalog {
    const sides = new Map<number, { sd?: Music; dx?: Music }>();
    for (const entry of Object.values(music.musicList)) {
        const isSd = entry.info.type === ChartType.Standard;
        const songId = isSd ? entry.id : entry.id - SALTMETA_DX_ID_OFFSET;
        const side = sides.get(songId) ?? {};
        sides.set(songId, side);
        if (isSd) side.sd = entry;
        else side.dx = entry;
    }

    const songs: Song[] = [];
    for (const [id, side] of [...sides].sort((a, b) => a[0] - b[0])) {
        const main = side.sd ?? side.dx;
        if (!main) continue;
        songs.push({
            id,
            musicId: main.id,
            title: main.info.title,
            artist: main.info.artist,
            aliases: aliasesOf([side.sd, side.dx]),
            sd: side.sd,
            dx: side.dx,
        });
    }

    const songOfMusic = new Map<number, Song>();
    const chartByKey = new Map<string, ChartEntry>();
    const byTitle = new Map<string, Song[]>();
    const byFoldedTitle = new Map<string, Song[]>();
    const byAlias = new Map<string, Song[]>();
    const byFoldedAlias = new Map<string, Song[]>();
    for (const song of songs) {
        for (const side of [song.sd, song.dx]) {
            if (!side) continue;
            songOfMusic.set(side.id, song);
            for (const chart of side.charts) {
                const key = chartKeyOf(chart);
                if (!chartByKey.has(key)) chartByKey.set(key, { chart, song });
            }
        }
        addName(byTitle, song.title, song);
        addName(byFoldedTitle, foldName(song.title), song);
        for (const alias of song.aliases) {
            addName(byAlias, alias, song);
            addName(byFoldedAlias, foldName(alias), song);
        }
    }

    return { songs, songOfMusic, chartByKey, byTitle, byFoldedTitle, byAlias, byFoldedAlias };
}
