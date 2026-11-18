import type { DivingFishFullRecord } from "@core/integrations/diving-fish/type";
import type { User } from "@core/user/type";
import { existsSync } from "node:fs";
import path from "node:path";
import { ComboStatus } from "@core/mai/types";
import {
    calculateRating,
    createMusicChartMap,
    normalizeConstant,
    selectB50Charts,
    sumChartRatings,
} from "@core/query/b50";
import { describe, expect, it } from "vitest";
import { chartKeyOf } from "../../src/catalog/songs";
import { createRegistry } from "../../src/commands";
import { openStore } from "../../src/store/store";
import { replaceUsers } from "../../src/users/repository";
import { formatLocalTime } from "../../src/util/time";
import { commandIn, NOW } from "../commandRun";
import { expectConforms } from "../dataSchema";
import {
    allFixtureRecords,
    b50User,
    detailedUser,
    recordOf,
    SCORE_TIME,
    seedScoreUsers,
    user,
} from "../scoreUsers";
import { useTempHome } from "../tempHome";
import { useTimeZone } from "../zone";

useTimeZone("America/New_York");
const home = useTempHome();

interface JsonGroup {
    key: "B35" | "B15";
    count: number;
    items: {
        chartKey: string;
        rank: number;
        rating: number;
        ratingConstant: number | null;
        b50: { part: "B35" | "B15"; rank: number } | null;
    }[];
}

function groupsOf(result: Awaited<ReturnType<typeof commandIn>>): JsonGroup[] {
    return result.json.data.groups;
}

function keys(charts: readonly { music: { id: number }; info: { grade: number } }[]): string[] {
    return charts.map(chart => `${chart.music.id}-${chart.info.grade}`);
}

function recordsOf(
    charts: Readonly<ReturnType<typeof allFixtureRecords>["charts"]>
): Record<string, DivingFishFullRecord> {
    return Object.fromEntries(
        charts.map((chart, index) => [chartKeyOf(chart), recordOf(chart, index)])
    );
}

function oldCharts() {
    return allFixtureRecords().charts.filter(
        chart => chart.music.info.isNew === false && chart.info.grade !== 10
    );
}

function seedWithoutCatalog(paths: ReturnType<typeof home>, users: readonly User[]): void {
    const store = openStore(paths);
    try {
        replaceUsers(store, users, []);
    } finally {
        store.close();
    }
}

