import type { Chart } from "@core/music/type";
import { isUtageGrade } from "@core/chart/difficulty";
import { calculateRating, createMusicChartMap, getB50Gain, selectB50Charts } from "@core/query/b50";
import { describe, expect, it } from "vitest";
import { allChartEntries } from "../../src/catalog/chartQuery";
import { constantOf } from "../../src/catalog/chartRow";
import { commandIn } from "../commandRun";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { detailedUser, recordOf, seedScoreUsers, user } from "../scoreUsers";
import { useTempHome } from "../tempHome";
import { useTimeZone } from "../zone";

useTimeZone("America/New_York");
const makeHome = useTempHome();

function allCharts(): Chart[] {
    return allChartEntries(fixtureSongCatalog()).map(e => e.chart);
}

/**
 * A user with nine detailed records rated by the game's formula, six of old charts and three of new
 * ones: both B50 sections have room left, so the gains differ from chart to chart.
 */
function realisticUser(uid: string, name: string) {
    const rated = allCharts().filter(
        chart => !isUtageGrade(chart.info.grade) && (chart.info.constant ?? 0) >= 12
    );
    const old = rated.filter(chart => chart.music.info.isNew === false).slice(0, 6);
    const newer = rated.filter(chart => chart.music.info.isNew === true).slice(0, 3);
    if (old.length < 6 || newer.length < 3)
        throw new Error("fixture needs rated old and new charts");
    const rates = [97, 99.5, 100.25, 98.4, 100.5, 96.2, 99.9, 100.1, 94.5];
    const detailed = Object.fromEntries(
        [...old, ...newer].map((chart, index) => [
            `${chart.music.id}-${chart.info.grade}`,
            {
                ...recordOf(chart, index),
                achievements: rates[index],
                ra: calculateRating(rates[index], chart.info.constant),
            },
        ])
    );
    const result = user(uid, name, { detailed });
    result.remark = name;
    return result;
}

