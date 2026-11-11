import { existsSync } from "node:fs";
import { createFixtureMusicList } from "@core/fixtures/saltmeta";
import { describe, expect, it } from "vitest";
import { formatLocalTime } from "../../src/util/time";
import { commandIn, LXNS_URL, META_URL, NOW } from "../commandRun";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();
const fixtureData = createFixtureMusicList();

function songIn(
    paths: ReturnType<typeof makeHome>,
    args: string[],
    options?: Parameters<typeof commandIn>[3]
) {
    return commandIn(paths, "song", args, options);
}

describe("saltnet song command", () => {
    it("returns output matching the standard envelope and object structure without pagination", async () => {
        const paths = makeHome();
        const { code, json } = await songIn(paths, ["146"]);

        expect(code).toBe(0);
        expect(json.v).toBe(1);
        expect(json.ok).toBe(true);
        expect(json.command).toBe("song");
        expect(json.warnings).toEqual([]);
        expect(json.meta.dataAsOf.catalog).toBe(formatLocalTime(NOW));
        expect(json.meta.page).toBeUndefined();

        expect(Object.keys(json.data)).toEqual([
            "musicId",
            "title",
            "artist",
            "genre",
            "bpm",
            "aliases",
            "type",
            "charts",
        ]);
    });

    it("returns details and all 9 charts for song 146", async () => {
        const paths = makeHome();
        const { code, json } = await songIn(paths, ["146"]);

        expect(code).toBe(0);
        expect(json.data.musicId).toBe(146);
        expect(json.data.title).toBe("39");
        expect(json.data.artist).toBe("sasakure.UK x DECO*27");
        expect(json.data.bpm).toBe(175);
        expect(json.data.aliases).toEqual(["39", "标39", "初音未来"]);
        expect(json.data.type).toBe("SD+DX");
        expect(json.data.genre).toBe(fixtureData.musicList[146].info.genre);

        expect(json.data.charts).toHaveLength(9);
        const chartKeys = json.data.charts.map((c: { chartKey: string }) => c.chartKey);
        expect(chartKeys).toEqual([
            "146-0",
            "146-1",
            "146-2",
            "146-3",
            "146-4",
            "10146-0",
            "10146-1",
            "10146-2",
            "10146-3",
        ]);

        const c146_3 = json.data.charts.find((c: { chartKey: string }) => c.chartKey === "146-3");
        expect(c146_3).toMatchObject({
            chartKey: "146-3",
            musicId: 146,
            title: "39",
            type: "SD",
            difficulty: "MASTER",
            level: "13",
            constant: 13,
            fitConstant: 13.6,
        });

        const c10146_3 = json.data.charts.find(
            (c: { chartKey: string }) => c.chartKey === "10146-3"
        );
        expect(c10146_3).toMatchObject({
            chartKey: "10146-3",
            musicId: 10146,
            title: "39",
            type: "DX",
            difficulty: "MASTER",
            level: "12+",
            constant: 12.8,
            fitConstant: 12.784,
        });
    });

    it("resolves the song by DX id, chart key, title, and alias", async () => {
        const paths = makeHome();

        const byDxId = await songIn(paths, ["10146"]);
        expect(byDxId.code).toBe(0);
        expect(byDxId.json.data.musicId).toBe(146);

        const byChartKey = await songIn(paths, ["146-3"]);
        expect(byChartKey.code).toBe(0);
        expect(byChartKey.json.data.musicId).toBe(146);

        const byTitle = await songIn(paths, ["True Love Song"]);
        expect(byTitle.code).toBe(0);
        expect(byTitle.json.data.musicId).toBe(8);
        expect(byTitle.json.data.type).toBe("SD");
        expect(byTitle.json.data.charts).toHaveLength(4);

        const byAlias = await songIn(paths, ["cmw"]);
        expect(byAlias.code).toBe(0);
        expect(byAlias.json.data.musicId).toBe(9);
    });

    it("handles banquet songs with null bpm and single UTAGE chart", async () => {
        const paths = makeHome();
        const { code, json } = await songIn(paths, ["110018"]);

        expect(code).toBe(0);
        expect(json.data.type).toBe("DX");
        expect(json.data.bpm).toBeNull();
        expect(json.data.charts).toHaveLength(1);
        expect(json.data.charts[0]).toMatchObject({
            chartKey: "110018-10",
            difficulty: "UTAGE",
            level: "12?",
            constant: null,
            fitConstant: null,
        });
    });

    it("handles DX-only songs correctly", async () => {
        const paths = makeHome();
        const { code, json } = await songIn(paths, ["11726"]);

        expect(code).toBe(0);
        expect(json.data.type).toBe("DX");
        expect(json.data.charts).toHaveLength(4);
        expect(json.data.charts.map((c: { chartKey: string }) => c.chartKey)).toEqual([
            "11726-0",
            "11726-1",
            "11726-2",
            "11726-3",
        ]);
    });

    it("fails with AMBIGUOUS_REF for Link", async () => {
        const paths = makeHome();
        const { code, json } = await songIn(paths, ["Link"]);

        expect(code).toBe(3);
        expect(json.ok).toBe(false);
        expect(json.error.code).toBe("AMBIGUOUS_REF");
        expect(json.error.candidates?.map(c => c.ref)).toEqual(["131", "383"]);
    });

    it("fails with NOT_FOUND for unknown songs", async () => {
        const paths = makeHome();
        const { code, json } = await songIn(paths, ["99999999"]);

        expect(code).toBe(3);
        expect(json.ok).toBe(false);
        expect(json.error.code).toBe("NOT_FOUND");
    });

    it("fails with USAGE when no argument is given", async () => {
        const paths = makeHome();
        const { code, json } = await songIn(paths, []);

        expect(code).toBe(2);
        expect(json.ok).toBe(false);
        expect(json.error.code).toBe("USAGE");
    });

    it("fails with OFFLINE_NO_CACHE when offline without cache", async () => {
        const paths = makeHome();
        const { code, json } = await songIn(paths, ["146", "--offline"]);

        expect(code).toBe(5);
        expect(json.ok).toBe(false);
        expect(json.error.code).toBe("OFFLINE_NO_CACHE");
    });

    it("downloads metadata on first call and caches it for subsequent calls", async () => {
        const paths = makeHome();

        const first = await songIn(paths, ["146"]);
        expect(first.code).toBe(0);
        expect(first.requests.map(r => r.url)).toEqual([META_URL]);

        const second = await songIn(paths, ["146"]);
        expect(second.code).toBe(0);
        expect(second.requests).toEqual([]);
    });

    it("warns when metadata is stale", async () => {
        const paths = makeHome();
        await songIn(paths, ["146"]);

        const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
        const stale = await songIn(paths, ["146"], { now: later, network: {} });
        expect(stale.code).toBe(0);
        expect(stale.json.ok).toBe(true);
        expect(stale.json.warnings.map(w => w.code)).toEqual(["STALE_METADATA"]);
        expect(stale.json.data.musicId).toBe(146);
    });
});

