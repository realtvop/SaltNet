import { shallowRef } from "vue";
import type { Chart } from "../music/type";
import { getSaltNetMusicIdForChartType } from "../music/saltmeta";
import type { Collection, CollectionRequired } from "./type";
import { requirementMatchesChart } from "./versionPlate";

type RelatedCollectionsIndex = ReadonlyMap<
    number,
    ReadonlyMap<Collection, ReadonlySet<CollectionRequired>>
>;

const relatedCollectionsIndex = shallowRef<RelatedCollectionsIndex>(new Map());

export function updateRelatedCollectionsIndex(collections: Collection[]): void {
    const nextIndex = new Map<number, Map<Collection, Set<CollectionRequired>>>();

    for (const collection of collections) {
        for (const requirement of collection.required ?? []) {
            for (const song of requirement.songs ?? []) {
                const musicId = getSaltNetMusicIdForChartType(song.id, song.type);
                let collectionsForMusic = nextIndex.get(musicId);
                if (!collectionsForMusic) {
                    collectionsForMusic = new Map();
                    nextIndex.set(musicId, collectionsForMusic);
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

    relatedCollectionsIndex.value = nextIndex;
}

export function getRelatedCollectionsForChart(chart: Chart): Collection[] {
    const collectionsForMusic = relatedCollectionsIndex.value.get(chart.music.id);
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
