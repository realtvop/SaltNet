import type { DivingFishFullRecord } from "@core/integrations/diving-fish/type";
import type { RuntimePaths } from "../../src/runtime/paths";
import { mapLXNSCollections } from "@core/collection/map";
import { getScoredCollectionCharts } from "@core/collection/progress";
import { checkCollectionChartFinish } from "@core/collection/versionPlate";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { ComboStatus, RankRate, SyncStatus } from "@core/mai/types";
import { describe, expect, it } from "vitest";
import { allChartEntries } from "../../src/catalog/chartQuery";
import { listCollections, resolveCollection } from "../../src/refs/collection";
import { resolvePlate } from "../../src/refs/plate";
import { commandIn } from "../commandRun";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { b50User, detailedUser, recordOf, SCORE_TIME, seedScoreUsers, user } from "../scoreUsers";
import { useTempHome } from "../tempHome";
import { useTimeZone } from "../zone";

useTimeZone("America/New_York");
const home = useTempHome();

function chart(key: string) {
    const entry = fixtureSongCatalog().chartByKey.get(key);
    if (!entry) throw new Error(`fixture has no chart ${key}`);
    return entry.chart;
}

function score(
    key: string,
    values: Partial<DivingFishFullRecord> & { achievements: number }
): DivingFishFullRecord {
    return { ...recordOf(chart(key)), ...values };
}

function scoreUser() {
    const records: Record<string, DivingFishFullRecord> = {
        "131-4": score("131-4", {
            achievements: 100.6,
            rate: RankRate.sssp,
            fc: ComboStatus.AllPerfectPlus,
            fs: SyncStatus.FullSyncDXPlus,
            ra: 600,
            play_count: 6,
            lastChangedAt: SCORE_TIME + 4_000,
        }),
        "70-4": score("70-4", {
            achievements: 100.5,
            rate: RankRate.sssp,
            fc: ComboStatus.AllPerfect,
            fs: SyncStatus.FullSync,
            ra: 500,
            play_count: 5,
            lastChangedAt: SCORE_TIME + 3_000,
        }),
        "58-4": score("58-4", {
            achievements: 100.5,
            rate: RankRate.sssp,
            fc: ComboStatus.FullComboPlus,
            fs: SyncStatus.FullSyncPlus,
            ra: 400,
            play_count: 4,
            lastChangedAt: SCORE_TIME + 3_000,
        }),
        "115-4": score("115-4", {
            achievements: 100.5,
            rate: RankRate.sssp,
            fc: ComboStatus.None,
            fs: SyncStatus.None,
            ra: 400,
            play_count: 3,
            lastChangedAt: SCORE_TIME + 3_000,
        }),
        "115-3": score("115-3", {
            achievements: 100.5,
            rate: RankRate.sssp,
            fc: ComboStatus.None,
            fs: SyncStatus.None,
            ra: 400,
            play_count: 3,
            lastChangedAt: SCORE_TIME + 3_000,
        }),
        "256-4": score("256-4", {
            achievements: 100,
            rate: RankRate.sss,
            fc: "unknown" as ComboStatus,
            fs: "unknown" as SyncStatus,
            ra: 200,
            play_count: 2,
            lastChangedAt: 0,
        }),
        "146-4": score("146-4", {
            achievements: 99.9999,
            rate: RankRate.ssp,
            fc: ComboStatus.None,
            fs: SyncStatus.None,
            ra: 100,
            lastChangedAt: 0,
        }),
        "8-0": score("8-0", {
            achievements: 80,
            rate: RankRate.a,
            fc: ComboStatus.None,
            fs: SyncStatus.None,
            ra: 1,
            lastChangedAt: 0,
        }),
        "9-0": score("9-0", {
            achievements: 79.9999,
            rate: RankRate.bbb,
            fc: ComboStatus.None,
            fs: SyncStatus.None,
            ra: 1,
            lastChangedAt: 0,
        }),
    };
    delete records["146-4"].play_count;
    return user("made-score-filter-user", "Made Score Filter User", {
        updateTime: SCORE_TIME,
        detailed: records,
    });
}