describe("saltnet song --with related", () => {
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

    it("fetches collections and adds related on fresh directory for 146", async () => {
        const paths = makeHome();
        const { code, json, requests } = await songIn(paths, ["146", "--with", "related"]);

        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expect(json.command).toBe("song");

        expect(Object.keys(json.data)).toEqual([
            "musicId",
            "title",
            "artist",
            "genre",
            "bpm",
            "aliases",
            "type",
            "charts",
            "related",
        ]);
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
                            charts: ["10146-0", "10146-1", "10146-2", "10146-3"],
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
        const second = await songIn(paths, ["146", "--with", "related"]);
        expect(second.code).toBe(0);
        expect(second.json.data.related).toEqual(expectedRelated);
        expect(second.requests).toEqual([]);

        // Everything in data except related is toEqual to run without --with
        const paths2 = makeHome();
        const withoutWith = await songIn(paths2, ["146"]);
        const { related: _rel, ...dataWithoutRelated } = json.data;
        expect(dataWithoutRelated).toEqual(withoutWith.json.data);
    });

    it("does not fetch collections without --with on fresh directory", async () => {
        const paths = makeHome();
        const { code, json, requests } = await songIn(paths, ["146"]);
        expect(code).toBe(0);
        expect("related" in json.data).toBe(false);
        expect(requests.map((r: { url: string }) => r.url)).toEqual([META_URL]);
        expect(json.meta.dataAsOf).toEqual({ catalog: formatLocalTime(NOW) });
    });

    it("gives same data for --with related,related as --with related", async () => {
        const paths1 = makeHome();
        const resSingle = await songIn(paths1, ["146", "--with", "related"]);
        const paths2 = makeHome();
        const resDouble = await songIn(paths2, ["146", "--with", "related,related"]);
        expect(resDouble.json.data).toEqual(resSingle.json.data);
    });

    it("returns expected relations for songs 8, 17, 58, 70, 115, 191, 256, 44", async () => {
        const paths = makeHome();

        // 8
        const res8 = await songIn(paths, ["8", "--with", "related"]);
        expect(res8.code).toBe(0);
        expect(refsOf(res8.json.data)).toEqual([
            "plate:6101",
            "plate:6102",
            "plate:6103",
            "plate:6148",
        ]);
        expect(courseIdsOf(res8.json.data)).toEqual([]);
        expect(res8.json.data.related.gates).toEqual([]);

        // 17
        const res17 = await songIn(paths, ["17", "--with", "related"]);
        expect(res17.code).toBe(0);
        expect(refsOf(res17.json.data)).toEqual([
            "plate:6101",
            "plate:6102",
            "plate:6103",
            "plate:6148",
        ]);
        expect(courseIdsOf(res17.json.data)).toEqual([]);
        expect(res17.json.data.related.gates).toEqual([]);
        const plate6148_17 = res17.json.data.related.collections.find(
            (c: { ref: string }) => c.ref === "plate:6148"
        );
        expect(plate6148_17.requirements).toEqual([
            {
                difficulties: BMEM,
                rank: "A",
                combo: null,
                sync: null,
                songCount: 5,
                charts: ["17-0", "17-1", "17-2", "17-3"],
            },
            {
                difficulties: ["Re:MASTER"],
                rank: "A",
                combo: null,
                sync: null,
                songCount: 4,
                charts: ["17-4"],
            },
        ]);

        // 58
        const res58 = await songIn(paths, ["58", "--with", "related"]);
        expect(res58.code).toBe(0);
        expect(refsOf(res58.json.data)).toEqual([
            "plate:6101",
            "plate:6102",
            "plate:6103",
            "plate:6148",
        ]);
        expect(courseIdsOf(res58.json.data)).toEqual([]);
        expect(res58.json.data.related.gates).toEqual([]);
        const plate6148_58 = res58.json.data.related.collections.find(
            (c: { ref: string }) => c.ref === "plate:6148"
        );
        expect(plate6148_58.requirements).toEqual([
            {
                difficulties: BMEM,
                rank: "A",
                combo: null,
                sync: null,
                songCount: 5,
                charts: ["58-0", "58-1", "58-2", "58-3"],
            },
            {
                difficulties: ["Re:MASTER"],
                rank: "A",
                combo: null,
                sync: null,
                songCount: 4,
                charts: ["58-4"],
            },
        ]);

        // 70
        const res70 = await songIn(paths, ["70", "--with", "related"]);
        expect(res70.code).toBe(0);
        expect(refsOf(res70.json.data)).toEqual(["plate:6148"]);
        expect(courseIdsOf(res70.json.data)).toEqual([]);
        expect(res70.json.data.related.gates).toEqual([]);
        expect(res70.json.data.related.collections[0].requirements).toEqual([
            {
                difficulties: ["Re:MASTER"],
                rank: "A",
                combo: null,
                sync: null,
                songCount: 4,
                charts: ["70-4"],
            },
        ]);

        // 115
        const res115 = await songIn(paths, ["115", "--with", "related"]);
        expect(res115.code).toBe(0);
        expect(refsOf(res115.json.data)).toEqual([
            "plate:6104",
            "plate:6105",
            "plate:6106",
            "plate:6107",
        ]);
        expect(courseIdsOf(res115.json.data)).toEqual([]);
        expect(res115.json.data.related.gates).toEqual([]);

        // 191
        const res191 = await songIn(paths, ["191", "--with", "related"]);
        expect(res191.code).toBe(0);
        expect(refsOf(res191.json.data)).toEqual([
            "plate:6104",
            "plate:6105",
            "plate:6106",
            "plate:6107",
            "frame:109101",
        ]);
        expect(courseIdsOf(res191.json.data)).toEqual([551102]);
        expect(res191.json.data.related.courses[0].tracks).toEqual([
            { track: 3, chartKey: "191-2", difficulty: "EXPERT" },
        ]);
        expect(res191.json.data.related.gates).toEqual([]);

        // 256
        const res256 = await songIn(paths, ["256", "--with", "related"]);
        expect(res256.code).toBe(0);
        expect(refsOf(res256.json.data)).toEqual([
            "plate:6104",
            "plate:6105",
            "plate:6106",
            "plate:6107",
            "plate:6148",
            "frame:109101",
        ]);
        expect(res256.json.data.related.collections[4].requirements).toEqual([
            {
                difficulties: ["Re:MASTER"],
                rank: "A",
                combo: null,
                sync: null,
                songCount: 4,
                charts: ["256-4"],
            },
        ]);
        expect(courseIdsOf(res256.json.data)).toEqual([551001]);
        expect(res256.json.data.related.courses[0].tracks).toEqual([
            { track: 1, chartKey: "10256-0", difficulty: "BASIC" },
        ]);
        expect(res256.json.data.related.gates).toEqual([]);

        // 44
        const res44 = await songIn(paths, ["44", "--with", "related"]);
        expect(res44.code).toBe(0);
        expect(res44.json.data.related).toEqual({ collections: [], courses: [], gates: [] });
    });

    it("makes no collections request when song is not found", async () => {
        const paths = makeHome();
        const { code, json, requests } = await songIn(paths, ["nosuchsong", "--with", "related"]);
        expect(code).toBe(3);
        expect(json.ok).toBe(false);
        expect(json.error.code).toBe("NOT_FOUND");
        expect(requests.map((r: { url: string }) => r.url)).toEqual([META_URL]);
    });

    it("handles invalid --with values", async () => {
        const paths1 = makeHome();
        const resFoo = await songIn(paths1, ["146", "--with", "foo"]);
        expect(resFoo.code).toBe(2);
        expect(resFoo.json.error.code).toBe("USAGE");
        expect(resFoo.json.error.message).toBe(
            "选项 --with 的值「foo」不在可选范围内；可选值：related"
        );
        expect(resFoo.json.error.fix).toBe("saltnet song --help");
        expect(resFoo.requests).toEqual([]);
        expect(existsSync(paths1.home)).toBe(false);

        const paths2 = makeHome();
        const resAll = await songIn(paths2, ["146", "--with", "all"]);
        expect(resAll.code).toBe(2);
        expect(resAll.json.error.code).toBe("USAGE");
        expect(resAll.json.error.message).toBe(
            "选项 --with 的值「all」不在可选范围内；可选值：related"
        );
        expect(resAll.json.error.fix).toBe("saltnet song --help");
        expect(resAll.requests).toEqual([]);
        expect(existsSync(paths2.home)).toBe(false);

        const paths3 = makeHome();
        const resEmpty = await songIn(paths3, ["146", "--with", ""]);
        expect(resEmpty.code).toBe(2);
        expect(resEmpty.json.error.code).toBe("USAGE");
        expect(resEmpty.json.error.message).toBe(
            "选项 --with 的列表里有空项；多个值用逗号隔开，例如 a,b"
        );
        expect(resEmpty.json.error.fix).toBe("saltnet song --help");
        expect(resEmpty.requests).toEqual([]);
        expect(existsSync(paths3.home)).toBe(false);

        const paths4 = makeHome();
        const resTrailing = await songIn(paths4, ["146", "--with", "related,"]);
        expect(resTrailing.code).toBe(2);
        expect(resTrailing.json.error.code).toBe("USAGE");
        expect(resTrailing.json.error.message).toBe(
            "选项 --with 的列表里有空项；多个值用逗号隔开，例如 a,b"
        );
        expect(resTrailing.json.error.fix).toBe("saltnet song --help");
        expect(resTrailing.requests).toEqual([]);
        expect(existsSync(paths4.home)).toBe(false);
    });

    it("handles offline mode", async () => {
        const paths = makeHome();
        await songIn(paths, ["146"]);

        const offlineWithoutCols = await songIn(paths, ["146", "--with", "related", "--offline"]);
        expect(offlineWithoutCols.code).toBe(5);
        expect(offlineWithoutCols.json.error.code).toBe("OFFLINE_NO_CACHE");
        expect(offlineWithoutCols.json.error.message).toContain("收藏品（落雪）");
        expect(offlineWithoutCols.requests).toEqual([]);

        // Normal run to populate cache
        const normal = await songIn(paths, ["146", "--with", "related"]);
        expect(normal.code).toBe(0);

        const offlineOk = await songIn(paths, ["146", "--with", "related", "--offline"]);
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
        const initial = await songIn(paths, ["146", "--with", "related"]);
        expect(initial.code).toBe(0);

        const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
        const stale = await songIn(paths, ["146", "--with", "related"], {
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

        const staleWithoutWith = await songIn(paths, ["146"], { now: later, network: {} });
        expect(staleWithoutWith.code).toBe(0);
        expect(staleWithoutWith.json.warnings.map((w: { code: string }) => w.code)).toEqual([
            "STALE_METADATA",
        ]);
    });

    it("warns when only collections are stale", async () => {
        const paths = makeHome();
        await commandIn(paths, "collection", ["list", "--limit", "1"]);

        const nowPlus20h = new Date(NOW.getTime() + 20 * 60 * 60 * 1000);
        const res20h = await songIn(paths, ["146", "--with", "related"], { now: nowPlus20h });
        expect(res20h.code).toBe(0);
        expect(res20h.json.warnings).toEqual([]);
        expect(res20h.requests.map((r: { url: string }) => r.url)).toEqual([META_URL]);
        expect(res20h.json.meta.dataAsOf).toEqual({
            catalog: formatLocalTime(nowPlus20h),
            collections: formatLocalTime(NOW),
        });

        const nowPlus30h = new Date(NOW.getTime() + 30 * 60 * 60 * 1000);
        const res30h = await songIn(paths, ["146", "--with", "related"], {
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

    it("outputs related in text format and prints with option in help", async () => {
        const paths = makeHome();
        const textRes = await songIn(paths, ["146", "--with", "related", "--format", "text"]);
        expect(textRes.code).toBe(0);
        expect(textRes.stdout).toContain("related:");
        expect(textRes.stdout).toContain("ref: title:5102");

        const helpRes = await songIn(paths, ["--help"]);
        expect(helpRes.code).toBe(0);
        expect(helpRes.stdout).toContain("--with <内容,内容>");
        expect(helpRes.stdout).toContain("（可选：related）");
    });
});
