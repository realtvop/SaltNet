import { existsSync } from "node:fs";
import { createFixtureMusicList } from "@core/fixtures/saltmeta";
import { describe, expect, it } from "vitest";
import { formatLocalTime } from "../../src/util/time";
import { commandIn, LXNS_URL, META_URL, NOW } from "../commandRun";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();
const fixtureData = createFixtureMusicList();

function chartIn(
    paths: ReturnType<typeof makeHome>,
    args: string[],
    options?: Parameters<typeof commandIn>[3]
) {
    return commandIn(paths, "chart", args, options);
}

const EXPECTED_CHART_COMMAND_KEYS = [
    "chartKey",
    "musicId",
    "title",
    "type",
    "difficulty",
    "level",
    "constant",
    "fitConstant",
    "version",
    "score",
    "b50",
    "charter",
    "notes",
    "stats",
];

const EXPECTED_NOTES_KEYS = ["tap", "hold", "slide", "touch", "break", "total"];

const EXPECTED_STATS_KEYS = [
    "samples",
    "avgAchievements",
    "avgDxScore",
    "stdDevAchievements",
    "rankDist",
    "comboDist",
];

describe("saltnet chart command", () => {
    it("returns output matching the 14 expected keys in order", async () => {
        const paths = makeHome();
        const { code, json } = await chartIn(paths, ["146-3"]);

        expect(code).toBe(0);
        expect(json.v).toBe(1);
        expect(json.ok).toBe(true);
        expect(json.command).toBe("chart");
        expect(json.warnings).toEqual([]);
        expect(json.meta.dataAsOf.catalog).toBe(formatLocalTime(NOW));
        expect(json.meta.page).toBeUndefined();

        expect(Object.keys(json.data)).toEqual(EXPECTED_CHART_COMMAND_KEYS);
        expect(Object.keys(json.data.notes)).toEqual(EXPECTED_NOTES_KEYS);
        expect(Object.keys(json.data.stats)).toEqual(EXPECTED_STATS_KEYS);
    });

    it("returns correct chart details for 146-3", async () => {
        const paths = makeHome();
        const { code, json } = await chartIn(paths, ["146-3"]);

        expect(code).toBe(0);
        expect(json.data).toMatchObject({
            chartKey: "146-3",
            musicId: 146,
            title: "39",
            type: "SD",
            difficulty: "MASTER",
            level: "13",
            constant: 13,
            fitConstant: 13.6,
            charter: "譜面-100号",
            notes: { tap: 374, hold: 55, slide: 40, touch: null, break: 43, total: 512 },
            score: null,
            b50: null,
            version: String(fixtureData.musicList[146].info.from),
        });
    });

    it("returns correct stats and null charter for 146-0", async () => {
        const paths = makeHome();
        const { code, json } = await chartIn(paths, ["146-0"]);

        expect(code).toBe(0);
        expect(json.data.charter).toBeNull();
        expect(json.data.stats.samples).toBe(4839);
        expect(json.data.stats.rankDist["SSS+"]).toBe(3164);
        expect(json.data.stats.comboDist.AP).toBe(1354);
    });

    it("returns touch count and total for DX chart 10146-3", async () => {
        const paths = makeHome();
        const { code, json } = await chartIn(paths, ["10146-3"]);

        expect(code).toBe(0);
        expect(json.data.type).toBe("DX");
        expect(json.data.notes.touch).toBe(104);
        expect(json.data.notes.total).toBe(602);
    });

    it("resolves the same chart by various spellings", async () => {
        const paths = makeHome();

        for (const args of [
            ["146", "mas"],
            ["146", "3"],
            ["146", "紫"],
            ["146", "MASTER"],
        ]) {
            const res = await chartIn(paths, args);
            expect(res.code, args.join(" ")).toBe(0);
            expect(res.json.data.chartKey, args.join(" ")).toBe("146-3");
        }

        const trueLove = await chartIn(paths, ["True Love Song", "mas"]);
        expect(trueLove.code).toBe(0);
        expect(trueLove.json.data.chartKey).toBe("8-3");
        expect(trueLove.json.data.constant).toBe(12.4);

        const trust = await chartIn(paths, ["Trust", "mas"]);
        expect(trust.code).toBe(0);
        expect(trust.json.data.chartKey).toBe("11726-3");
        expect(trust.json.data.constant).toBe(13.6);

        const agree = await chartIn(paths, ["146-3", "mas"]);
        expect(agree.code).toBe(0);
        expect(agree.json.data.chartKey).toBe("146-3");

        const disagree = await chartIn(paths, ["146-3", "exp"]);
        expect(disagree.code).toBe(2);
        expect(disagree.json.ok).toBe(false);
        expect(disagree.json.error.code).toBe("USAGE");
    });

    it("handles --type sd and --type dx appropriately", async () => {
        const paths = makeHome();

        const notFoundDx = await chartIn(paths, ["146", "mas", "--type", "dx"]);
        expect(notFoundDx.code).toBe(3);
        expect(notFoundDx.json.ok).toBe(false);
        expect(notFoundDx.json.error.code).toBe("NOT_FOUND");

        const okSd = await chartIn(paths, ["146", "mas", "--type", "sd"]);
        expect(okSd.code).toBe(0);
        expect(okSd.json.data.chartKey).toBe("146-3");
    });

    it("fails with AMBIGUOUS_REF for Link exp and resolves aliased song with --type", async () => {
        const paths = makeHome();

        const link = await chartIn(paths, ["Link", "exp"]);
        expect(link.code).toBe(3);
        expect(link.json.ok).toBe(false);
        expect(link.json.error.code).toBe("AMBIGUOUS_REF");
        expect(link.json.error.candidates?.map(c => c.ref)).toEqual(["131", "383"]);

        const aliasAmbiguous = await chartIn(paths, ["标39", "mas"]);
        expect(aliasAmbiguous.code).toBe(3);
        expect(aliasAmbiguous.json.ok).toBe(false);
        expect(aliasAmbiguous.json.error.code).toBe("AMBIGUOUS_REF");
        expect(aliasAmbiguous.json.error.candidates?.map(c => c.ref)).toEqual(["146-3", "10146-3"]);

        const aliasDx = await chartIn(paths, ["标39", "mas", "--type", "dx"]);
        expect(aliasDx.code).toBe(0);
        expect(aliasDx.json.data.chartKey).toBe("10146-3");

        const aliasSd = await chartIn(paths, ["标39", "mas", "--type", "sd"]);
        expect(aliasSd.code).toBe(0);
        expect(aliasSd.json.data.chartKey).toBe("146-3");
    });

    it("handles banquet chart 110018-10 with null notes and stats", async () => {
        const paths = makeHome();
        const { code, json } = await chartIn(paths, ["110018-10"]);

        expect(code).toBe(0);
        expect(json.data).toMatchObject({
            chartKey: "110018-10",
            difficulty: "UTAGE",
            type: "DX",
            level: "12?",
            constant: null,
            fitConstant: null,
            charter: null,
            stats: null,
        });
        expect(json.data.notes).toEqual({
            tap: null,
            hold: null,
            slide: null,
            touch: null,
            break: null,
            total: null,
        });
    });

    it("handles chart 77-2 without stats", async () => {
        const paths = makeHome();
        const { code, json } = await chartIn(paths, ["77-2"]);

        expect(code).toBe(0);
        expect(json.data.constant).toBe(10.6);
        expect(json.data.fitConstant).toBeNull();
        expect(json.data.stats).toBeNull();
        expect(json.data.notes.total).toBe(344);
    });

    it("validates error handling for invalid arguments and unknown charts", async () => {
        const paths = makeHome();

        const unknownSong = await chartIn(paths, ["99999999", "mas"]);
        expect(unknownSong.code).toBe(3);
        expect(unknownSong.json.error.code).toBe("NOT_FOUND");

        const unknownChartKey = await chartIn(paths, ["146-9"]);
        expect(unknownChartKey.code).toBe(3);
        expect(unknownChartKey.json.error.code).toBe("NOT_FOUND");

        const noArgs = await chartIn(paths, []);
        expect(noArgs.code).toBe(2);
        expect(noArgs.json.error.code).toBe("USAGE");

        const unknownDiff = await chartIn(paths, ["146", "zzz"]);
        expect(unknownDiff.code).toBe(2);
        expect(unknownDiff.json.error.code).toBe("USAGE");

        const invalidType = await chartIn(paths, ["146-3", "--type", "xx"]);
        expect(invalidType.code).toBe(2);
        expect(invalidType.json.error.code).toBe("USAGE");
    });

    it("handles caching, offline mode, and stale metadata warnings", async () => {
        const paths = makeHome();

        const failOffline = await chartIn(paths, ["146-3", "--offline"]);
        expect(failOffline.code).toBe(5);
        expect(failOffline.json.error.code).toBe("OFFLINE_NO_CACHE");

        const first = await chartIn(paths, ["146-3"]);
        expect(first.code).toBe(0);
        expect(first.requests.map(r => r.url)).toEqual([META_URL]);

        const second = await chartIn(paths, ["146-3"]);
        expect(second.code).toBe(0);
        expect(second.requests).toEqual([]);

        const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
        const stale = await chartIn(paths, ["146-3"], { now: later, network: {} });
        expect(stale.code).toBe(0);
        expect(stale.json.warnings.map(w => w.code)).toEqual(["STALE_METADATA"]);
        expect(stale.json.data.chartKey).toBe("146-3");
    });
});

