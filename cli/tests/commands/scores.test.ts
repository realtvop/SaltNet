import type { DivingFishFullRecord } from "@core/integrations/diving-fish/type";
import type { User } from "@core/user/type";
import { existsSync } from "node:fs";
import { kaleidxscopeGates } from "@core/kaleidxscope";
import { ComboStatus, RankRate, SyncStatus } from "@core/mai/types";
import { ScoreHistoryChange } from "@core/user/scoreHistory/type";
import { describe, expect, it } from "vitest";
import { replaceMusic } from "../../src/catalog/store";
import { createRegistry } from "../../src/commands";
import { renderHelp } from "../../src/commands/help";
import { openStore } from "../../src/store/store";
import { replaceUsers } from "../../src/users/repository";
import { userForCoreScores } from "../../src/users/rows";
import { commandIn, NOW } from "../commandRun";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { madeMusicBuild } from "../madeCatalog";
import {
    allFixtureRecords,
    b50User,
    detailedUser,
    recordOf,
    SCORE_TIME,
    scoreEvent,
    seedScoreUsers,
    user,
} from "../scoreUsers";
import { useTempHome } from "../tempHome";
import { useTimeZone } from "../zone";

useTimeZone("America/New_York");
const home = useTempHome();

function chart(key: string) {
    const entry = fixtureSongCatalog().chartByKey.get(key);
    if (!entry) throw new Error(`fixture has no chart ${key}`);
    return entry.chart;
}

function scoreOf(json: Awaited<ReturnType<typeof commandIn>>["json"]) {
    return json.data.score;
}

