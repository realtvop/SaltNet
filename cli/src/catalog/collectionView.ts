/**
 * Collections as the commands print them (design 3.2): the row `collection list` gives for each,
 * and what `collection show` adds: the conditions, the charts they name and the songs the catalog
 * does not have. Ownership and progress use the same core functions as the web collection page.
 */
import type { Collection, CollectionRequired, Title } from "@core/collection/type";
import type { CollectionProgress } from "@core/collection/versionPlate";
import type { Chart } from "@core/music/type";
import type { CollectionEntry, CollectionKindName } from "../refs/collection";
import type { UserScores } from "../users/scores";
import type { ChartRow } from "./chartRow";
import type { ChartEntry, SongCatalog } from "./songs";
import {
    getOwnedCollectionIds,
    isCollectionOwned,
    toCharacterCollection,
} from "@core/collection/ownership";
import { characters } from "@core/collection/static";
import {
    checkCollectionChartFinish,
    getCollectionProgress,
    isCollectionScoreEvaluable,
} from "@core/collection/versionPlate";
import { getSaltNetMusicIdForChartType } from "@core/music/saltmeta";
import { collectionRef } from "../refs/collection";
import { difficultyLabel } from "../refs/difficulty";
import { comboLabel, rankLabel, syncLabel } from "../refs/status";
import { chartsWithCollectionScores } from "../users/scores";
import { chartRow } from "./chartRow";
import { collectionCharts } from "./chartSets";
import { chartKeyOf } from "./songs";

export interface CollectionUserContext {
    readonly scores: UserScores;
    readonly scoredCharts: Chart[];
    readonly scoredByChartKey: ReadonlyMap<string, Chart>;
    readonly ownedIds: ReturnType<typeof getOwnedCollectionIds>;
}

/** Builds score and ownership lookups once for every row of a command result. */
export function collectionUserContext(
    scores: UserScores | undefined,
    charts: readonly Chart[]
): CollectionUserContext | undefined {
    if (!scores) return undefined;
    const scoredCharts = chartsWithCollectionScores(charts, scores);
    return {
        scores,
        scoredCharts,
        scoredByChartKey: new Map(scoredCharts.map(chart => [chartKeyOf(chart), chart])),
        ownedIds: getOwnedCollectionIds(scores.raw),
    };
}

export interface CollectionRow {
    /** `title:5108`: what `collection show` and `charts --collection` take. */
    readonly ref: string;
    readonly kind: CollectionKindName;
    readonly id: number;
    readonly name: string;
    /** What the game files it under (`実績`, a region such as `でらっくすちほー`); null for a partner. */
    readonly genre: string | null;
    /** The rarity of a title (`Normal`, `Bronze`, `Silver`, `Gold`, `Rainbow`); null for the others. */
    readonly color: string | null;
    /** How the game says it is obtained. */
    readonly description: string;
    /** How many songs the conditions name; 0 when they name none, as with most titles and icons. */
    readonly songCount: number;
    /** Whether the selected user has it; null without a selected user. */
    readonly owned: boolean | null;
    /** Score progress for evaluable collections; null otherwise or without a selected user. */
    readonly progress: CollectionProgress | null;
}

/** One condition: what has to be reached, at which difficulties, on which songs. */
export interface RequirementRow {
    /** BASIC to Re:MASTER; null when any difficulty of the song will do. */
    readonly difficulties: readonly string[] | null;
    /** The lowest rank it asks for (`SSS`); null when it asks for none. */
    readonly rank: string | null;
    /** The lowest combo status it asks for (`FC`, `AP+`); null when it asks for none. */
    readonly combo: string | null;
    /** The lowest sync status it asks for (`FS`, `FDX+`); null when it asks for none. */
    readonly sync: string | null;
    /** How many songs it applies to. */
    readonly songCount: number;
}

export interface CollectionDetail extends CollectionRow {
    /** The conditions, in the order the data has them; empty when the game gives only the text. */
    readonly requirements: readonly RequirementRow[];
}

