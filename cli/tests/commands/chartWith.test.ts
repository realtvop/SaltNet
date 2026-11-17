import type { Chart, ChartScore } from "@core/music/type";
import type { ScoreHistoryEventV1 } from "@core/user/scoreHistory/type";
import { getChartPositionByDifficulty } from "@core/chart/position";
import { getDetailedRatingsByConstant } from "@core/chart/rating";
import { ComboStatus, SyncStatus } from "@core/mai/types";
import {
    getChartRatingTables,
    getLowestRaInChartOrSection,
    getLowestRaInSection,
    selectDisplayedRaTable,
} from "@core/query/chartInfo";
import { ScoreHistoryChange } from "@core/user/scoreHistory/type";
import { describe, expect, it } from "vitest";
import { allChartEntries } from "../../src/catalog/chartQuery";
import { rankLabel } from "../../src/refs/status";
import { commandIn, NOW } from "../commandRun";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { b50User, detailedUser, recordOf, seedScoreUsers, user } from "../scoreUsers";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

function fixtureChart(key: string): Chart {
    const found = fixtureSongCatalog().chartByKey.get(key)?.chart;
    if (!found) throw new Error(`fixture chart ${key} not found`);
    return found;
}

function allCatalogCharts(): Chart[] {
    return allChartEntries(fixtureSongCatalog()).map(e => e.chart);
}

function makeEvent(
    id: string,
    uid: string,
    recordKey: string,
    observedAt: number,
    achievements: number,
    playCount: number | null = null
): ScoreHistoryEventV1 {
    return {
        id,
        schemaVersion: 1,
        generationId: "made-generation",
        batchId: "made-batch",
        userUid: uid,
        chartKey: recordKey,
        observedAt,
        sequence: 0,
        source: "inGame",
        kind: "change",
        changedMask: ScoreHistoryChange.Achievements,
        state: {
            achievements,
            dxScore: 1000,
            fc: ComboStatus.None,
            fs: SyncStatus.None,
            playCount,
        },
    };
}

