import type { RelatedCollectionsIndex } from "@core/collection/related";
import type { Collection } from "@core/collection/type";
import type { Chart } from "@core/music/type";
import { buildRelatedCollectionsIndex, getRelatedCollections } from "@core/collection/related";
import { shallowRef } from "vue";

const relatedCollectionsIndex = shallowRef<RelatedCollectionsIndex>(new Map());

export function updateRelatedCollectionsIndex(collections: Collection[]): void {
    relatedCollectionsIndex.value = buildRelatedCollectionsIndex(collections);
}

export function getRelatedCollectionsForChart(chart: Chart): Collection[] {
    return getRelatedCollections(relatedCollectionsIndex.value, chart);
}
