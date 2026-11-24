import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatLocalTime } from "../../src/util/time";
import { commandIn, META_URL, NOW } from "../commandRun";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

function courseIn(
    paths: ReturnType<typeof makeHome>,
    args: string[],
    options?: Parameters<typeof commandIn>[3]
) {
    return commandIn(paths, "course", args, options);
}

describe("course list command", () => {
    it("lists all 22 courses statically without catalog or network", async () => {
        const paths = makeHome();
        const { code, json, requests } = await courseIn(paths, ["list"]);

        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expect(json.command).toBe("course list");
        expect(json.warnings).toEqual([]);
        expect(json.meta.dataAsOf).toBeUndefined();
        expect(json.meta.page).toEqual({
            total: 22,
            offset: 0,
            limit: 50,
            nextOffset: null,
        });
        expect(requests).toEqual([]);
        expect(existsSync(paths.home)).toBe(false);

        expect(json.data.items).toHaveLength(22);
        expect(json.data.items[0]).toEqual({
            id: 551001,
            name: "初段",
            mode: "段位认定",
            locked: false,
            unlockCourse: null,
            trackCount: 4,
            life: {
                initial: 350,
                recovery: 20,
                damage: { perfect: 0, great: 0, good: 2, miss: 5 },
            },
        });
        expect(json.data.items[21]).toEqual({
            id: 551112,
            name: "裏皆伝",
            mode: "真段位认定",
            locked: true,
            unlockCourse: { id: 551111, name: "真皆伝" },
            trackCount: 4,
            life: { initial: 10, recovery: 0, damage: { perfect: 0, great: 1, good: 3, miss: 10 } },
        });
    });

    it("supports paging with --limit and --offset", async () => {
        const paths = makeHome();
        const paged = await courseIn(paths, ["list", "--limit", "2", "--offset", "10"]);

        expect(paged.code).toBe(0);
        expect(paged.json.meta.page.nextOffset).toBe(12);
        expect(paged.json.data.items.map((c: { name: string }) => c.name)).toEqual([
            "真初段",
            "真二段",
        ]);
        expect(paged.json.data.items[0].unlockCourse).toEqual({ id: 551010, name: "十段" });
        expect(paged.json.data.items[1].unlockCourse).toEqual({ id: 551010, name: "十段" });

        const lastPage = await courseIn(paths, ["list", "--limit", "5", "--offset", "20"]);
        expect(lastPage.code).toBe(0);
        expect(lastPage.json.meta.page.nextOffset).toBeNull();
        expect(lastPage.json.data.items.map((c: { name: string }) => c.name)).toEqual([
            "真皆伝",
            "裏皆伝",
        ]);
    });

    it("filters fields with --fields", async () => {
        const paths = makeHome();
        const { code, json } = await courseIn(paths, [
            "list",
            "--fields",
            "name,unlockCourse",
            "--limit",
            "2",
            "--offset",
            "10",
        ]);

        expect(code).toBe(0);
        expect(json.data.items).toEqual([
            { name: "真初段", unlockCourse: { id: 551010, name: "十段" } },
            { name: "真二段", unlockCourse: { id: 551010, name: "十段" } },
        ]);
    });

    it("formats output as TSV with --format tsv", async () => {
        const paths = makeHome();
        const { code, stdout } = await courseIn(paths, [
            "list",
            "--limit",
            "3",
            "--fields",
            "name,life.initial,life.recovery",
            "--format",
            "tsv",
        ]);

        expect(code).toBe(0);
        expect(stdout).toBe(
            "name\tlife.initial\tlife.recovery\n初段\t350\t20\n二段\t350\t20\n三段\t600\t50\n"
        );
    });

    it("works in offline mode with an empty home", async () => {
        const paths = makeHome();
        const { code, json, requests } = await courseIn(paths, ["list", "--offline"]);

        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expect(requests).toEqual([]);
    });
});