describe("chart concise stages and --with stages", () => {
    it("concise stages equals core functions without users (no score)", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);
        const { json } = await commandIn(home, "chart", ["146-3"]);

        const chart = fixtureChart("146-3");
        const tables = getChartRatingTables(chart, null, "简洁");
        const expected = selectDisplayedRaTable(tables.current, "简洁", () => null).map(r => ({
            achievements: r.achievements,
            rating: r.rating,
            rank: rankLabel(r.rank),
        }));

        expect(json.data.stages).toEqual(expected);
    });

    it("concise stages equals core functions with score above and below lowest B50", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        // Seed user with a B50 floor
        const testUser = detailedUser("uid-1", "用户一");
        testUser.remark = "用户一";
        await seedScoreUsers(home, [testUser]);

        const chart = fixtureChart("146-3");
        const { json } = await commandIn(home, "chart", ["146-3"]);

        const userScore = json.data.score;
        expect(userScore).not.toBeNull();

        const lowestInSection = () => getLowestRaInSection(testUser, chart);
        const getBaseRa = () => getLowestRaInChartOrSection(chart, userScore, lowestInSection());

        const tables = getChartRatingTables(chart, userScore, "简洁");
        const expected = selectDisplayedRaTable(tables.current, "简洁", getBaseRa).map(r => ({
            achievements: r.achievements,
            rating: r.rating,
            rank: rankLabel(r.rank),
        }));

        expect(json.data.stages).toEqual(expected);
    });

    it("concise stages measure the extra stage against the chart's own stored rating", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);
        const chart = fixtureChart("146-3");
        const other = allCatalogCharts().find(
            entry =>
                entry.music.info.isNew === chart.music.info.isNew &&
                entry.music.id !== chart.music.id &&
                entry.info.constant
        )!;
        // A stored rating left from an older constant (300) is above every stage of 13.0 (at most
        // 292), while the lowest entry of the B50 section is 260.
        const sections = { sd: [] as unknown[], dx: [] as unknown[] };
        sections[chart.music.info.isNew ? "dx" : "sd"].push({ ...recordOf(other), ra: 260 });
        const stale = user("uid-stale", "旧定数", {
            detailed: { "146-3": { ...recordOf(chart), achievements: 97, ra: 300 } },
            b50: sections,
        });
        stale.remark = "旧定数";
        await seedScoreUsers(home, [stale]);

        const { json } = await commandIn(home, "chart", ["146-3"]);
        const dialogScore = { achievements: 97, deluxeRating: 300 } as unknown as ChartScore;
        const tables = getChartRatingTables(chart, dialogScore, "简洁");
        const toStage = (r: ReturnType<typeof selectDisplayedRaTable>[number]) => ({
            achievements: r.achievements,
            rating: r.rating,
            rank: rankLabel(r.rank),
        });
        const base = getLowestRaInChartOrSection(chart, dialogScore, 260);
        expect(base).toBe(300);
        const expected = selectDisplayedRaTable(tables.current, "简洁", () => base).map(toStage);
        const againstSection = selectDisplayedRaTable(tables.current, "简洁", () => 260).map(
            toStage
        );
        expect(againstSection).not.toEqual(expected);
        expect(json.data.stages).toEqual(expected);
    });

    it("concise stages handles empty B50 section without throwing", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        // User with no B50 items at all
        const emptyUser = user("uid-empty", "空用户", {
            b50: { sd: [], dx: [] },
            detailed: {},
        });
        emptyUser.remark = "空用户";
        await seedScoreUsers(home, [emptyUser]);

        const { code, json } = await commandIn(home, "chart", ["146-3"]);
        expect(code).toBe(0);
        expect(json.data.stages.length).toBeGreaterThan(0);
    });

    it("concise stages only looks at the B50 section of the chart itself", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);
        const entries = [...fixtureSongCatalog().chartByKey.entries()];
        const [oldKey, oldEntry] = entries.find(
            ([, entry]) => entry.chart.music.info.isNew === false && entry.chart.info.constant
        )!;
        const [newKey] = entries.find(
            ([, entry]) => entry.chart.music.info.isNew === true && entry.chart.info.constant
        )!;
        // The old section has an entry and the new one is empty.
        const onlyOld = user("uid-old", "只有旧曲", {
            b50: { sd: [recordOf(oldEntry.chart)], dx: [] },
            detailed: {},
        });
        onlyOld.remark = "只有旧曲";
        await seedScoreUsers(home, [onlyOld]);

        const newer = await commandIn(home, "chart", [newKey]);
        expect(newer.code).toBe(0);
        expect(newer.json.data.stages.length).toBeGreaterThan(0);
        const old = await commandIn(home, "chart", [oldKey]);
        expect(old.code).toBe(0);
        expect(old.json.data.stages.length).toBeGreaterThan(0);
    });

    it("concise stages is empty for utage chart without constant", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);
        const { code, json } = await commandIn(home, "chart", ["110227-10"]);
        expect(code).toBe(0);
        expect(json.data.constant).toBeNull();
        expect(json.data.stages).toEqual([]);
    });

    it("--with stages returns full table and matches getDetailedRatingsByConstant for two constants (checked by hand)", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        // Constant 13 (chart 146-3)
        const res13 = await commandIn(home, "chart", ["146-3", "--with", "stages"]);
        expect(res13.code).toBe(0);
        const stages13 = res13.json.data.stages;
        const expected13 = getDetailedRatingsByConstant(13).map(r => ({
            achievements: r.achievements,
            rating: r.rating,
            rank: rankLabel(r.rank),
        }));
        expect(stages13).toEqual(expected13);

        // Hand check 3 rows for constant 13:
        // 1. 100.5% SSS+ -> floor(13 * 1.005 * 22.4) = 292
        const row1005_13 = stages13.find((r: { achievements: number }) => r.achievements === 100.5);
        expect(row1005_13).toEqual({ achievements: 100.5, rating: 292, rank: "SSS+" });
        // 2. 100.0% SSS -> floor(13 * 1.000 * 21.6) = 280
        const row1000_13 = stages13.find((r: { achievements: number }) => r.achievements === 100.0);
        expect(row1000_13).toEqual({ achievements: 100.0, rating: 280, rank: "SSS" });
        // 3. 99.5% SS+ -> floor(13 * 0.995 * 21.1) = 272
        const row995_13 = stages13.find((r: { achievements: number }) => r.achievements === 99.5);
        expect(row995_13).toEqual({ achievements: 99.5, rating: 272, rank: "SS+" });

        // Constant 5.0 (chart 146-0)
        const res5 = await commandIn(home, "chart", ["146-0", "--with", "stages"]);
        expect(res5.code).toBe(0);
        expect(res5.json.data.constant).toBe(5);
        const stages5 = res5.json.data.stages;
        const expected5 = getDetailedRatingsByConstant(5).map(r => ({
            achievements: r.achievements,
            rating: r.rating,
            rank: rankLabel(r.rank),
        }));
        expect(stages5).toEqual(expected5);

        // Hand check 3 rows for constant 5:
        // 1. 100.5% SSS+ -> floor(5 * 1.005 * 22.4) = 112
        const row1005_5 = stages5.find((r: { achievements: number }) => r.achievements === 100.5);
        expect(row1005_5).toEqual({ achievements: 100.5, rating: 112, rank: "SSS+" });
        // 2. 100.0% SSS -> floor(5 * 1.000 * 21.6) = 108
        const row1000_5 = stages5.find((r: { achievements: number }) => r.achievements === 100.0);
        expect(row1000_5).toEqual({ achievements: 100.0, rating: 108, rank: "SSS" });
        // 3. 99.5% SS+ -> floor(5 * 0.995 * 21.1) = 104
        const row995_5 = stages5.find((r: { achievements: number }) => r.achievements === 99.5);
        expect(row995_5).toEqual({ achievements: 99.5, rating: 104, rank: "SS+" });
    });
});

