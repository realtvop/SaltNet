import type { DivingFishFullRecord } from "@core/integrations/diving-fish/type";
import type { Chart } from "@core/music/type";
import type { User } from "@core/user/type";
import { isUtageGrade } from "@core/chart/difficulty";
import { ScoreCoefficient } from "@core/chart/rating/ScoreCoefficient";
import { ComboStatus } from "@core/mai/types";
import { getSaltNetMusicIdForChartType } from "@core/music/saltmeta";

export type ComboFilterMode = "ap" | "fc" | null;

export function createMusicChartMap(charts: Chart[]): Map<string, Chart> {
    const map = new Map<string, Chart>();
    for (const chart of charts) {
        // key: `${normalized_song_id}-${level_index}`
        map.set(`${chart.music.id}-${chart.info.grade}`, chart);
    }
    return map;
}

export function recordsHaveLastChangedAt(data: User["data"] | undefined): boolean {
    const detailed = data?.detailed;
    if (detailed) {
        return Object.values(detailed).some(
            r => typeof r.lastChangedAt === "number" && r.lastChangedAt > 0
        );
    }
    const b50 = data?.b50;
    if (b50) {
        return [...(b50.sd ?? []), ...(b50.dx ?? [])].some(
            r => typeof r.lastChangedAt === "number" && r.lastChangedAt > 0
        );
    }
    return false;
}

export interface B50QueryOptions {
    fitDiff: boolean;
    nb50: boolean;
    comboFilter: ComboFilterMode;
    pc50: boolean;
}

export function selectB50Charts(
    data: User["data"] | undefined,
    musicChartMap: Map<string, Chart>,
    options: B50QueryOptions
): { old: Chart[]; newer: Chart[] } {
    if (!data) return { old: [] as Chart[], newer: [] as Chart[] };

    const useFitDiff = options.fitDiff || options.nb50;
    const comboFilter = options.comboFilter;
    const isPc50 = options.pc50;

    let records = getSourceRecords(data, useFitDiff || !!comboFilter || isPc50);
    records = filterByComboStatus(records, comboFilter);

    let charts = records
        .map(record => convertDFRecordToChart(record, musicChartMap, useFitDiff))
        .filter((chart): chart is Chart => chart !== null)
        .filter(chart => !isUtageGrade(chart.info.grade));

    if (options.nb50) {
        charts = charts.filter(chart => {
            const fitDiff = chart.info.stat?.fit_diff;
            const constant = chart.info.constant;
            if (typeof fitDiff !== "number" || typeof constant !== "number") return false;
            return fitDiff > constant;
        });
    }

    const oldCharts = charts.filter(chart => chart.music.info.isNew === false);
    const newCharts = charts.filter(chart => chart.music.info.isNew === true);

    return {
        old: sortCharts(oldCharts, 35, isPc50),
        newer: sortCharts(newCharts, 15, isPc50),
    };
}

export function sumChartRatings(charts: Chart[]): number {
    return charts.reduce((sum, chart) => sum + (chart.score?.deluxeRating ?? 0), 0);
}

// 将 DivingFishFullRecord 转换为 Chart 类型
export function convertDFRecordToChart(
    record: DivingFishFullRecord,
    musicChartMap: Map<string, Chart>,
    useFitDiff: boolean = false
): Chart | null {
    const musicId = getSaltNetMusicIdForChartType(record.song_id, record.type);
    const baseChart = musicChartMap.get(`${musicId}-${record.level_index}`);
    if (!baseChart) return null;

    let rating = record.ra;
    let fitConstant: number | undefined;

    if (useFitDiff) {
        const rawFitConstant =
            baseChart.info.stat?.fit_diff ??
            (Number.isFinite(record.ds) ? record.ds : undefined) ??
            baseChart.info.constant;
        const normalizedConstant = normalizeConstant(rawFitConstant);
        fitConstant = normalizedConstant ?? baseChart.info.constant;
        rating = calculateRating(record.achievements, fitConstant);
    }

    const chartScore: Chart["score"] = {
        achievements: record.achievements,
        comboStatus: record.fc,
        syncStatus: record.fs,
        rankRate: record.rate,
        deluxeRating: rating,
        deluxeScore: record.dxScore,
        playCount: record.play_count,
        lastChangedAt: record.lastChangedAt,
    };

    if (typeof fitConstant === "number") {
        (chartScore as unknown as Record<string, unknown>).fitConstant = fitConstant;
    }

    return {
        ...baseChart,
        score: chartScore,
    };
}

export function getSourceRecords(
    data: User["data"] | undefined,
    requireDetailed: boolean
): DivingFishFullRecord[] {
    const detailedRecords = data?.detailed ? Object.values(data.detailed) : [];

    if (detailedRecords.length) return detailedRecords;

    if (requireDetailed) return [];

    const b50Records = data?.b50;
    if (!b50Records) return [];

    return [...(b50Records.sd ?? []), ...(b50Records.dx ?? [])];
}

export function filterByComboStatus(
    records: DivingFishFullRecord[],
    mode: ComboFilterMode
): DivingFishFullRecord[] {
    if (!mode) return records;
    if (mode === "ap") {
        return records.filter(
            r => r.fc === ComboStatus.AllPerfect || r.fc === ComboStatus.AllPerfectPlus
        );
    }
    return records.filter(r =>
        [
            ComboStatus.FullCombo,
            ComboStatus.FullComboPlus,
            ComboStatus.AllPerfect,
            ComboStatus.AllPerfectPlus,
        ].includes(r.fc)
    );
}

export function sortCharts(charts: Chart[], limit: number, sortByPlayCount = false): Chart[] {
    const sorted = [...charts].sort((a, b) => {
        if (sortByPlayCount) {
            const countA = a.score?.playCount ?? 0;
            const countB = b.score?.playCount ?? 0;
            if (countA !== countB) return countB - countA;
        }

        const ratingA = a.score?.deluxeRating ?? 0;
        const ratingB = b.score?.deluxeRating ?? 0;
        if (ratingA !== ratingB) return ratingB - ratingA;

        const achA = a.score?.achievements ?? 0;
        const achB = b.score?.achievements ?? 0;
        if (achA !== achB) return achB - achA;

        const fitA = (a.score as Record<string, unknown> | undefined)?.fitConstant;
        const fitB = (b.score as Record<string, unknown> | undefined)?.fitConstant;
        const constantA =
            typeof fitA === "number" && !Number.isNaN(fitA) ? fitA : (a.info.constant ?? 0);
        const constantB =
            typeof fitB === "number" && !Number.isNaN(fitB) ? fitB : (b.info.constant ?? 0);
        return constantB - constantA;
    });

    return sorted.slice(0, limit);
}

export function calculateRating(achievements: number | null, constant?: number): number {
    if (typeof achievements !== "number") return 0;
    if (typeof constant !== "number" || Number.isNaN(constant)) return 0;

    return new ScoreCoefficient(achievements).ra(constant);
}

export function normalizeConstant(value?: number | null): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Math.round(value * 10) / 10;
}