describe("chart-row score shaping", () => {
    it("filters only records core cannot inspect and leaves a web-written user deeply equal", async () => {
        const clean = detailedUser("clean-copy", "Clean Copy");
        clean.data.rating = 15_000;
        clean.data.ratingHistory = [{ time: SCORE_TIME, rating: 15_000 }];
        expect(userForCoreScores(clean)).toEqual(clean);

        const bad = structuredClone(clean) as User;
        const detailed = bad.data.detailed as unknown as Record<string, unknown>;
        detailed["bad-null-type"] = { song_id: 1, type: null, level_index: 0, ds: 1 };
        detailed["bad-number-type"] = { song_id: 1, type: 7, level_index: 0, ds: 1 };
        detailed["bad-song-id"] = {
            song_id: { toString: 1 },
            type: "SD",
            level_index: 0,
            ds: 1,
        };
        bad.data.b50 = {
            sd: [{ song_id: 1, type: null, level_index: 0, ds: 1 }],
            dx: [],
        } as unknown as User["data"]["b50"];
        bad.data.ratingHistory = [
            ...(bad.data.ratingHistory ?? []),
            null as unknown as NonNullable<User["data"]["ratingHistory"]>[number],
        ];
        const safe = userForCoreScores(bad);
        expect(Object.keys(safe.data.detailed ?? {})).toEqual(Object.keys(clean.data.detailed!));
        expect(safe.data.b50).toEqual({ sd: [], dx: [] });
        expect(safe.data.ratingHistory).toEqual(clean.data.ratingHistory);

        const cleanPaths = home();
        const badPaths = home();
        await seedScoreUsers(cleanPaths, [clean]);
        await seedScoreUsers(badPaths, [bad]);
        const cases: [string, string[]][] = [
            ["rating", ["--history"]],
            ...(["normal", "fit", "ap", "fc", "pc", "nb"] as const).map(
                mode => ["b50", ["--mode", mode, "--limit", "10000"]] as [string, string[]]
            ),
            ["charts", ["--sort", "rating", "--limit", "10000"]],
            ["charts", ["--sort", "gain", "--limit", "10000"]],
            ["chart", ["146-3", "--with", "all"]],
            ["calc", ["146-3", "--achievements", "100.5"]],
            ["collection", ["show", "plate:6148", "--all", "--limit", "10000"]],
            ["kaleidxscope", ["blue"]],
        ];
        for (const [command, args] of cases) {
            const expected = await commandIn(cleanPaths, command, args);
            const actual = await commandIn(badPaths, command, args);
            expect(actual.code, `${command} ${args.join(" ")}`).toBe(0);
            expect(actual.json.data, `${command} ${args.join(" ")}`).toEqual(expected.json.data);
        }
    });

    it("prints every score key, estimates play counts, and keeps unsafe copies null", async () => {
        const paths = home();
        const exact = recordOf(chart("146-3"));
        Object.assign(exact, {
            achievements: 100.1234,
            dxScore: chart("146-3").info.deluxeScoreMax,
            fc: ComboStatus.AllPerfectPlus,
            fs: SyncStatus.FullSyncDXPlus,
            rate: RankRate.sssp,
            ra: 321,
            play_count: 41,
            lastChangedAt: SCORE_TIME,
        });
        const estimated = recordOf(chart("146-2"));
        delete estimated.play_count;
        estimated.fc = ComboStatus.None;
        estimated.fs = SyncStatus.None;
        const unsafe = {
            ...recordOf(chart("146-1")),
            achievements: "unknown",
            dxScore: 1.5,
            fc: "unknown",
            fs: "unknown",
            rate: "unknown",
            ra: 1.5,
            play_count: "unknown",
            lastChangedAt: 0,
        } as unknown as DivingFishFullRecord;
        await seedScoreUsers(
            paths,
            [
                user("made-default", "Made Default", {
                    updateTime: SCORE_TIME,
                    detailed: { "146-3": exact, "146-2": estimated, "146-1": unsafe },
                }),
            ],
            [scoreEvent("estimated-play", "made-default", "146-2", ScoreHistoryChange.Achievements)]
        );

        const exactResult = await commandIn(paths, "chart", ["146-3"]);
        expect(scoreOf(exactResult.json)).toEqual({
            achievements: 100.1234,
            rank: "SSS+",
            combo: "AP+",
            sync: "FDX+",
            dxScore: chart("146-3").info.deluxeScoreMax,
            dxScoreMax: chart("146-3").info.deluxeScoreMax,
            dxStars: 5,
            rating: 321,
            playCount: 41,
            playCountEstimated: false,
            changedAt: "2026-11-09T22:04:05-05:00",
        });
        expect(exactResult.json.meta.user).toEqual({
            index: 0,
            uid: "made-default",
            name: "Made Default",
        });
        expect(exactResult.json.meta.dataAsOf.scores).toBe("2026-11-09T22:04:05-05:00");

        const estimateResult = await commandIn(paths, "chart", ["146-2", "--with", "position"]);
        expect(scoreOf(estimateResult.json)).toMatchObject({
            combo: null,
            sync: null,
            playCount: 2,
            playCountEstimated: true,
        });
        expect(estimateResult.json.data.position).toMatchObject({
            playCount: 2,
            playCountEstimated: true,
        });

        const nullResult = await commandIn(paths, "chart", ["146-1"]);
        expect(scoreOf(nullResult.json)).toEqual({
            achievements: null,
            rank: null,
            combo: null,
            sync: null,
            dxScore: null,
            dxScoreMax: chart("146-1").info.deluxeScoreMax,
            dxStars: null,
            rating: null,
            playCount: null,
            playCountEstimated: false,
            changedAt: null,
        });
    });

    it("agrees with v_charts for the default user's stored score columns", async () => {
        const paths = home();
        await seedScoreUsers(paths, [detailedUser("made-default", "Made Default")]);
        const shown = await commandIn(paths, "chart", ["146-3"]);
        const sql = await commandIn(paths, "sql", [
            "SELECT score_achievements, score_dx_score, score_combo, score_sync, score_rank, score_rating, score_play_count FROM v_charts WHERE chart_key = '146-3'",
        ]);
        const row = sql.json.data.items[0];
        expect(shown.json.data.score).toMatchObject({
            achievements: row.score_achievements,
            dxScore: row.score_dx_score,
            combo: "FC",
            sync: "FS",
            rank: "SSS",
            rating: row.score_rating,
            playCount: row.score_play_count,
        });
        expect(row).toMatchObject({ score_combo: "FC", score_sync: "FS", score_rank: "SSS" });
    });

    it("prefers the record's play count over an estimate", async () => {
        const paths = home();
        const record = recordOf(chart("146-3"));
        record.play_count = 41;
        await seedScoreUsers(
            paths,
            [
                user("made-playcount", "Made Playcount", {
                    updateTime: SCORE_TIME,
                    detailed: { "146-3": record },
                }),
            ],
            [scoreEvent("play-event", "made-playcount", "146-3", ScoreHistoryChange.Achievements)]
        );

        const result = await commandIn(paths, "chart", ["146-3"]);
        expect(result.json.data.score).toMatchObject({
            playCount: 41,
            playCountEstimated: false,
        });
    });
});

