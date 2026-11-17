import type { DivingFishFullRecord } from "@core/integrations/diving-fish/type";
import type { Chart } from "@core/music/type";
import { isUtageGrade } from "@core/chart/difficulty";
import { createMusicChartMap, getB50Gain, selectB50Charts } from "@core/query/b50";
import { describe, expect, it } from "vitest";
import { allChartEntries } from "../../src/catalog/chartQuery";
import { commandIn } from "../commandRun";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { b50User, detailedUser, recordOf, SCORE_TIME, seedScoreUsers, user } from "../scoreUsers";
import { useTempHome } from "../tempHome";
import { useTimeZone } from "../zone";

useTimeZone("America/New_York");
const makeHome = useTempHome();

function allCharts(): Chart[] {
    return allChartEntries(fixtureSongCatalog()).map(e => e.chart);
}

function fixtureChart(key: string): Chart {
    const entry = fixtureSongCatalog().chartByKey.get(key);
    if (!entry) throw new Error(`fixture has no chart ${key}`);
    return entry.chart;
}

describe("stage gains in chart and calc", () => {
    it("computes stage gains equal to getB50Gain for a user with detailed records across scenarios", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        const charts = allCharts().filter(c => !isUtageGrade(c.info.grade));
        const oldCharts = charts.filter(c => c.music.info.isNew === false);
        const newCharts = charts.filter(c => c.music.info.isNew === true);

        // Build 35 old records so old section is completely full (lowest rating is 200)
        // Chart "146-3" (old) is explicitly in B50 with rating 250
        const targetChart = fixtureChart("146-3");
        const otherOldCharts = oldCharts.filter(c => `${c.music.id}-${c.info.grade}` !== "146-3");
        const records: Record<string, DivingFishFullRecord> = {
            "146-3": {
                ...recordOf(targetChart, 0),
                ra: 250,
                achievements: 100.0,
            },
        };
        for (let i = 0; i < 34; i++) {
            const c = otherOldCharts[i];
            const key = `${c.music.id}-${c.info.grade}`;
            records[key] = {
                ...recordOf(c, i + 1),
                ra: 200 + i,
                achievements: 100.0,
            };
        }

        // Add 1 played old chart OUTSIDE B50: lower rating than lowest in B50 (rating 120 < 200)
        const outsideOldChart = otherOldCharts[34];
        const outsideOldKey = `${outsideOldChart.music.id}-${outsideOldChart.info.grade}`;
        records[outsideOldKey] = {
            ...recordOf(outsideOldChart, 35),
            ra: 120,
            achievements: 80.0,
        };

        // Add new records for whatever new charts exist in fixture
        for (let i = 0; i < newCharts.length; i++) {
            const c = newCharts[i];
            const key = `${c.music.id}-${c.info.grade}`;
            records[key] = {
                ...recordOf(c, 100 + i),
                ra: 220 + i,
                achievements: 100.0,
            };
        }

        const testUser = user("uid-detailed-gains", "Detailed Gains User", {
            updateTime: SCORE_TIME,
            detailed: records,
        });
        testUser.remark = "Detailed Gains User";
        await seedScoreUsers(home, [testUser]);

        const chartMap = createMusicChartMap(allCharts());
        const userB50 = selectB50Charts(testUser.data, chartMap, {
            fitDiff: false,
            nb50: false,
            comboFilter: null,
            pc50: false,
        });

        // Lowest rating in old B50 section:
        const oldLowest = Math.min(...userB50.old.map(c => c.score?.deluxeRating ?? 0));
        expect(userB50.old).toHaveLength(35);
        expect(oldLowest).toBe(200);

        // 1. Chart IN its B50 section: 146-3 (rating 250)
        const inSectionRes = await commandIn(home, "chart", ["146-3", "--with", "stages"]);
        expect(inSectionRes.code).toBe(0);
        const inStages = inSectionRes.json.data.stages;
        expect(inStages.length).toBeGreaterThan(0);
        for (const stage of inStages) {
            const expectedGain = getB50Gain(userB50, fixtureChart("146-3"), stage.rating);
            expect(stage.gain).toBe(expectedGain);
        }

        // Hand-check in-section stage gains for 146-3 (current rating is 250):
        // Stage 100.5% -> rating 292: gain is 292 - 250 = 42
        const sssPlusStage = inStages.find(
            (s: { achievements: number }) => s.achievements === 100.5
        );
        expect(sssPlusStage.rating).toBe(292);
        expect(sssPlusStage.gain).toBe(42);
        // Stage 99.0% -> rating 267: gain is 267 - 250 = 17
        const ssStage = inStages.find((s: { achievements: number }) => s.achievements === 99.0);
        expect(ssStage.rating).toBe(267);
        expect(ssStage.gain).toBe(17);
        // Stage 97.0% -> rating 252: gain is 252 - 250 = 2
        const sStage = inStages.find((s: { achievements: number }) => s.achievements === 97.0);
        expect(sStage.rating).toBe(252);
        expect(sStage.gain).toBe(2);
        // Stage 94.0% -> rating 205: below 250, so gain is 0
        const aaaStage = inStages.find((s: { achievements: number }) => s.achievements === 94.0);
        expect(aaaStage.rating).toBe(205);
        expect(aaaStage.gain).toBe(0);

        // 2. Played chart OUTSIDE its B50 section: outsideOldKey
        const outsideRes = await commandIn(home, "chart", [outsideOldKey, "--with", "stages"]);
        expect(outsideRes.code).toBe(0);
        const outsideStages = outsideRes.json.data.stages;
        expect(outsideStages.length).toBeGreaterThan(0);
        for (const stage of outsideStages) {
            const expectedGain = getB50Gain(userB50, outsideOldChart, stage.rating);
            expect(stage.gain).toBe(expectedGain);
        }
        // Hand check: outside chart is not in B50, so gain is max(0, stage.rating - oldLowest (201))
        for (const stage of outsideStages) {
            const expected = Math.max(0, stage.rating - oldLowest);
            expect(stage.gain).toBe(expected);
        }

        // 3. Unplayed chart: pick another old chart not in records
        const unplayedChart = oldCharts.find(c => !records[`${c.music.id}-${c.info.grade}`])!;
        const unplayedKey = `${unplayedChart.music.id}-${unplayedChart.info.grade}`;
        const unplayedRes = await commandIn(home, "chart", [unplayedKey, "--with", "stages"]);
        expect(unplayedRes.code).toBe(0);
        const unplayedStages = unplayedRes.json.data.stages;
        expect(unplayedStages.length).toBeGreaterThan(0);
        for (const stage of unplayedStages) {
            const expectedGain = getB50Gain(userB50, unplayedChart, stage.rating);
            expect(stage.gain).toBe(expectedGain);
        }

        // 4. Newer section chart: in newer B50 section
        const newerInChart = newCharts[0];
        const newerKey = `${newerInChart.music.id}-${newerInChart.info.grade}`;
        const newerRes = await commandIn(home, "chart", [newerKey, "--with", "stages"]);
        expect(newerRes.code).toBe(0);
        const newerStages = newerRes.json.data.stages;
        expect(newerStages.length).toBeGreaterThan(0);
        for (const stage of newerStages) {
            const expectedGain = getB50Gain(userB50, newerInChart, stage.rating);
            expect(stage.gain).toBe(expectedGain);
        }
    });

    it("handles public-B50-only user with PARTIAL_SCORES warning and calculates gain against that B50", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        const pu = b50User("uid-public-b50", "Public B50 User");
        pu.remark = "Public B50 User";
        await seedScoreUsers(home, [pu]);

        const chartMap = createMusicChartMap(allCharts());
        const expectedB50 = selectB50Charts(pu.data, chartMap, {
            fitDiff: false,
            nb50: false,
            comboFilter: null,
            pc50: false,
        });

        const res = await commandIn(home, "chart", ["146-3"]);
        expect(res.code).toBe(0);
        expect(res.json.warnings.some((w: { code: string }) => w.code === "PARTIAL_SCORES")).toBe(
            true
        );
        expect(res.json.data.stages.length).toBeGreaterThan(0);
        for (const stage of res.json.data.stages) {
            const expectedGain = getB50Gain(expectedB50, fixtureChart("146-3"), stage.rating);
            expect(stage.gain).toBe(expectedGain);
        }
    });

    it("returns null gain when no users exist", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        const res = await commandIn(home, "chart", ["146-3"]);
        expect(res.code).toBe(0);
        expect(res.json.data.stages.length).toBeGreaterThan(0);
        for (const stage of res.json.data.stages) {
            expect(stage.gain).toBeNull();
        }
    });

    describe("calc command gains", () => {
        it("returns null gain with a constant", async () => {
            const home = makeHome();
            // calc with constant: stages gain is null, top-level gain is null
            const resStages = await commandIn(home, "calc", ["13.5"]);
            expect(resStages.code).toBe(0);
            expect(resStages.json.data.gain).toBeNull();
            for (const stage of resStages.json.data.stages) {
                expect(stage.gain).toBeNull();
            }

            const resAch = await commandIn(home, "calc", ["13.5", "--achievements", "100.5"]);
            expect(resAch.code).toBe(0);
            expect(resAch.json.data.gain).toBeNull();
            expect(resAch.json.data.stages).toBeNull();

            const resRa = await commandIn(home, "calc", ["13.5", "--rating", "250"]);
            expect(resRa.code).toBe(0);
            expect(resRa.json.data.gain).toBeNull();
            expect(resRa.json.data.stages).toBeNull();
        });

        it("computes stages gains and top-level gain with a chart and user", async () => {
            const home = makeHome();
            await commandIn(home, "refresh", []);

            const u = detailedUser("uid-calc-user", "Calc User");
            u.remark = "Calc User";
            await seedScoreUsers(home, [u]);

            const chartMap = createMusicChartMap(allCharts());
            const userB50 = selectB50Charts(u.data, chartMap, {
                fitDiff: false,
                nb50: false,
                comboFilter: null,
                pc50: false,
            });
            const chart = fixtureChart("146-3");

            // Without options: stages have gains, top-level gain is null
            const resStages = await commandIn(home, "calc", ["146-3"]);
            expect(resStages.code).toBe(0);
            expect(resStages.json.data.gain).toBeNull();
            for (const stage of resStages.json.data.stages) {
                expect(stage.gain).toBe(getB50Gain(userB50, chart, stage.rating));
            }

            // With --achievements: top-level gain is computed, stages is null
            const resAch = await commandIn(home, "calc", ["146-3", "--achievements", "100.5"]);
            expect(resAch.code).toBe(0);
            const expectedRatingAch = resAch.json.data.rating;
            expect(expectedRatingAch).toBe(292);
            expect(resAch.json.data.gain).toBe(getB50Gain(userB50, chart, expectedRatingAch));
            expect(resAch.json.data.stages).toBeNull();

            // With --rating: top-level gain is computed, stages is null
            const resRa = await commandIn(home, "calc", ["146-3", "--rating", "250"]);
            expect(resRa.code).toBe(0);
            const expectedRatingRa = resRa.json.data.rating;
            expect(expectedRatingRa).toBeGreaterThanOrEqual(250);
            expect(resRa.json.data.gain).toBe(getB50Gain(userB50, chart, expectedRatingRa));
            expect(resRa.json.data.stages).toBeNull();

            // With unreachable --rating: rating is null -> gain is null
            const resUnreach = await commandIn(home, "calc", ["146-3", "--rating", "9999"]);
            expect(resUnreach.code).toBe(0);
            expect(resUnreach.json.data.rating).toBeNull();
            expect(resUnreach.json.data.gain).toBeNull();
            expect(resUnreach.json.data.stages).toBeNull();
        });

        it("gives the gain of the rating found, measured against a B50 with room left", async () => {
            const home = makeHome();
            await commandIn(home, "refresh", []);
            // 146-3 has constant 13.0. 97.0000 (S) gives floor(130 * 970000 * 200 / 1e8) = 252 and
            // is the lowest rate that reaches any target from 222 to 252; 100.5 gives
            // floor(130 * 1005000 * 224 / 1e8) = 292.
            const other = allCharts().find(
                chart =>
                    chart.music.id !== 146 &&
                    !isUtageGrade(chart.info.grade) &&
                    typeof chart.info.constant === "number"
            )!;
            const roomy = user("uid-roomy", "有空位", {
                detailed: {
                    [`${other.music.id}-${other.info.grade}`]: {
                        ...recordOf(other),
                        achievements: 99,
                        ra: 200,
                    },
                },
            });
            roomy.remark = "有空位";
            const played = user("uid-played", "玩过", {
                detailed: {
                    "146-3": { ...recordOf(fixtureChart("146-3")), achievements: 97, ra: 252 },
                },
            });
            played.remark = "玩过";
            await seedScoreUsers(home, [roomy, played]);

            // The first user has not played 146-3 and both sections have room: it gains its whole
            // rating, 252 for the rate --rating 230 finds (not 230).
            const found = await commandIn(home, "calc", ["146-3", "--rating", "230"]);
            expect(found.json.data).toMatchObject({
                target: 230,
                achievements: 97,
                rating: 252,
                gain: 252,
            });
            const top = await commandIn(home, "calc", ["146-3", "--achievements", "100.5"]);
            expect(top.json.data).toMatchObject({ rating: 292, gain: 292 });

            // The second user has it in the B50 at 252: reaching 292 adds 40.
            const better = await commandIn(home, "calc", [
                "146-3",
                "--achievements",
                "100.5",
                "--user",
                "玩过",
            ]);
            expect(better.json.data).toMatchObject({ rating: 292, gain: 40 });
        });

        it("returns null gain with a chart and no users", async () => {
            const home = makeHome();
            await commandIn(home, "refresh", []);

            const resStages = await commandIn(home, "calc", ["146-3"]);
            expect(resStages.code).toBe(0);
            expect(resStages.json.data.gain).toBeNull();
            for (const stage of resStages.json.data.stages) {
                expect(stage.gain).toBeNull();
            }

            const resAch = await commandIn(home, "calc", ["146-3", "--achievements", "100.5"]);
            expect(resAch.code).toBe(0);
            expect(resAch.json.data.gain).toBeNull();
        });
    });
});
