import type { Chart } from "../music/type";
import type { User } from "../user/type";
import type { Collection } from "./type";
import { createDetailedScoreLookup, toChartScore } from "../chart/scoreLookup";
import { getCollectionCharts, sortCollectionChartsByCompletion } from "./versionPlate";

export function getScoredCollectionCharts(
    collection: Collection,
    charts: Chart[],
    detailed: User["data"]["detailed"]
): Chart[] {
    const scoreLookup = createDetailedScoreLookup(detailed);
    const withScores = charts.map(chart => ({
        ...chart,
        score: toChartScore(scoreLookup?.findScoreForChart(chart)),
    }));
    return sortCollectionChartsByCompletion(
        collection,
        getCollectionCharts(collection, withScores)
    );
}