describe("b50 positions and score sources", () => {
    it("builds ranked B35 and B15 parts and never puts a banquet chart in B50", async () => {
        const paths = home();
        await seedScoreUsers(paths, [detailedUser("made-default", "Made Default")]);
        const result = await commandIn(paths, "charts", ["--limit", "10000"]);
        const places = result.json.data.items
            .map((item: { b50: unknown }) => item.b50)
            .filter(Boolean);
        expect(places.filter((place: { part: string }) => place.part === "B35")).toHaveLength(35);
        const newerCount = Math.min(
            15,
            allFixtureRecords().charts.filter(
                item => item.music.info.isNew && item.info.grade !== 10
            ).length
        );
        expect(places.filter((place: { part: string }) => place.part === "B15")).toHaveLength(
            newerCount
        );
        expect(
            places
                .filter((place: { part: string }) => place.part === "B35")
                .map((place: { rank: number }) => place.rank)
                .sort((a: number, b: number) => a - b)
        ).toEqual(Array.from({ length: 35 }, (_, index) => index + 1));
        expect(
            places
                .filter((place: { part: string }) => place.part === "B15")
                .map((place: { rank: number }) => place.rank)
                .sort((a: number, b: number) => a - b)
        ).toEqual(Array.from({ length: newerCount }, (_, index) => index + 1));
        const banquet = await commandIn(paths, "chart", ["110227-10"]);
        expect(banquet.json.data.b50).toBeNull();
    });

    it("uses B50 snapshot scores only and reports PARTIAL_SCORES", async () => {
        const paths = home();
        await seedScoreUsers(paths, [b50User("made-partial", "Made Partial")]);
        const result = await commandIn(paths, "charts", ["--limit", "10000"]);
        expect(result.json.warnings).toEqual([
            {
                code: "PARTIAL_SCORES",
                message: "只拿到了水鱼公开的 B50，其他谱面没有成绩",
            },
        ]);
        expect(result.json.data.items.some((item: { score: unknown }) => item.score !== null)).toBe(
            true
        );
        expect(result.json.data.items.some((item: { score: unknown }) => item.score === null)).toBe(
            true
        );
        expect(result.json.data.items.filter((item: { b50: unknown }) => item.b50)).toHaveLength(
            35 +
                Math.min(
                    15,
                    allFixtureRecords().charts.filter(
                        item => item.music.info.isNew && item.info.grade !== 10
                    ).length
                )
        );
    });

    it("treats a single detailed record as a detailed source", async () => {
        const paths = home();
        await seedScoreUsers(paths, [
            user("made-single", "Made Single", {
                updateTime: NOW.getTime(),
                detailed: { "146-3": recordOf(chart("146-3")) },
            }),
        ]);
        const result3 = await commandIn(paths, "chart", ["146-3"]);
        expect(result3.json.data.score).not.toBeNull();
        expect(result3.json.data.score.achievements).toBe(100);
        expect(result3.json.warnings).toEqual([]);

        const result2 = await commandIn(paths, "chart", ["146-2"]);
        expect(result2.json.data.score).toBeNull();
    });
});