async function scoreHome(): Promise<RuntimePaths> {
    const paths = home();
    await seedScoreUsers(paths, [scoreUser()]);
    return paths;
}

function keys(result: Awaited<ReturnType<typeof commandIn>>): string[] {
    return result.json.data.items.map((item: { chartKey: string }) => item.chartKey);
}

describe("charts score filters and required users", () => {
    it("rejects every score-reading option without users before fetching metadata", async () => {
        const cases = [
            ["--achieved", "s"],
            ["--missing", "s"],
            ["--recent"],
            ["--stats"],
            ["--sort", "achievements"],
            ["--sort", "rating"],
            ["--sort", "playcount"],
            ["--sort", "recent"],
            ["--group-by", "rank"],
            ["--group-by", "combo"],
            ["--group-by", "sync"],
            ["--plate", "真極", "--missing"],
        ];
        for (const args of cases) {
            const result = await commandIn(home(), "charts", args);
            expect(result.code, args.join(" ")).toBe(4);
            expect(result.json.error.code, args.join(" ")).toBe("NO_USER");
            expect(result.requests, args.join(" ")).toEqual([]);
        }
    });

    it("uses a plate's own per-chart requirement when the score condition is omitted", async () => {
        const paths = home();
        const player = detailedUser("made-own-requirement", "Made Own Requirement");
        player.data.detailed!["8-0"].fc = ComboStatus.None;
        await seedScoreUsers(paths, [player]);

        const plate = resolvePlate(
            mapLXNSCollections(getFixtureLXNSCollections()).versionPlates,
            "真極"
        ).plate;
        const charts = allChartEntries(fixtureSongCatalog()).map(entry => entry.chart);
        const scored = getScoredCollectionCharts(plate, charts, player.data.detailed);
        const expectedAchieved = scored
            .filter(chart => checkCollectionChartFinish(plate, chart))
            .map(chart => `${chart.music.id}-${chart.info.grade}`);
        const expectedMissing = scored
            .filter(chart => !checkCollectionChartFinish(plate, chart))
            .map(chart => `${chart.music.id}-${chart.info.grade}`);

        const achieved = await commandIn(paths, "charts", ["--plate", "真極", "--achieved"]);
        const missing = await commandIn(paths, "charts", ["--plate", "真極", "--missing"]);
        expect(new Set(keys(achieved))).toEqual(new Set(expectedAchieved));
        expect(new Set(keys(missing))).toEqual(new Set(expectedMissing));
        expect(keys(missing)).toEqual(["8-0"]);

        const followedByOption = await commandIn(paths, "charts", [
            "--plate",
            "真極",
            "--missing",
            "--diff",
            "mas",
        ]);
        expect(followedByOption.code).toBe(0);
        expect(keys(followedByOption)).toEqual([]);
    });

    it("uses the requirement of a collection named by --collection when the condition is omitted", async () => {
        const paths = home();
        const player = detailedUser("made-collection-own", "Made Collection Own");
        player.data.detailed!["115-0"].fc = ComboStatus.None;
        await seedScoreUsers(paths, [player]);

        const target = resolveCollection(
            listCollections(mapLXNSCollections(getFixtureLXNSCollections())),
            "plate:6104"
        ).collection;
        const charts = allChartEntries(fixtureSongCatalog()).map(entry => entry.chart);
        const scored = getScoredCollectionCharts(target, charts, player.data.detailed);
        const expected = (finished: boolean) =>
            scored
                .filter(chart => checkCollectionChartFinish(target, chart) === finished)
                .map(chart => `${chart.music.id}-${chart.info.grade}`);

        const args = ["--collection", "plate:6104", "--limit", "100"];
        const achieved = await commandIn(paths, "charts", [...args, "--achieved"]);
        const missing = await commandIn(paths, "charts", [...args, "--missing"]);
        expect(achieved.code).toBe(0);
        expect(missing.code).toBe(0);
        expect(expected(true).length).toBeGreaterThan(0);
        expect(new Set(keys(achieved))).toEqual(new Set(expected(true)));
        expect(new Set(keys(missing))).toEqual(new Set(expected(false)));
        expect(keys(missing)).toEqual(["115-0"]);
    });

    it("requires exactly one plate or collection when a score condition is omitted", async () => {
        const paths = home();
        await seedScoreUsers(paths, [detailedUser("made-usage-player", "Made Usage Player")]);
        for (const args of [
            ["--missing"],
            ["--achieved", "--course", "十段"],
            ["--plate", "真極", "--collection", "plate:6101", "--missing"],
        ]) {
            const result = await commandIn(paths, "charts", args);
            expect(result.code, args.join(" ")).toBe(2);
            expect(result.json.error.code, args.join(" ")).toBe("USAGE");
            expect(result.json.error.message, args.join(" ")).toContain(
                "恰好一个 --plate 或 --collection"
            );
        }
    });

    it("uses public B50 scores for omitted collection requirements and keeps its warning", async () => {
        const paths = home();
        await seedScoreUsers(paths, [b50User("made-own-b50", "Made Own B50")]);
        const result = await commandIn(paths, "charts", [
            "--collection",
            "plate:6101",
            "--missing",
            "--limit",
            "100",
        ]);
        expect(result.code).toBe(0);
        expect(result.json.warnings.map((warning: { code: string }) => warning.code)).toContain(
            "PARTIAL_SCORES"
        );
        expect(result.json.meta.page.total).toBeGreaterThan(0);
    });

    it("keeps ordinary no-user output unchanged and allows explicit default sorting", async () => {
        const paths = home();
        const plain = await commandIn(paths, "charts", ["--limit", "5"]);
        const explicit = await commandIn(paths, "charts", ["--sort", "default", "--limit", "5"]);
        expect(keys(explicit)).toEqual(keys(plain));
        expect(plain.json.meta.user).toBeUndefined();
        expect(plain.json.data.items.every((item: { score: unknown }) => item.score === null)).toBe(
            true
        );
    });

    it("rejects an invalid condition before a metadata request and lists valid spellings", async () => {
        const result = await commandIn(home(), "charts", ["--achieved", "rainbow"]);
        expect(result.code).toBe(2);
        expect(result.json.error.code).toBe("USAGE");
        expect(result.json.error.message).toContain("clear");
        expect(result.json.error.message).toContain("sss+");
        expect(result.json.error.message).toContain("fdx+");
        expect(result.requests).toEqual([]);
    });

    it("filters rank, combo and sync thresholds, including unknown and absent scores", async () => {
        const paths = await scoreHome();
        expect(
            keys(await commandIn(paths, "charts", ["--diff", "rem", "--achieved", "SsS+"]))
        ).toEqual(["131-4", "70-4", "58-4", "115-4"]);
        expect(
            keys(await commandIn(paths, "charts", ["--diff", "rem", "--achieved", "sss"]))
        ).toEqual(["131-4", "70-4", "58-4", "115-4", "256-4"]);
        expect(
            keys(await commandIn(paths, "charts", ["--diff", "rem", "--missing", "sss"]))
        ).toEqual(["146-4", "17-4"]);

        expect(
            keys(await commandIn(paths, "charts", ["--diff", "rem", "--achieved", "fC+"]))
        ).toEqual(["131-4", "70-4", "58-4"]);
        expect(
            keys(await commandIn(paths, "charts", ["--diff", "rem", "--achieved", "ap"]))
        ).toEqual(["131-4", "70-4"]);
        expect(
            keys(await commandIn(paths, "charts", ["--diff", "rem", "--achieved", "fs"]))
        ).toEqual(["131-4", "70-4", "58-4"]);
        expect(
            keys(await commandIn(paths, "charts", ["--diff", "rem", "--achieved", "fdx"]))
        ).toEqual(["131-4"]);
        expect(
            keys(await commandIn(paths, "charts", ["--diff", "rem", "--missing", "sync"]))
        ).toContain("256-4");
    });

    it("checks clear at 80, combines achieved and missing, and treats unplayed correctly", async () => {
        const paths = await scoreHome();
        expect(
            keys(await commandIn(paths, "charts", ["--search", "8", "--achieved", "clear"]))
        ).toContain("8-0");
        expect(
            keys(await commandIn(paths, "charts", ["--search", "9", "--achieved", "clear"]))
        ).not.toContain("9-0");
        expect(
            keys(
                await commandIn(paths, "charts", [
                    "--diff",
                    "rem",
                    "--achieved",
                    "fc",
                    "--missing",
                    "ap",
                ])
            )
        ).toEqual(["58-4"]);
        expect(
            keys(await commandIn(paths, "charts", ["--diff", "rem", "--achieved", "d"]))
        ).not.toContain("17-4");
        expect(
            keys(await commandIn(paths, "charts", ["--diff", "rem", "--missing", "d"]))
        ).toContain("17-4");
    });

    it("ignores surrounding spaces and case in score conditions", async () => {
        const paths = await scoreHome();
        const achievedLower = await commandIn(paths, "charts", ["--achieved", "sss+"]);
        const achievedSpaced = await commandIn(paths, "charts", ["--achieved", " SSS+ "]);
        expect(keys(achievedSpaced)).toEqual(keys(achievedLower));
        expect(keys(achievedLower)).toEqual(["131-4", "70-4", "58-4", "115-4", "115-3"]);

        const missingLower = await commandIn(paths, "charts", ["--missing", "fc"]);
        const missingSpaced = await commandIn(paths, "charts", ["--missing", " Fc "]);
        expect(keys(missingSpaced)).toEqual(keys(missingLower));
        expect(keys(missingLower).length).toBeGreaterThan(0);
    });
});