describe("b50", () => {
    it("matches the shared normal selection, ranks, normal B50 places, and whole-part sums", async () => {
        const paths = home();
        const made = detailedUser("made-normal", "Made Normal");
        await seedScoreUsers(paths, [made]);
        const result = await commandIn(paths, "b50", []);
        const charts = allFixtureRecords().charts;
        const expected = selectB50Charts(made.data, createMusicChartMap(charts), {
            fitDiff: false,
            nb50: false,
            comboFilter: null,
            pc50: false,
        });

        expect(result.code).toBe(0);
        expect(result.json.data.mode).toBe("normal");
        expect(result.json.data.label).toBe("B50");
        expect(groupsOf(result).map(group => group.key)).toEqual(["B35", "B15"]);
        expect(groupsOf(result).map(group => group.items.map(item => item.chartKey))).toEqual([
            keys(expected.old),
            keys(expected.newer),
        ]);
        for (const group of groupsOf(result)) {
            expect(group.count).toBe(group.items.length);
            group.items.forEach((item, index) => {
                expect(item.rank).toBe(index + 1);
                expect(item.b50).toEqual({ part: group.key, rank: index + 1 });
                expect(item.ratingConstant).toBeNull();
            });
        }
        const b35 = sumChartRatings(expected.old);
        const b15 = sumChartRatings(expected.newer);
        expect(result.json.data.rating).toEqual({ total: b35 + b15, b35, b15 });
        expect(result.json.meta.user).toEqual({
            index: 0,
            uid: "made-normal",
            name: "Made Normal",
        });
        expect(result.json.meta.dataAsOf).toHaveProperty("catalog");
        expect(result.json.meta.dataAsOf.scores).toBe(formatLocalTime(new Date(SCORE_TIME)));
    });

    it("recomputes fit rating with the rounded fit constant and keeps the stored row score", async () => {
        const paths = home();
        const chart = oldCharts().find(candidate => candidate.info.stat?.fit_diff !== undefined);
        if (!chart?.info.stat) throw new Error("fixture needs an old chart with fit statistics");
        const record = recordOf(chart);
        record.achievements = 100.1234;
        record.ra = 1;
        const made = user("made-fit", "Made Fit", {
            updateTime: SCORE_TIME,
            detailed: { [chartKeyOf(chart)]: record },
        });
        await seedScoreUsers(paths, [made]);

        const result = await commandIn(paths, "b50", ["--mode", "fit"]);
        const item = groupsOf(result).flatMap(group => group.items)[0];
        const constant = normalizeConstant(chart.info.stat.fit_diff) ?? chart.info.constant;
        expect(item.chartKey).toBe(chartKeyOf(chart));
        expect(item.ratingConstant).toBe(constant);
        expect(item.rating).toBe(calculateRating(record.achievements, constant));
        expect((item as unknown as { score: { rating: number } }).score.rating).toBe(1);
        expect(result.json.data.rating.total).toBe(item.rating);
    });

    it("implements nb, AP, and FC with the shared page rules", async () => {
        const paths = home();
        const candidates = oldCharts().slice(0, 8);
        const records = recordsOf(candidates);
        const firstFour = candidates.slice(0, 4);
        const combos = [
            ComboStatus.None,
            ComboStatus.FullCombo,
            ComboStatus.AllPerfect,
            ComboStatus.AllPerfectPlus,
        ];
        firstFour.forEach((chart, index) => {
            records[chartKeyOf(chart)].fc = combos[index];
        });
        const made = user("made-modes", "Made Modes", {
            updateTime: SCORE_TIME,
            detailed: records,
        });
        await seedScoreUsers(paths, [made]);
        const map = createMusicChartMap(allFixtureRecords().charts);

        for (const mode of ["nb", "ap", "fc"] as const) {
            const result = await commandIn(paths, "b50", ["--mode", mode]);
            const expected = selectB50Charts(made.data, map, {
                fitDiff: false,
                nb50: mode === "nb",
                comboFilter: mode === "ap" || mode === "fc" ? mode : null,
                pc50: false,
            });
            expect(
                groupsOf(result).flatMap(group => group.items.map(item => item.chartKey))
            ).toEqual([...keys(expected.old), ...keys(expected.newer)]);
        }
        const ap = groupsOf(await commandIn(paths, "b50", ["--mode", "ap"]))[0].items;
        const fc = groupsOf(await commandIn(paths, "b50", ["--mode", "fc"]))[0].items;
        expect(new Set(ap.map(item => item.chartKey))).toEqual(
            new Set(firstFour.slice(2).map(chartKeyOf))
        );
        expect(new Set(fc.map(item => item.chartKey))).toEqual(
            new Set(candidates.slice(1).map(chartKeyOf))
        );

        const nb = groupsOf(await commandIn(paths, "b50", ["--mode", "nb"]))
            .flatMap(group => group.items)
            .map(item => item.chartKey);
        for (const key of nb) {
            const chart = map.get(key);
            expect(chart?.info.stat?.fit_diff).toBeGreaterThan(chart?.info.constant ?? Infinity);
        }
    });

    it("orders PC50 by records' play counts and warns when none is positive", async () => {
        const candidates = oldCharts().slice(0, 3);
        const records = recordsOf(candidates);
        [2, 10, 5].forEach((count, index) => {
            records[chartKeyOf(candidates[index])].play_count = count;
        });
        const paths = home();
        await seedScoreUsers(paths, [
            user("made-pc", "Made PC", { updateTime: SCORE_TIME, detailed: records }),
        ]);
        const result = await commandIn(paths, "b50", ["--mode", "pc"]);
        expect(groupsOf(result)[0].items.map(item => item.chartKey)).toEqual([
            chartKeyOf(candidates[1]),
            chartKeyOf(candidates[2]),
            chartKeyOf(candidates[0]),
        ]);
        expect(result.json.warnings.some(warning => warning.code === "NO_PLAY_COUNTS")).toBe(false);

        const noCounts = Object.fromEntries(
            candidates.map(chart => {
                const record = recordOf(chart);
                record.play_count = 0;
                return [chartKeyOf(chart), record];
            })
        );
        const noCountPaths = home();
        await seedScoreUsers(noCountPaths, [
            user("made-no-counts", "Made No Counts", {
                updateTime: SCORE_TIME,
                detailed: noCounts,
            }),
        ]);
        const warned = await commandIn(noCountPaths, "b50", ["--mode", "pc"]);
        expect(warned.json.warnings).toContainEqual({
            code: "NO_PLAY_COUNTS",
            message: "没有可用的正数游玩次数，PC50 只能按 rating 排序",
        });
    });

    it("uses a public B50 only for normal mode and keeps empty/no-score groups", async () => {
        const partialPaths = home();
        await seedScoreUsers(partialPaths, [b50User("made-partial", "Made Partial")]);
        const normal = await commandIn(partialPaths, "b50", []);
        expect(groupsOf(normal).some(group => group.count > 0)).toBe(true);
        expect(normal.json.warnings).toContainEqual({
            code: "PARTIAL_SCORES",
            message: "只拿到了水鱼公开的 B50，其他谱面没有成绩",
        });
        const fit = await commandIn(partialPaths, "b50", ["--mode", "fit"]);
        expect(
            groupsOf(fit).map(group => ({ key: group.key, count: group.count, items: group.items }))
        ).toEqual([
            { key: "B35", count: 0, items: [] },
            { key: "B15", count: 0, items: [] },
        ]);
        expect(fit.json.data.rating).toEqual({ total: 0, b35: 0, b15: 0 });

        const emptyPaths = home();
        await seedScoreUsers(emptyPaths, [user("made-empty", "Made Empty")]);
        const empty = await commandIn(emptyPaths, "b50", []);
        expect(groupsOf(empty).map(group => group.count)).toEqual([0, 0]);
        expect(empty.json.warnings[0].code).toBe("NO_SCORES");
    });

    it("resolves --user, fails before metadata without users, and preserves reference errors", async () => {
        const paths = home();
        await seedScoreUsers(paths, [
            detailedUser("made-default", "Made Default"),
            detailedUser("made-friend", "Made Friend"),
        ]);
        for (const reference of ["1", "Made Friend"]) {
            const result = await commandIn(paths, "b50", ["--user", reference]);
            expect(result.json.meta.user.uid).toBe("made-friend");
        }
        const unknown = await commandIn(paths, "b50", ["--user", "Nobody Made"]);
        expect(unknown.code).toBe(3);
        expect(unknown.json.error.code).toBe("NOT_FOUND");

        const noUser = await commandIn(home(), "b50", [], { network: {} });
        expect(noUser.code).toBe(4);
        expect(noUser.json.error.code).toBe("NO_USER");
        expect(noUser.requests).toEqual([]);
    });

    it("carries selected-user score context when catalog loading fails", async () => {
        const paths = home();
        seedWithoutCatalog(paths, [detailedUser("made-context", "Made Context")]);
        const result = await commandIn(paths, "b50", [], { network: {} });
        expect(result.code).toBe(5);
        expect(result.json.error.code).toBe("NETWORK");
        expect(result.json.meta.user).toEqual({
            index: 0,
            uid: "made-context",
            name: "Made Context",
        });
        expect(result.json.meta.dataAsOf.scores).toBe(formatLocalTime(new Date(SCORE_TIME)));
    });

    it("pages and projects each group, and renders grouped TSV and text", async () => {
        const paths = home();
        await seedScoreUsers(paths, [detailedUser("made-output", "Made Output")]);
        const page = await commandIn(paths, "b50", [
            "--limit",
            "2",
            "--offset",
            "1",
            "--fields",
            "chartKey,rank",
        ]);
        expect(page.json.data.groups.every((group: JsonGroup) => group.items.length <= 2)).toBe(
            true
        );
        expect(Object.keys(page.json.data.groups[0].items[0])).toEqual(["chartKey", "rank"]);
        expect(page.json.data.groups[0].items[0].rank).toBe(2);

        const tsv = await commandIn(paths, "b50", [
            "--limit",
            "1",
            "--fields",
            "chartKey,rank",
            "--format",
            "tsv",
        ]);
        expect(tsv.stdout.split("\n")[0]).toBe("group\tchartKey\trank");
        expect(tsv.stderr).toContain('# mode "normal"');
        expect(tsv.stderr).toContain('# label "B50"');
        expect(tsv.stderr).toContain("# rating {");

        const text = await commandIn(paths, "b50", ["--limit", "1", "--format", "text"]);
        expect(text.stdout).toContain("B35（35 条）");
        expect(text.stdout).toContain("B15（");
        expect(text.stdout).toContain("mode: normal");
    });
});

