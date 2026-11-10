/**
 * Turning what was typed into a song (design 3.1). A pure number is a music id, `n-n` is a chart
 * key, and anything else is a name, tried as an exact title, then an exact alias, then through
 * the search index. A step settles the matter as soon as it finds anything, and what it finds
 * must be exactly one song: several are `AMBIGUOUS_REF`, none at all moves on to the next step.
 */
import type { Chart } from "@core/music/type";
import type { ChartEntry, Song, SongCatalog } from "../catalog/songs";
import type { ErrorCandidate } from "../errors";
import { SALTMETA_DX_ID_OFFSET } from "@core/music/saltmeta";
import {
    createMusicSearchIndex,
    createMusicSearchQuery,
    matchesMusicSearchIndex,
} from "@core/music/search";
import { chartKey, chartKeyOf, musicType, songCharts, songType } from "../catalog/songs";
import { CliError, usageError } from "../errors";
import { closestItems } from "../util/closest";
import { echo } from "../util/echo";
import { foldName } from "../util/fold";
import { difficultyLabel } from "./difficulty";

/** How many songs an `AMBIGUOUS_REF` lists; the rest are only counted. */
export const MAX_AMBIGUOUS_CANDIDATES = 10;
/** How many near misses a `NOT_FOUND` lists. */
export const MAX_NEAREST_CANDIDATES = 5;

const DIGITS = /^\d+$/;
const CHART_KEY = /^(\d+)-(\d+)$/;

/** The music id and grade of a chart key such as `11451-3`. */
export function parseChartKey(text: string): { musicId: number; grade: number } | undefined {
    const match = CHART_KEY.exec(text);
    if (!match) return undefined;
    const musicId = Number(match[1]);
    const grade = Number(match[2]);
    return Number.isSafeInteger(musicId) && Number.isSafeInteger(grade)
        ? { musicId, grade }
        : undefined;
}

export function isMusicId(text: string): boolean {
    return DIGITS.test(text);
}

export function songCandidate(song: Song): ErrorCandidate {
    return {
        ref: String(song.musicId),
        title: song.title,
        artist: song.artist,
        type: songType(song),
    };
}

export function chartCandidate(song: Song, chart: Chart): ErrorCandidate {
    return {
        ref: chartKeyOf(chart),
        title: song.title,
        type: musicType(chart.music),
        difficulty: difficultyLabel(chart.info.grade),
        level: chart.info.level,
    };
}

/** `saltnet search ...` for the text, when the text is safe to repeat in a suggestion. */
function searchFix(text: string): string | undefined {
    return echo(text) ? `saltnet search ${text}` : undefined;
}

/** No song has this music id. Songs titled with the number are what its writer most likely meant. */
export function unknownMusicId(catalog: SongCatalog, text: string): CliError {
    const hints: Song[] = [];
    const add = (song: Song | undefined): void => {
        if (song && !hints.includes(song)) hints.push(song);
    };
    const id = Number(text);
    // The id of a DX song is its base id plus 10000, which is easy to leave off.
    if (Number.isSafeInteger(id)) add(catalog.songOfMusic.get(id + SALTMETA_DX_ID_OFFSET));
    (catalog.byTitle.get(text) ?? []).forEach(add);
    (catalog.byAlias.get(text) ?? []).forEach(add);

    const shown = echo(text);
    return new CliError(
        "NOT_FOUND",
        `找不到曲目${shown}；纯数字按曲目 id 解析，标题或别名是数字的歌请先用 search 查找`,
        {
            candidates: hints.slice(0, MAX_NEAREST_CANDIDATES).map(songCandidate),
            fix: searchFix(text),
        }
    );
}

