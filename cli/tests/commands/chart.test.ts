import { createFixtureMusicList } from "@core/fixtures/saltmeta";
import { describe, expect, it } from "vitest";
import { formatLocalTime } from "../../src/util/time";
import { commandIn, META_URL, NOW } from "../commandRun";
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