describe("rating", () => {
    it.each([
        ["string current rating", { rating: "15000" }],
        ["fractional current rating", { rating: 15_000.5 }],
        [
            "fractional history rating",
            {
                rating: 15_200,
                ratingHistory: [
                    { time: 100, rating: 15_000 },
                    { time: 200, rating: 15_100.5 },
                    { time: 300, rating: 15_200 },
                ],
            },
        ],
        ["null history entry", { rating: 15_000, ratingHistory: [null] }],
        [
            "string history rating",
            { rating: 15_000, ratingHistory: [{ time: 100, rating: "15000" }] },
        ],
    ])("keeps %s output inside the published schema", async (_name, unusualData) => {
        const paths = home();
        seedWithoutCatalog(paths, [
            user("unusual-rating", "Unusual Rating", unusualData as Record<string, unknown>),
        ]);
        const result = await commandIn(paths, "rating", ["--history"], { network: {} });
        expect(result.code).toBe(0);
        expectConforms(createRegistry().find("rating")!.spec.dataSchema!, result.json.data);
        if (unusualData.rating === 15_000.5 || unusualData.rating === "15000") {
            expect(result.json.data.rating).toBeNull();
        }
        if (_name === "fractional history rating") {
            expect(result.json.data.history).toEqual([
                { time: "1969-12-31T19:00:00-05:00", rating: 15_000, change: null },
                { time: "1969-12-31T19:00:00-05:00", rating: 15_200, change: 200 },
            ]);
        }
    });

    it("returns current rating or null without metadata or network", async () => {
        const ratedPaths = home();
        seedWithoutCatalog(ratedPaths, [
            user("made-rated", "Made Rated", { updateTime: SCORE_TIME, rating: 15_432 }),
        ]);
        const rated = await commandIn(ratedPaths, "rating", ["--offline"], { network: {} });
        expect(rated.code).toBe(0);
        expect(rated.json.data).toEqual({ rating: 15_432 });
        expect(rated.json.meta.dataAsOf).toEqual({ scores: formatLocalTime(new Date(SCORE_TIME)) });
        expect(rated.requests).toEqual([]);
        expect(existsSync(path.join(ratedPaths.home, "cache", "saltmeta.json"))).toBe(false);

        const emptyPaths = home();
        seedWithoutCatalog(emptyPaths, [user("made-null", "Made Null")]);
        const empty = await commandIn(emptyPaths, "rating", [], { network: {} });
        expect(empty.json.data).toEqual({ rating: null });
        expect(empty.json.warnings[0].code).toBe("NO_SCORES");
        expect(empty.requests).toEqual([]);
    });

    it("normalizes, sorts, formats, drops invalid history, and calculates changes", async () => {
        const paths = home();
        const made = user("made-history", "Made History", {
            updateTime: SCORE_TIME,
            rating: 15_500,
            ratingHistory: [
                { time: SCORE_TIME + 2_000, rating: 15_500 },
                { time: SCORE_TIME, rating: 15_000 },
                { time: SCORE_TIME + 1_000, rating: 14_900 },
                { time: Number.NaN, rating: 99_999 },
                { time: SCORE_TIME + 3_000, rating: Number.NaN },
                { time: "bad", rating: 1 },
            ],
        } as unknown as Record<string, unknown>);
        seedWithoutCatalog(paths, [made]);
        const result = await commandIn(paths, "rating", ["--history"], { network: {} });
        expect(result.json.data).toEqual({
            rating: 15_500,
            history: [
                { time: "2026-11-09T22:04:05-05:00", rating: 15_000, change: null },
                { time: "2026-11-09T22:04:06-05:00", rating: 14_900, change: -100 },
                { time: "2026-11-09T22:04:07-05:00", rating: 15_500, change: 600 },
            ],
        });
        expect(result.requests).toEqual([]);
    });

    it("makes the single fallback entry from update time or the injected current time", async () => {
        const updatedPaths = home();
        seedWithoutCatalog(updatedPaths, [
            user("made-updated", "Made Updated", {
                updateTime: SCORE_TIME,
                rating: 12_345,
                ratingHistory: [],
            }),
        ]);
        const updated = await commandIn(updatedPaths, "rating", ["--history"]);
        expect(updated.json.data.history).toEqual([
            { time: "2026-11-09T22:04:05-05:00", rating: 12_345, change: null },
        ]);

        const nowPaths = home();
        seedWithoutCatalog(nowPaths, [
            user("made-now", "Made Now", { updateTime: null, rating: 12_346 }),
        ]);
        const now = await commandIn(nowPaths, "rating", ["--history"], { now: NOW });
        expect(now.json.data.history).toEqual([
            { time: "2026-11-10T20:00:00-05:00", rating: 12_346, change: null },
        ]);
    });

    it("resolves users, reports score warnings, and returns NO_USER without requests", async () => {
        const paths = home();
        seedWithoutCatalog(paths, [
            user("made-default", "Made Default", { rating: 1 }),
            user("made-friend", "Made Friend", { rating: 2 }),
        ]);
        for (const reference of ["1", "Made Friend"]) {
            const result = await commandIn(paths, "rating", ["--user", reference], { network: {} });
            expect(result.json.data.rating).toBe(2);
            expect(result.json.meta.user.uid).toBe("made-friend");
            expect(result.json.warnings[0].code).toBe("NO_SCORES");
        }

        const noUser = await commandIn(home(), "rating", [], { network: {} });
        expect(noUser.code).toBe(4);
        expect(noUser.json.error.code).toBe("NO_USER");
        expect(noUser.requests).toEqual([]);
    });

    it("reports PARTIAL_SCORES without needing a catalog", async () => {
        const paths = home();
        seedWithoutCatalog(paths, [b50User("made-rating-partial", "Made Rating Partial")]);
        const result = await commandIn(paths, "rating", [], { network: {} });
        expect(result.code).toBe(0);
        expect(result.json.warnings).toEqual([
            {
                code: "PARTIAL_SCORES",
                message: "只拿到了水鱼公开的 B50，其他谱面没有成绩",
            },
        ]);
        expect(result.requests).toEqual([]);
    });
});