describe("chart --with friends", () => {
    it("sorts by achievements desc, shares ranks for ties, leaves unnamed user out, marks current, includes public B50 user", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        const chart = fixtureChart("146-3");

        // User 1: 100.5%
        const u1 = user("uid-1", "用户一", {
            detailed: {
                "146-3": { ...recordOf(chart, 0), achievements: 100.5 },
            },
        });
        u1.remark = "用户一";

        // User 2: 100.5% (tie with u1)
        const u2 = user("uid-2", "用户二", {
            detailed: {
                "146-3": { ...recordOf(chart, 0), achievements: 100.5 },
            },
        });
        u2.remark = "用户二";

        // User 3: unnamed user (no remark, no divingFish name, no inGame name/id) -> should be excluded
        const u3 = user("uid-3", "未命名用户", {
            detailed: {
                "146-3": { ...recordOf(chart, 0), achievements: 100.8 },
            },
        });
        // Leave u3 without remark / divingFish / inGame

        // User 4: Public B50 only user with 99.0% on this chart
        const b50 = b50User("uid-4", "B50用户");
        b50.remark = "B50用户";
        // Override the record for 146-3 in B50 sd section
        const sdIndex = b50.data.b50!.sd.findIndex(r => r.song_id === 146 && r.level_index === 3);
        if (sdIndex >= 0) {
            b50.data.b50!.sd[sdIndex].achievements = 99.0;
        } else {
            b50.data.b50!.sd.push({ ...recordOf(chart, 0), achievements: 99.0 });
        }

        // User 5: Unplayed user
        const u5 = user("uid-5", "未游玩用户", {
            detailed: {},
        });
        u5.remark = "未游玩用户";

        await seedScoreUsers(home, [u1, u2, u3, b50, u5]);

        // Run chart --with friends with default user u1
        const { code, json } = await commandIn(home, "chart", ["146-3", "--with", "friends"]);
        expect(code).toBe(0);

        const friends = json.data.friends;
        // Unnamed user u3 must be left out!
        expect(friends.map((f: { uid: string }) => f.uid)).not.toContain("uid-3");
        expect(friends.length).toBe(4);

        // Shared rank: u1 and u2 tied at 100.5% -> both #1
        expect(friends[0].uid).toBe("uid-1");
        expect(friends[0].rank).toBe(1);
        expect(friends[0].current).toBe(true);
        expect(friends[0].score.achievements).toBe(100.5);

        expect(friends[1].uid).toBe("uid-2");
        expect(friends[1].rank).toBe(1);
        expect(friends[1].current).toBe(false);
        expect(friends[1].score.achievements).toBe(100.5);

        // u4 (B50 user) has 99.0% -> rank 3 (since 2 users tied at #1)
        expect(friends[2].uid).toBe("uid-4");
        expect(friends[2].rank).toBe(3);
        expect(friends[2].current).toBe(false);
        expect(friends[2].score.achievements).toBe(99.0);

        // u5 (unplayed) -> rank null
        expect(friends[3].uid).toBe("uid-5");
        expect(friends[3].rank).toBeNull();
        expect(friends[3].current).toBe(false);
        expect(friends[3].score).toBeNull();
    });

    it("puts played users first and keeps the unplayed ones, and a record without a rate, in user order", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);
        const chart = fixtureChart("146-3");
        const named = (uid: string, name: string, detailed: Record<string, unknown>) => {
            const made = user(uid, name, { detailed });
            made.remark = name;
            return made;
        };
        await seedScoreUsers(home, [
            named("uid-a", "甲", {}),
            named("uid-b", "乙", { "146-3": { ...recordOf(chart, 0), achievements: 97.5 } }),
            named("uid-c", "丙", {}),
            // A record without an achievement rate counts as not played.
            named("uid-d", "丁", { "146-3": { ...recordOf(chart, 0), achievements: null } }),
        ]);

        const { json } = await commandIn(home, "chart", ["146-3", "--with", "friends"]);
        expect(
            json.data.friends.map((f: { uid: string; rank: number | null; current: boolean }) => [
                f.uid,
                f.rank,
                f.current,
            ])
        ).toEqual([
            ["uid-b", 1, false],
            ["uid-a", null, true],
            ["uid-c", null, false],
            ["uid-d", null, false],
        ]);
    });
});

