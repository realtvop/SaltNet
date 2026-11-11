/**
 * Finding songs by a text (design 3.2). A song is found by its title, an alias, how either of them
 * sounds (pinyin, romaji), its artist, one of its charters or its music id, and a hit says which of
 * these it was. `search` lists the hits best first; the song reference falls back on the same
 * matching after the exact names, and `charts --search` keeps the songs it finds.
 *
 * What counts as a match is what the web app's search box accepts: the normalized text (width,
 * case, punctuation and spaces ignored, simplified and traditional alike) contained in one of the
 * spellings the search index holds. The order is this module's own: exact names first, then
 * titles, aliases, sounds, artists and charters.
 */
import type { MusicSearchVariant } from "@core/music/search";
import type { ChartEntry, Song, SongCatalog } from "./songs";
import {
    createMusicSearchQuery,
    createMusicSearchVariants,
    matchesMusicSearchIndex,
} from "@core/music/search";
import { foldName } from "../util/fold";
import { songCharts } from "./songs";

/** The ways a text can find a song, in the order `matchedBy` lists them. */
export const MATCH_KINDS = [
    "id",
    "title",
    "alias",
    "pinyin",
    "romaji",
    "artist",
    "charter",
] as const;

export type MatchKind = (typeof MATCH_KINDS)[number];

/** The kinds that say the text is (part of) the song's name, which is what a reference needs. */
export const NAME_MATCH_KINDS: readonly MatchKind[] = ["title", "alias", "pinyin", "romaji"];

export interface SongMatch {
    readonly song: Song;
    /** Higher is better; only the order of the scores means anything. */
    readonly score: number;
    /** Every way the text found the song, in the order of `MATCH_KINDS`. */
    readonly matchedBy: readonly MatchKind[];
}

/**
 * How good a hit is, by what was hit. A song's score is that of its best hit. The exact names
 * rank above everything, so `search` puts the song a reference would resolve to first.
 */
const SCORE = {
    titleExact: 100,
    titleFolded: 90,
    id: 85,
    aliasExact: 80,
    aliasFolded: 70,
    /** The normalized text is the whole title, or the whole alias. */
    titleSame: 60,
    aliasSame: 55,
    titlePrefix: 50,
    titleContains: 40,
    aliasContains: 30,
    /** The text is found in the pinyin or the romaji of a title or an alias. */
    sound: 25,
    artist: 20,
    charter: 10,
} as const;

type Relation = "same" | "prefix" | "contains";

const RELATION_RANK: Readonly<Record<Relation, number>> = { same: 3, prefix: 2, contains: 1 };

function relationOf(text: string, query: string): Relation | undefined {
    if (text === query) return "same";
    if (text.startsWith(query)) return "prefix";
    return text.includes(query) ? "contains" : undefined;
}

/** How a normalized text relates to the closest of the query's spellings. */
function relationToAny(text: string, queries: readonly string[]): Relation | undefined {
    let best: Relation | undefined;
    for (const query of queries) {
        const relation = relationOf(text, query);
        if (relation && (!best || RELATION_RANK[relation] > RELATION_RANK[best])) best = relation;
    }
    return best;
}

interface Query {
    /** What was typed, trimmed. */
    readonly raw: string;
    /** `raw` with case and width folded, to compare with names. */
    readonly folded: string;
    /** The music id the text spells, when it is a number. */
    readonly id: number | undefined;
    /** The normalized spellings of the text (as typed, and in simplified characters). */
    readonly normalized: readonly string[];
}

function buildQuery(text: string): Query | undefined {
    const raw = text.trim();
    if (!raw) return undefined;
    const id = /^\d+$/.test(raw) ? Number(raw) : undefined;
    return {
        raw,
        folded: foldName(raw),
        id: id !== undefined && Number.isSafeInteger(id) ? id : undefined,
        normalized: createMusicSearchQuery(raw),
    };
}

/**
 * Whether the index the catalog stores for the song (its names and artist, and the charters of
 * its charts) holds the query. It is a cheap test that lets most songs skip the work of
 * recomputing every spelling; it never rules out a song the full check would find, because that
 * check looks at the same texts. Music without an index (one not built through the shared
 * indexing) cannot be ruled out.
 */
function mayContain(song: Song, queries: readonly string[]): boolean {
    const holds = (index: readonly string[] | undefined): boolean =>
        index === undefined || matchesMusicSearchIndex(index, queries);
    for (const side of [song.sd, song.dx]) {
        if (!side) continue;
        if (holds(side.info.searchIndex)) return true;
        if (side.charts.some(chart => holds(chart.info.searchIndex))) return true;
    }
    return false;
}

