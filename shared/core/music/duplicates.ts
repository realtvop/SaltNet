import type { SaltMetaMusicMetadataNext } from "./saltmeta";

type SaltMetaMusic = SaltMetaMusicMetadataNext["musics"][number];
type SaltMetaChart = SaltMetaMusic["charts"][number];

/** One song that upstream lists more than once, as it was folded into a single entry. */
export interface MergedDuplicateMusic {
    /** The SaltMeta id the entries share (before the DX offset is applied). */
    id: number;
    /** The title that was kept. */
    title: string;
    /** The titles of the entries that were folded into it, in document order. */
    mergedTitles: string[];
}

export interface DuplicateMergeResult {
    metadata: SaltMetaMusicMetadataNext;
    merged: MergedDuplicateMusic[];
}

/** `[幸]犬日和。…`, `【宴】…`: how banquet songs of other regions mark themselves. */
const TITLE_PREFIX = /^(?:\[[^\]]+\]|【[^】]+】)/u;

function regionCount(music: SaltMetaMusic): number {
    return music.charts.reduce((count, chart) => count + Object.keys(chart.regions).length, 0);
}

/**
 * The entry whose title is kept: one that carries a region prefix, otherwise the one that knows
 * the most regions, otherwise the first.
 */
function chooseKept(entries: readonly SaltMetaMusic[]): SaltMetaMusic {
    let kept = entries[0];
    for (const entry of entries.slice(1)) {
        const keptPrefixed = TITLE_PREFIX.test(kept.title);
        const entryPrefixed = TITLE_PREFIX.test(entry.title);
        if (entryPrefixed !== keptPrefixed) {
            if (entryPrefixed) kept = entry;
        } else if (regionCount(entry) > regionCount(kept)) {
            kept = entry;
        }
    }
    return kept;
}

function sameChart(a: SaltMetaChart, b: SaltMetaChart): boolean {
    return a.type === b.type && a.difficulty === b.difficulty;
}

/** Copies what `other` knows into `base` where `base` has nothing; `base` wins every conflict. */
function fillChart(base: SaltMetaChart, other: SaltMetaChart): SaltMetaChart {
    return {
        ...base,
        noteDesigner: base.noteDesigner || other.noteDesigner,
        regions: { ...other.regions, ...base.regions },
        ...(base.fitDiffDF || !other.fitDiffDF ? {} : { fitDiffDF: other.fitDiffDF }),
    };
}

function mergeEntries(kept: SaltMetaMusic, others: readonly SaltMetaMusic[]): SaltMetaMusic {
    let charts = kept.charts.map(chart => ({ ...chart, regions: { ...chart.regions } }));
    const aliases = [...(kept.aliases?.cn ?? [])];
    let { bpm, artist, comment } = kept;

    for (const other of others) {
        for (const chart of other.charts) {
            const index = charts.findIndex(existing => sameChart(existing, chart));
            charts =
                index < 0
                    ? [...charts, { ...chart, regions: { ...chart.regions } }]
                    : charts.map((existing, at) =>
                          at === index ? fillChart(existing, chart) : existing
                      );
        }
        for (const alias of [...(other.aliases?.cn ?? []), other.title]) {
            if (alias !== kept.title && !aliases.includes(alias)) aliases.push(alias);
        }
        bpm ??= other.bpm;
        artist ||= other.artist;
        comment ||= other.comment;
    }

    const merged: SaltMetaMusic = { ...kept, bpm, artist, charts };
    if (aliases.length > 0) merged.aliases = { cn: aliases };
    if (comment) merged.comment = comment;
    return merged;
}

/**
 * Upstream lists a few banquet songs twice under one id: one entry that only knows the CN region
 * with a plain title, and one for every region with a region prefix (`[幸]…`). The web app keeps
 * both, so two charts collide on one chart id. This folds each such group into a single entry: the
 * title with the prefix stays, the other title becomes an alias, and the charts and regions of
 * both are combined. The input is not modified.
 */
export function mergeDuplicateMusics(metadata: SaltMetaMusicMetadataNext): DuplicateMergeResult {
    const groups = new Map<number, SaltMetaMusic[]>();
    for (const music of metadata.musics) {
        const group = groups.get(music.id);
        if (group) group.push(music);
        else groups.set(music.id, [music]);
    }

    const merged: MergedDuplicateMusic[] = [];
    const musics: SaltMetaMusic[] = [];
    for (const [id, entries] of groups) {
        if (entries.length === 1) {
            musics.push(entries[0]);
            continue;
        }
        const kept = chooseKept(entries);
        musics.push(
            mergeEntries(
                kept,
                entries.filter(entry => entry !== kept)
            )
        );
        merged.push({
            id,
            title: kept.title,
            mergedTitles: entries.filter(entry => entry !== kept).map(entry => entry.title),
        });
    }

    return { metadata: { ...metadata, musics }, merged };
}