describe("charts score sorting and recent", () => {
    it("sorts each numeric score key both ways and leaves missing values last", async () => {
        const paths = await scoreHome();
        const expected: Record<string, { desc: string[]; asc: string[] }> = {
            achievements: {
                desc: ["131-4", "58-4", "70-4", "115-4", "256-4", "146-4", "17-4"],
                asc: ["146-4", "256-4", "58-4", "70-4", "115-4", "131-4", "17-4"],
            },
            rating: {
                desc: ["131-4", "70-4", "58-4", "115-4", "256-4", "146-4", "17-4"],
                asc: ["146-4", "256-4", "58-4", "115-4", "70-4", "131-4", "17-4"],
            },
            playcount: {
                desc: ["131-4", "70-4", "58-4", "115-4", "256-4", "17-4", "146-4"],
                asc: ["256-4", "115-4", "58-4", "70-4", "131-4", "17-4", "146-4"],
            },
        };
        for (const [sort, order] of Object.entries(expected)) {
            const base = ["--diff", "rem", "--sort", sort, "--limit", "20"];
            expect(keys(await commandIn(paths, "charts", base)), sort).toEqual(order.desc);
            expect(keys(await commandIn(paths, "charts", [...base, "--asc"])), sort).toEqual(
                order.asc
            );
        }
    });

    it("uses the recent tie-break chain and lets an explicit sort win", async () => {
        const paths = await scoreHome();
        const recent = await commandIn(paths, "charts", ["--recent", "--limit", "20"]);
        expect(keys(recent)).toEqual(["131-4", "70-4", "115-3", "115-4", "58-4"]);
        expect(
            recent.json.data.items.every(
                (item: { score: { changedAt: string } }) => item.score.changedAt
            )
        ).toBe(true);

        const asc = await commandIn(paths, "charts", [
            "--recent",
            "--sort",
            "recent",
            "--asc",
            "--limit",
            "20",
        ]);
        expect(keys(asc)).toEqual(["70-4", "115-3", "115-4", "58-4", "131-4"]);

        const rating = await commandIn(paths, "charts", [
            "--recent",
            "--sort",
            "rating",
            "--asc",
            "--limit",
            "20",
        ]);
        expect(keys(rating)).toEqual(["58-4", "115-3", "115-4", "70-4", "131-4"]);
    });

    it("uses played-first default order, reverses its two keys, and keeps course order", async () => {
        const paths = await scoreHome();
        const desc = await commandIn(paths, "charts", ["--diff", "rem", "--limit", "20"]);
        expect(keys(desc)).toEqual(["131-4", "70-4", "58-4", "115-4", "256-4", "146-4", "17-4"]);
        const asc = await commandIn(paths, "charts", ["--diff", "rem", "--asc", "--limit", "20"]);
        expect(keys(asc)).toEqual(["146-4", "256-4", "70-4", "58-4", "115-4", "131-4", "17-4"]);

        const noUser = home();
        const expected = await commandIn(noUser, "charts", ["--course", "十段", "--limit", "20"]);
        const withScores = await commandIn(paths, "charts", ["--course", "十段", "--limit", "20"]);
        expect(keys(withScores)).toEqual(keys(expected));
    });

    it("orders by change time rather than achievement rate under --sort recent", async () => {
        const paths = home();
        await seedScoreUsers(paths, [
            user("made-recent-time-user", "Made Recent Time User", {
                updateTime: SCORE_TIME,
                detailed: {
                    "131-4": score("131-4", {
                        achievements: 97,
                        rate: RankRate.s,
                        ra: 200,
                        lastChangedAt: SCORE_TIME + 3_000,
                    }),
                    "70-4": score("70-4", {
                        achievements: 100.2,
                        rate: RankRate.sss,
                        ra: 300,
                        lastChangedAt: SCORE_TIME + 2_000,
                    }),
                    "58-4": score("58-4", {
                        achievements: 100.8,
                        rate: RankRate.sssp,
                        ra: 400,
                        lastChangedAt: SCORE_TIME + 1_000,
                    }),
                },
            }),
        ]);

        const desc = await commandIn(paths, "charts", ["--recent", "--sort", "recent"]);
        expect(keys(desc)).toEqual(["131-4", "70-4", "58-4"]);

        const asc = await commandIn(paths, "charts", ["--recent", "--sort", "recent", "--asc"]);
        expect(keys(asc)).toEqual(["58-4", "70-4", "131-4"]);

        const descLimit = await commandIn(paths, "charts", ["--sort", "recent", "--limit", "3"]);
        expect(keys(descLimit)).toEqual(["131-4", "70-4", "58-4"]);

        const ascLimit = await commandIn(paths, "charts", [
            "--sort",
            "recent",
            "--asc",
            "--limit",
            "3",
        ]);
        expect(keys(ascLimit)).toEqual(["58-4", "70-4", "131-4"]);
    });

    it("breaks ties with achievements, rating and constant in both directions", async () => {
        const tieTime = SCORE_TIME + 2_000;
        const paths = home();
        await seedScoreUsers(paths, [
            user("made-recent-tie-user", "Made Recent Tie User", {
                updateTime: SCORE_TIME,
                detailed: {
                    "70-4": score("70-4", {
                        achievements: 100.5,
                        ra: 300,
                        lastChangedAt: tieTime,
                    }),
                    "58-4": score("58-4", {
                        achievements: 100.0,
                        ra: 500,
                        lastChangedAt: tieTime,
                    }),
                    "131-4": score("131-4", {
                        achievements: 100.0,
                        ra: 400,
                        lastChangedAt: tieTime,
                    }),
                    "115-4": score("115-4", {
                        achievements: 100.0,
                        ra: 400,
                        lastChangedAt: tieTime,
                    }),
                },
            }),
        ]);

        const expectedTieOrder = ["70-4", "58-4", "115-4", "131-4"];
        const desc = await commandIn(paths, "charts", ["--recent", "--sort", "recent"]);
        expect(keys(desc)).toEqual(expectedTieOrder);

        const asc = await commandIn(paths, "charts", ["--recent", "--sort", "recent", "--asc"]);
        expect(keys(asc)).toEqual(expectedTieOrder);
    });
});