/** What a hit on one field gives, by how the text relates to the field's own text. */
type FieldScores = Readonly<Record<Relation, number>>;

const TITLE_SCORES: FieldScores = {
    same: SCORE.titleSame,
    prefix: SCORE.titlePrefix,
    contains: SCORE.titleContains,
};
const ALIAS_SCORES: FieldScores = {
    same: SCORE.aliasSame,
    prefix: SCORE.aliasContains,
    contains: SCORE.aliasContains,
};

function evaluate(song: Song, query: Query): SongMatch | undefined {
    const kinds = new Set<MatchKind>();
    let score = 0;
    const hit = (kind: MatchKind, points: number): void => {
        kinds.add(kind);
        if (points > score) score = points;
    };

    // The ids the song answers to: the same ones a reference accepts.
    if (query.id !== undefined && (song.sd?.id === query.id || song.dx?.id === query.id)) {
        hit("id", SCORE.id);
    }

    // Names as written, which need no search index (a title may be nothing but symbols).
    if (song.title === query.raw) hit("title", SCORE.titleExact);
    else if (foldName(song.title) === query.folded) hit("title", SCORE.titleFolded);
    for (const alias of song.aliases) {
        if (alias === query.raw) hit("alias", SCORE.aliasExact);
        else if (foldName(alias) === query.folded) hit("alias", SCORE.aliasFolded);
    }

    if (query.normalized.length > 0 && mayContain(song, query.normalized)) {
        // A field's own text counts as the field (`title`); its pinyin and romaji count as sounds.
        const searchName = (
            variants: readonly MusicSearchVariant[],
            field: "title" | "alias",
            scores: FieldScores
        ): void => {
            for (const variant of variants) {
                const relation = relationToAny(variant.text, query.normalized);
                if (!relation) continue;
                if (variant.kind === "text") hit(field, scores[relation]);
                else hit(variant.kind, SCORE.sound);
            }
        };
        // An artist or a charter counts however its text was reached.
        const searchOther = (
            variants: readonly MusicSearchVariant[],
            kind: "artist" | "charter",
            points: number
        ): void => {
            if (variants.some(variant => relationToAny(variant.text, query.normalized))) {
                hit(kind, points);
            }
        };

        searchName(createMusicSearchVariants(song.title), "title", TITLE_SCORES);
        for (const alias of song.aliases) {
            searchName(createMusicSearchVariants(alias), "alias", ALIAS_SCORES);
        }
        searchOther(createMusicSearchVariants(song.artist), "artist", SCORE.artist);
        const charters = new Set(songCharts(song).map(chart => chart.info.charter));
        for (const charter of charters) {
            if (charter) searchOther(createMusicSearchVariants(charter), "charter", SCORE.charter);
        }
    }

    if (kinds.size === 0) return undefined;
    return { song, score, matchedBy: MATCH_KINDS.filter(kind => kinds.has(kind)) };
}

/**
 * Every song the text finds, best first; songs that are equally good come in music id order, so
 * the same catalog and text always give the same list. A blank text finds nothing.
 */
export function searchSongs(catalog: SongCatalog, text: string): SongMatch[] {
    const query = buildQuery(text);
    if (!query) return [];

    const matches: SongMatch[] = [];
    for (const song of catalog.songs) {
        const match = evaluate(song, query);
        if (match) matches.push(match);
    }
    return matches.sort((a, b) => b.score - a.score || a.song.musicId - b.song.musicId);
}

/**
 * The charts a text finds (`charts --search`): all the charts of a song found by its names,
 * artist or id, but, for a song only a charter's name matched, just the charts that charter made;
 * the web app searches charters per chart too. The order is the songs' (best first), each song's
 * charts from the easiest, SD before DX.
 */
export function searchChartEntries(catalog: SongCatalog, text: string): ChartEntry[] {
    const query = buildQuery(text);
    if (!query) return [];

    const byCharter = (charter: string | null | undefined): boolean =>
        !!charter &&
        createMusicSearchVariants(charter).some(variant =>
            relationToAny(variant.text, query.normalized)
        );
    const entries: ChartEntry[] = [];
    for (const { song, matchedBy } of searchSongs(catalog, text)) {
        const charterOnly = matchedBy.length === 1 && matchedBy[0] === "charter";
        for (const chart of songCharts(song)) {
            if (!charterOnly || byCharter(chart.info.charter)) entries.push({ chart, song });
        }
    }
    return entries;
}