describe("b50 mode details", () => {
    it("prints the fit constant as ratingConstant in nb mode and null in normal mode", async () => {
        const paths = home();
        const made = detailedUser("made-nb-constant", "Made NB Constant");
        await seedScoreUsers(paths, [made]);
        const map = createMusicChartMap(allFixtureRecords().charts);
        const expected = selectB50Charts(made.data, map, {
            fitDiff: false,
            nb50: true,
            comboFilter: null,
            pc50: false,
        });
        const fitConstants = [...expected.old, ...expected.newer].map(
            chart => (chart.score as unknown as { fitConstant: number }).fitConstant
        );
        expect(fitConstants.length).toBeGreaterThan(0);
        expect(fitConstants.every(value => typeof value === "number")).toBe(true);

        const nb = groupsOf(await commandIn(paths, "b50", ["--mode", "nb"])).flatMap(
            group => group.items
        );
        expect(nb.map(item => item.ratingConstant)).toEqual(fitConstants);

        const normal = groupsOf(await commandIn(paths, "b50", [])).flatMap(group => group.items);
        expect(normal.length).toBeGreaterThan(0);
        expect(normal.every(item => item.ratingConstant === null)).toBe(true);
    });

    it("warns NO_PLAY_COUNTS in pc mode only", async () => {
        const paths = home();
        const records = recordsOf(oldCharts().slice(0, 4));
        for (const record of Object.values(records)) record.play_count = 0;
        await seedScoreUsers(paths, [
            user("made-no-counts", "Made No Counts", { updateTime: SCORE_TIME, detailed: records }),
        ]);

        for (const mode of ["normal", "fit", "ap", "fc", "nb"] as const) {
            const result = await commandIn(paths, "b50", ["--mode", mode]);
            expect(result.code).toBe(0);
            expect(result.json.warnings.map((w: { code: string }) => w.code)).not.toContain(
                "NO_PLAY_COUNTS"
            );
        }
        const pc = await commandIn(paths, "b50", ["--mode", "pc"]);
        expect(pc.json.warnings.map((w: { code: string }) => w.code)).toContain("NO_PLAY_COUNTS");
    });

    it("ignores the play counts of a public B50 for the PC50 warning", async () => {
        const paths = home();
        const made = b50User("made-public-counts", "Made Public Counts");
        const b50 = made.data.b50;
        expect(b50).toBeDefined();
        for (const record of [...(b50?.sd ?? []), ...(b50?.dx ?? [])]) record.play_count = 7;
        await seedScoreUsers(paths, [made]);

        const pc = await commandIn(paths, "b50", ["--mode", "pc"]);
        expect(pc.code).toBe(0);
        expect(groupsOf(pc).map(group => group.count)).toEqual([0, 0]);
        expect(pc.json.warnings.map((w: { code: string }) => w.code)).toContain("NO_PLAY_COUNTS");
    });

    it("passes on the catalog warnings", async () => {
        const paths = home();
        await seedScoreUsers(paths, [detailedUser("made-stale", "Made Stale")]);
        const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
        const stale = await commandIn(paths, "b50", [], { now: later, network: {} });
        expect(stale.code).toBe(0);
        expect(stale.json.warnings[0].code).toBe("STALE_METADATA");
    });
});
