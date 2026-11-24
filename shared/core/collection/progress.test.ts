import type { DivingFishFullRecord } from "../integrations/diving-fish/type";
import type { Chart } from "../music/type";
import type { DetailedData } from "../user/type";
import type { Collection } from "./type";
import { describe, expect, it } from "vitest";
import { createDetailedScoreLookup, toChartScore } from "../chart/scoreLookup";
import { getFixtureLXNSCollections } from "../fixtures/lxns";
import { createFixtureMusicList } from "../fixtures/saltmeta";
import { ComboStatus, RankRate, SyncStatus } from "../mai/types";
import { mapLXNSCollections } from "./map";
import { getScoredCollectionCharts } from "./progress";
import {
    getCollectionCharts,
    getCollectionProgress,
    isCollectionScoreEvaluable,
    sortCollectionChartsByCompletion,
} from "./versionPlate";

function oldScoredCollectionCharts(
    collection: Collection,
    charts: Chart[],
    detailed: DetailedData | undefined
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

function deepFreeze(value: unknown, seen = new Set<object>()): void {
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
}

function findCollection(collections: Collection[], id: number): Collection {
    const collection = collections.find(item => item.id === id);
    if (!collection) throw new Error(`Missing fixture collection ${id}`);
    return collection;
}

function makeRecord(
    chart: Chart,
    overrides: Partial<DivingFishFullRecord> = {}
): DivingFishFullRecord {
    return {
        achievements: 100,
        ds: chart.info.constant,
        dxScore: 1000,
        fc: ComboStatus.FullCombo,
        fs: SyncStatus.FullSync,
        level: chart.info.level,
        level_index: chart.info.grade,
        level_label: "",
        ra: 100,
        rate: RankRate.sss,
        song_id: chart.music.id >= 10_000 ? chart.music.id - 10_000 : chart.music.id,
        title: chart.music.info.title,
        type: chart.music.id >= 10_000 ? "DX" : "SD",
        ...overrides,
    };
}

describe("scored collection charts", () => {
    const music = createFixtureMusicList();
    const sourceCharts = Object.values(music.chartList);
    const mapped = mapLXNSCollections(getFixtureLXNSCollections());
    const allCollections: Collection[] = [
        ...mapped.titles,
        ...mapped.icons,
        ...mapped.plates,
        ...mapped.frames,
    ];
    const versionPlate = findCollection(mapped.versionPlates["極"], 6101);
    const withDifficulties = findCollection(mapped.titles, 5102);
    const withoutDifficulties = findCollection(mapped.icons, 209502);

    it("matches the old web pipeline for real fixture collections", () => {
        expect(isCollectionScoreEvaluable(versionPlate)).toBe(true);
        expect(withDifficulties.required?.[0]?.difficulties).toEqual([0, 1, 2, 3]);
        expect(withoutDifficulties.required?.[0]?.difficulties).toEqual([]);

        for (const collection of [versionPlate, withDifficulties, withoutDifficulties]) {
            expect(getScoredCollectionCharts(collection, sourceCharts, undefined)).toEqual(
                oldScoredCollectionCharts(collection, sourceCharts, undefined)
            );
        }
    });

    it("attaches scores, preserves missing scores and sorts completion first", () => {
        const plateCharts = getCollectionCharts(versionPlate, sourceCharts);
        const completedChart = plateCharts.find(
            chart => chart.music.id === 8 && chart.info.grade === 1
        );
        const incompleteChart = plateCharts.find(
            chart => chart.music.id === 8 && chart.info.grade === 0
        );
        if (!completedChart || !incompleteChart) throw new Error("Missing fixture plate charts");

        const detailed: DetailedData = {
            completed: makeRecord(completedChart, {
                achievements: 99,
                fc: ComboStatus.FullCombo,
            }),
            incomplete: makeRecord(incompleteChart, {
                achievements: 100.5,
                fc: ComboStatus.None,
            }),
        };
        const result = getScoredCollectionCharts(versionPlate, sourceCharts, detailed);

        expect(result).toEqual(oldScoredCollectionCharts(versionPlate, sourceCharts, detailed));
        expect(result[0]?.id).toBe(completedChart.id);
        expect(result.find(chart => chart.id === completedChart.id)?.score?.achievements).toBe(99);
        expect(result.find(chart => chart.id === incompleteChart.id)?.score?.comboStatus).toBe(
            ComboStatus.None
        );
        expect(result.some(chart => chart.score === undefined)).toBe(true);
        expect(getCollectionProgress(versionPlate, result)).toEqual({ completed: 1, total: 20 });
    });

    it("attaches an undefined score when detailed scores are absent", () => {
        const result = getScoredCollectionCharts(withDifficulties, sourceCharts, undefined);
        expect(result).toHaveLength(4);
        expect(result.every(chart => "score" in chart && chart.score === undefined)).toBe(true);
        expect(result).toEqual(
            oldScoredCollectionCharts(withDifficulties, sourceCharts, undefined)
        );
    });

    it("replaces a score the charts already carry, and clears it without detailed scores", () => {
        const plateCharts = getCollectionCharts(versionPlate, sourceCharts);
        const played = plateCharts.find(chart => chart.music.id === 8 && chart.info.grade === 1);
        if (!played) throw new Error("Missing fixture plate chart");
        // Every chart arrives with a score from somewhere else, such as another user.
        const staleScore = toChartScore(makeRecord(played, { achievements: 50 }));
        const withStaleScores = sourceCharts.map(chart => ({ ...chart, score: staleScore }));
        const detailed: DetailedData = { played: makeRecord(played, { achievements: 99 }) };

        const cleared = getScoredCollectionCharts(versionPlate, withStaleScores, undefined);
        const replaced = getScoredCollectionCharts(versionPlate, withStaleScores, detailed);

        expect(staleScore?.achievements).toBe(50);
        expect(cleared.length).toBeGreaterThan(1);
        expect(cleared.every(chart => chart.score === undefined)).toBe(true);
        expect(replaced.find(chart => chart.id === played.id)?.score?.achievements).toBe(99);
        const others = replaced.filter(chart => chart.id !== played.id);
        expect(others.length).toBeGreaterThan(0);
        expect(others.every(chart => chart.score === undefined)).toBe(true);
        expect(replaced).toEqual(
            oldScoredCollectionCharts(versionPlate, withStaleScores, detailed)
        );
    });

    it("returns no charts for a collection that is not score-evaluable", () => {
        const collection = findCollection(allCollections, 1);
        expect(isCollectionScoreEvaluable(collection)).toBe(false);
        expect(getScoredCollectionCharts(collection, sourceCharts, undefined)).toEqual([]);
    });

    it("does not change the chart array or any chart passed in", () => {
        const before = sourceCharts.map(chart => ({
            chart,
            keys: Object.keys(chart),
            score: chart.score,
        }));
        const ids = sourceCharts.map(chart => chart.id);
        // Scores for every chart of the plate, so a score written onto a chart passed in shows.
        const detailed: DetailedData = Object.fromEntries(
            getCollectionCharts(versionPlate, sourceCharts).map(chart => [
                `${chart.music.id}-${chart.info.grade}`,
                makeRecord(chart),
            ])
        );

        const result = getScoredCollectionCharts(versionPlate, sourceCharts, detailed);

        expect(result.length).toBeGreaterThan(0);
        expect(result.every(chart => chart.score !== undefined)).toBe(true);
        result.forEach(chart => expect(sourceCharts).not.toContain(chart));
        expect(sourceCharts.map(chart => chart.id)).toEqual(ids);
        sourceCharts.forEach((chart, index) => {
            expect(chart).toBe(before[index]?.chart);
            expect(Object.keys(chart)).toEqual(before[index]?.keys);
            expect(chart.score).toBe(before[index]?.score);
        });
    });

    it("writes to nothing reachable from the charts or the scores passed in", () => {
        // Frozen in full, songs and chart info included, so any write throws in strict mode.
        const frozenCharts = Object.values(createFixtureMusicList().chartList);
        const detailed: DetailedData = Object.fromEntries(
            getCollectionCharts(versionPlate, frozenCharts).map(chart => [
                `${chart.music.id}-${chart.info.grade}`,
                makeRecord(chart),
            ])
        );
        deepFreeze(frozenCharts);
        deepFreeze(detailed);

        const result = getScoredCollectionCharts(versionPlate, frozenCharts, detailed);

        expect(result.length).toBeGreaterThan(0);
        expect(result.every(chart => chart.score !== undefined)).toBe(true);
    });
});