describe("charts score grouping and statistics", () => {
    it("orders rank, combo and sync groups best-first with null last and pages each group", async () => {
        const paths = await scoreHome();
        const expected = {
            rank: [
                ["SSS+", 4],
                ["SSS", 1],
                ["SS+", 1],
                [null, 1],
            ],
            combo: [
                ["AP+", 1],
                ["AP", 1],
                ["FC+", 1],
                [null, 4],
            ],
            sync: [
                ["FDX+", 1],
                ["FS+", 1],
                ["FS", 1],
                [null, 4],
            ],
        };
        for (const [groupBy, groups] of Object.entries(expected)) {
            const result = await commandIn(paths, "charts", [
                "--diff",
                "rem",
                "--group-by",
                groupBy,
                "--limit",
                "1",
                "--offset",
                "1",
            ]);
            expect(
                result.json.data.groups.map((group: { key: string | null; count: number }) => [
                    group.key,
                    group.count,
                ]),
                groupBy
            ).toEqual(groups);
            expect(result.json.data.groups[0].items).toHaveLength(Number(groups[0][1]) > 1 ? 1 : 0);
        }
    });

    it("counts the full filtered result before paging and gives every group its own stats", async () => {
        const paths = await scoreHome();
        const plain = await commandIn(paths, "charts", [
            "--diff",
            "rem",
            "--stats",
            "--limit",
            "1",
        ]);
        expect(plain.json.data.items).toHaveLength(1);
        expect(plain.json.data.stats).toEqual({
            total: 7,
            played: 6,
            sss: 5,
            sssPlus: 4,
            fc: 3,
            ap: 2,
            fdx: 1,
        });

        const grouped = await commandIn(paths, "charts", [
            "--diff",
            "rem",
            "--group-by",
            "rank",
            "--stats",
            "--limit",
            "1",
        ]);
        const plus = grouped.json.data.groups[0];
        expect(plus).toMatchObject({
            key: "SSS+",
            count: 4,
            stats: { total: 4, played: 4, sss: 4, sssPlus: 4 },
        });
        expect(plus.items).toHaveLength(1);
        const nullGroup = grouped.json.data.groups.at(-1);
        expect(nullGroup).toMatchObject({
            key: null,
            count: 1,
            stats: { total: 1, played: 0, sss: 0, sssPlus: 0, fc: 0, ap: 0, fdx: 0 },
        });
    });

    it("preserves stats in TSV comments and text summaries", async () => {
        const paths = await scoreHome();
        const tsv = await commandIn(paths, "charts", [
            "--diff",
            "rem",
            "--stats",
            "--limit",
            "1",
            "--format",
            "tsv",
        ]);
        expect(tsv.stdout.split("\n")[0]).toContain("chartKey");
        expect(tsv.stderr).toContain(
            '# stats {"total":7,"played":6,"sss":5,"sssPlus":4,"fc":3,"ap":2,"fdx":1}'
        );

        const groupedTsv = await commandIn(paths, "charts", [
            "--diff",
            "rem",
            "--group-by",
            "rank",
            "--stats",
            "--limit",
            "1",
            "--format",
            "tsv",
        ]);
        const comments = groupedTsv.stderr.split("\n").filter(line => line.startsWith("# stats "));
        expect(comments).toHaveLength(4);
        expect(comments[0]).toContain('{"group":"SSS+","total":4');
        expect(comments.at(-1)).toContain('{"group":null,"total":1');

        const text = await commandIn(paths, "charts", [
            "--diff",
            "rem",
            "--stats",
            "--limit",
            "1",
            "--format",
            "text",
        ]);
        expect(text.stdout.split("\n")[0]).toBe(
            "统计：总数 7，游玩 6，SSS 5，SSS+ 4，FC 3，AP 2，FDX 1"
        );
    });

    it("keeps PARTIAL_SCORES and NO_SCORES warnings with score options", async () => {
        const partialPaths = home();
        await seedScoreUsers(partialPaths, [b50User("made-partial", "Made Partial")]);
        const partial = await commandIn(partialPaths, "charts", ["--stats", "--limit", "1"]);
        expect(partial.json.warnings.map((warning: { code: string }) => warning.code)).toEqual([
            "PARTIAL_SCORES",
        ]);
        expect(partial.json.data.stats.played).toBeGreaterThan(0);

        const emptyPaths = home();
        await seedScoreUsers(emptyPaths, [
            user("made-no-scores", "Made No Scores", { updateTime: SCORE_TIME }),
        ]);
        const empty = await commandIn(emptyPaths, "charts", ["--missing", "s", "--limit", "1"]);
        expect(empty.json.warnings.map((warning: { code: string }) => warning.code)).toEqual([
            "NO_SCORES",
        ]);
        expect(empty.json.meta.page.total).toBe(175);
        expect(empty.json.data.items[0].score).toBeNull();
    });

    it("counts plain FC and plain FDX alongside higher and lower statuses in --stats", async () => {
        const paths = home();
        await seedScoreUsers(paths, [
            user("made-fc-fdx-user", "Made FC FDX User", {
                updateTime: SCORE_TIME,
                detailed: {
                    "131-4": score("131-4", {
                        achievements: 100.6,
                        rate: RankRate.sssp,
                        fc: ComboStatus.AllPerfectPlus,
                        fs: SyncStatus.FullSyncDXPlus,
                    }),
                    "70-4": score("70-4", {
                        achievements: 100.5,
                        rate: RankRate.sssp,
                        fc: ComboStatus.AllPerfect,
                        fs: SyncStatus.FullSyncDX,
                    }),
                    "58-4": score("58-4", {
                        achievements: 100.2,
                        rate: RankRate.sss,
                        fc: ComboStatus.FullComboPlus,
                        fs: SyncStatus.FullSyncPlus,
                    }),
                    "115-4": score("115-4", {
                        achievements: 100.0,
                        rate: RankRate.sss,
                        fc: ComboStatus.FullCombo,
                        fs: SyncStatus.FullSync,
                    }),
                    "256-4": score("256-4", {
                        achievements: 99.0,
                        rate: RankRate.ssp,
                        fc: ComboStatus.None,
                        fs: SyncStatus.Sync,
                    }),
                    "146-4": score("146-4", {
                        achievements: 98.0,
                        rate: RankRate.ss,
                        fc: ComboStatus.None,
                        fs: SyncStatus.None,
                    }),
                },
            }),
        ]);

        const result = await commandIn(paths, "charts", [
            "--diff",
            "rem",
            "--stats",
            "--limit",
            "1",
        ]);
        expect(result.json.data.stats).toEqual({
            total: 7,
            played: 6,
            sss: 4,
            sssPlus: 2,
            fc: 4,
            ap: 2,
            fdx: 2,
        });
    });

    it("requires a numeric achievement rate to increment played in --stats", async () => {
        const paths = home();
        await seedScoreUsers(paths, [
            user("made-non-numeric-user", "Made Non Numeric User", {
                updateTime: SCORE_TIME,
                detailed: {
                    "8-0": score("8-0", { achievements: 80 }),
                    "8-1": score("8-1", {
                        achievements: "100.5" as unknown as number,
                    }),
                },
            }),
        ]);

        const result = await commandIn(paths, "charts", [
            "--search",
            "True Love Song",
            "--diff",
            "bas,adv",
            "--stats",
        ]);
        const items = result.json.data.items as {
            chartKey: string;
            score: { achievements: number | null } | null;
        }[];
        const invalidRow = items.find(item => item.chartKey === "8-1");
        expect(invalidRow?.score).not.toBeNull();
        expect(invalidRow?.score?.achievements).toBeNull();

        const normalRow = items.find(item => item.chartKey === "8-0");
        expect(normalRow?.score).not.toBeNull();
        expect(normalRow?.score?.achievements).toBe(80);

        expect(result.json.data.stats).toMatchObject({
            total: 2,
            played: 1,
        });
    });
});
