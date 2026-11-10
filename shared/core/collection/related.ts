import type { Chart } from "../music/type";
import type { Collection, CollectionRequired } from "./type";
import { getSaltNetMusicIdForChartType } from "../music/saltmeta";
import { requirementMatchesChart } from "./versionPlate";

/**
 * Reverse association from a music id to the collections whose requirements mention that music,
 * together with the requirements that do. Built once per collection snapshot and queried per chart.
 */
export type RelatedCollectionsIndex = ReadonlyMap<
    number,
    ReadonlyMap<Collection, ReadonlySet<CollectionRequired>>
>;

/**
 * Indexes `collections` by the music ids named in their requirements. Collection order is
 * preserved so lookups return candidates in the order they were given.
 */
export function buildRelatedCollectionsIndex(
    collections: readonly Collection[]
): RelatedCollectionsIndex {
    const index = new Map<number, Map<Collection, Set<CollectionRequired>>>();

    for (const collection of collections) {
        for (const requirement of collection.required ?? []) {
            for (const song of requirement.songs ?? []) {
                const musicId = getSaltNetMusicIdForChartType(song.id, song.type);
                let collectionsForMusic = index.get(musicId);
                if (!collectionsForMusic) {
                    collectionsForMusic = new Map();
                    index.set(musicId, collectionsForMusic);
                }

                let requirements = collectionsForMusic.get(collection);
                if (!requirements) {
                    requirements = new Set();
                    collectionsForMusic.set(collection, requirements);
                }
                requirements.add(requirement);
            }
        }
    }

    return index;
}

/**
 * Collections that have at least one requirement matching `chart` (its music and, when the
 * requirement lists difficulties, its grade). Each collection appears once.
 */
export function getRelatedCollections(index: RelatedCollectionsIndex, chart: Chart): Collection[] {
    const collectionsForMusic = index.get(chart.music.id);
    if (!collectionsForMusic) return [];

    const result: Collection[] = [];
    for (const [collection, requirements] of collectionsForMusic) {
        for (const requirement of requirements) {
            if (!requirementMatchesChart(requirement, chart)) continue;
            result.push(collection);
            break;
        }
    }
    return result;
}
