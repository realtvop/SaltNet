import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatLocalTime } from "../../src/util/time";
import { commandIn, NOW } from "../commandRun";
import { useTempHome } from "../tempHome";
import { useTimeZone } from "../zone";

const makeHome = useTempHome();

// Not UTC and not UTC+8 (where the calendars are published), so a time that was left in the
// zone of the data or of the text instead of the machine's shows.
useTimeZone("America/New_York");

function gateIn(
    paths: ReturnType<typeof makeHome>,
    args: string[],
    options?: Parameters<typeof commandIn>[3]
) {
    return commandIn(paths, "kaleidxscope", args, options);
}

describe("kaleidxscope command overview", () => {
    it("returns overview at an explicit time without needing catalog or network", async () => {
        const paths = makeHome();
        const { code, json, requests } = await gateIn(paths, ["--at", "2026-10-05T00:00:00+08:00"]);

        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expect(json.command).toBe("kaleidxscope");
        expect(json.warnings).toEqual([]);
        expect(json.meta.dataAsOf).toBeUndefined();
        expect(requests).toEqual([]);
        expect(existsSync(paths.home)).toBe(false);

        expect(new Date(json.data.at).getTime()).toBe(
            new Date("2026-10-05T00:00:00+08:00").getTime()
        );
        expect(json.data.at).toBe("2026-10-04T12:00:00-04:00");

        const expectedGateIds = [
            "blue",
            "white",
            "purple",
            "black",
            "yellow",
            "red",
            "prism",
            "noise",
            "hope",
            "final",
        ];
        expect(json.data.gates.map((g: { id: string }) => g.id)).toEqual(expectedGateIds);
        expect(json.data.gates.every((g: { opened: boolean }) => g.opened)).toBe(true);

        const expectedCounts = [29, 6, 28, 11, 12, 10, 0, 0, 0, 0];
        expect(
            json.data.gates.map(
                (g: { keyCondition: { songCount: number } }) => g.keyCondition.songCount
            )
        ).toEqual(expectedCounts);

        // blue
        const blue = json.data.gates.find((g: { id: string }) => g.id === "blue");
        expect(new Date(blue.currentPhase.startsAt).getTime()).toBe(
            new Date("2026-02-12T04:00:00+08:00").getTime()
        );
        expect(blue.currentPhase.difficulty).toBe("BASIC");
        expect(blue.currentPhase.life).toBe(999);
        expect(blue.nextPhase).toBeNull();

        // prism
        const prism = json.data.gates.find((g: { id: string }) => g.id === "prism");
        expect(new Date(prism.currentPhase.startsAt).getTime()).toBe(
            new Date("2026-10-04T07:00:00+08:00").getTime()
        );
        expect(prism.currentPhase.difficulty).toBe("MASTER");
        expect(prism.currentPhase.life).toBe(10);
        expect(new Date(prism.nextPhase.startsAt).getTime()).toBe(
            new Date("2026-10-07T07:00:00+08:00").getTime()
        );
        expect(prism.nextPhase.difficulty).toBe("MASTER");
        expect(prism.nextPhase.life).toBe(30);

        // hope
        const hope = json.data.gates.find((g: { id: string }) => g.id === "hope");
        expect(new Date(hope.currentPhase.startsAt).getTime()).toBe(
            new Date("2026-10-02T07:00:00+08:00").getTime()
        );
        expect(hope.currentPhase.difficulty).toBe("MASTER");
        expect(hope.currentPhase.life).toBe(1);
        expect(hope.nextPhase.status).toBe("future");
        expect(new Date(hope.nextPhase.startsAt).getTime()).toBe(
            new Date("2026-10-05T07:00:00+08:00").getTime()
        );

        // final
        const finalG = json.data.gates.find((g: { id: string }) => g.id === "final");
        expect(new Date(finalG.currentPhase.startsAt).getTime()).toBe(
            new Date("2026-10-04T07:00:00+08:00").getTime()
        );
        expect(finalG.currentPhase.difficulty).toBe("Re:MASTER");
        expect(finalG.currentPhase.life).toEqual({ first: 5, second: 300 });
        expect(new Date(finalG.nextPhase.startsAt).getTime()).toBe(
            new Date("2026-10-06T07:00:00+08:00").getTime()
        );
    });

    it("returns overview at NOW when --at is omitted", async () => {
        const paths = makeHome();
        const { code, json } = await gateIn(paths, []);

        expect(code).toBe(0);
        expect(new Date(json.data.at).getTime()).toBe(NOW.getTime());
        expect(json.data.at).toBe(formatLocalTime(NOW));
        expect(json.data.gates.every((g: { opened: boolean }) => g.opened)).toBe(true);
        expect(json.data.gates.every((g: { nextPhase: unknown }) => g.nextPhase === null)).toBe(
            true
        );

        const blue = json.data.gates.find((g: { id: string }) => g.id === "blue");
        expect(new Date(blue.currentPhase.startsAt).getTime()).toBe(
            new Date("2026-02-12T04:00:00+08:00").getTime()
        );
        expect(blue.currentPhase.difficulty).toBe("BASIC");
        expect(blue.currentPhase.life).toBe(999);

        const finalG = json.data.gates.find((g: { id: string }) => g.id === "final");
        expect(new Date(finalG.currentPhase.startsAt).getTime()).toBe(
            new Date("2026-10-23T07:00:00+08:00").getTime()
        );
        expect(finalG.currentPhase.difficulty).toBe("BASIC");
        expect(finalG.currentPhase.life).toEqual({ first: 999, second: 999 });

        // options.now before blue opens
        const beforeBlue = await gateIn(paths, [], { now: new Date("2026-01-01T00:00:00Z") });
        const blueBefore = beforeBlue.json.data.gates.find((g: { id: string }) => g.id === "blue");
        expect(blueBefore.opened).toBe(false);
        expect(blueBefore.currentPhase).toBeNull();

        // options.now before any gate opens
        const beforeAll = await gateIn(paths, [], { now: new Date("2025-12-31T00:00:00Z") });
        expect(beforeAll.json.data.gates.every((g: { opened: boolean }) => !g.opened)).toBe(true);
        expect(
            beforeAll.json.data.gates.every(
                (g: { currentPhase: unknown }) => g.currentPhase === null
            )
        ).toBe(true);
    });

    it("accepts various valid --at formats and rejects invalid ones", async () => {
        const paths = makeHome();

        const dateOnly = await gateIn(paths, ["--at", "2026-10-05"]);
        expect(dateOnly.code).toBe(0);
        expect(new Date(dateOnly.json.data.at).getTime()).toBe(new Date(2026, 9, 5).getTime());
        expect(dateOnly.json.data.at).toBe("2026-10-05T00:00:00-04:00");

        const utcDate = await gateIn(paths, ["--at", "2026-10-05T00:00:00Z"]);
        expect(utcDate.code).toBe(0);
        expect(new Date(utcDate.json.data.at).getTime()).toBe(Date.UTC(2026, 9, 5, 0, 0, 0));
        expect(utcDate.json.data.at).toBe("2026-10-04T20:00:00-04:00");

        const spaceDate = await gateIn(paths, ["--at", "2026-10-05 00:00"]);
        expect(spaceDate.code).toBe(0);
        expect(new Date(spaceDate.json.data.at).getTime()).toBe(
            new Date(2026, 9, 5, 0, 0).getTime()
        );

        const invalid = await gateIn(paths, ["--at", "2026-13-01"]);
        expect(invalid.code).toBe(2);
        expect(invalid.json.error.code).toBe("USAGE");
        expect(invalid.json.error.message).toMatch(/^选项 --at 的值「2026-13-01」不是时间/);
        expect(invalid.requests).toEqual([]);
    });

    it("rejects --diff without a gate argument", async () => {
        const paths = makeHome();
        const result = await gateIn(paths, ["--diff", "mas"]);

        expect(result.code).toBe(2);
        expect(result.json.error.code).toBe("USAGE");
    });

    it("works in offline mode for overview without needing cache", async () => {
        const paths = makeHome();
        const result = await gateIn(paths, ["--offline"]);

        expect(result.code).toBe(0);
        expect(result.requests).toEqual([]);
    });
});