describe("score meta and warnings", () => {
    it("uses the strict stale boundary and whole-day message", async () => {
        const before = home();
        await seedScoreUsers(before, [
            detailedUser("made-before", "Made Before", NOW.getTime() - 3 * 86_400_000 + 1),
        ]);
        expect((await commandIn(before, "chart", ["146-3"])).json.warnings).toEqual([]);

        const after = home();
        await seedScoreUsers(after, [
            detailedUser("made-after", "Made After", NOW.getTime() - 3 * 86_400_000 - 1),
        ]);
        expect((await commandIn(after, "chart", ["146-3"])).json.warnings).toEqual([
            {
                code: "STALE_SCORES",
                message: "成绩已经 3 天没更新",
                fix: "saltnet sync",
            },
        ]);
    });

    it("warns when a detailed score time is unknown", async () => {
        const paths = home();
        await seedScoreUsers(paths, [detailedUser("made-unknown", "Made Unknown", null)]);
        const result = await commandIn(paths, "chart", ["146-3"]);
        expect(result.json.meta.dataAsOf.scores).toBeNull();
        expect(result.json.warnings).toEqual([
            {
                code: "STALE_SCORES",
                message: "成绩的更新时间未知",
                fix: "saltnet sync",
            },
        ]);
    });

    it("reports NO_SCORES with default and non-default fixes", async () => {
        const paths = home();
        await seedScoreUsers(paths, [
            user("made-default", "Made Default"),
            user("made-friend", "Made Friend"),
        ]);
        expect((await commandIn(paths, "chart", ["146-3"])).json.warnings[0]).toMatchObject({
            code: "NO_SCORES",
            fix: "saltnet sync",
        });
        expect(
            (await commandIn(paths, "chart", ["146-3", "--user", "made-friend"])).json.warnings[0]
        ).toMatchObject({
            code: "NO_SCORES",
            fix: "saltnet sync --user made-friend",
        });
    });

    it("reports no warning at the exact stale boundary of 3 days", async () => {
        const paths = home();
        await seedScoreUsers(paths, [
            detailedUser("made-boundary", "Made Boundary", NOW.getTime() - 3 * 86_400_000),
        ]);
        expect((await commandIn(paths, "chart", ["146-3"])).json.warnings).toEqual([]);
    });

    it("handles an update time beyond the Date range with null meta time", async () => {
        const paths = home();
        await seedScoreUsers(paths, [
            detailedUser("made-future", "Made Future", 8_700_000_000_000_000),
        ]);
        const result = await commandIn(paths, "chart", ["146-3"]);
        expect(result.code).toBe(0);
        expect(result.json.meta.dataAsOf.scores).toBeNull();
    });

    it.each([
        {
            name: "course show 初段",
            command: "course",
            args: ["show", "初段"],
            getRows: (json: {
                data: {
                    tracks: readonly {
                        chartKey: string;
                        score: { achievements: number | null } | null;
                    }[];
                };
            }) => json.data.tracks,
            expectRows: true,
        },
        {
            name: "collection show plate:6101 --all",
            command: "collection",
            args: ["show", "plate:6101", "--all"],
            getRows: (json: {
                data: {
                    items: readonly {
                        chartKey: string;
                        score: { achievements: number | null } | null;
                    }[];
                };
            }) => json.data.items,
            expectRows: true,
        },
    ])("attaches scores and warnings in $name", async ({ command, args, getRows, expectRows }) => {
        const paths = home();
        await seedScoreUsers(paths, [
            detailedUser("made-stale", "Made Stale", NOW.getTime() - 4 * 86_400_000),
        ]);
        const result = await commandIn(paths, command, args);
        expect(result.code).toBe(0);
        const { records } = allFixtureRecords();
        const rows = getRows(result.json);
        if (expectRows) {
            expect(rows.length).toBeGreaterThan(0);
        } else {
            expect(rows.length).toBe(0);
        }
        for (const row of rows) {
            expect(row.score).not.toBeNull();
            expect(row.score?.achievements).toBe(records[row.chartKey]?.achievements);
        }
        expect(result.json.warnings).toContainEqual({
            code: "STALE_SCORES",
            message: "成绩已经 4 天没更新",
            fix: "saltnet sync",
        });
    });

    it("attaches the selected user's distinct scores to real KALEIDXSCOPE gate songs", async () => {
        const blue = kaleidxscopeGates.find(gate => gate.id === "blue")!;
        const keySong = blue.keyCondition.songs[0];
        const keyMusicIds = new Set(blue.keyCondition.songs.map(song => song.musicId));
        const poolSong = blue.selectionPools
            .flatMap(pool => pool.songs ?? [])
            .find(song => !keyMusicIds.has(song.musicId))!;
        expect(keySong).toBeDefined();
        expect(poolSong).toBeDefined();
        const entries = [keySong, poolSong].map(song => ({
            id: song.musicId,
            title: song.title,
            charters: ["B", "A", "E", "M"],
        }));
        const build = madeMusicBuild(entries);
        const record = (musicId: number, achievements: number) => {
            const chart = build.music.musicList[musicId].charts[3];
            return { ...recordOf(chart), achievements };
        };
        const firstRecords = {
            [`${keySong.musicId}-3`]: record(keySong.musicId, 91.1111),
            [`${poolSong.musicId}-3`]: record(poolSong.musicId, 92.2222),
        };
        const secondRecords = {
            [`${keySong.musicId}-3`]: record(keySong.musicId, 93.3333),
            [`${poolSong.musicId}-3`]: record(poolSong.musicId, 94.4444),
        };
        const paths = home();
        const store = openStore(paths);
        try {
            replaceMusic(store, build, { fetchedAt: NOW.getTime(), upstreamVersion: "made" });
            replaceUsers(
                store,
                [
                    user("gate-first", "Gate First", {
                        updateTime: SCORE_TIME,
                        detailed: firstRecords,
                    }),
                    user("gate-second", "Gate Second", {
                        updateTime: SCORE_TIME,
                        detailed: secondRecords,
                    }),
                ],
                []
            );
        } finally {
            store.close();
        }

        const rowsOf = (result: Awaited<ReturnType<typeof commandIn>>) => [
            ...result.json.data.keyCondition.songs,
            ...result.json.data.pools.flatMap((pool: { songs: unknown[] }) => pool.songs),
        ];
        const first = await commandIn(paths, "kaleidxscope", ["blue", "--diff", "mas"]);
        const second = await commandIn(paths, "kaleidxscope", [
            "blue",
            "--diff",
            "mas",
            "--user",
            "gate-second",
        ]);
        expect(first.code).toBe(0);
        expect(second.code).toBe(0);
        expect(first.json.data.keyCondition.songs).toHaveLength(1);
        expect(second.json.data.keyCondition.songs).toHaveLength(1);
        expect(first.json.data.keyCondition.songs[0].score.achievements).toBe(91.1111);
        expect(second.json.data.keyCondition.songs[0].score.achievements).toBe(93.3333);
        const firstPoolRows = rowsOf(first).filter(row => row.musicId === poolSong.musicId);
        const secondPoolRows = rowsOf(second).filter(row => row.musicId === poolSong.musicId);
        expect(firstPoolRows.length).toBeGreaterThan(0);
        expect(secondPoolRows.length).toBe(firstPoolRows.length);
        expect(firstPoolRows.every(row => row.score?.achievements === 92.2222)).toBe(true);
        expect(secondPoolRows.every(row => row.score?.achievements === 94.4444)).toBe(true);
        expect(rowsOf(first).every(row => row.score !== null)).toBe(true);
        expect(rowsOf(second).every(row => row.score !== null)).toBe(true);
    });
});

