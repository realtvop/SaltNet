import { ComboStatus, RankRate, SyncStatus } from "../maiTypes";
import type { Chart, ChartScore } from "../music/type";
import { getSaltNetMusicIdForChartType } from "../music/saltmeta";
import type { CollectionRequired, Plate, VersionPlate } from "./type";

const rankOrder = Object.values(RankRate);
const comboOrder = Object.values(ComboStatus);
const syncOrder = Object.values(SyncStatus);

const requirementLookupCache = new WeakMap<Plate, Map<number, CollectionRequired[]>>();

function reachesThreshold<T extends string>(current: T, required: T, order: T[]): boolean {
    const currentIndex = order.indexOf(current);
    const requiredIndex = order.indexOf(required);
    return currentIndex !== -1 && requiredIndex !== -1 && currentIndex >= requiredIndex;
}

export function isRequirementScoreEvaluable(requirement: CollectionRequired): boolean {
    return Boolean(requirement.songs?.length);
}

export function isPlateScoreEvaluable(plate: Plate): boolean {
    return Boolean(plate.required?.length && plate.required.every(isRequirementScoreEvaluable));
}

function requirementMatchesChart(requirement: CollectionRequired, chart: Chart): boolean {
    const difficulties = requirement.difficulties ?? [];
    return difficulties.length === 0 || difficulties.includes(chart.info.grade);
}

function getRequirementLookup(plate: Plate): Map<number, CollectionRequired[]> {
    const cached = requirementLookupCache.get(plate);
    if (cached) return cached;

    const lookup = new Map<number, CollectionRequired[]>();
    for (const requirement of plate.required ?? []) {
        for (const song of requirement.songs ?? []) {
            const musicId = getSaltNetMusicIdForChartType(song.id, song.type);
            const requirements = lookup.get(musicId);
            if (requirements) requirements.push(requirement);
            else lookup.set(musicId, [requirement]);
        }
    }
    requirementLookupCache.set(plate, lookup);
    return lookup;
}

export function getPlateRequirementForChart(
    plate: Plate,
    chart: Chart
): CollectionRequired | undefined {
    return getRequirementLookup(plate)
        .get(chart.music.id)
        ?.find(requirement => requirementMatchesChart(requirement, chart));
}

export function getPlateCharts(plate: Plate, charts: Chart[]): Chart[] {
    return charts.filter(chart => Boolean(getPlateRequirementForChart(plate, chart)));
}

export type PlateProgress = {
    completed: number;
    total: number;
};

export function getPlateProgress(plate: Plate, charts: Chart[]): PlateProgress {
    let completed = 0;
    let total = 0;
    const chartsByMusicId = new Map<number, Chart[]>();
    for (const chart of charts) {
        const musicCharts = chartsByMusicId.get(chart.music.id);
        if (musicCharts) musicCharts.push(chart);
        else chartsByMusicId.set(chart.music.id, [chart]);
    }

    for (const requirement of plate.required ?? []) {
        for (const song of requirement.songs ?? []) {
            const musicId = getSaltNetMusicIdForChartType(song.id, song.type);
            const songCharts = chartsByMusicId.get(musicId) ?? [];
            const difficulties = requirement.difficulties ?? [];

            if (difficulties.length === 0) {
                total += 1;
                if (songCharts.some(chart => checkChartFinish(plate, chart))) completed += 1;
                continue;
            }

            for (const difficulty of difficulties) {
                const chart = songCharts.find(item => item.info.grade === difficulty);
                if (!chart) continue;
                total += 1;
                if (checkChartFinish(plate, chart)) completed += 1;
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

export function checkChartFinish(plate: Plate, chart: Chart): boolean {
    const requirement = getPlateRequirementForChart(plate, chart);
    return Boolean(requirement && chart.score && scoreMeetsRequirement(chart.score, requirement));
}

export function sortPlateChartsByCompletion(plate: Plate, charts: Chart[]): Chart[] {
    const completed = new Map(charts.map(chart => [chart, checkChartFinish(plate, chart)]));
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
