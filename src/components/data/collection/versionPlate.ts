import { ComboStatus, RankRate, SyncStatus } from "../maiTypes";
import type { Chart, ChartScore } from "../music/type";
import { getSaltNetMusicIdForChartType } from "../music/saltmeta";
import type { Collection, CollectionRequired, VersionPlate } from "./type";

const rankOrder = Object.values(RankRate);
const comboOrder = Object.values(ComboStatus);
const syncOrder = Object.values(SyncStatus);

const requirementLookupCache = new WeakMap<Collection, Map<number, CollectionRequired[]>>();

function reachesThreshold<T extends string>(current: T, required: T, order: T[]): boolean {
    const currentIndex = order.indexOf(current);
    const requiredIndex = order.indexOf(required);
    return currentIndex !== -1 && requiredIndex !== -1 && currentIndex >= requiredIndex;
}

export function isRequirementScoreEvaluable(requirement: CollectionRequired): boolean {
    return Boolean(requirement.songs?.length);
}

export function isCollectionScoreEvaluable(collection: Collection): boolean {
    return Boolean(
        collection.required?.length && collection.required.every(isRequirementScoreEvaluable)
    );
}

function requirementMatchesChart(requirement: CollectionRequired, chart: Chart): boolean {
    const difficulties = requirement.difficulties ?? [];
    return difficulties.length === 0 || difficulties.includes(chart.info.grade);
}

function getRequirementLookup(collection: Collection): Map<number, CollectionRequired[]> {
    const cached = requirementLookupCache.get(collection);
    if (cached) return cached;

    const lookup = new Map<number, CollectionRequired[]>();
    for (const requirement of collection.required ?? []) {
        for (const song of requirement.songs ?? []) {
            const musicId = getSaltNetMusicIdForChartType(song.id, song.type);
            const requirements = lookup.get(musicId);
            if (requirements) requirements.push(requirement);
            else lookup.set(musicId, [requirement]);
        }
    }
    requirementLookupCache.set(collection, lookup);
    return lookup;
}

export function getCollectionRequirementForChart(
    collection: Collection,
    chart: Chart
): CollectionRequired | undefined {
    return getRequirementLookup(collection)
        .get(chart.music.id)
        ?.find(requirement => requirementMatchesChart(requirement, chart));
}

export function getCollectionCharts(collection: Collection, charts: Chart[]): Chart[] {
    return charts.filter(chart => Boolean(getCollectionRequirementForChart(collection, chart)));
}

export type CollectionProgress = {
    completed: number;
    total: number;
};

export function getCollectionProgress(collection: Collection, charts: Chart[]): CollectionProgress {
    let completed = 0;
    let total = 0;
    const chartsByMusicId = new Map<number, Chart[]>();
    for (const chart of charts) {
        const musicCharts = chartsByMusicId.get(chart.music.id);
        if (musicCharts) musicCharts.push(chart);
        else chartsByMusicId.set(chart.music.id, [chart]);
    }

    for (const requirement of collection.required ?? []) {
        for (const song of requirement.songs ?? []) {
            const musicId = getSaltNetMusicIdForChartType(song.id, song.type);
            const songCharts = chartsByMusicId.get(musicId) ?? [];
            const difficulties = requirement.difficulties ?? [];

            if (difficulties.length === 0) {
                total += 1;
                if (songCharts.some(chart => checkCollectionChartFinish(collection, chart))) {
                    completed += 1;
                }
                continue;
            }

            for (const difficulty of difficulties) {
                const chart = songCharts.find(item => item.info.grade === difficulty);
                if (!chart) continue;
                total += 1;
                if (checkCollectionChartFinish(collection, chart)) completed += 1;
            }
        }
    }

    return { completed, total };
}

function scoreMeetsRequirement(score: ChartScore, requirement: CollectionRequired): boolean {
    if (typeof score.achievements !== "number") return false;
    if (requirement.rate && !reachesThreshold(score.rankRate, requirement.rate, rankOrder)) {
        return false;
    }
    if (requirement.fc && !reachesThreshold(score.comboStatus, requirement.fc, comboOrder)) {
        return false;
    }
    if (requirement.fs && !reachesThreshold(score.syncStatus, requirement.fs, syncOrder)) {
        return false;
    }
    return true;
}

export function checkCollectionChartFinish(collection: Collection, chart: Chart): boolean {
    const requirement = getCollectionRequirementForChart(collection, chart);
    return Boolean(requirement && chart.score && scoreMeetsRequirement(chart.score, requirement));
}

export function sortCollectionChartsByCompletion(collection: Collection, charts: Chart[]): Chart[] {
    const completed = new Map(
        charts.map(chart => [chart, checkCollectionChartFinish(collection, chart)])
    );
    return [...charts].sort((a, b) => {
        const completedA = completed.get(a) ?? false;
        const completedB = completed.get(b) ?? false;
        if (completedA !== completedB) return completedA ? -1 : 1;

        const achievementsA = a.score?.achievements;
        const achievementsB = b.score?.achievements;
        if (typeof achievementsA === "number" && typeof achievementsB === "number") {
            return achievementsB - achievementsA;
        }
        if (typeof achievementsA === "number") return -1;
        if (typeof achievementsB === "number") return 1;
        return b.info.constant - a.info.constant;
    });
}

export function getVersionPlateConditionText(plate: VersionPlate): string {
    return plate.description
        .replace("FULL COMBO", "FC")
        .replace("FULL SYNC DX", "FSDX")
        .replace("ALL PERFECT", "AP")
        .replace("BASIC", "BAS")
        .replace("Re:MASTER", "ReM")
        .replace("MASTER", "MAS");
}

export function getPlateCompactPresentation(plate: VersionPlate): {
    mode: "rankRate" | "comboStatus" | "syncStatus";
    filter: RankRate | ComboStatus | SyncStatus;
} {
    if (plate.category === "将") {
        return {
            mode: "rankRate",
            filter: plate.required?.[0]?.rate ?? RankRate.sss,
        };
    }
    if (plate.category === "舞舞") {
        return {
            mode: "syncStatus",
            filter: plate.required?.[0]?.fs ?? SyncStatus.FullSyncDX,
        };
    }
    return {
        mode: "comboStatus",
        filter:
            plate.required?.[0]?.fc ??
            (plate.category === "神" ? ComboStatus.AllPerfect : ComboStatus.FullCombo),
    };
}