/** The chart a music id and grade name, or `NOT_FOUND`. */
export function findChart(catalog: SongCatalog, musicId: number, grade: number): ChartEntry {
    const entry = catalog.chartByKey.get(chartKey(musicId, grade));
    if (entry) return entry;
    const song = catalog.songOfMusic.get(musicId);
    if (!song) throw unknownMusicId(catalog, String(musicId));
    // Which side was looked at only matters when the song has the other one as well.
    const side =
        song.sd && song.dx ? musicType(musicId === song.sd.id ? song.sd : song.dx) : undefined;
    throw missingChart(song, grade, side);
}

/** The song has no chart of this difficulty (on this side, when only one was asked about). */
export function missingChart(song: Song, grade: number, side?: string): CliError {
    return new CliError(
        "NOT_FOUND",
        `「${song.title}」${side ? `的 ${side} 部分` : ""}没有 ${difficultyLabel(grade)} 谱面`,
        { candidates: songCharts(song).map(chart => chartCandidate(song, chart)) }
    );
}

function ambiguousSongs(text: string, hits: readonly Song[]): CliError {
    const shown = hits.slice(0, MAX_AMBIGUOUS_CANDIDATES);
    const truncated = shown.length < hits.length;
    return new CliError(
        "AMBIGUOUS_REF",
        `${echo(text) || "这个引用"}对应 ${hits.length} 首歌${truncated ? `，只列出前 ${shown.length} 首` : ""}`,
        { candidates: shown.map(songCandidate), fix: truncated ? searchFix(text) : undefined }
    );
}

function songNotFound(catalog: SongCatalog, text: string): CliError {
    const near = closestItems(
        foldName(text),
        catalog.songs,
        song => [song.title, ...song.aliases].map(foldName),
        MAX_NEAREST_CANDIDATES
    );
    const shown = echo(text);
    return new CliError("NOT_FOUND", shown ? `找不到曲目${shown}` : "找不到这个引用对应的曲目", {
        candidates: near.map(songCandidate),
        fix: searchFix(text),
    });
}

/**
 * The songs whose title or alias contains the text, in any of the spellings the search index
 * knows (simplified and traditional, pinyin, romaji). The index the catalog keeps also holds the
 * artist; a reference names a song, so a song only counts when its own names match.
 */
function searchByNames(catalog: SongCatalog, text: string): Song[] {
    const query = createMusicSearchQuery(text);
    if (query.length === 0) return [];
    return catalog.songs.filter(song => {
        const stored = (song.sd ?? song.dx)?.info.searchIndex;
        return (
            matchesMusicSearchIndex(stored, query) &&
            matchesMusicSearchIndex(createMusicSearchIndex([song.title, ...song.aliases]), query)
        );
    });
}

function exactlyOne(text: string, hits: readonly Song[]): Song {
    if (hits.length === 1) return hits[0];
    throw ambiguousSongs(text, hits);
}

function resolveByName(catalog: SongCatalog, text: string): Song {
    const folded = foldName(text);
    // Titles first, as written and then folded, so that `TRUST` finds its song although `trust`
    // would not; then aliases the same way.
    const exact = [
        catalog.byTitle.get(text),
        catalog.byFoldedTitle.get(folded),
        catalog.byAlias.get(text),
        catalog.byFoldedAlias.get(folded),
    ];
    for (const hits of exact) {
        if (hits?.length) return exactlyOne(text, hits);
    }
    const hits = searchByNames(catalog, text);
    if (hits.length > 0) return exactlyOne(text, hits);
    throw songNotFound(catalog, text);
}

/** The song a reference names, or `USAGE`, `NOT_FOUND` or `AMBIGUOUS_REF`. */
export function resolveSong(catalog: SongCatalog, ref: string): Song {
    const text = ref.trim();
    if (!text) throw usageError("曲目引用不能为空");

    if (DIGITS.test(text)) {
        const musicId = Number(text);
        const song = Number.isSafeInteger(musicId) ? catalog.songOfMusic.get(musicId) : undefined;
        if (song) return song;
        throw unknownMusicId(catalog, text);
    }

    const key = parseChartKey(text);
    if (key) return findChart(catalog, key.musicId, key.grade).song;

    return resolveByName(catalog, text);
}