describe("saltnet chart --with related", () => {
    const lxnsList = (kind: string) => `${LXNS_URL}/api/v0/maimai/${kind}/list?required=true`;
    const EXPECTED_LXNS_REQUESTS = [
        META_URL,
        lxnsList("trophy"),
        lxnsList("icon"),
        lxnsList("plate"),
        lxnsList("frame"),
    ];

    const BMEM = ["BASIC", "ADVANCED", "EXPERT", "MASTER"];

    const TITLE_5102_ROW = {
        ref: "title:5102",
        kind: "title",
        id: 5102,
        name: "39",
        genre: "niconicoボーカロイド",
        color: "Gold",
        description: "39[でらっくす]/全難易度/ALL PERFECT",
        songCount: 1,
        owned: null,
        progress: null,
    };

    const refsOf = (data: { related: { collections: { ref: string }[] } }) =>
        data.related.collections.map((c: { ref: string }) => c.ref);
    const courseIdsOf = (data: { related: { courses: { id: number }[] } }) =>
        data.related.courses.map((c: { id: number }) => c.id);

    it("fetches collections and adds related on fresh directory for 10146-3", async () => {
        const paths = makeHome();
        const { code, json, requests } = await chartIn(paths, ["10146-3", "--with", "related"]);

        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expect(json.command).toBe("chart");

        expect(Object.keys(json.data)).toEqual([...EXPECTED_CHART_COMMAND_KEYS, "related"]);
        expect(Object.keys(json.data.related)).toEqual(["collections", "courses", "gates"]);

        const expectedRelated = {
            collections: [
                {
                    ...TITLE_5102_ROW,
                    requirements: [
                        {
                            difficulties: BMEM,
                            rank: null,
                            combo: "AP",
                            sync: null,
                            songCount: 1,
                            charts: ["10146-3"],
                        },
                    ],
                },
            ],
            courses: [],
            gates: [],
        };
        expect(json.data.related).toEqual(expectedRelated);

        expect(requests.map((r: { url: string }) => r.url)).toEqual(EXPECTED_LXNS_REQUESTS);
        expect(json.meta.dataAsOf).toEqual({
            catalog: formatLocalTime(NOW),
            collections: formatLocalTime(NOW),
        });
        expect(json.warnings).toEqual([]);

        // Second run with same paths
        const second = await chartIn(paths, ["10146-3", "--with", "related"]);
        expect(second.code).toBe(0);
        expect(second.json.data.related).toEqual(expectedRelated);
        expect(second.requests).toEqual([]);

        // Everything in data except related is toEqual to run without --with
        const paths2 = makeHome();
        const withoutWith = await chartIn(paths2, ["10146-3"]);
        const { related: _rel, ...dataWithoutRelated } = json.data;
        expect(dataWithoutRelated).toEqual(withoutWith.json.data);
    });

    it("does not fetch collections without --with on fresh directory", async () => {
        const paths = makeHome();
        const { code, json, requests } = await chartIn(paths, ["10146-3"]);
        expect(code).toBe(0);
        expect("related" in json.data).toBe(false);
        expect(requests.map((r: { url: string }) => r.url)).toEqual([META_URL]);
        expect(json.meta.dataAsOf).toEqual({ catalog: formatLocalTime(NOW) });
    });

    it("gives same data for --with related,related as --with related", async () => {
        const paths1 = makeHome();
        const resSingle = await chartIn(paths1, ["10146-3", "--with", "related"]);
        const paths2 = makeHome();
        const resDouble = await chartIn(paths2, ["10146-3", "--with", "related,related"]);
        expect(resDouble.json.data).toEqual(resSingle.json.data);
    });

    it("returns expected relations for chart rows in the table", async () => {
        const paths = makeHome();

        // 146-3: SD chart of song whose title names only DX side -> empty relations
        const res146_3 = await chartIn(paths, ["146-3", "--with", "related"]);
        expect(res146_3.code).toBe(0);
        expect(res146_3.json.data.related).toEqual({ collections: [], courses: [], gates: [] });

        // 10146-3
        const res10146_3 = await chartIn(paths, ["10146-3", "--with", "related"]);
        expect(res10146_3.code).toBe(0);
        expect(refsOf(res10146_3.json.data)).toEqual(["title:5102"]);
        expect(res10146_3.json.data.related.collections[0].requirements).toEqual([
            {
                difficulties: BMEM,
                rank: null,
                combo: "AP",
                sync: null,
                songCount: 1,
                charts: ["10146-3"],
            },
        ]);
        expect(courseIdsOf(res10146_3.json.data)).toEqual([]);
        expect(res10146_3.json.data.related.gates).toEqual([]);

        // 58-3
        const res58_3 = await chartIn(paths, ["58-3", "--with", "related"]);
        expect(res58_3.code).toBe(0);
        expect(refsOf(res58_3.json.data)).toEqual([
            "plate:6101",
            "plate:6102",
            "plate:6103",
            "plate:6148",
        ]);
        expect(courseIdsOf(res58_3.json.data)).toEqual([]);
        expect(res58_3.json.data.related.gates).toEqual([]);
        const plate6148_58_3 = res58_3.json.data.related.collections.find(
            (c: { ref: string }) => c.ref === "plate:6148"
        );
        expect(plate6148_58_3.requirements).toEqual([
            {
                difficulties: BMEM,
                rank: "A",
                combo: null,
                sync: null,
                songCount: 5,
                charts: ["58-3"],
            },
        ]);

        // chart 58 mas --with related gives same related as chart 58-3 --with related
        const res58_mas = await chartIn(paths, ["58", "mas", "--with", "related"]);
        expect(res58_mas.code).toBe(0);
        expect(res58_mas.json.data.related).toEqual(res58_3.json.data.related);

        // 58-4
        const res58_4 = await chartIn(paths, ["58-4", "--with", "related"]);
        expect(res58_4.code).toBe(0);
        expect(refsOf(res58_4.json.data)).toEqual(["plate:6148"]);
        expect(courseIdsOf(res58_4.json.data)).toEqual([]);
        expect(res58_4.json.data.related.gates).toEqual([]);
        expect(res58_4.json.data.related.collections[0].requirements).toEqual([
            {
                difficulties: ["Re:MASTER"],
                rank: "A",
                combo: null,
                sync: null,
                songCount: 4,
                charts: ["58-4"],
            },
        ]);

        // 191-2
        const res191_2 = await chartIn(paths, ["191-2", "--with", "related"]);
        expect(res191_2.code).toBe(0);
        expect(refsOf(res191_2.json.data)).toEqual([
            "plate:6104",
            "plate:6105",
            "plate:6106",
            "plate:6107",
        ]);
        expect(res191_2.json.data.related.collections[0].requirements[0].charts).toEqual(["191-2"]);
        expect(courseIdsOf(res191_2.json.data)).toEqual([551102]);
        expect(res191_2.json.data.related.courses[0].tracks).toEqual([
            { track: 3, chartKey: "191-2", difficulty: "EXPERT" },
        ]);
        expect(res191_2.json.data.related.gates).toEqual([]);

        // 191-3
        const res191_3 = await chartIn(paths, ["191-3", "--with", "related"]);
        expect(res191_3.code).toBe(0);
        expect(refsOf(res191_3.json.data)).toEqual([
            "plate:6104",
            "plate:6105",
            "plate:6106",
            "plate:6107",
        ]);
        expect(courseIdsOf(res191_3.json.data)).toEqual([]);
        expect(res191_3.json.data.related.gates).toEqual([]);

        // 10191-2
        const res10191_2 = await chartIn(paths, ["10191-2", "--with", "related"]);
        expect(res10191_2.code).toBe(0);
        expect(refsOf(res10191_2.json.data)).toEqual(["frame:109101"]);
        expect(res10191_2.json.data.related.collections[0].requirements[0].charts).toEqual([
            "10191-2",
        ]);
        expect(courseIdsOf(res10191_2.json.data)).toEqual([]);
        expect(res10191_2.json.data.related.gates).toEqual([]);

        // 10256-0
        const res10256_0 = await chartIn(paths, ["10256-0", "--with", "related"]);
        expect(res10256_0.code).toBe(0);
        expect(refsOf(res10256_0.json.data)).toEqual(["frame:109101"]);
        expect(res10256_0.json.data.related.collections[0].requirements[0].charts).toEqual([
            "10256-0",
        ]);
        expect(courseIdsOf(res10256_0.json.data)).toEqual([551001]);
        expect(res10256_0.json.data.related.courses[0].tracks).toEqual([
            { track: 1, chartKey: "10256-0", difficulty: "BASIC" },
        ]);
        expect(res10256_0.json.data.related.gates).toEqual([]);

        // 256-0
        const res256_0 = await chartIn(paths, ["256-0", "--with", "related"]);
        expect(res256_0.code).toBe(0);
        expect(refsOf(res256_0.json.data)).toEqual([
            "plate:6104",
            "plate:6105",
            "plate:6106",
            "plate:6107",
        ]);
        expect(res256_0.json.data.related.collections[0].requirements[0].charts).toEqual(["256-0"]);
        expect(courseIdsOf(res256_0.json.data)).toEqual([]);
        expect(res256_0.json.data.related.gates).toEqual([]);
    });

    it("makes no collections request when chart is not found", async () => {
        const paths = makeHome();
        const { code, json, requests } = await chartIn(paths, ["99999-3", "--with", "related"]);
        expect(code).toBe(3);
        expect(json.ok).toBe(false);
        expect(json.error.code).toBe("NOT_FOUND");
        expect(requests.map((r: { url: string }) => r.url)).toEqual([META_URL]);
    });

    it("handles invalid --with values", async () => {
        const paths1 = makeHome();
        const resFoo = await chartIn(paths1, ["10146-3", "--with", "foo"]);
        expect(resFoo.code).toBe(2);
        expect(resFoo.json.error.code).toBe("USAGE");
        expect(resFoo.json.error.message).toBe(
            "选项 --with 的值「foo」不在可选范围内；可选值：related"
        );
        expect(resFoo.json.error.fix).toBe("saltnet chart --help");
        expect(resFoo.requests).toEqual([]);
        expect(existsSync(paths1.home)).toBe(false);

        const paths2 = makeHome();
        const resAll = await chartIn(paths2, ["10146-3", "--with", "all"]);
        expect(resAll.code).toBe(2);
        expect(resAll.json.error.code).toBe("USAGE");
        expect(resAll.json.error.message).toBe(
            "选项 --with 的值「all」不在可选范围内；可选值：related"
        );
        expect(resAll.json.error.fix).toBe("saltnet chart --help");
        expect(resAll.requests).toEqual([]);
        expect(existsSync(paths2.home)).toBe(false);

        const paths3 = makeHome();
        const resEmpty = await chartIn(paths3, ["10146-3", "--with", ""]);
        expect(resEmpty.code).toBe(2);
        expect(resEmpty.json.error.code).toBe("USAGE");
        expect(resEmpty.json.error.message).toBe(
            "选项 --with 的列表里有空项；多个值用逗号隔开，例如 a,b"
        );
        expect(resEmpty.json.error.fix).toBe("saltnet chart --help");
        expect(resEmpty.requests).toEqual([]);
        expect(existsSync(paths3.home)).toBe(false);

        const paths4 = makeHome();
        const resTrailing = await chartIn(paths4, ["10146-3", "--with", "related,"]);
        expect(resTrailing.code).toBe(2);
        expect(resTrailing.json.error.code).toBe("USAGE");
        expect(resTrailing.json.error.message).toBe(
            "选项 --with 的列表里有空项；多个值用逗号隔开，例如 a,b"
        );
        expect(resTrailing.json.error.fix).toBe("saltnet chart --help");
        expect(resTrailing.requests).toEqual([]);
        expect(existsSync(paths4.home)).toBe(false);
    });

    it("handles offline mode", async () => {
        const paths = makeHome();
        await chartIn(paths, ["10146-3"]);

        const offlineWithoutCols = await chartIn(paths, [
            "10146-3",
            "--with",
            "related",
            "--offline",
        ]);
        expect(offlineWithoutCols.code).toBe(5);
        expect(offlineWithoutCols.json.error.code).toBe("OFFLINE_NO_CACHE");
        expect(offlineWithoutCols.json.error.message).toContain("收藏品（落雪）");
        expect(offlineWithoutCols.requests).toEqual([]);

        // Normal run to populate cache
        const normal = await chartIn(paths, ["10146-3", "--with", "related"]);
        expect(normal.code).toBe(0);

        const offlineOk = await chartIn(paths, ["10146-3", "--with", "related", "--offline"]);
        expect(offlineOk.code).toBe(0);
        expect(offlineOk.requests).toEqual([]);
        expect(offlineOk.json.meta.dataAsOf).toEqual({
            catalog: formatLocalTime(NOW),
            collections: formatLocalTime(NOW),
        });
        expect(offlineOk.json.data.related).toEqual(normal.json.data.related);
    });

    it("warns when both metadata sources are stale", async () => {
        const paths = makeHome();
        const initial = await chartIn(paths, ["10146-3", "--with", "related"]);
        expect(initial.code).toBe(0);

        const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
        const stale = await chartIn(paths, ["10146-3", "--with", "related"], {
            now: later,
            network: {},
        });
        expect(stale.code).toBe(0);
        expect(stale.json.warnings.map((w: { code: string }) => w.code)).toEqual([
            "STALE_METADATA",
            "STALE_METADATA",
        ]);
        expect(stale.json.warnings[0].message).toContain("曲库（SaltMeta）");
        expect(stale.json.warnings[1].message).toContain("收藏品（落雪）");
        expect(stale.json.warnings[0].fix).toBe("saltnet refresh");
        expect(stale.json.warnings[1].fix).toBe("saltnet refresh");
        expect(stale.json.meta.dataAsOf).toEqual({
            catalog: formatLocalTime(NOW),
            collections: formatLocalTime(NOW),
        });
        expect(stale.json.data.related).toEqual(initial.json.data.related);

        const staleWithoutWith = await chartIn(paths, ["10146-3"], { now: later, network: {} });
        expect(staleWithoutWith.code).toBe(0);
        expect(staleWithoutWith.json.warnings.map((w: { code: string }) => w.code)).toEqual([
            "STALE_METADATA",
        ]);
    });

    it("warns when only collections are stale", async () => {
        const paths = makeHome();
        await commandIn(paths, "collection", ["list", "--limit", "1"]);

        const nowPlus20h = new Date(NOW.getTime() + 20 * 60 * 60 * 1000);
        const res20h = await chartIn(paths, ["10146-3", "--with", "related"], { now: nowPlus20h });
        expect(res20h.code).toBe(0);
        expect(res20h.json.warnings).toEqual([]);
        expect(res20h.requests.map((r: { url: string }) => r.url)).toEqual([META_URL]);
        expect(res20h.json.meta.dataAsOf).toEqual({
            catalog: formatLocalTime(nowPlus20h),
            collections: formatLocalTime(NOW),
        });

        const nowPlus30h = new Date(NOW.getTime() + 30 * 60 * 60 * 1000);
        const res30h = await chartIn(paths, ["10146-3", "--with", "related"], {
            now: nowPlus30h,
            network: {},
        });
        expect(res30h.code).toBe(0);
        expect(res30h.json.warnings.map((w: { code: string }) => w.code)).toEqual([
            "STALE_METADATA",
        ]);
        expect(res30h.json.warnings[0].message).toContain("收藏品（落雪）");
        expect(res30h.json.warnings[0].message).not.toContain("曲库");
    });
});
