import type { ChartRow } from "../../src/catalog/chartRow";
import type { PrintedOutput } from "../commandRun";
import { characters } from "@core/collection/static";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { describe, expect, it } from "vitest";
import { commandIn, LXNS_URL, META_URL, NOW, routes } from "../commandRun";
import { jsonResponse } from "../mockHttp";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

const plate6101Keys = [
    "58-3",
    "30-3",
    "8-3",
    "9-3",
    "17-3",
    "58-2",
    "30-2",
    "8-2",
    "9-2",
    "17-2",
    "58-1",
    "30-1",
    "8-1",
    "9-1",
    "17-1",
    "58-0",
    "30-0",
    "8-0",
    "9-0",
    "17-0",
];

const plate6104Keys = [
    "115-3",
    "188-3",
    "191-3",
    "256-3",
    "115-2",
    "188-2",
    "191-2",
    "256-2",
    "115-1",
    "188-1",
    "191-1",
    "256-1",
    "115-0",
    "188-0",
    "191-0",
    "256-0",
];

function keysOf(res: { json: PrintedOutput }): string[] {
    return (res.json.data.items as ChartRow[]).map(item => item.chartKey);
}

function docWith(renames: Record<number, number>) {
    const doc = getFixtureSaltMetaCompacted();
    for (const entry of doc.musics as unknown as [number, ...unknown[]][]) {
        if (entry[0] in renames) {
            entry[0] = renames[entry[0]];
        }
    }
    return doc;
}