/** A chart a collection asks for. */
export interface CollectionChartRow extends ChartRow {
    /** Whether the user has met the condition on it; null without a selected user. */
    readonly done: boolean | null;
}

/** A song the conditions name that the catalog does not have. */
export interface MissingCollectionSong {
    readonly musicId: number;
    /** As the condition data writes it. */
    readonly title: string;
}

/** The music id each song of a requirement stands for in the catalog (`1590` DX is `11590`). */
function musicIdsOf(requirement: CollectionRequired): number[] {
    return (requirement.songs ?? []).map(song => getSaltNetMusicIdForChartType(song.id, song.type));
}

function songCountOf(collection: Collection): number {
    return new Set((collection.required ?? []).flatMap(musicIdsOf)).size;
}

const charactersById = new Map(characters.map(character => [character.id, character]));

function owned(entry: CollectionEntry, context: CollectionUserContext): boolean {
    const { collection, kind } = entry;
    const character = kind === "character" ? charactersById.get(collection.id) : undefined;
    const target =
        character === undefined ? collection : toCharacterCollection(character, context.scores.raw);
    return isCollectionOwned(target, () => context.ownedIds) === true;
}

export function collectionRow(
    entry: CollectionEntry,
    context?: CollectionUserContext
): CollectionRow {
    const { kind, collection } = entry;
    return {
        ref: collectionRef(entry),
        kind,
        id: collection.id,
        name: collection.name,
        genre: collection.genre ?? null,
        color: kind === "title" ? ((collection as Title).color ?? null) : null,
        description: collection.description,
        songCount: songCountOf(collection),
        owned: context ? owned(entry, context) : null,
        progress:
            context && isCollectionScoreEvaluable(collection)
                ? getCollectionProgress(collection, context.scoredCharts)
                : null,
    };
}

export function requirementRow(requirement: CollectionRequired): RequirementRow {
    const { difficulties, rate, fc, fs } = requirement;
    return {
        difficulties: difficulties?.length ? difficulties.map(difficultyLabel) : null,
        rank: rate ? rankLabel(rate) : null,
        combo: fc ? comboLabel(fc) : null,
        sync: fs ? syncLabel(fs) : null,
        songCount: new Set(musicIdsOf(requirement)).size,
    };
}

export function collectionDetail(
    entry: CollectionEntry,
    context?: CollectionUserContext
): CollectionDetail {
    return {
        ...collectionRow(entry, context),
        requirements: (entry.collection.required ?? []).map(requirementRow),
    };
}

/** The charts the collection asks for among `entries`, in the order `entries` has them. */
export function collectionChartEntries(
    collection: Collection,
    entries: readonly ChartEntry[]
): ChartEntry[] {
    const { keys } = collectionCharts(collection, entries);
    return entries.filter(({ chart }) => keys.has(chartKeyOf(chart)));
}

export function collectionChartDone(
    collection: Collection,
    entry: ChartEntry,
    context?: CollectionUserContext
): boolean | null {
    if (!context) return null;
    const chart = context.scoredByChartKey.get(chartKeyOf(entry.chart)) ?? entry.chart;
    return checkCollectionChartFinish(collection, chart);
}

export function collectionChartRow(
    entry: ChartEntry,
    scores?: UserScores,
    done: boolean | null = null
): CollectionChartRow {
    return { ...chartRow(entry, scores), done };
}

/** The songs the conditions name that the catalog lacks, once each, in the order of the data. */
export function missingCollectionSongs(
    collection: Collection,
    catalog: SongCatalog
): MissingCollectionSong[] {
    const missing = new Map<number, MissingCollectionSong>();
    for (const requirement of collection.required ?? []) {
        for (const song of requirement.songs ?? []) {
            const musicId = getSaltNetMusicIdForChartType(song.id, song.type);
            if (catalog.songOfMusic.has(musicId) || missing.has(musicId)) continue;
            missing.set(musicId, { musicId, title: song.title });
        }
    }
    return [...missing.values()];
}
