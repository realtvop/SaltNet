import type { DivingFishFullRecord } from "../integrations/diving-fish/type";
import type { Chart } from "../music/type";
import type { User } from "../user/type";
import { describe, expect, it } from "vitest";
import { createFixtureMusicList } from "../fixtures/saltmeta";
import { ComboStatus, RankRate, SyncStatus } from "../mai/types";
import MusicSort from "../music/sort.json";
import {
    addPositionToCharts,
    findChartPosition,
    getChartPositionByDifficulty,
    sortChartsForPosition,
} from "./position";

const chartTemplate = Object.values(createFixtureMusicList().chartList)[0];

function makeChart(id: number, musicId: number, grade: number, level: string): Chart {
    const music = {
        ...chartTemplate.music,
        id: musicId,
        info: { ...chartTemplate.music.info, id: musicId },
        charts: [] as Chart[],
    };
    const chart: Chart = {
        ...chartTemplate,
        id,
        info: { ...chartTemplate.info, grade, level },
        music,
    };
    music.charts.push(chart);
    return chart;
}

function recordFor(chart: Chart, achievements: number): DivingFishFullRecord {
    return {
        achievements,
        ds: chart.info.constant,
        dxScore: 0,
        fc: ComboStatus.None,
        fs: SyncStatus.None,
        level: chart.info.level,
        level_index: chart.info.grade,
        level_label: "",
        ra: 0,
        rate: RankRate.d,
        song_id: chart.music.id,
        title: chart.music.info.title,
        type: chart.music.info.type,
    };
}

function makeUser(scores: [Chart, number][]): User {
    return {
        divingFish: { name: null },
        inGame: { id: null },
        settings: { manuallyUpdate: false },
        data: {
            updateTime: null,
            name: null,
            rating: null,
            detailed: Object.fromEntries(
                scores.map(([chart, achievements], index) => [
                    `score-${index}`,
                    recordFor(chart, achievements),
                ])
            ),
        },
    };
}

function seededSample<T>(items: T[], size: number, seed: number): T[] {
    const shuffled = [...items];
    let state = seed >>> 0;
    for (let index = shuffled.length - 1; index > 0; index--) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const swapIndex = state % (index + 1);
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled.slice(0, size);
}

describe("chart position sorting", () => {
    it("returns a dash for an empty list", () => {
        const chart = makeChart(1, MusicSort[0], 0, "1");
        expect(findChartPosition([], chart, "ALL")).toBe("-");
        expect(getChartPositionByDifficulty(chart, "ALL", [])).toBe("-");
    });

    it("sorts by grade and MusicSort index, with missing songs at index -1", () => {
        const firstInMusicSort = makeChart(1, MusicSort[0], 0, "1");
        const laterInMusicSort = makeChart(2, MusicSort[10], 0, "1");
        const missingFromMusicSort = makeChart(3, 999999, 0, "1");
        const higherGrade = makeChart(4, MusicSort[0], 1, "2");
        const charts = [firstInMusicSort, missingFromMusicSort, higherGrade, laterInMusicSort];

        const sorted = sortChartsForPosition(charts);

        expect(sorted.map(chart => chart.id)).toEqual([4, 2, 1, 3]);
        expect(charts.map(chart => chart.id)).toEqual([1, 3, 4, 2]);
        expect(sorted).not.toBe(charts);
    });

    it("puts achievements first while preserving ties and the unplayed order", () => {
        const charts = [50, 40, 30, 20, 10].map((sortIndex, index) =>
            makeChart(index + 1, MusicSort[sortIndex], 2, "12")
        );
        const user = makeUser([
            [charts[1], 90],
            [charts[2], 90],
            [charts[3], 0],
            [charts[4], 100],
        ]);

        expect(sortChartsForPosition(charts, user).map(chart => chart.id)).toEqual([5, 2, 3, 1, 4]);
    });

    it("orders equal achievements by the base order, not by the order they came in", () => {
        // Given lowest MusicSort index first, the reverse of the base order.
        const charts = [10, 20, 30].map((sortIndex, index) =>
            makeChart(index + 1, MusicSort[sortIndex], 2, "12")
        );
        const user = makeUser([
            [charts[0], 95],
            [charts[1], 95],
        ]);

        expect(sortChartsForPosition(charts, user).map(chart => chart.id)).toEqual([2, 1, 3]);
    });
});