const rowCommands: readonly {
    name: string;
    command: string;
    args: readonly string[];
}[] = [
    { name: "song", command: "song", args: ["146"] },
    { name: "chart", command: "chart", args: ["146-3"] },
    { name: "charts", command: "charts", args: ["--limit", "1"] },
    { name: "course show", command: "course", args: ["show", "初段"] },
    {
        name: "collection show",
        command: "collection",
        args: ["show", "plate:6101", "--limit", "1"],
    },
    { name: "kaleidxscope gate", command: "kaleidxscope", args: ["blue"] },
];

describe("--user on every chart-row command", () => {
    it.each(rowCommands)(
        "publishes --user in help and schema for $name",
        async ({ command, args }) => {
            const words = [command, ...args].filter(
                word => !word.startsWith("--") && !/^\d+$/.test(word)
            );
            const commandWords = words.slice(
                0,
                command === "course" || command === "collection" ? 2 : 1
            );
            const registry = createRegistry();
            const resolved = registry.resolve(commandWords);
            if (resolved.kind !== "command")
                throw new Error(`${commandWords.join(" ")} is not a command`);
            expect(
                renderHelp(registry, { kind: "command", command: resolved.command }, "test")
            ).toContain("--user <用户>");

            const schema = await commandIn(home(), "schema", commandWords);
            expect(
                schema.json.data.options.map((option: { flag: string }) => option.flag)
            ).toContain("--user");
        }
    );

    it.each(rowCommands)("resolves by index, uid and name in $name", async ({ command, args }) => {
        const paths = home();
        await seedScoreUsers(paths, [
            detailedUser("made-default", "Made Default"),
            detailedUser("made-friend", "Made Friend"),
        ]);
        for (const reference of ["1", "made-friend", "Made Friend"]) {
            const result = await commandIn(paths, command, [...args, "--user", reference]);
            expect(result.code, reference).toBe(0);
            expect(result.json.meta.user).toEqual({
                index: 1,
                uid: "made-friend",
                name: "Made Friend",
            });
        }
    });

    it.each(rowCommands)(
        "reports NO_USER for explicit --user in $name",
        async ({ command, args }) => {
            const result = await commandIn(home(), command, [...args, "--user", "0"]);
            expect(result.code).toBe(4);
            expect(result.json.error.code).toBe("NO_USER");
        }
    );

    it("rejects --user on the gate overview before opening the data directory", async () => {
        const paths = home();
        const result = await commandIn(paths, "kaleidxscope", ["--user", "0"]);
        expect(result.code).toBe(2);
        expect(result.json.error.code).toBe("USAGE");
        expect(existsSync(paths.home)).toBe(false);
    });
});