describe("charts command gate, course, plate and collection filters", () => {
    describe("fixture course and gate cases", () => {
        it("filters by course and respects diff, level, and sort options", async () => {
            const paths = makeHome();

            const resChu = await commandIn(paths, "charts", ["--course", "初段"]);
            expect(resChu.code).toBe(0);
            expect(resChu.json.ok).toBe(true);
            expect(keysOf(resChu)).toEqual(["10256-0"]);
            expect(resChu.json.meta.page.total).toBe(1);
            expect(resChu.json.meta.dataAsOf.catalog).toBeDefined();
            expect(resChu.json.meta.dataAsOf.collections).toBeUndefined();
            expect(resChu.requests.map(r => r.url)).toEqual([META_URL]);

            const res551001 = await commandIn(paths, "charts", ["--course", "551001"]);
            expect(res551001.code).toBe(0);
            expect(res551001.json.ok).toBe(true);
            expect(keysOf(res551001)).toEqual(["10256-0"]);
            expect(res551001.json.meta.page.total).toBe(1);

            const resSortConst = await commandIn(paths, "charts", [
                "--course",
                "初段",
                "--sort",
                "constant",
            ]);
            expect(resSortConst.code).toBe(0);
            expect(resSortConst.json.ok).toBe(true);
            expect(keysOf(resSortConst)).toEqual(["10256-0"]);
            expect(resSortConst.json.meta.page.total).toBe(1);

            const resAsc = await commandIn(paths, "charts", ["--course", "初段", "--asc"]);
            expect(resAsc.code).toBe(0);
            expect(resAsc.json.ok).toBe(true);
            expect(keysOf(resAsc)).toEqual(["10256-0"]);
            expect(resAsc.json.meta.page.total).toBe(1);

            const resZhenEr = await commandIn(paths, "charts", ["--course", "真二段"]);
            expect(resZhenEr.code).toBe(0);
            expect(resZhenEr.json.ok).toBe(true);
            expect(keysOf(resZhenEr)).toEqual(["191-2"]);
            expect(resZhenEr.json.meta.page.total).toBe(1);

            const resShi = await commandIn(paths, "charts", ["--course", "十段"]);
            expect(resShi.code).toBe(0);
            expect(resShi.json.ok).toBe(true);
            expect(keysOf(resShi)).toEqual([]);
            expect(resShi.json.meta.page.total).toBe(0);

            const resMas = await commandIn(paths, "charts", ["--course", "初段", "--diff", "mas"]);
            expect(resMas.code).toBe(0);
            expect(resMas.json.ok).toBe(true);
            expect(keysOf(resMas)).toEqual([]);
            expect(resMas.json.meta.page.total).toBe(0);

            const resBas = await commandIn(paths, "charts", ["--course", "初段", "--diff", "bas"]);
            expect(resBas.code).toBe(0);
            expect(resBas.json.ok).toBe(true);
            expect(keysOf(resBas)).toEqual(["10256-0"]);
            expect(resBas.json.meta.page.total).toBe(1);

            const resLvl2 = await commandIn(paths, "charts", ["--course", "初段", "--level", "2"]);
            expect(resLvl2.code).toBe(0);
            expect(resLvl2.json.ok).toBe(true);
            expect(keysOf(resLvl2)).toEqual(["10256-0"]);
            expect(resLvl2.json.meta.page.total).toBe(1);

            const resLvl3 = await commandIn(paths, "charts", ["--course", "初段", "--level", "3"]);
            expect(resLvl3.code).toBe(0);
            expect(resLvl3.json.ok).toBe(true);
            expect(keysOf(resLvl3)).toEqual([]);
            expect(resLvl3.json.meta.page.total).toBe(0);
        });

        it("filters by gate and returns empty for fixture", async () => {
            const paths = makeHome();
            const resGate = await commandIn(paths, "charts", ["--gate", "blue"]);
            expect(resGate.code).toBe(0);
            expect(resGate.json.ok).toBe(true);
            expect(keysOf(resGate)).toEqual([]);
            expect(resGate.json.meta.page.total).toBe(0);
            expect(resGate.requests.map(r => r.url)).toEqual([META_URL]);
        });

        it("fails before any network request for invalid course or gate arguments", async () => {
            const paths = makeHome();

            const resJie = await commandIn(paths, "charts", ["--course", "皆伝"]);
            expect(resJie.code).toBe(3);
            expect(resJie.json.ok).toBe(false);
            expect(resJie.json.error.code).toBe("AMBIGUOUS_REF");
            expect(resJie.json.error.candidates?.map(c => c.ref)).toEqual(["真皆伝", "裏皆伝"]);
            expect(resJie.requests).toEqual([]);

            const resNone = await commandIn(paths, "charts", ["--course", "不存在的段位"]);
            expect(resNone.code).toBe(3);
            expect(resNone.json.ok).toBe(false);
            expect(resNone.json.error.code).toBe("NOT_FOUND");
            expect(resNone.requests).toEqual([]);

            const resZhiMen = await commandIn(paths, "charts", ["--gate", "之门"]);
            expect(resZhiMen.code).toBe(3);
            expect(resZhiMen.json.ok).toBe(false);
            expect(resZhiMen.json.error.code).toBe("AMBIGUOUS_REF");
            expect(resZhiMen.json.error.candidates?.map(c => c.ref)).toEqual([
                "blue",
                "white",
                "purple",
                "black",
                "yellow",
                "red",
                "hope",
            ]);
            expect(resZhiMen.requests).toEqual([]);

            const resGateNotFound = await commandIn(paths, "charts", ["--gate", "zzzzzzzz"]);
            expect(resGateNotFound.code).toBe(3);
            expect(resGateNotFound.json.ok).toBe(false);
            expect(resGateNotFound.json.error.code).toBe("NOT_FOUND");
            expect(resGateNotFound.json.error.candidates?.map(c => c.ref)).toEqual([
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
            ]);
            expect(resGateNotFound.requests).toEqual([]);

            const resAscDesc = await commandIn(paths, "charts", [
                "--gate",
                "zzzzzzzz",
                "--asc",
                "--desc",
            ]);
            expect(resAscDesc.code).toBe(2);
            expect(resAscDesc.json.ok).toBe(false);
            expect(resAscDesc.json.error.code).toBe("USAGE");
            expect(resAscDesc.requests).toEqual([]);
        });
    });

    describe("fixture plate cases", () => {
        it("filters by version plates and fetches collections", async () => {
            const paths = makeHome();

            const resZhenJi = await commandIn(paths, "charts", ["--plate", "真極"]);
            expect(resZhenJi.code).toBe(0);
            expect(resZhenJi.json.ok).toBe(true);
            expect(keysOf(resZhenJi)).toEqual(plate6101Keys);
            expect(resZhenJi.json.meta.page.total).toBe(20);
            expect(resZhenJi.json.meta.dataAsOf.catalog).toBeDefined();
            expect(resZhenJi.json.meta.dataAsOf.collections).toBeDefined();

            const requestedUrls = resZhenJi.requests.map(r => r.url);
            expect(requestedUrls).toContain(META_URL);
            expect(requestedUrls).toContain(`${LXNS_URL}/api/v0/maimai/trophy/list?required=true`);
            expect(requestedUrls).toContain(`${LXNS_URL}/api/v0/maimai/icon/list?required=true`);
            expect(requestedUrls).toContain(`${LXNS_URL}/api/v0/maimai/plate/list?required=true`);
            expect(requestedUrls).toContain(`${LXNS_URL}/api/v0/maimai/frame/list?required=true`);

            const resDiffMas = await commandIn(paths, "charts", [
                "--plate",
                "真極",
                "--diff",
                "mas",
            ]);
            expect(resDiffMas.code).toBe(0);
            expect(resDiffMas.json.ok).toBe(true);
            expect(keysOf(resDiffMas)).toEqual(["58-3", "30-3", "8-3", "9-3", "17-3"]);
            expect(resDiffMas.json.meta.page.total).toBe(5);

            for (const name of ["超極", "超将", "超神", "超舞舞"]) {
                const res = await commandIn(paths, "charts", ["--plate", name]);
                expect(res.code).toBe(0);
                expect(res.json.ok).toBe(true);
                expect(keysOf(res)).toEqual(plate6104Keys);
                expect(res.json.meta.page.total).toBe(16);
            }

            for (const name of ["真神", "真舞舞"]) {
                const res = await commandIn(paths, "charts", ["--plate", name]);
                expect(res.code).toBe(0);
                expect(res.json.ok).toBe(true);
                expect(keysOf(res)).toEqual(plate6101Keys);
                expect(res.json.meta.page.total).toBe(20);
            }

            const resChaoAmbiguous = await commandIn(paths, "charts", ["--plate", "超"]);
            expect(resChaoAmbiguous.code).toBe(3);
            expect(resChaoAmbiguous.json.ok).toBe(false);
            expect(resChaoAmbiguous.json.error.code).toBe("AMBIGUOUS_REF");
            expect(resChaoAmbiguous.json.error.candidates?.map(c => c.ref)).toEqual([
                "超極",
                "超将",
                "超神",
                "超舞舞",
            ]);

            const resBaZhe = await commandIn(paths, "charts", ["--plate", "覇者"]);
            expect(resBaZhe.code).toBe(3);
            expect(resBaZhe.json.ok).toBe(false);
            expect(resBaZhe.json.error.code).toBe("NOT_FOUND");
            expect(resBaZhe.json.error.message).toContain("找不到牌子「覇者」");

            const resXiong = await commandIn(paths, "charts", ["--plate", "熊"]);
            expect(resXiong.code).toBe(3);
            expect(resXiong.json.ok).toBe(false);
            expect(resXiong.json.error.code).toBe("NOT_FOUND");
        });
    });

    describe("fixture collection cases", () => {
        it("filters by collection reference or name", async () => {
            const paths = makeHome();

            const resTitle5102 = await commandIn(paths, "charts", ["--collection", "title:5102"]);
            expect(resTitle5102.code).toBe(0);
            expect(resTitle5102.json.ok).toBe(true);
            expect(keysOf(resTitle5102)).toEqual(["10146-3", "10146-2", "10146-1", "10146-0"]);
            expect(resTitle5102.json.meta.page.total).toBe(4);

            const resTitleUpper = await commandIn(paths, "charts", ["--collection", "TITLE:5102"]);
            expect(resTitleUpper.code).toBe(0);
            expect(keysOf(resTitleUpper)).toEqual(keysOf(resTitle5102));

            const resFrame = await commandIn(paths, "charts", ["--collection", "frame:109101"]);
            expect(resFrame.code).toBe(0);
            expect(resFrame.json.ok).toBe(true);
            expect(keysOf(resFrame)).toEqual([
                "10191-3",
                "10256-3",
                "10191-2",
                "10256-2",
                "10191-1",
                "10256-1",
                "10191-0",
                "10256-0",
            ]);
            expect(resFrame.json.meta.page.total).toBe(8);

            const resPlate6148 = await commandIn(paths, "charts", ["--collection", "plate:6148"]);
            expect(resPlate6148.code).toBe(0);
            expect(resPlate6148.json.ok).toBe(true);
            expect(keysOf(resPlate6148)).toEqual([
                "70-4",
                "58-4",
                "256-4",
                "17-4",
                ...plate6101Keys,
            ]);
            expect(resPlate6148.json.meta.page.total).toBe(24);

            const resPlate6148Rem = await commandIn(paths, "charts", [
                "--collection",
                "plate:6148",
                "--diff",
                "rem",
            ]);
            expect(resPlate6148Rem.code).toBe(0);
            expect(resPlate6148Rem.json.ok).toBe(true);
            expect(keysOf(resPlate6148Rem)).toEqual(["70-4", "58-4", "256-4", "17-4"]);
            expect(resPlate6148Rem.json.meta.page.total).toBe(4);

            const resBaZhe = await commandIn(paths, "charts", ["--collection", "覇者"]);
            expect(resBaZhe.code).toBe(0);
            expect(keysOf(resBaZhe)).toEqual(keysOf(resPlate6148));

            const resPlate409506 = await commandIn(paths, "charts", [
                "--collection",
                "plate:409506",
            ]);
            expect(resPlate409506.code).toBe(0);
            expect(resPlate409506.json.ok).toBe(true);
            expect(keysOf(resPlate409506)).toEqual([]);
            expect(resPlate409506.json.meta.page.total).toBe(0);

            const resTitleNotFound = await commandIn(paths, "charts", [
                "--collection",
                "title:999999",
            ]);
            expect(resTitleNotFound.code).toBe(3);
            expect(resTitleNotFound.json.ok).toBe(false);
            expect(resTitleNotFound.json.error.code).toBe("NOT_FOUND");
            expect(resTitleNotFound.json.error.message).toContain("title:999999");

            const resDefaultAmbiguous = await commandIn(paths, "charts", [
                "--collection",
                "デフォルト",
            ]);
            expect(resDefaultAmbiguous.code).toBe(3);
            expect(resDefaultAmbiguous.json.ok).toBe(false);
            expect(resDefaultAmbiguous.json.error.code).toBe("AMBIGUOUS_REF");
            expect(resDefaultAmbiguous.json.error.candidates?.map(c => c.ref)).toEqual([
                "plate:1",
                "icon:1",
                "frame:1",
            ]);

            const resRandomAmbiguous = await commandIn(paths, "charts", [
                "--collection",
                "从整体中随机选择",
            ]);
            expect(resRandomAmbiguous.code).toBe(3);
            expect(resRandomAmbiguous.json.ok).toBe(false);
            expect(resRandomAmbiguous.json.error.code).toBe("AMBIGUOUS_REF");
            expect(resRandomAmbiguous.json.error.candidates?.map(c => c.ref)).toEqual([
                "plate:2",
                "title:2",
                "icon:2",
                "frame:2",
            ]);
        });

        it("gives an empty result, not an error, when the songs asked for have no chart", async () => {
            const paths = makeHome();

            // 千本桜 asks for a song that has no chart in the CN catalog, so nothing can match.
            for (const text of ["title:5101", "千本桜"]) {
                const res = await commandIn(paths, "charts", ["--collection", text]);
                expect(res.code).toBe(0);
                expect(res.json.ok).toBe(true);
                expect(keysOf(res)).toEqual([]);
                expect(res.json.meta.page.total).toBe(0);
            }
        });

        it("rejects a collection whose conditions name no song with USAGE", async () => {
            const paths = makeHome();
            const character = characters[0];

            const cases = [
                { text: "title:1", name: "新人出道", ref: "title:1" },
                { text: "彩虹评级熊！", name: "彩虹评级熊！", ref: "title:20" },
                { text: "plate:101", name: "はじまりのちほー", ref: "plate:101" },
                { text: "icon:1", name: "デフォルト", ref: "icon:1" },
                { text: "frame:2", name: "从整体中随机选择", ref: "frame:2" },
                {
                    text: `character:${character.id}`,
                    name: character.name,
                    ref: `character:${character.id}`,
                },
            ];
            for (const { text, name, ref } of cases) {
                const res = await commandIn(paths, "charts", ["--collection", text]);
                expect(res.code).toBe(2);
                expect(res.json.ok).toBe(false);
                expect(res.json.error.code).toBe("USAGE");
                expect(res.json.error.message).toBe(
                    `收藏品「${name}」（${ref}）的获取条件里没有曲目，没有谱面可选`
                );
            }
        });
    });

    describe("doctored LXNS cases", () => {
        it("rejects a version plate whose conditions name no song with USAGE", async () => {
            const paths = makeHome();
            const lists = getFixtureLXNSCollections();
            // A version plate needs a requirement to be one, but this one names no song.
            lists.plates.find(item => item.id === 6101)!.required = [{ difficulties: [3] }];
            const net = routes({
                [`${LXNS_URL}/api/v0/maimai/plate/list?required=true`]: jsonResponse({
                    plates: lists.plates,
                }),
            });

            const res = await commandIn(paths, "charts", ["--plate", "真極"], { network: net });
            expect(res.code).toBe(2);
            expect(res.json.ok).toBe(false);
            expect(res.json.error.code).toBe("USAGE");
            expect(res.json.error.message).toBe("牌子「真極」的获取条件里没有曲目，没有谱面可选");

            // The other plates are untouched.
            const other = await commandIn(paths, "charts", ["--plate", "超極", "--limit", "1"], {
                network: net,
            });
            expect(other.code).toBe(0);
            expect(keysOf(other)).toEqual(["115-3"]);
        });
    });

    describe("intersections of multiple sets and filters", () => {
        it("combines plate, collection, diff, and level correctly", async () => {
            const paths = makeHome();

            const resIntersect = await commandIn(paths, "charts", [
                "--plate",
                "真極",
                "--collection",
                "plate:6148",
            ]);
            expect(resIntersect.code).toBe(0);
            expect(resIntersect.json.ok).toBe(true);
            expect(keysOf(resIntersect)).toEqual(plate6101Keys);
            expect(resIntersect.json.meta.page.total).toBe(20);

            const resDisjoint = await commandIn(paths, "charts", [
                "--plate",
                "超極",
                "--collection",
                "frame:109101",
            ]);
            expect(resDisjoint.code).toBe(0);
            expect(resDisjoint.json.ok).toBe(true);
            expect(keysOf(resDisjoint)).toEqual([]);
            expect(resDisjoint.json.meta.page.total).toBe(0);

            const resCombo = await commandIn(paths, "charts", [
                "--plate",
                "真極",
                "--diff",
                "mas",
                "--level",
                "10+",
            ]);
            expect(resCombo.code).toBe(0);
            expect(resCombo.json.ok).toBe(true);
            expect(keysOf(resCombo)).toEqual(["17-3"]);
            expect(resCombo.json.meta.page.total).toBe(1);
        });
    });

    describe("offline mode and stale metadata", () => {
        it("handles offline cache presence for catalog vs collections", async () => {
            const paths = makeHome();

            // Populate catalog cache
            const init = await commandIn(paths, "charts", ["--limit", "1"]);
            expect(init.code).toBe(0);

            // Course requires only catalog cache -> succeeds offline
            const offlineCourse = await commandIn(paths, "charts", [
                "--course",
                "初段",
                "--offline",
            ]);
            expect(offlineCourse.code).toBe(0);
            expect(offlineCourse.json.ok).toBe(true);
            expect(keysOf(offlineCourse)).toEqual(["10256-0"]);
            expect(offlineCourse.json.meta.dataAsOf.collections).toBeUndefined();

            // Plate requires collections cache, which is not cached yet -> fails offline
            const offlinePlate = await commandIn(paths, "charts", ["--plate", "真極", "--offline"]);
            expect(offlinePlate.code).toBe(5);
            expect(offlinePlate.json.ok).toBe(false);
            expect(offlinePlate.json.error.code).toBe("OFFLINE_NO_CACHE");
        });

        it("warns about stale metadata for both catalog and collections", async () => {
            const paths = makeHome();

            const init = await commandIn(paths, "charts", ["--plate", "真極", "--limit", "2"]);
            expect(init.code).toBe(0);
            expect(init.json.ok).toBe(true);

            const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
            const stale = await commandIn(paths, "charts", ["--plate", "真極", "--limit", "2"], {
                now: later,
                network: {},
            });
            expect(stale.code).toBe(0);
            expect(stale.json.ok).toBe(true);
            expect(stale.json.warnings.map(w => w.code)).toEqual([
                "STALE_METADATA",
                "STALE_METADATA",
            ]);
            expect(stale.json.meta.dataAsOf.catalog).toBeDefined();
            expect(stale.json.meta.dataAsOf.collections).toBeDefined();
            expect(keysOf(stale)).toEqual(["58-3", "30-3"]);
        });
    });

    describe("help text", () => {
        it("mentions new filter options in --help", async () => {
            const paths = makeHome();
            const { code, stdout } = await commandIn(paths, "charts", ["--help"]);
            expect(code).toBe(0);
            expect(stdout).toContain("--gate");
            expect(stdout).toContain("--course");
            expect(stdout).toContain("--plate");
            expect(stdout).toContain("--collection");
        });
    });

    describe("doctored SaltMeta cases", () => {
        it("combines a gate and a course", async () => {
            const paths = makeHome();
            // 11612 is a key song of the white gate and the third track of 裏皆伝.
            const net = routes({ [META_URL]: jsonResponse(docWith({ 1726: 1612 })) });

            const gateOnly = await commandIn(paths, "charts", ["--gate", "white"], {
                network: net,
            });
            expect(keysOf(gateOnly)).toEqual(["11612-3", "11612-2", "11612-1", "11612-0"]);

            const courseOnly = await commandIn(paths, "charts", ["--course", "裏皆伝"], {
                network: net,
            });
            expect(keysOf(courseOnly)).toEqual(["11612-3"]);

            const both = await commandIn(
                paths,
                "charts",
                ["--gate", "white", "--course", "裏皆伝"],
                {
                    network: net,
                }
            );
            expect(both.code).toBe(0);
            expect(keysOf(both)).toEqual(["11612-3"]);

            const disjoint = await commandIn(
                paths,
                "charts",
                ["--gate", "blue", "--course", "裏皆伝"],
                { network: net }
            );
            expect(disjoint.code).toBe(0);
            expect(keysOf(disjoint)).toEqual([]);
        });

        it("handles gate selection on doctored SaltMeta", async () => {
            const paths = makeHome();
            const doc = docWith({ 1726: 1009 });
            const net = routes({ [META_URL]: jsonResponse(doc) });

            const resGate = await commandIn(paths, "charts", ["--gate", "blue"], {
                network: net,
            });
            expect(resGate.code).toBe(0);
            expect(resGate.json.ok).toBe(true);
            expect(keysOf(resGate)).toEqual(["11009-3", "11009-2", "11009-1", "11009-0"]);
            expect(resGate.json.meta.dataAsOf.collections).toBeUndefined();
            expect(resGate.requests.map(r => r.url)).toEqual([META_URL]);

            const resGateLanMen = await commandIn(
                paths,
                "charts",
                ["--gate", "蓝门", "--diff", "mas"],
                { network: net }
            );
            expect(resGateLanMen.code).toBe(0);
            expect(resGateLanMen.json.ok).toBe(true);
            expect(keysOf(resGateLanMen)).toEqual(["11009-3"]);

            const resGateLan = await commandIn(paths, "charts", ["--gate", "蓝", "--diff", "mas"], {
                network: net,
            });
            expect(resGateLan.code).toBe(0);
            expect(resGateLan.json.ok).toBe(true);
            expect(keysOf(resGateLan)).toEqual(["11009-3"]);

            const resGateLevel = await commandIn(
                paths,
                "charts",
                ["--gate", "blue", "--level", "13+"],
                { network: net }
            );
            expect(resGateLevel.code).toBe(0);
            expect(resGateLevel.json.ok).toBe(true);
            expect(keysOf(resGateLevel)).toEqual(["11009-3"]);

            const resGateUtage = await commandIn(
                paths,
                "charts",
                ["--gate", "blue", "--diff", "utage"],
                { network: net }
            );
            expect(resGateUtage.code).toBe(0);
            expect(resGateUtage.json.ok).toBe(true);
            expect(keysOf(resGateUtage)).toEqual([]);

            const resGateWhite = await commandIn(paths, "charts", ["--gate", "white"], {
                network: net,
            });
            expect(resGateWhite.code).toBe(0);
            expect(resGateWhite.json.ok).toBe(true);
            expect(keysOf(resGateWhite)).toEqual([]);

            const resGatePlate = await commandIn(
                paths,
                "charts",
                ["--gate", "blue", "--plate", "真極"],
                { network: net }
            );
            expect(resGatePlate.code).toBe(0);
            expect(resGatePlate.json.ok).toBe(true);
            expect(keysOf(resGatePlate)).toEqual([]);
        });

        it("handles course selection and sorts on doctored SaltMeta", async () => {
            const paths = makeHome();
            const doc = docWith({ 1726: 1207, 2025: 1412, 146: 840, 8: 227 });
            const net = routes({ [META_URL]: jsonResponse(doc) });

            const playOrder = ["840-3", "11207-3", "11412-3", "227-3"];

            const resShi = await commandIn(paths, "charts", ["--course", "十段"], {
                network: net,
            });
            expect(resShi.code).toBe(0);
            expect(resShi.json.ok).toBe(true);
            expect(keysOf(resShi)).toEqual(playOrder);

            const resAsc = await commandIn(paths, "charts", ["--course", "十段", "--asc"], {
                network: net,
            });
            expect(resAsc.code).toBe(0);
            expect(resAsc.json.ok).toBe(true);
            expect(keysOf(resAsc)).toEqual(["227-3", "11412-3", "11207-3", "840-3"]);

            const resSortConst = await commandIn(
                paths,
                "charts",
                ["--course", "十段", "--sort", "constant"],
                { network: net }
            );
            expect(resSortConst.code).toBe(0);
            expect(resSortConst.json.ok).toBe(true);
            expect(keysOf(resSortConst)).toEqual(["11412-3", "11207-3", "840-3", "227-3"]);

            const resSortConstAsc = await commandIn(
                paths,
                "charts",
                ["--course", "十段", "--sort", "constant", "--asc"],
                { network: net }
            );
            expect(resSortConstAsc.code).toBe(0);
            expect(resSortConstAsc.json.ok).toBe(true);
            expect(keysOf(resSortConstAsc)).toEqual(["227-3", "840-3", "11207-3", "11412-3"]);

            const resSortVer = await commandIn(
                paths,
                "charts",
                ["--course", "十段", "--sort", "version"],
                { network: net }
            );
            expect(resSortVer.code).toBe(0);
            expect(resSortVer.json.ok).toBe(true);
            expect(keysOf(resSortVer)).toEqual(["11412-3", "11207-3", "840-3", "227-3"]);

            const resSortVerAsc = await commandIn(
                paths,
                "charts",
                ["--course", "十段", "--sort", "version", "--asc"],
                { network: net }
            );
            expect(resSortVerAsc.code).toBe(0);
            expect(resSortVerAsc.json.ok).toBe(true);
            expect(keysOf(resSortVerAsc)).toEqual(["227-3", "840-3", "11207-3", "11412-3"]);

            const res551010Mas = await commandIn(
                paths,
                "charts",
                ["--course", "551010", "--diff", "mas"],
                { network: net }
            );
            expect(res551010Mas.code).toBe(0);
            expect(res551010Mas.json.ok).toBe(true);
            expect(keysOf(res551010Mas)).toEqual(playOrder);

            const resDiffExp = await commandIn(
                paths,
                "charts",
                ["--course", "十段", "--diff", "exp"],
                { network: net }
            );
            expect(resDiffExp.code).toBe(0);
            expect(resDiffExp.json.ok).toBe(true);
            expect(keysOf(resDiffExp)).toEqual([]);

            const resAmbiguousShi = await commandIn(paths, "charts", ["--course", "十"], {
                network: net,
            });
            expect(resAmbiguousShi.code).toBe(3);
            expect(resAmbiguousShi.json.ok).toBe(false);
            expect(resAmbiguousShi.json.error.code).toBe("AMBIGUOUS_REF");
            expect(resAmbiguousShi.json.error.candidates?.map(c => c.ref)).toEqual([
                "十段",
                "真十段",
            ]);

            const resGroup = await commandIn(
                paths,
                "charts",
                ["--course", "十段", "--group-by", "difficulty"],
                { network: net }
            );
            expect(resGroup.code).toBe(0);
            expect(resGroup.json.ok).toBe(true);
            const groups = (
                resGroup.json.data as {
                    groups: { key: string; count: number; items: ChartRow[] }[];
                }
            ).groups;
            expect(groups).toHaveLength(1);
            expect(groups[0].key).toBe("MASTER");
            expect(groups[0].items.map(i => i.chartKey)).toEqual(playOrder);

            const resPage = await commandIn(
                paths,
                "charts",
                ["--course", "十段", "--limit", "2", "--offset", "1"],
                { network: net }
            );
            expect(resPage.code).toBe(0);
            expect(resPage.json.ok).toBe(true);
            expect(keysOf(resPage)).toEqual(["11207-3", "11412-3"]);
            expect(resPage.json.meta.page.offset).toBe(1);
            expect(resPage.json.meta.page.limit).toBe(2);
            expect(resPage.json.meta.page.nextOffset).toBe(3);
            expect(resPage.json.meta.page.total).toBe(4);
        });
    });
});
