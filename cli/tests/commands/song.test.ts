import { createFixtureMusicList } from "@core/fixtures/saltmeta";
import { describe, expect, it } from "vitest";
import { formatLocalTime } from "../../src/util/time";
import { commandIn, META_URL, NOW } from "../commandRun";
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
