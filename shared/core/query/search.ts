import type { MusicSearchVariant } from "../music/search";
import type { Chart, MusicInfo } from "../music/type";
import {
    createMusicSearchQuery,
    createMusicSearchVariants,
    matchesMusicSearchIndex,
} from "../music/search";

enum Tier {
    Id,
    ExactName,
    NamePrefix,
    NameContains,
    Sound,
    Artist,
    Charter,
    Score,
}

/** Lower is better. A stronger tier always wins, regardless of the other fields. */
type Rank = readonly [tier: Tier, relation: number, field: number];
type Relation = 0 | 1 | 2;
const NAME_TIERS = [Tier.ExactName, Tier.NamePrefix, Tier.NameContains] as const;
const SCORE_RANK: Rank = [Tier.Score, 0, 0];

function compareRanks(a: Rank, b: Rank): number {
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function betterRank(a: Rank | undefined, b: Rank | undefined): Rank | undefined {
    if (!a) return b;
    return b && compareRanks(b, a) < 0 ? b : a;
}

interface CachedFields {
    texts: readonly string[];
    variants: MusicSearchVariant[][];
}

// Metadata is shared by all of a song's charts. Keep transliteration across keystrokes without
// retaining old catalogs, and rebuild if any source text (including an alias) changes in place.
const fieldCache = new WeakMap<object, CachedFields>();

function fieldsFor(owner: object, texts: readonly string[]): MusicSearchVariant[][] {
    const cached = fieldCache.get(owner);
    if (
        cached &&
        cached.texts.length === texts.length &&
        texts.every((text, index) => text === cached.texts[index])
    ) {
        return cached.variants;
    }
    const variants = texts.map(createMusicSearchVariants);
    fieldCache.set(owner, { texts, variants });
    return variants;
}

/** Whole text, prefix, then substring; undefined means there is no match. */
function relationOf(text: string, queries: readonly string[]): Relation | undefined {
    let best: Relation | undefined;
    for (const query of queries) {
        const relation =
            text === query ? 0 : text.startsWith(query) ? 1 : text.includes(query) ? 2 : undefined;
        if (relation !== undefined && (best === undefined || relation < best)) best = relation;
    }
    return best;
}

function rankField(
    variants: readonly MusicSearchVariant[],
    queries: readonly string[],
    field: "title" | "alias" | "artist" | "charter"
): Rank | undefined {
    let best: Rank | undefined;
    for (const variant of variants) {
        const relation = relationOf(variant.text, queries);
        if (relation === undefined) continue;
        let rank: Rank;
        if (field === "artist" || field === "charter") {
            rank = [field === "artist" ? Tier.Artist : Tier.Charter, relation, 0];
        } else {
            const nameField = field === "title" ? 0 : 1;
            rank =
                variant.kind === "text"
                    ? [NAME_TIERS[relation], 0, nameField]
                    : [Tier.Sound, relation, nameField];
        }
        best = betterRank(best, rank);
    }
    return best;
}

function rankMusic(info: MusicInfo, queries: readonly string[]): Rank | undefined {
    if (!matchesMusicSearchIndex(info.searchIndex, queries)) return undefined;
    const fields = fieldsFor(info, [info.title, ...(info.aliases ?? []), info.artist]);
    let best: Rank | undefined;
    for (const [index, variants] of fields.entries()) {
        const field = index === 0 ? "title" : index === fields.length - 1 ? "artist" : "alias";
        best = betterRank(best, rankField(variants, queries, field));
    }
    // Retain indexed hits even if an older index contains a spelling the current fields lack.
    return best ?? SCORE_RANK;
}

/**
 * The web search keeps its existing matches, ordered by ID, whole name, name prefix, name
 * substring, name transliteration, artist, charter, then score/status. Names share the same
 * normalization as the stored index; titles break ties with aliases, and transliterations also
 * prefer whole text to prefixes to substrings. Only the best match counts. Equal ranks retain
 * the incoming order, and neither charts nor their scores/position indexes are changed.
 */
export function searchCharts<T extends Chart>(charts: T[], queryText: string): T[] {
    if (!queryText) return charts;

    const queries = createMusicSearchQuery(queryText);
    const musicRanks = new Map<MusicInfo, Rank | undefined>();
    const matches: Array<{ chart: T; rank: Rank; position: number }> = [];
    for (const [position, chart] of charts.entries()) {
        let rank: Rank | undefined;
        if (chart.music.info.id.toString() === queryText) {
            rank = [Tier.Id, 0, 0];
        } else {
            const info = chart.music.info;
            if (!musicRanks.has(info)) musicRanks.set(info, rankMusic(info, queries));
            rank = musicRanks.get(info);
            if (matchesMusicSearchIndex(chart.info.searchIndex, queries)) {
                const [variants] = fieldsFor(chart.info, [chart.info.charter]);
                rank = betterRank(rank, rankField(variants, queries, "charter") ?? SCORE_RANK);
            }
            const score = chart.score;
            if (
                !rank &&
                (score?.achievements?.toString().includes(queryText) ||
                    score?.comboStatus?.toString().includes(queryText) ||
                    score?.syncStatus?.toString().includes(queryText))
            ) {
                rank = SCORE_RANK;
            }
        }
        if (rank) matches.push({ chart, rank, position });
    }
    return matches
        .sort((a, b) => compareRanks(a.rank, b.rank) || a.position - b.position)
        .map(match => match.chart);
}