describe("charts --sort gain and --target", () => {
    it("orders charts against getB50Gain computed in the test with default target sss+", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        const u = realisticUser("uid-gain-user", "Gain User");
        await seedScoreUsers(home, [u]);

        const chartMap = createMusicChartMap(allCharts());
        const userB50 = selectB50Charts(u.data, chartMap, {
            fitDiff: false,
            nb50: false,
            comboFilter: null,
            pc50: false,
        });

        // Test default target: sss+ (100.5)
        const { code, json } = await commandIn(home, "charts", ["--sort", "gain", "--limit", "50"]);
        expect(code).toBe(0);
        expect(json.data.items.length).toBeGreaterThan(0);

        const items = json.data.items;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            expect(item.gain).toBeDefined();

            const entry = fixtureSongCatalog().chartByKey.get(item.chartKey)!;
            const constant = constantOf(entry.chart);
            const expectedRating = constant !== null ? calculateRating(100.5, constant) : null;
            const expectedGain =
                expectedRating !== null ? getB50Gain(userB50, entry.chart, expectedRating) : null;

            expect(item.gain).toBe(expectedGain);

            if (i > 0) {
                const prev = items[i - 1];
                if (prev.gain !== null && item.gain !== null) {
                    expect(prev.gain).toBeGreaterThanOrEqual(item.gain);
                } else if (prev.gain === null) {
                    // Null gains must only be at the end
                    expect(item.gain).toBeNull();
                }
            }
        }

        // The gains must differ, or the order above proves nothing.
        expect(
            new Set(items.map((item: { gain: number | null }) => item.gain)).size
        ).toBeGreaterThan(5);

        // Verify that default target matches explicit --target sss+
        const explicit = await commandIn(home, "charts", [
            "--sort",
            "gain",
            "--target",
            "sss+",
            "--limit",
            "50",
        ]);
        expect(explicit.code).toBe(0);
        expect(explicit.json.data.items).toEqual(items);
    });

    it("orders charts with a rank target (sss, s+) and a numeric target (100.25)", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        const u = realisticUser("uid-target-user", "Target User");
        await seedScoreUsers(home, [u]);

        const chartMap = createMusicChartMap(allCharts());
        const userB50 = selectB50Charts(u.data, chartMap, {
            fitDiff: false,
            nb50: false,
            comboFilter: null,
            pc50: false,
        });

        // 1. Rank target: sss (threshold 100.0)
        const sssRes = await commandIn(home, "charts", [
            "--sort",
            "gain",
            "--target",
            "sss",
            "--limit",
            "20",
        ]);
        expect(sssRes.code).toBe(0);
        for (const item of sssRes.json.data.items) {
            const entry = fixtureSongCatalog().chartByKey.get(item.chartKey)!;
            const constant = constantOf(entry.chart);
            const targetRating = constant !== null ? calculateRating(100.0, constant) : null;
            const expectedGain =
                targetRating !== null ? getB50Gain(userB50, entry.chart, targetRating) : null;
            expect(item.gain).toBe(expectedGain);
        }

        // A rank is read without regard to case.
        const upper = await commandIn(home, "charts", [
            "--sort",
            "gain",
            "--target",
            "SSS",
            "--limit",
            "20",
        ]);
        expect(upper.json.data.items).toEqual(sssRes.json.data.items);

        // 2. Rank target: s+ (threshold 98.0)
        const spRes = await commandIn(home, "charts", [
            "--sort",
            "gain",
            "--target",
            "s+",
            "--limit",
            "20",
        ]);
        expect(spRes.code).toBe(0);
        for (const item of spRes.json.data.items) {
            const entry = fixtureSongCatalog().chartByKey.get(item.chartKey)!;
            const constant = constantOf(entry.chart);
            const targetRating = constant !== null ? calculateRating(98.0, constant) : null;
            const expectedGain =
                targetRating !== null ? getB50Gain(userB50, entry.chart, targetRating) : null;
            expect(item.gain).toBe(expectedGain);
        }

        // 3. Numeric target: 100.25
        const numRes = await commandIn(home, "charts", [
            "--sort",
            "gain",
            "--target",
            "100.25",
            "--limit",
            "20",
        ]);
        expect(numRes.code).toBe(0);
        for (const item of numRes.json.data.items) {
            const entry = fixtureSongCatalog().chartByKey.get(item.chartKey)!;
            const constant = constantOf(entry.chart);
            const targetRating = constant !== null ? calculateRating(100.25, constant) : null;
            const expectedGain =
                targetRating !== null ? getB50Gain(userB50, entry.chart, targetRating) : null;
            expect(item.gain).toBe(expectedGain);
        }
    });

    it("supports --asc and puts null gains last in both sort directions", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        const u = realisticUser("uid-asc-user", "Asc User");
        await seedScoreUsers(home, [u]);

        // Query with banquet charts so null gains exist
        const descRes = await commandIn(home, "charts", [
            "--sort",
            "gain",
            "--diff",
            "mas,rem,utage",
            "--limit",
            "200",
        ]);
        expect(descRes.code).toBe(0);
        const descItems = descRes.json.data.items;
        const descNullIndex = descItems.findIndex(
            (it: { gain: number | null }) => it.gain === null
        );
        expect(descNullIndex).toBeGreaterThan(0);
        // All items from descNullIndex to the end must be null
        for (let i = descNullIndex; i < descItems.length; i++) {
            expect(descItems[i].gain).toBeNull();
        }

        // With --asc:
        const ascRes = await commandIn(home, "charts", [
            "--sort",
            "gain",
            "--asc",
            "--diff",
            "mas,rem,utage",
            "--limit",
            "200",
        ]);
        expect(ascRes.code).toBe(0);
        const ascItems = ascRes.json.data.items;
        const ascNullIndex = ascItems.findIndex((it: { gain: number | null }) => it.gain === null);
        expect(ascNullIndex).toBeGreaterThan(0);
        // In ascending order, non-null items must be non-decreasing
        for (let i = 1; i < ascNullIndex; i++) {
            expect(ascItems[i].gain).toBeGreaterThanOrEqual(ascItems[i - 1].gain);
        }
        // Null gains must still be at the end
        for (let i = ascNullIndex; i < ascItems.length; i++) {
            expect(ascItems[i].gain).toBeNull();
        }
    });

    it("adds gain to the rows only when sorting by gain", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);
        await seedScoreUsers(home, [realisticUser("uid-rows", "Rows")]);
        for (const args of [
            ["--limit", "5"],
            ["--sort", "constant", "--limit", "5"],
            ["--sort", "rating", "--limit", "5"],
        ]) {
            const { json } = await commandIn(home, "charts", args);
            expect(json.data.items).toHaveLength(5);
            for (const item of json.data.items) expect(item).not.toHaveProperty("gain");
        }
    });

    it("works with grouping and paging", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        const u = detailedUser("uid-group-user", "Group User");
        u.remark = "Group User";
        await seedScoreUsers(home, [u]);

        // Grouping
        const groupRes = await commandIn(home, "charts", [
            "--sort",
            "gain",
            "--group-by",
            "level",
            "--limit",
            "5",
        ]);
        expect(groupRes.code).toBe(0);
        expect(groupRes.json.data.groups.length).toBeGreaterThan(0);
        for (const grp of groupRes.json.data.groups) {
            for (let i = 0; i < grp.items.length; i++) {
                expect(grp.items[i].gain).toBeDefined();
                if (i > 0 && grp.items[i - 1].gain !== null && grp.items[i].gain !== null) {
                    expect(grp.items[i - 1].gain).toBeGreaterThanOrEqual(grp.items[i].gain);
                }
            }
        }

        // Paging
        const page1 = await commandIn(home, "charts", [
            "--sort",
            "gain",
            "--limit",
            "5",
            "--offset",
            "0",
        ]);
        const page2 = await commandIn(home, "charts", [
            "--sort",
            "gain",
            "--limit",
            "5",
            "--offset",
            "5",
        ]);
        expect(page1.code).toBe(0);
        expect(page2.code).toBe(0);
        expect(page1.json.data.items).toHaveLength(5);
        expect(page2.json.data.items).toHaveLength(5);
        const keys1 = page1.json.data.items.map((it: { chartKey: string }) => it.chartKey);
        const keys2 = page2.json.data.items.map((it: { chartKey: string }) => it.chartKey);
        for (const k of keys1) {
            expect(keys2).not.toContain(k);
        }
    });

    it("fails with NO_USER before any request when no users exist", async () => {
        const home = makeHome();
        // Empty home: no users
        const { code, json, requests } = await commandIn(home, "charts", ["--sort", "gain"]);
        expect(code).toBe(4);
        expect(json.ok).toBe(false);
        expect(json.error.code).toBe("NO_USER");
        expect(requests).toHaveLength(0);
    });

    it("rejects --target without --sort gain and invalid target values with USAGE", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        const u = detailedUser("uid-bad-target", "Bad Target User");
        u.remark = "Bad Target User";
        await seedScoreUsers(home, [u]);

        // --target without --sort gain
        const noGainSort = await commandIn(home, "charts", ["--target", "sss"]);
        expect(noGainSort.code).toBe(2);
        expect(noGainSort.json.error.code).toBe("USAGE");
        expect(noGainSort.json.error.message).toContain("--target 只有在 --sort gain 时才能使用");

        // --target with another sort key
        const otherSort = await commandIn(home, "charts", [
            "--sort",
            "constant",
            "--target",
            "sss",
        ]);
        expect(otherSort.code).toBe(2);
        expect(otherSort.json.error.code).toBe("USAGE");

        // Bad target: invalid string
        const badStr = await commandIn(home, "charts", [
            "--sort",
            "gain",
            "--target",
            "not-a-rank",
        ]);
        expect(badStr.code).toBe(2);
        expect(badStr.json.error.code).toBe("USAGE");
        expect(badStr.json.error.message).toContain("无效");

        // Bad target: number > 101
        const numHigh = await commandIn(home, "charts", ["--sort", "gain", "--target", "102"]);
        expect(numHigh.code).toBe(2);
        expect(numHigh.json.error.code).toBe("USAGE");

        // Bad target: negative number
        const numLow = await commandIn(home, "charts", ["--sort", "gain", "--target", "-1"]);
        expect(numLow.code).toBe(2);
        expect(numLow.json.error.code).toBe("USAGE");
    });
});