describe("score context in errors and output modes", () => {
    it.each([
        ["definitely-no-such-song", "NOT_FOUND"],
        ["link", "AMBIGUOUS_REF"],
    ])("carries user meta on song %s", async (reference, code) => {
        const paths = home();
        await seedScoreUsers(paths, [detailedUser("made-default", "Made Default")]);
        const result = await commandIn(paths, "song", [reference]);
        expect(result.json.error.code).toBe(code);
        expect(result.json.meta.user.uid).toBe("made-default");
        expect(result.json.meta.dataAsOf.scores).toBeDefined();
        expect(result.json.warnings).toBeUndefined();
    });

    it("attaches score warnings on song and charts errors", async () => {
        const paths = home();
        await seedScoreUsers(paths, [
            detailedUser("made-stale", "Made Stale", NOW.getTime() - 4 * 86_400_000),
        ]);
        const songResult = await commandIn(paths, "song", ["definitely-no-such-song"]);
        expect(songResult.json.error.code).toBe("NOT_FOUND");
        expect(songResult.json.meta.user.uid).toBe("made-stale");
        expect(songResult.json.warnings).toEqual([
            {
                code: "STALE_SCORES",
                message: "成绩已经 4 天没更新",
                fix: "saltnet sync",
            },
        ]);

        const chartsResult = await commandIn(paths, "charts", ["--version", "zzzz"]);
        expect(chartsResult.json.error.code).toBe("NOT_FOUND");
        expect(chartsResult.json.meta.user.uid).toBe("made-stale");
        expect(chartsResult.json.meta.dataAsOf.scores).toBeDefined();
        expect(chartsResult.json.meta.dataAsOf.catalog).toBeDefined();
        expect(chartsResult.json.warnings).toEqual([
            {
                code: "STALE_SCORES",
                message: "成绩已经 4 天没更新",
                fix: "saltnet sync",
            },
        ]);
    });

    it("puts scores in grouped rows and supports nested fields in TSV", async () => {
        const paths = home();
        await seedScoreUsers(paths, [detailedUser("made-default", "Made Default")]);
        const grouped = await commandIn(paths, "charts", [
            "--group-by",
            "difficulty",
            "--limit",
            "1",
        ]);
        expect(
            grouped.json.data.groups.some((group: { items: { score: unknown }[] }) =>
                group.items.some(item => item.score !== null)
            )
        ).toBe(true);

        const tsv = await commandIn(paths, "charts", [
            "--limit",
            "1",
            "--fields",
            "score.rank",
            "--format",
            "tsv",
        ]);
        expect(tsv.stdout).toMatch(/^score\.rank\n[A-Z+]*\n$/);
    });
});

describe("no implicit user", () => {
    it.each(rowCommands)("keeps phase-1 score output in $name", async ({ command, args }) => {
        const result = await commandIn(home(), command, [...args]);
        expect(result.code).toBe(0);
        expect(result.json.meta.user).toBeUndefined();
        expect(result.json.meta.dataAsOf?.scores).toBeUndefined();
        expect(result.json.warnings.some(warning => warning.code.includes("SCORES"))).toBe(false);
    });
});