describe("chart --with history, position and all", () => {
    it("--with history returns this chart entries identical to history <chart>", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        const u = detailedUser("uid-1", "测试用户");
        u.remark = "测试用户";
        const events = [
            makeEvent("ev-1", "uid-1", "146-3", NOW.getTime() - 2000, 99.0, 1),
            makeEvent("ev-2", "uid-1", "146-3", NOW.getTime() - 1000, 100.0, 2),
        ];
        await seedScoreUsers(home, [u], events);

        const chartRes = await commandIn(home, "chart", ["146-3", "--with", "history"]);
        const historyRes = await commandIn(home, "history", ["146-3"]);

        expect(chartRes.code).toBe(0);
        expect(historyRes.code).toBe(0);

        // history <chart> returns items with ChartRow fields embedded; chart --with history returns ChartHistoryEntry
        const historyItems = historyRes.json.data.items;
        const chartHistory = chartRes.json.data.history;

        expect(chartHistory.length).toBe(historyItems.length);
        for (let i = 0; i < chartHistory.length; i++) {
            expect(chartHistory[i]).toEqual({
                eventId: historyItems[i].eventId,
                time: historyItems[i].time,
                source: historyItems[i].source,
                kind: historyItems[i].kind,
                changes: historyItems[i].changes,
            });
        }
    });

    it("--with position matches getChartPositionByDifficulty", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        const u = detailedUser("uid-1", "测试用户");
        u.remark = "测试用户";
        await seedScoreUsers(home, [u]);

        const chart = fixtureChart("146-3");
        const allCharts = allCatalogCharts();
        const posText = getChartPositionByDifficulty(chart, chart.info.level, allCharts, u);
        expect(posText).not.toBe("-");
        const [place, total] = posText.split("/").map(Number);

        const { code, json } = await commandIn(home, "chart", ["146-3", "--with", "position"]);
        expect(code).toBe(0);
        expect(json.data.position).toEqual({
            level: chart.info.level,
            place,
            total,
            playCount: json.data.score.playCount,
            playCountEstimated: json.data.score.playCountEstimated,
        });
    });

    it("--with all includes stages (full), related, friends, history, position", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        const u = detailedUser("uid-1", "全选用户");
        u.remark = "全选用户";
        await seedScoreUsers(
            home,
            [u],
            [makeEvent("ev-1", "uid-1", "146-3", NOW.getTime() - 1000, 100.0, 1)]
        );

        const { code, json } = await commandIn(home, "chart", ["146-3", "--with", "all"]);
        expect(code).toBe(0);
        expect(json.data.stages.length).toBeGreaterThan(10); // Full table, not concise
        expect(json.data.related).toBeDefined();
        expect(json.data.friends).toBeDefined();
        expect(json.data.history).toBeDefined();
        expect(json.data.position).toBeDefined();
    });
});
