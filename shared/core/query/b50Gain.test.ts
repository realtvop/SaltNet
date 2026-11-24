import type { Chart } from "../music/type";
import { describe, expect, it } from "vitest";
import { UTAGE_GRADE } from "../chart/difficulty";
import { createFixtureMusicList } from "../fixtures/saltmeta";
import { getB50Gain } from "./b50";

function createChartWithScore(base: Chart, rating: number): Chart {
    return {
        ...base,
        score: {
            achievements: 100.5,
            rankRate: "sssp" as never,
            comboStatus: "" as never,
            syncStatus: "" as never,
            deluxeScore: 0,
            deluxeRating: rating,
        },
    };
}

describe("getB50Gain", () => {
    const fixture = createFixtureMusicList();
    const allCharts = Object.values(fixture.chartList);

    const oldChart = allCharts.find(
        c => c.music.info.isNew === false && c.info.grade !== UTAGE_GRADE
    );
    const newerChart = allCharts.find(
        c => c.music.info.isNew === true && c.info.grade !== UTAGE_GRADE
    );
    const utageChart = allCharts.find(c => c.info.grade === UTAGE_GRADE);

    if (!oldChart || !newerChart || !utageChart) {
        throw new Error("Fixture missing required chart types for b50Gain tests");
    }

    it("returns null for utage charts and charts with missing isNew", () => {
        const b50 = { old: [], newer: [] };
        expect(getB50Gain(b50, utageChart, 300)).toBeNull();

        const missingIsNewChart: Chart = {
            ...oldChart,
            music: {
                ...oldChart.music,
                info: {
                    ...oldChart.music.info,
                    isNew: undefined as unknown as boolean,
                },
            },
        };
        expect(getB50Gain(b50, missingIsNewChart, 300)).toBeNull();
    });

    describe("empty section", () => {
        it("returns whole targetRating for both old and newer sections", () => {
            const b50 = { old: [], newer: [] };
            // Old section empty (< 35): target 280 -> gain 280
            expect(getB50Gain(b50, oldChart, 280)).toBe(280);
            // Newer section empty (< 15): target 295 -> gain 295
            expect(getB50Gain(b50, newerChart, 295)).toBe(295);
            // Non-positive targetRating
            expect(getB50Gain(b50, oldChart, 0)).toBe(0);
        });
    });

    describe("section shorter than cap", () => {
        it("returns full rating when chart is not in section", () => {
            const chartInB50 = createChartWithScore(oldChart, 200);
            // Different chart not in B50
            const otherOld = allCharts.find(
                c =>
                    c.music.info.isNew === false &&
                    c.music.id !== oldChart.music.id &&
                    c.info.grade !== UTAGE_GRADE
            )!;
            const b50 = { old: [chartInB50], newer: [] };
            expect(getB50Gain(b50, otherOld, 250)).toBe(250);
        });

        it("returns difference when chart is already in section", () => {
            const chartInB50 = createChartWithScore(oldChart, 200);
            const b50 = { old: [chartInB50], newer: [] };

            // Above current rating: 250 - 200 = 50
            expect(getB50Gain(b50, oldChart, 250)).toBe(50);
            // Equal to current rating: 200 - 200 = 0
            expect(getB50Gain(b50, oldChart, 200)).toBe(0);
            // Below current rating: max(0, 150 - 200) = 0
            expect(getB50Gain(b50, oldChart, 150)).toBe(0);
        });
    });

    describe("full section (old: 35, newer: 15)", () => {
        it("evaluates old section correctly against lowest rating", () => {
            // Build 35 distinct charts with ratings from 201 to 235 (lowest is 201)
            const filledOld: Chart[] = [];
            for (let i = 0; i < 35; i++) {
                filledOld.push({
                    ...oldChart,
                    music: { ...oldChart.music, id: 90000 + i },
                    info: { ...oldChart.info, grade: 3 },
                    score: {
                        achievements: 100,
                        rankRate: "sss" as never,
                        comboStatus: "" as never,
                        syncStatus: "" as never,
                        deluxeScore: 0,
                        deluxeRating: 201 + i,
                    },
                });
            }
            const b50 = { old: filledOld, newer: [] };

            // Target 250 > lowest 201: gain is 250 - 201 = 49
            expect(getB50Gain(b50, oldChart, 250)).toBe(49);
            // Target 201 == lowest 201: gain is 0
            expect(getB50Gain(b50, oldChart, 201)).toBe(0);
            // Target 180 < lowest 201: gain is 0
            expect(getB50Gain(b50, oldChart, 180)).toBe(0);
        });

        it("evaluates newer section correctly against lowest rating", () => {
            // Build 15 distinct charts with ratings from 240 to 254 (lowest is 240)
            const filledNewer: Chart[] = [];
            for (let i = 0; i < 15; i++) {
                filledNewer.push({
                    ...newerChart,
                    music: { ...newerChart.music, id: 95000 + i },
                    info: { ...newerChart.info, grade: 3 },
                    score: {
                        achievements: 100,
                        rankRate: "sss" as never,
                        comboStatus: "" as never,
                        syncStatus: "" as never,
                        deluxeScore: 0,
                        deluxeRating: 240 + i,
                    },
                });
            }
            const b50 = { old: [], newer: filledNewer };

            // Target 290 > lowest 240: gain is 290 - 240 = 50
            expect(getB50Gain(b50, newerChart, 290)).toBe(50);
            // Target 240 == lowest 240: gain is 0
            expect(getB50Gain(b50, newerChart, 240)).toBe(0);
            // Target 210 < lowest 240: gain is 0
            expect(getB50Gain(b50, newerChart, 210)).toBe(0);
        });

        it("evaluates chart already in full section against its own rating rather than lowest", () => {
            const targetOldInB50 = createChartWithScore(oldChart, 220);
            const filledOld: Chart[] = [targetOldInB50];
            for (let i = 1; i < 35; i++) {
                filledOld.push({
                    ...oldChart,
                    music: { ...oldChart.music, id: 90000 + i },
                    info: { ...oldChart.info, grade: 3 },
                    score: {
                        achievements: 100,
                        rankRate: "sss" as never,
                        comboStatus: "" as never,
                        syncStatus: "" as never,
                        deluxeScore: 0,
                        deluxeRating: 150 + i, // lowest will be 151
                    },
                });
            }
            const b50 = { old: filledOld, newer: [] };

            // In the section with rating 220, lowest is 151.
            // Target 250: gain is 250 - 220 = 30 (NOT 250 - 151 = 99!)
            expect(getB50Gain(b50, oldChart, 250)).toBe(30);
            // Target 210: below its own rating 220, even though above lowest 151 -> gain is 0
            expect(getB50Gain(b50, oldChart, 210)).toBe(0);
        });
    });

    describe("section edges", () => {
        const rated = (base: Chart, id: number, grade: number, rating: number) =>
            createChartWithScore(
                { ...base, music: { ...base.music, id }, info: { ...base.info, grade } },
                rating
            );

        it("treats a section one short of its cap as not full", () => {
            // 34 old charts rated 201 to 234 and 14 newer ones rated 240 to 253: a chart that is
            // not in them gains its whole target rating, not the difference to the lowest.
            const old = Array.from({ length: 34 }, (_, i) =>
                rated(oldChart, 90000 + i, 3, 201 + i)
            );
            const newer = Array.from({ length: 14 }, (_, i) =>
                rated(newerChart, 95000 + i, 3, 240 + i)
            );
            expect(getB50Gain({ old, newer }, oldChart, 250)).toBe(250);
            expect(getB50Gain({ old, newer }, newerChart, 290)).toBe(290);
        });

        it("does not take the same song at another difficulty for the chart", () => {
            // The section holds the song at another grade, rated 280; the chart itself is not in
            // the section, which is not full, so it gains its whole target rating.
            const otherGrade = oldChart.info.grade === 3 ? 2 : 3;
            const old = [rated(oldChart, oldChart.music.id, otherGrade, 280)];
            expect(getB50Gain({ old, newer: [] }, oldChart, 250)).toBe(250);
        });

        it("takes the lowest rating wherever it is in a full section", () => {
            // 35 old charts rated 201 to 235, except the eighteenth, rated 190: the first is 201
            // and the last 235, but the lowest is 190, so reaching 250 gains 250 - 190 = 60.
            const old = Array.from({ length: 35 }, (_, i) =>
                rated(oldChart, 90000 + i, 3, i === 17 ? 190 : 201 + i)
            );
            expect(getB50Gain({ old, newer: [] }, oldChart, 250)).toBe(60);
        });
    });
});