describe("chart position lookup", () => {
    it("filters ALL by grade and a named difficulty by level", () => {
        const first = makeChart(1, MusicSort[3], 3, "13");
        const sameLevel = makeChart(2, MusicSort[2], 2, "13");
        const sameGrade = makeChart(3, MusicSort[1], 3, "14");
        const charts = [first, sameLevel, sameGrade];

        expect(findChartPosition(charts, sameGrade, "ALL")).toBe("1/3");
        expect(findChartPosition(charts, first, "13")).toBe("2/3");
        expect(findChartPosition(charts, sameGrade, "13")).toBe("-");
    });

    it("matches by chart id or by music id plus grade", () => {
        const listed = makeChart(1, MusicSort[0], 2, "12");
        const sameId = makeChart(1, MusicSort[1], 2, "12");
        const sameMusicAndGrade = makeChart(99, MusicSort[0], 2, "12");

        expect(findChartPosition([listed], sameId, "ALL")).toBe("1/2");
        expect(findChartPosition([listed], sameMusicAndGrade, "ALL")).toBe("1/2");
    });

    it("returns a dash for a chart outside the list", () => {
        const listed = makeChart(1, MusicSort[0], 2, "12");
        const missing = makeChart(2, MusicSort[1], 2, "12");
        expect(findChartPosition([listed], missing, "ALL")).toBe("-");
    });

    it("counts from the end and formats the denominator as total plus one", () => {
        const charts = [
            makeChart(1, MusicSort[2], 2, "12"),
            makeChart(2, MusicSort[1], 2, "12"),
            makeChart(3, MusicSort[0], 2, "12"),
        ];
        expect(findChartPosition(charts, charts[0], "ALL")).toBe("3/4");
        expect(findChartPosition(charts, charts[2], "ALL")).toBe("1/4");
    });
});

it("adds the unchanged position fields to charts", () => {
    const charts = [makeChart(1, MusicSort[1], 2, "12"), makeChart(2, MusicSort[0], 2, "12")];
    expect(addPositionToCharts(charts)).toEqual([
        { ...charts[0], originalIndex: 2, totalInDifficulty: 2, index: "2/3" },
        { ...charts[1], originalIndex: 1, totalInDifficulty: 2, index: "1/3" },
    ]);
});

it("returns new chart objects and leaves the given charts unchanged", () => {
    const charts = [makeChart(1, MusicSort[1], 2, "12"), makeChart(2, MusicSort[0], 2, "12")];
    const before = charts.map(chart => ({ ...chart }));

    const result = addPositionToCharts(charts);

    expect(charts.map(chart => ({ ...chart }))).toEqual(before);
    result.forEach((chart, index) => expect(chart).not.toBe(charts[index]));
});

it("composes sorting and lookup on seeded fixture charts and levels", () => {
    const fixtureCharts = Object.values(createFixtureMusicList().chartList);
    const charts = seededSample(fixtureCharts, 32, 20261116);
    const levels = [...new Set(charts.map(chart => chart.info.level))];
    const user = makeUser(
        charts.flatMap((chart, index) =>
            index % 3 === 0 ? [[chart, index % 6 === 0 ? 0 : 90 + index / 100]] : []
        )
    );

    for (const userData of [undefined, user]) {
        const sorted = sortChartsForPosition(charts, userData);
        for (const chart of charts) {
            for (const difficulty of ["ALL", ...levels]) {
                expect(getChartPositionByDifficulty(chart, difficulty, charts, userData)).toBe(
                    findChartPosition(sorted, chart, difficulty)
                );
            }
        }
    }
});