describe("kaleidxscope gate detail command", () => {
    it("resolves gates by id, name, short name, unique part and case variations", async () => {
        const paths = makeHome();
        for (const input of ["blue", "蓝色之门", "蓝门", "蓝", "BLUE"]) {
            const result = await gateIn(paths, [input]);
            expect(result.code).toBe(0);
            expect(result.json.data.id).toBe("blue");
        }

        // A home of their own: with a catalog already cached, "nothing was fetched" proves nothing.
        const ambigPaths = makeHome();
        const ambig = await gateIn(ambigPaths, ["之门"]);
        expect(ambig.code).toBe(3);
        expect(ambig.json.error.code).toBe("AMBIGUOUS_REF");
        expect(ambig.json.error.candidates?.map(c => c.ref)).toEqual([
            "blue",
            "white",
            "purple",
            "black",
            "yellow",
            "red",
            "hope",
        ]);
        expect(ambig.requests).toEqual([]);
        expect(existsSync(ambigPaths.home)).toBe(false);

        const notFoundPaths = makeHome();
        const notFound = await gateIn(notFoundPaths, ["zzzzzzzz"]);
        expect(notFound.code).toBe(3);
        expect(notFound.json.error.code).toBe("NOT_FOUND");
        expect(notFound.requests).toEqual([]);
        expect(existsSync(notFoundPaths.home)).toBe(false);
    });

    it("shows 白门 at 2026-02-10T08:00:00+08:00 with all pending songs", async () => {
        const paths = makeHome();
        const { code, json } = await gateIn(paths, ["白门", "--at", "2026-02-10T08:00:00+08:00"]);

        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expect(json.data.id).toBe("white");
        expect(json.data.opened).toBe(true);
        expect(json.data.at).toBe("2026-02-09T19:00:00-05:00");
        expect(json.data.openedAt).toBe("2026-02-09T18:00:00-05:00");
        expect(json.data.currentPhase.endsAt).toBe("2026-02-12T15:00:00-05:00");
        expect(json.data.chartDifficulty).toBe("MASTER");
        expect(json.meta.dataAsOf.catalog).toBe(formatLocalTime(NOW));

        expect(json.data.currentPhase.status).toBe("current");
        expect(new Date(json.data.currentPhase.startsAt).getTime()).toBe(
            new Date("2026-02-10T07:00:00+08:00").getTime()
        );
        expect(new Date(json.data.currentPhase.endsAt).getTime()).toBe(
            new Date("2026-02-13T04:00:00+08:00").getTime()
        );
        expect(json.data.currentPhase.difficulty).toBe("MASTER");
        expect(json.data.currentPhase.life).toBe(1);

        expect(json.data.nextPhase.status).toBe("future");
        expect(json.data.nextPhase.difficulty).toBe("MASTER");
        expect(json.data.nextPhase.life).toBe(10);

        expect(json.data.phases).toHaveLength(6);
        expect(json.data.phases.map((p: { status: string }) => p.status)).toEqual([
            "current",
            "future",
            "future",
            "future",
            "future",
            "future",
        ]);

        expect(json.data.keyCondition.summary).toBe(
            "设置背景「Latent Kingdom」后，同一局连续游玩 3 首（单人）或 4 首（双人）不重复的作曲家含「奏音」曲目"
        );
        expect(json.data.keyCondition.songCount).toBe(6);
        expect(json.data.keyCondition.songs).toEqual([]);
        expect(json.data.keyCondition.pending).toEqual([
            { musicId: 11102, title: "封焔の135秒" },
            { musicId: 11234, title: "ほしぞらスペクタクル" },
            { musicId: 11300, title: "U&iVERSE -銀河鸞翔-" },
            { musicId: 11529, title: "ツムギボシ" },
            { musicId: 11542, title: "ここからはじまるプロローグ。 (Kanon Remix)" },
            { musicId: 11612, title: "Latent Kingdom" },
        ]);

        expect(json.data.pools).toHaveLength(3);
        expect(json.data.pools[0]).toEqual({
            track: 1,
            label: null,
            description: "天界区域课题曲",
            selection: "random",
            unlistedDescription: null,
            songs: [],
            pending: expect.any(Array),
        });
        expect(json.data.pools[0].pending).toHaveLength(20);

        expect(json.data.pools[1]).toEqual({
            track: 2,
            label: null,
            description: "天界区域完美挑战曲",
            selection: "random",
            unlistedDescription: null,
            songs: [],
            pending: expect.any(Array),
        });
        expect(json.data.pools[1].pending).toHaveLength(9);

        expect(json.data.pools[2]).toEqual({
            track: 3,
            label: null,
            description: "固定门曲",
            selection: "fixed",
            unlistedDescription: null,
            songs: [],
            pending: [{ musicId: 11745, title: "氷滅の135小節" }],
        });
    });

    it("derives default grade from --at or NOW", async () => {
        const paths = makeHome();

        const mas = await gateIn(paths, ["blue", "--at", "2026-01-23T10:00:00+08:00"]);
        expect(mas.json.data.chartDifficulty).toBe("MASTER");

        const exp = await gateIn(paths, ["blue", "--at", "2026-02-05T04:00:00+08:00"]);
        expect(exp.json.data.chartDifficulty).toBe("EXPERT");

        const bas = await gateIn(paths, ["blue", "--at", "2026-03-01T00:00:00+08:00"]);
        expect(bas.json.data.chartDifficulty).toBe("BASIC");

        const before = await gateIn(paths, ["blue", "--at", "2026-01-01T00:00:00+08:00"]);
        expect(before.json.data.chartDifficulty).toBe("MASTER");
        expect(before.json.data.opened).toBe(false);
        expect(before.json.data.currentPhase).toBeNull();
        expect(before.json.data.nextPhase.status).toBe("future");
        expect(new Date(before.json.data.nextPhase.startsAt).getTime()).toBe(
            new Date("2026-01-23T10:00:00+08:00").getTime()
        );

        const nowDefault = await gateIn(paths, ["blue"]);
        expect(nowDefault.json.data.chartDifficulty).toBe("BASIC");
    });

    it("accepts --diff options and aliases and rejects invalid ones", async () => {
        const paths = makeHome();

        for (const diff of ["rem", "4", "Re:MASTER", "白"]) {
            const res = await gateIn(paths, ["blue", "--diff", diff]);
            expect(res.code).toBe(0);
            expect(res.json.data.chartDifficulty).toBe("Re:MASTER");
        }

        const exp = await gateIn(paths, ["blue", "--diff", "exp"]);
        expect(exp.json.data.chartDifficulty).toBe("EXPERT");

        const bas = await gateIn(paths, ["blue", "--diff", "bas"]);
        expect(bas.json.data.chartDifficulty).toBe("BASIC");

        const mas = await gateIn(paths, ["blue", "--diff", "mas"]);
        expect(mas.json.data.chartDifficulty).toBe("MASTER");

        const utage = await gateIn(paths, ["blue", "--diff", "utage"]);
        expect(utage.code).toBe(2);
        expect(utage.json.error.code).toBe("USAGE");

        const nope = await gateIn(paths, ["blue", "--diff", "nope"]);
        expect(nope.code).toBe(2);
        expect(nope.json.error.code).toBe("USAGE");
    });

    it("shows 乱码 with description, lifeNote, region, and unlisted pool", async () => {
        const paths = makeHome();
        const { code, json } = await gateIn(paths, ["乱码", "--at", "2026-10-05T00:00:00+08:00"]);

        expect(code).toBe(0);
        expect(json.data.description).toBe(
            "完成第三曲的乱码演出后获得希望钥匙；提前结束或跳过第三曲不会获得。"
        );
        expect(json.data.lifeNote).toBe(
            "按开放首日 LIFE 1、每 3 天放宽一次推算，生效时间统一为 07:00。"
        );
        expect(json.data.region).toBe("棱镜区域");
        expect(json.data.pools[2]).toEqual({
            track: 3,
            label: null,
            description: "",
            selection: "fixed",
            unlistedDescription: "乱码版 Xaleid◆scopiX",
            songs: [],
            pending: [],
        });
        expect(json.data.pools[0].pending).toHaveLength(6);
        expect(json.data.pools[1].pending).toHaveLength(7);
    });

    it("shows final gate with 9 phases, two-bar life, and BONUS TRACK pool", async () => {
        const paths = makeHome();
        const { code, json } = await gateIn(paths, ["final", "--at", "2026-10-07T07:00:00+08:00"]);

        expect(code).toBe(0);
        expect(json.data.phases).toHaveLength(9);
        expect(json.data.phases[3].life).toEqual({ first: 30, second: 500 });
        expect(json.data.pools).toHaveLength(2);
        expect(json.data.pools[1].label).toBe("BONUS TRACK");
        expect(json.data.chartDifficulty).toBe("Re:MASTER");
    });

    it("rejects --format tsv for gate detail", async () => {
        const paths = makeHome();
        const result = await gateIn(paths, ["blue", "--format", "tsv"]);

        expect(result.code).toBe(2);
        expect(result.json.error.code).toBe("USAGE");
    });

    it("handles offline mode and stale metadata for gate detail", async () => {
        const paths = makeHome();

        const failOffline = await gateIn(paths, ["blue", "--offline"]);
        expect(failOffline.code).toBe(5);
        expect(failOffline.json.error.code).toBe("OFFLINE_NO_CACHE");

        const first = await gateIn(paths, ["blue"]);
        expect(first.code).toBe(0);
        expect(first.json.warnings).toEqual([]);

        const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
        const stale = await gateIn(paths, ["blue"], { now: later, network: {} });

        expect(stale.code).toBe(0);
        expect(stale.json.warnings.map(w => w.code)).toEqual(["STALE_METADATA"]);
        expect(stale.json.data.id).toBe("blue");

        // Overview never carries stale metadata
        const overviewLater = await gateIn(paths, [], { now: later, network: {} });
        expect(overviewLater.code).toBe(0);
        expect(overviewLater.json.warnings).toEqual([]);
    });
});