describe("course show command", () => {
    it("shows 十段 with missing tracks and fetches only SaltMeta on first run", async () => {
        const paths = makeHome();
        const { code, json, requests } = await courseIn(paths, ["show", "十段"]);

        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expect(json.command).toBe("course show");
        expect(json.warnings).toEqual([]);
        expect(json.meta.dataAsOf.catalog).toBe(formatLocalTime(NOW));
        expect(requests.map(r => r.url)).toEqual([META_URL]);

        expect(json.data.id).toBe(551010);
        expect(json.data.name).toBe("十段");
        expect(json.data.mode).toBe("段位认定");
        expect(json.data.locked).toBe(false);
        expect(json.data.unlockCourse).toBeNull();
        expect(json.data.trackCount).toBe(4);
        expect(json.data.life).toEqual({
            initial: 900,
            recovery: 30,
            damage: { perfect: 0, great: 2, good: 2, miss: 5 },
        });

        expect(json.data.tracks).toEqual([]);
        expect(json.data.missing).toEqual([
            {
                track: 1,
                chartKey: "840-3",
                musicId: 840,
                title: "Imperishable Night 2006 (2016 Refine)",
                difficulty: "MASTER",
            },
            {
                track: 2,
                chartKey: "11207-3",
                musicId: 11207,
                title: "Ether Strike",
                difficulty: "MASTER",
            },
            {
                track: 3,
                chartKey: "11412-3",
                musicId: 11412,
                title: "初音天地開闢神話",
                difficulty: "MASTER",
            },
            {
                track: 4,
                chartKey: "227-3",
                musicId: 227,
                title: "Garakuta Doll Play",
                difficulty: "MASTER",
            },
        ]);
    });

    it("shows 初段 with track 1 present in the fixture catalog", async () => {
        const paths = makeHome();
        const { code, json } = await courseIn(paths, ["show", "初段"]);

        expect(code).toBe(0);
        expect(Object.keys(json.data.tracks[0]).slice(0, 2)).toEqual(["track", "chartKey"]);
        expect(json.data.tracks).toEqual([
            {
                track: 1,
                chartKey: "10256-0",
                musicId: 10256,
                title: "いーあるふぁんくらぶ",
                type: "DX",
                difficulty: "BASIC",
                level: "2",
                constant: 2,
                fitConstant: null,
                version: "舞萌DX",
                score: null,
                b50: null,
            },
        ]);
        expect(json.data.missing).toEqual([
            {
                track: 2,
                chartKey: "11052-0",
                musicId: 11052,
                title: "グリーンライツ・セレナーデ",
                difficulty: "BASIC",
            },
            {
                track: 3,
                chartKey: "10319-0",
                musicId: 10319,
                title: "幻想のサテライト",
                difficulty: "BASIC",
            },
            {
                track: 4,
                chartKey: "617-0",
                musicId: 617,
                title: "オトヒメモリー☆ウタゲーション",
                difficulty: "BASIC",
            },
        ]);
    });

    it("shows 真二段 with track 3 present and unlock requirements", async () => {
        const paths = makeHome();
        const { code, json } = await courseIn(paths, ["show", "真二段"]);

        expect(code).toBe(0);
        expect(json.data.locked).toBe(true);
        expect(json.data.unlockCourse).toEqual({ id: 551010, name: "十段" });
        expect(json.data.tracks).toEqual([
            {
                track: 3,
                chartKey: "191-2",
                musicId: 191,
                title: "脳漿炸裂ガール",
                type: "SD",
                difficulty: "EXPERT",
                level: "12+",
                constant: 12.7,
                fitConstant: null,
                version: "maimai GreeN",
                score: null,
                b50: null,
            },
        ]);
        expect(json.data.missing).toEqual([
            {
                track: 1,
                chartKey: "791-3",
                musicId: 791,
                title: "ロールプレイングゲーム",
                difficulty: "MASTER",
            },
            {
                track: 2,
                chartKey: "11199-3",
                musicId: 11199,
                title: "悪戯センセーション",
                difficulty: "MASTER",
            },
            {
                track: 4,
                chartKey: "11532-3",
                musicId: 11532,
                title: "ヱデン",
                difficulty: "MASTER",
            },
        ]);
    });

    it("shows 裏皆伝 by id with four missing tracks and difficulty labels", async () => {
        const paths = makeHome();
        const { code, json } = await courseIn(paths, ["show", "551112"]);

        expect(code).toBe(0);
        expect(json.data.name).toBe("裏皆伝");
        expect(json.data.unlockCourse).toEqual({ id: 551111, name: "真皆伝" });
        expect(json.data.tracks).toEqual([]);
        expect(json.data.missing.map((m: { difficulty: string }) => m.difficulty)).toEqual([
            "Re:MASTER",
            "MASTER",
            "MASTER",
            "Re:MASTER",
        ]);
    });

    it("resolves unique partial names and handles ambiguous/not found names", async () => {
        const paths = makeHome();

        const unique = await courseIn(paths, ["show", "真九"]);
        expect(unique.code).toBe(0);
        expect(unique.json.data.id).toBe(551109);
        expect(unique.json.data.name).toBe("真九段");

        // A home of their own: with a catalog already cached, "nothing was fetched" proves nothing.
        const ambigPaths = makeHome();
        const ambig = await courseIn(ambigPaths, ["show", "九"]);
        expect(ambig.code).toBe(3);
        expect(ambig.json.error.code).toBe("AMBIGUOUS_REF");
        expect(ambig.json.error.candidates?.map(c => c.ref)).toEqual(["九段", "真九段"]);
        expect(ambig.requests).toEqual([]);
        expect(existsSync(ambigPaths.home)).toBe(false);

        const notFoundPaths = makeHome();
        const notFound = await courseIn(notFoundPaths, ["show", "十一段"]);
        expect(notFound.code).toBe(3);
        expect(notFound.json.error.code).toBe("NOT_FOUND");
        expect(notFound.requests).toEqual([]);
        expect(existsSync(notFoundPaths.home)).toBe(false);

        const noArg = await courseIn(makeHome(), ["show"]);
        expect(noArg.code).toBe(2);
        expect(noArg.json.error.code).toBe("USAGE");
    });

    it("fails with OFFLINE_NO_CACHE when offline and cache is empty", async () => {
        const paths = makeHome();
        const result = await courseIn(paths, ["show", "十段", "--offline"]);

        expect(result.code).toBe(5);
        expect(result.json.error.code).toBe("OFFLINE_NO_CACHE");
    });

    it("uses cached data and reports STALE_METADATA warning when refresh fails", async () => {
        const paths = makeHome();

        const first = await courseIn(paths, ["show", "初段"]);
        expect(first.code).toBe(0);
        expect(first.json.warnings).toEqual([]);

        const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
        const stale = await courseIn(paths, ["show", "初段"], { now: later, network: {} });

        expect(stale.code).toBe(0);
        expect(stale.json.warnings.map(w => w.code)).toEqual(["STALE_METADATA"]);
        expect(stale.json.data.tracks).toHaveLength(1);
        expect(stale.json.data.tracks[0].chartKey).toBe("10256-0");
    });
});
