import type { ChartRow } from "../../src/catalog/chartRow";
import type { RuntimePaths } from "../../src/runtime/paths";
import type { PrintedOutput } from "../commandRun";
import { createFixtureMusicList } from "@core/fixtures/saltmeta";
import { describe, expect, it } from "vitest";
import { commandIn, NOW } from "../commandRun";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

interface ChartsOutput extends Omit<PrintedOutput, "data"> {
    data: { items: ChartRow[] };
}

async function chartsIn(
    paths: RuntimePaths,
    args: string[],
    options?: Parameters<typeof commandIn>[3]
) {
    const res = await commandIn(paths, "charts", args, options);
    return res as unknown as {
        code: number;
        json: ChartsOutput;
        stdout: string;
        requests: { url: string }[];
    };
}

describe("saltnet charts command", () => {
    it("returns 50 items with default options, standard envelope and paging metadata", async () => {
        const paths = makeHome();
        const { code, json } = await chartsIn(paths, []);

        expect(code).toBe(0);
        expect(json.v).toBe(1);
        expect(json.ok).toBe(true);
        expect(json.command).toBe("charts");
        expect(json.warnings).toEqual([]);
        expect(json.meta.dataAsOf.catalog).toBeDefined();
        expect(json.meta.page).toEqual({
            total: 175,
            offset: 0,
            limit: 50,
            nextOffset: 50,
        });

        expect(json.data.items).toHaveLength(50);
        const first = json.data.items[0];
        expect(first).toEqual({
            chartKey: "131-4",
            musicId: 131,
            title: "Link",
            type: "SD",
            difficulty: "Re:MASTER",
            level: "13",
            constant: 13.5,
            fitConstant: first.fitConstant,
            version: "maimai PLUS",
            score: null,
            b50: null,
        });
        expect(typeof first.fitConstant === "number" || first.fitConstant === null).toBe(true);
    });

    it("supports paging with limit and offset, and rejects limit 0", async () => {
        const paths = makeHome();

        const { code, json } = await chartsIn(paths, ["--limit", "3", "--offset", "2"]);
        expect(code).toBe(0);
        expect(json.data.items.map(item => item.chartKey)).toEqual(["58-4", "115-4", "256-4"]);
        expect(json.meta.page).toEqual({
            total: 175,
            offset: 2,
            limit: 3,
            nextOffset: 5,
        });

        const { json: lastPage } = await chartsIn(paths, ["--offset", "170"]);
        expect(lastPage.data.items).toHaveLength(5);
        expect(lastPage.meta.page.nextOffset).toBeNull();

        const { code: limitZeroCode, json: limitZeroJson } = await chartsIn(paths, [
            "--limit",
            "0",
        ]);
        expect(limitZeroCode).toBe(2);
        expect(limitZeroJson.ok).toBe(false);
        expect(limitZeroJson.error.code).toBe("USAGE");
    });

    it("filters by level, constant, difficulty, version and search", async () => {
        const paths = makeHome();

        const { json: levelMas } = await chartsIn(paths, ["--level", "13+", "--diff", "mas"]);
        expect(levelMas.data.items.map(i => i.chartKey)).toEqual([
            "115-3",
            "283-3",
            "10030-3",
            "11726-3",
        ]);

        const { json: levelRem } = await chartsIn(paths, ["--level", "13..14", "--diff", "rem"]);
        expect(levelRem.data.items.map(i => i.chartKey)).toEqual([
            "131-4",
            "70-4",
            "58-4",
            "115-4",
            "146-4",
        ]);

        const { json: constMas } = await chartsIn(paths, [
            "--constant",
            "13.5..13.9",
            "--diff",
            "mas",
        ]);
        expect(constMas.data.items.map(i => i.chartKey)).toEqual([
            "115-3",
            "283-3",
            "10030-3",
            "11726-3",
        ]);

        const { json: constExact } = await chartsIn(paths, ["--constant", "12.8", "--diff", "mas"]);
        expect(constExact.data.items.map(i => i.chartKey)).toEqual([
            "650-3",
            "10188-3",
            "10044-3",
            "185-3",
            "10185-3",
            "10146-3",
        ]);

        const { json: diffAliases } = await chartsIn(paths, ["--diff", "紫,白", "--limit", "100"]);
        expect(diffAliases.data.items).toHaveLength(49);

        const { json: utage } = await chartsIn(paths, ["--diff", "utage"]);
        expect(utage.data.items).toHaveLength(8);
        for (const item of utage.data.items) {
            expect(item.type).toBe("DX");
            expect(item.difficulty).toBe("UTAGE");
            expect(item.constant).toBeNull();
            expect(item.fitConstant).toBeNull();
        }

        const { json: utageLevel } = await chartsIn(paths, ["--diff", "utage", "--level", "13"]);
        expect(utageLevel.data.items.map(i => i.chartKey)).toEqual(["110206-10", "110851-10"]);

        const { json: versionZhen } = await chartsIn(paths, ["--version", "真", "--limit", "100"]);
        expect(versionZhen.data.items).toHaveLength(49);
        for (const item of versionZhen.data.items) {
            expect(["maimai", "maimai PLUS"]).toContain(item.version);
        }

        const { json: versionDxUtage } = await chartsIn(paths, [
            "--version",
            "舞萌DX 2024",
            "--diff",
            "utage",
        ]);
        expect(versionDxUtage.data.items).toHaveLength(7);

        const { json: combo } = await chartsIn(paths, [
            "--version",
            "真",
            "--level",
            "13..",
            "--diff",
            "rem",
        ]);
        expect(combo.data.items.map(i => i.chartKey)).toEqual(["131-4", "70-4", "58-4", "146-4"]);

        const { json: searchTls } = await chartsIn(paths, ["--search", "True Love Song"]);
        expect(searchTls.data.items.map(i => i.chartKey)).toEqual(["8-3", "8-2", "8-1", "8-0"]);

        const nyainFixtureKeys = Object.values(createFixtureMusicList().musicList)
            .flatMap(m => m.charts)
            .filter(c => c.info.charter && c.info.charter.includes("ニャイン"))
            .map(c => `${c.music.id}-${c.info.grade}`);
        const { json: searchNyain } = await chartsIn(paths, ["--search", "ニャイン"]);
        expect(searchNyain.data.items.map(i => i.chartKey)).toEqual([
            "58-3",
            "30-3",
            "8-3",
            "9-3",
            "44-3",
            "256-3",
            "115-2",
            "146-2",
        ]);
        expect(new Set(searchNyain.data.items.map(i => i.chartKey))).toEqual(
            new Set(nyainFixtureKeys)
        );

        const { json: searchEmpty } = await chartsIn(paths, ["--search", "nonexistentquery"]);
        expect(searchEmpty.data.items).toEqual([]);
        expect(searchEmpty.meta.page.total).toBe(0);
        expect(searchEmpty.meta.page.nextOffset).toBeNull();
    });

    it("rejects invalid options with proper error codes and candidates", async () => {
        const paths = makeHome();

        const { code: codeLevelAbc, json: jsonLevelAbc } = await chartsIn(paths, [
            "--level",
            "abc",
        ]);
        expect(codeLevelAbc).toBe(2);
        expect(jsonLevelAbc.error.code).toBe("USAGE");

        const { code: codeReversed, json: jsonReversed } = await chartsIn(paths, [
            "--level",
            "14..13",
        ]);
        expect(codeReversed).toBe(2);
        expect(jsonReversed.error.code).toBe("USAGE");

        const { code: codeDiffFoo, json: jsonDiffFoo } = await chartsIn(paths, ["--diff", "foo"]);
        expect(codeDiffFoo).toBe(2);
        expect(jsonDiffFoo.error.code).toBe("USAGE");

        const { code: codeVerNotFound, json: jsonVerNotFound } = await chartsIn(paths, [
            "--version",
            "zzzz",
        ]);
        expect(codeVerNotFound).toBe(3);
        expect(jsonVerNotFound.error.code).toBe("NOT_FOUND");
        expect(jsonVerNotFound.error.candidates?.length).toBeGreaterThan(0);

        const { code: codeVerAmbiguous, json: jsonVerAmbiguous } = await chartsIn(paths, [
            "--version",
            "ree",
        ]);
        expect(codeVerAmbiguous).toBe(3);
        expect(jsonVerAmbiguous.error.code).toBe("AMBIGUOUS_REF");
        expect(jsonVerAmbiguous.error.candidates?.map(c => c.ref)).toEqual([
            "maimai GreeN",
            "maimai GreeN PLUS",
        ]);

        const { code: codeBlank, json: jsonBlank } = await chartsIn(paths, ["--search", ""]);
        expect(codeBlank).toBe(2);
        expect(jsonBlank.error.code).toBe("USAGE");
        expect(jsonBlank.error.message).toContain("--search");

        const { code: codeUnknown, json: jsonUnknown } = await chartsIn(paths, [
            "--no-such-option",
        ]);
        expect(codeUnknown).toBe(2);
        expect(jsonUnknown.error.code).toBe("USAGE");
    });

    it("supports field projection and TSV formatting", async () => {
        const paths = makeHome();

        const { json: projected } = await chartsIn(paths, ["--fields", "chartKey,level"]);
        for (const item of projected.data.items) {
            expect(Object.keys(item)).toEqual(["chartKey", "level"]);
        }

        const { stdout } = await chartsIn(paths, [
            "--fields",
            "chartKey,level",
            "--format",
            "tsv",
            "--limit",
            "3",
        ]);
        const lines = stdout.trimEnd().split("\n");
        expect(lines[0]).toBe("chartKey\tlevel");
        expect(lines).toHaveLength(4);
        expect(lines[1]).toBe("131-4\t13");
    });

    it("handles offline mode and stale metadata warnings", async () => {
        const paths = makeHome();

        const failOffline = await chartsIn(paths, ["--offline"]);
        expect(failOffline.code).toBe(5);
        expect(failOffline.json.error.code).toBe("OFFLINE_NO_CACHE");

        await chartsIn(paths, []);

        const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
        const stale = await chartsIn(paths, [], { now: later, network: {} });
        expect(stale.code).toBe(0);
        expect(stale.json.ok).toBe(true);
        expect(stale.json.warnings.map(w => w.code)).toEqual(["STALE_METADATA"]);
    });

    it("registers charts in help with expected options mentioned", async () => {
        const paths = makeHome();
        const { code, stdout } = await chartsIn(paths, ["--help"]);

        expect(code).toBe(0);
        expect(stdout).toContain("--level");
        expect(stdout).toContain("--constant");
        expect(stdout).toContain("--diff");
        expect(stdout).toContain("--version");
        expect(stdout).toContain("--search");
    });
});

interface ChartsGroupedOutput extends Omit<PrintedOutput, "data"> {
    data: {
        groups: {
            key: string | null;
            count: number;
            items: ChartRow[];
        }[];
    };
}

async function chartsGroupedIn(
    paths: RuntimePaths,
    args: string[],
    options?: Parameters<typeof commandIn>[3]
) {
    const res = await commandIn(paths, "charts", args, options);
    return res as unknown as {
        code: number;
        json: ChartsGroupedOutput;
        stdout: string;
        requests: { url: string }[];
    };
}

describe("saltnet charts sorting and grouping", () => {
    it("sorts by constant descending, ascending, with limit and offset", async () => {
        const paths = makeHome();

        const { code, json } = await chartsIn(paths, ["--sort", "constant", "--limit", "14"]);
        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expect(json.meta.page).toEqual({
            total: 175,
            offset: 0,
            limit: 14,
            nextOffset: 14,
        });
        expect(json.data.items.map(i => i.chartKey)).toEqual([
            "12025-3",
            "10070-3",
            "70-3",
            "431-3",
            "70-4",
            "191-3",
            "115-3",
            "115-4",
            "283-3",
            "10030-3",
            "11726-3",
            "131-4",
            "58-4",
            "113-3",
        ]);

        const { json: jsonAsc } = await chartsIn(paths, [
            "--sort",
            "constant",
            "--asc",
            "--limit",
            "14",
        ]);
        expect(jsonAsc.ok).toBe(true);
        expect(jsonAsc.data.items.map(i => i.chartKey)).toEqual([
            "10030-0",
            "10185-0",
            "10256-0",
            "185-0",
            "10044-0",
            "10146-0",
            "10188-0",
            "10552-0",
            "11726-0",
            "9-0",
            "113-0",
            "188-0",
            "225-0",
            "228-0",
        ]);

        const { json: jsonDesc } = await chartsIn(paths, [
            "--sort",
            "constant",
            "--desc",
            "--limit",
            "14",
        ]);
        expect(jsonDesc.data.items.map(i => i.chartKey)).toEqual(
            json.data.items.map(i => i.chartKey)
        );

        const { json: jsonOffset } = await chartsIn(paths, [
            "--sort",
            "constant",
            "--asc",
            "--offset",
            "170",
        ]);
        expect(jsonOffset.data.items.map(i => i.chartKey)).toEqual([
            "70-4",
            "70-3",
            "431-3",
            "10070-3",
            "12025-3",
        ]);
        expect(jsonOffset.meta.page).toEqual({
            total: 175,
            offset: 170,
            limit: 50,
            nextOffset: null,
        });
    });

    it("sorts by version and default in both directions", async () => {
        const paths = makeHome();

        const { code: codeVer, json: jsonVer } = await chartsIn(paths, [
            "--sort",
            "version",
            "--limit",
            "14",
        ]);
        expect(codeVer).toBe(0);
        expect(jsonVer.ok).toBe(true);
        expect(jsonVer.data.items.map(i => i.chartKey)).toEqual([
            "10030-0",
            "10030-1",
            "10030-2",
            "10030-3",
            "12025-0",
            "12025-1",
            "12025-2",
            "12025-3",
            "10044-0",
            "10044-1",
            "10044-2",
            "10044-3",
            "10225-0",
            "10225-1",
        ]);

        const { json: jsonVerAsc } = await chartsIn(paths, [
            "--sort",
            "version",
            "--asc",
            "--limit",
            "14",
        ]);
        expect(jsonVerAsc.ok).toBe(true);
        expect(jsonVerAsc.data.items.map(i => i.chartKey)).toEqual([
            "8-0",
            "8-1",
            "8-2",
            "8-3",
            "9-0",
            "9-1",
            "9-2",
            "9-3",
            "17-0",
            "17-1",
            "17-2",
            "17-3",
            "17-4",
            "30-0",
        ]);

        const { json: jsonDefAsc } = await chartsIn(paths, [
            "--sort",
            "default",
            "--asc",
            "--limit",
            "14",
        ]);
        expect(jsonDefAsc.ok).toBe(true);
        expect(jsonDefAsc.data.items.map(i => i.chartKey)).toEqual([
            "10030-0",
            "10225-0",
            "11726-0",
            "12025-0",
            "17-0",
            "10552-0",
            "552-0",
            "10146-0",
            "146-0",
            "10185-0",
            "185-0",
            "10256-0",
            "256-0",
            "10044-0",
        ]);

        const { json: jsonDefAscOffset } = await chartsIn(paths, [
            "--sort",
            "default",
            "--asc",
            "--offset",
            "170",
        ]);
        expect(jsonDefAscOffset.data.items.map(i => i.chartKey)).toEqual([
            "256-4",
            "115-4",
            "58-4",
            "70-4",
            "131-4",
        ]);

        const { json: jsonDef } = await chartsIn(paths, ["--sort", "default"]);
        const { json: jsonNoSort } = await chartsIn(paths, []);
        expect(jsonDef.data.items.map(i => i.chartKey)).toEqual(
            jsonNoSort.data.items.map(i => i.chartKey)
        );
    });

    it("sorts charts including banquet charts (--diff rem,utage)", async () => {
        const paths = makeHome();

        const { code: codeConst, json: jsonConst } = await chartsIn(paths, [
            "--diff",
            "rem,utage",
            "--sort",
            "constant",
            "--limit",
            "15",
        ]);
        expect(codeConst).toBe(0);
        expect(jsonConst.ok).toBe(true);
        expect(jsonConst.data.items.map(i => i.chartKey)).toEqual([
            "70-4",
            "115-4",
            "131-4",
            "58-4",
            "146-4",
            "17-4",
            "256-4",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110227-10",
            "110851-10",
            "110998-10",
            "121513-10",
        ]);
        for (const item of jsonConst.data.items.slice(7)) {
            expect(item.constant).toBeNull();
        }

        const { json: jsonConstAsc } = await chartsIn(paths, [
            "--diff",
            "rem,utage",
            "--sort",
            "constant",
            "--asc",
            "--limit",
            "15",
        ]);
        expect(jsonConstAsc.data.items.map(i => i.chartKey)).toEqual([
            "17-4",
            "256-4",
            "58-4",
            "146-4",
            "131-4",
            "115-4",
            "70-4",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110227-10",
            "110851-10",
            "110998-10",
            "121513-10",
        ]);

        const { json: jsonVer } = await chartsIn(paths, [
            "--diff",
            "rem,utage",
            "--sort",
            "version",
            "--limit",
            "15",
        ]);
        expect(jsonVer.data.items.map(i => i.chartKey)).toEqual([
            "110851-10",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110227-10",
            "110998-10",
            "121513-10",
            "115-4",
            "256-4",
            "58-4",
            "131-4",
            "146-4",
            "17-4",
            "70-4",
        ]);

        const { json: jsonVerAsc } = await chartsIn(paths, [
            "--diff",
            "rem,utage",
            "--sort",
            "version",
            "--asc",
            "--limit",
            "15",
        ]);
        expect(jsonVerAsc.data.items.map(i => i.chartKey)).toEqual([
            "17-4",
            "70-4",
            "58-4",
            "131-4",
            "146-4",
            "115-4",
            "256-4",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110227-10",
            "110998-10",
            "121513-10",
            "110851-10",
        ]);

        const { json: jsonDefAsc } = await chartsIn(paths, [
            "--diff",
            "rem,utage",
            "--sort",
            "default",
            "--asc",
            "--limit",
            "15",
        ]);
        expect(jsonDefAsc.data.items.map(i => i.chartKey)).toEqual([
            "17-4",
            "146-4",
            "256-4",
            "115-4",
            "58-4",
            "70-4",
            "131-4",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110851-10",
            "110998-10",
            "121513-10",
            "110227-10",
        ]);
    });

    it("rejects contradictory sort directions and unsupported sort/group options with USAGE error", async () => {
        const paths = makeHome();

        const { code, json, requests } = await chartsIn(paths, ["--asc", "--desc"]);
        expect(code).toBe(2);
        expect(json.ok).toBe(false);
        expect(json.error.code).toBe("USAGE");
        expect(json.error.message).toContain("--asc");
        expect(requests).toHaveLength(0);

        const { code: codeRating, json: jsonRating } = await chartsIn(paths, ["--sort", "rating"]);
        expect(codeRating).toBe(2);
        expect(jsonRating.error.code).toBe("USAGE");

        const { code: codeAch, json: jsonAch } = await chartsIn(paths, ["--sort", "achievements"]);
        expect(codeAch).toBe(2);
        expect(jsonAch.error.code).toBe("USAGE");

        const { code: codeRank, json: jsonRank } = await chartsIn(paths, ["--group-by", "rank"]);
        expect(codeRank).toBe(2);
        expect(jsonRank.error.code).toBe("USAGE");
    });

    it("groups by difficulty with standard options and envelope", async () => {
        const paths = makeHome();

        const { code, json } = await chartsGroupedIn(paths, ["--group-by", "difficulty"]);
        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expect(json.meta.page).toBeUndefined();
        expect(json.meta.dataAsOf.catalog).toBeDefined();

        expect(json.data.groups).toHaveLength(5);
        expect(json.data.groups.map(g => [g.key, g.count])).toEqual([
            ["BASIC", 42],
            ["ADVANCED", 42],
            ["EXPERT", 42],
            ["MASTER", 42],
            ["Re:MASTER", 7],
        ]);
        expect(json.data.groups.map(g => g.items.length)).toEqual([42, 42, 42, 42, 7]);

        const totalCount = json.data.groups.reduce((sum, g) => sum + g.count, 0);
        expect(totalCount).toBe(175);

        expect(json.data.groups[0].items.slice(0, 3).map(i => i.chartKey)).toEqual([
            "695-0",
            "131-0",
            "431-0",
        ]);
        expect(json.data.groups[1].items.slice(0, 3).map(i => i.chartKey)).toEqual([
            "695-1",
            "131-1",
            "431-1",
        ]);
        expect(json.data.groups[2].items.slice(0, 3).map(i => i.chartKey)).toEqual([
            "695-2",
            "131-2",
            "431-2",
        ]);
        expect(json.data.groups[3].items.slice(0, 3).map(i => i.chartKey)).toEqual([
            "695-3",
            "131-3",
            "431-3",
        ]);
        expect(json.data.groups[4].items.slice(0, 3).map(i => i.chartKey)).toEqual([
            "131-4",
            "70-4",
            "58-4",
        ]);
    });

    it("applies limit and offset to each group separately", async () => {
        const paths = makeHome();

        const { code, json } = await chartsGroupedIn(paths, [
            "--group-by",
            "difficulty",
            "--limit",
            "2",
            "--offset",
            "1",
        ]);
        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expect(json.data.groups.map(g => [g.key, g.count, g.items.length])).toEqual([
            ["BASIC", 42, 2],
            ["ADVANCED", 42, 2],
            ["EXPERT", 42, 2],
            ["MASTER", 42, 2],
            ["Re:MASTER", 7, 2],
        ]);
        expect(json.data.groups[0].items.map(i => i.chartKey)).toEqual(["131-0", "431-0"]);

        const { json: jsonOffset100 } = await chartsGroupedIn(paths, [
            "--group-by",
            "difficulty",
            "--offset",
            "100",
        ]);
        for (const group of jsonOffset100.data.groups) {
            expect(group.items).toEqual([]);
        }
        expect(jsonOffset100.data.groups.map(g => g.count)).toEqual([42, 42, 42, 42, 7]);
    });

    it("groups --diff mas by level, constant, version and orders inside groups", async () => {
        const paths = makeHome();

        // by level
        const { code: codeLevel, json: jsonLevel } = await chartsGroupedIn(paths, [
            "--group-by",
            "level",
            "--diff",
            "mas",
        ]);
        expect(codeLevel).toBe(0);
        expect(jsonLevel.ok).toBe(true);
        expect(jsonLevel.data.groups.map(g => [g.key, g.count])).toEqual([
            ["14+", 2],
            ["14", 3],
            ["13+", 4],
            ["13", 12],
            ["12+", 11],
            ["12", 8],
            ["11", 1],
            ["10+", 1],
        ]);
        expect(jsonLevel.data.groups[0].items.map(i => i.chartKey)).toEqual(["10070-3", "12025-3"]);
        expect(jsonLevel.data.groups[1].items.map(i => i.chartKey)).toEqual([
            "431-3",
            "70-3",
            "191-3",
        ]);
        expect(jsonLevel.data.groups[2].items.map(i => i.chartKey)).toEqual([
            "115-3",
            "283-3",
            "10030-3",
            "11726-3",
        ]);
        expect(jsonLevel.data.groups[3].items.slice(0, 3).map(i => i.chartKey)).toEqual([
            "695-3",
            "58-3",
            "10242-3",
        ]);
        expect(jsonLevel.data.groups[4].items.slice(0, 3).map(i => i.chartKey)).toEqual([
            "30-3",
            "564-3",
            "228-3",
        ]);
        expect(jsonLevel.data.groups[5].items.slice(0, 3).map(i => i.chartKey)).toEqual([
            "131-3",
            "8-3",
            "9-3",
        ]);
        expect(jsonLevel.data.groups[6].items.map(i => i.chartKey)).toEqual(["10256-3"]);
        expect(jsonLevel.data.groups[7].items.map(i => i.chartKey)).toEqual(["17-3"]);

        // by constant
        const { json: jsonConst } = await chartsGroupedIn(paths, [
            "--group-by",
            "constant",
            "--diff",
            "mas",
        ]);
        expect(jsonConst.data.groups.map(g => [g.key, g.count])).toEqual([
            ["14.8", 1],
            ["14.6", 1],
            ["14.4", 2],
            ["14.1", 1],
            ["13.8", 1],
            ["13.7", 2],
            ["13.6", 1],
            ["13.4", 3],
            ["13.3", 3],
            ["13.2", 3],
            ["13.1", 1],
            ["13.0", 2],
            ["12.9", 3],
            ["12.8", 6],
            ["12.7", 1],
            ["12.6", 1],
            ["12.5", 5],
            ["12.4", 2],
            ["12.2", 1],
            ["11.2", 1],
            ["10.7", 1],
        ]);
        const constGroupMap = new Map(jsonConst.data.groups.map(g => [g.key, g]));
        expect(constGroupMap.get("14.4")!.items.map(i => i.chartKey)).toEqual(["431-3", "70-3"]);
        expect(constGroupMap.get("13.7")!.items.map(i => i.chartKey)).toEqual(["283-3", "10030-3"]);
        expect(constGroupMap.get("13.4")!.items.map(i => i.chartKey)).toEqual([
            "113-3",
            "225-3",
            "10225-3",
        ]);
        expect(constGroupMap.get("12.8")!.items.map(i => i.chartKey)).toEqual([
            "650-3",
            "10188-3",
            "10044-3",
            "185-3",
            "10185-3",
            "10146-3",
        ]);

        // by version
        const { json: jsonVer } = await chartsGroupedIn(paths, [
            "--group-by",
            "version",
            "--diff",
            "mas",
        ]);
        expect(jsonVer.data.groups.map(g => [g.key, g.count])).toEqual([
            ["舞萌DX 2026", 2],
            ["舞萌DX 2025", 3],
            ["舞萌DX 2024", 2],
            ["舞萌DX 2023", 1],
            ["舞萌DX 2022", 1],
            ["舞萌DX 2021", 1],
            ["舞萌DX", 3],
            ["maimai FiNALE", 1],
            ["maimai MiLK PLUS", 1],
            ["maimai MiLK", 2],
            ["maimai MURASAKi PLUS", 1],
            ["maimai MURASAKi", 2],
            ["maimai PiNK PLUS", 1],
            ["maimai PiNK", 1],
            ["maimai ORANGE PLUS", 1],
            ["maimai ORANGE", 2],
            ["maimai GreeN PLUS", 1],
            ["maimai GreeN", 5],
            ["maimai PLUS", 4],
            ["maimai", 7],
        ]);
        const verGroupMap = new Map(jsonVer.data.groups.map(g => [g.key, g]));
        expect(verGroupMap.get("舞萌DX 2025")!.items.map(i => i.chartKey)).toEqual([
            "10044-3",
            "10225-3",
            "11726-3",
        ]);
        expect(
            verGroupMap
                .get("maimai")!
                .items.slice(0, 3)
                .map(i => i.chartKey)
        ).toEqual(["70-3", "30-3", "8-3"]);

        // --group-by level --diff mas --sort constant --asc
        const { json: jsonLevelConstAsc } = await chartsGroupedIn(paths, [
            "--group-by",
            "level",
            "--diff",
            "mas",
            "--sort",
            "constant",
            "--asc",
        ]);
        expect(jsonLevelConstAsc.data.groups.map(g => g.key)).toEqual(
            jsonLevel.data.groups.map(g => g.key)
        );
        expect(jsonLevelConstAsc.data.groups[0].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "10070-3",
            "12025-3",
        ]);
        expect(jsonLevelConstAsc.data.groups[1].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "191-3",
            "70-3",
            "431-3",
        ]);
        expect(jsonLevelConstAsc.data.groups[2].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "11726-3",
            "283-3",
            "10030-3",
            "115-3",
        ]);
        expect(jsonLevelConstAsc.data.groups[3].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "58-3",
            "146-3",
            "695-3",
            "359-3",
        ]);
        expect(jsonLevelConstAsc.data.groups[4].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "30-3",
            "77-3",
            "185-3",
            "650-3",
        ]);
        expect(jsonLevelConstAsc.data.groups[5].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "256-3",
            "8-3",
            "9-3",
            "44-3",
        ]);
        expect(jsonLevelConstAsc.data.groups[6].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "10256-3",
        ]);
        expect(jsonLevelConstAsc.data.groups[7].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "17-3",
        ]);

        // --group-by level --diff mas --sort default --asc
        const { json: jsonLevelDefAsc } = await chartsGroupedIn(paths, [
            "--group-by",
            "level",
            "--diff",
            "mas",
            "--sort",
            "default",
            "--asc",
        ]);
        expect(jsonLevelDefAsc.data.groups.map(g => g.key)).toEqual(
            jsonLevel.data.groups.map(g => g.key)
        );
        expect(jsonLevelDefAsc.data.groups[0].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "12025-3",
            "10070-3",
        ]);
        expect(jsonLevelDefAsc.data.groups[1].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "191-3",
            "70-3",
            "431-3",
        ]);
        expect(jsonLevelDefAsc.data.groups[2].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "10030-3",
            "11726-3",
            "283-3",
            "115-3",
        ]);
        expect(jsonLevelDefAsc.data.groups[3].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "10225-3",
            "10552-3",
            "552-3",
            "146-3",
        ]);
        expect(jsonLevelDefAsc.data.groups[4].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "10146-3",
            "10185-3",
            "185-3",
            "10044-3",
        ]);
        expect(jsonLevelDefAsc.data.groups[5].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "256-3",
            "44-3",
            "383-3",
            "540-3",
        ]);
        expect(jsonLevelDefAsc.data.groups[6].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "10256-3",
        ]);
        expect(jsonLevelDefAsc.data.groups[7].items.slice(0, 4).map(i => i.chartKey)).toEqual([
            "17-3",
        ]);

        // --group-by version --diff mas --sort version --asc
        const { json: jsonVerSortAsc } = await chartsGroupedIn(paths, [
            "--group-by",
            "version",
            "--diff",
            "mas",
            "--sort",
            "version",
            "--asc",
        ]);
        expect(jsonVerSortAsc.data.groups.map(g => g.key)).toEqual(
            jsonVer.data.groups.map(g => g.key)
        );
        const verAscMap = new Map(jsonVerSortAsc.data.groups.map(g => [g.key, g]));
        expect(
            verAscMap
                .get("舞萌DX 2024")!
                .items.slice(0, 4)
                .map(i => i.chartKey)
        ).toEqual(["10185-3", "10242-3"]);
        expect(
            verAscMap
                .get("舞萌DX")!
                .items.slice(0, 4)
                .map(i => i.chartKey)
        ).toEqual(["10146-3", "10191-3", "10256-3"]);
        expect(
            verAscMap
                .get("maimai GreeN")!
                .items.slice(0, 4)
                .map(i => i.chartKey)
        ).toEqual(["115-3", "185-3", "188-3", "191-3"]);
        expect(
            verAscMap
                .get("maimai PLUS")!
                .items.slice(0, 4)
                .map(i => i.chartKey)
        ).toEqual(["58-3", "113-3", "131-3", "146-3"]);
        expect(
            verAscMap
                .get("maimai")!
                .items.slice(0, 4)
                .map(i => i.chartKey)
        ).toEqual(["8-3", "9-3", "17-3", "30-3"]);

        // --group-by constant --diff mas --sort version
        const { json: jsonConstSortVer } = await chartsGroupedIn(paths, [
            "--group-by",
            "constant",
            "--diff",
            "mas",
            "--sort",
            "version",
        ]);
        const constVerMap = new Map(jsonConstSortVer.data.groups.map(g => [g.key, g]));
        expect(constVerMap.get("14.4")!.items.map(i => i.chartKey)).toEqual(["431-3", "70-3"]);
        expect(constVerMap.get("13.4")!.items.map(i => i.chartKey)).toEqual([
            "10225-3",
            "225-3",
            "113-3",
        ]);
        expect(
            constVerMap
                .get("12.8")!
                .items.slice(0, 5)
                .map(i => i.chartKey)
        ).toEqual(["10044-3", "10185-3", "10188-3", "10146-3", "650-3"]);
    });

    it("groups --level 13.. by version in order", async () => {
        const paths = makeHome();

        const { code, json } = await chartsGroupedIn(paths, [
            "--level",
            "13..",
            "--group-by",
            "version",
        ]);
        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expect(json.data.groups.map(g => [g.key, g.count])).toEqual([
            ["舞萌DX 2026", 2],
            ["舞萌DX 2025", 2],
            ["舞萌DX 2024", 1],
            ["舞萌DX 2023", 1],
            ["舞萌DX 2022", 1],
            ["maimai MiLK", 1],
            ["maimai MURASAKi PLUS", 1],
            ["maimai MURASAKi", 2],
            ["maimai PiNK PLUS", 2],
            ["maimai PiNK", 1],
            ["maimai GreeN PLUS", 1],
            ["maimai GreeN", 4],
            ["maimai PLUS", 7],
            ["maimai", 2],
        ]);

        const gMap = new Map(json.data.groups.map(g => [g.key, g]));
        expect(gMap.get("舞萌DX 2026")!.items.map(i => i.chartKey)).toEqual(["10030-3", "12025-3"]);
        expect(gMap.get("舞萌DX 2025")!.items.map(i => i.chartKey)).toEqual(["10225-3", "11726-3"]);
        expect(gMap.get("舞萌DX 2024")!.items.map(i => i.chartKey)).toEqual(["10242-3"]);
        expect(gMap.get("舞萌DX 2023")!.items.map(i => i.chartKey)).toEqual(["10070-3"]);
        expect(gMap.get("舞萌DX 2022")!.items.map(i => i.chartKey)).toEqual(["10552-3"]);
        expect(gMap.get("maimai MiLK")!.items.map(i => i.chartKey)).toEqual(["695-3"]);
        expect(gMap.get("maimai MURASAKi PLUS")!.items.map(i => i.chartKey)).toEqual(["236-3"]);
        expect(gMap.get("maimai MURASAKi")!.items.map(i => i.chartKey)).toEqual(["283-3", "552-3"]);
        expect(gMap.get("maimai PiNK PLUS")!.items.map(i => i.chartKey)).toEqual([
            "431-3",
            "431-2",
        ]);
        expect(gMap.get("maimai PiNK")!.items.map(i => i.chartKey)).toEqual(["359-3"]);
        expect(gMap.get("maimai GreeN PLUS")!.items.map(i => i.chartKey)).toEqual(["225-3"]);
        expect(
            gMap
                .get("maimai GreeN")!
                .items.slice(0, 3)
                .map(i => i.chartKey)
        ).toEqual(["115-4", "115-3", "188-3"]);
        expect(
            gMap
                .get("maimai PLUS")!
                .items.slice(0, 3)
                .map(i => i.chartKey)
        ).toEqual(["131-4", "58-4", "146-4"]);
        expect(gMap.get("maimai")!.items.map(i => i.chartKey)).toEqual(["70-4", "70-3"]);
    });

    it("groups --diff rem,utage by constant, level, difficulty, version", async () => {
        const paths = makeHome();

        // by constant
        const { code: codeConst, json: jsonConst } = await chartsGroupedIn(paths, [
            "--diff",
            "rem,utage",
            "--group-by",
            "constant",
        ]);
        expect(codeConst).toBe(0);
        expect(jsonConst.ok).toBe(true);
        expect(jsonConst.data.groups.map(g => [g.key, g.count])).toEqual([
            ["14.2", 1],
            ["13.8", 1],
            ["13.5", 1],
            ["13.4", 2],
            ["12.7", 2],
            [null, 8],
        ]);
        const constGroupMap = new Map(jsonConst.data.groups.map(g => [g.key, g]));
        expect(constGroupMap.get("14.2")!.items.map(i => i.chartKey)).toEqual(["70-4"]);
        expect(constGroupMap.get("13.8")!.items.map(i => i.chartKey)).toEqual(["115-4"]);
        expect(constGroupMap.get("13.5")!.items.map(i => i.chartKey)).toEqual(["131-4"]);
        expect(constGroupMap.get("13.4")!.items.map(i => i.chartKey)).toEqual(["58-4", "146-4"]);
        expect(constGroupMap.get("12.7")!.items.map(i => i.chartKey)).toEqual(["256-4", "17-4"]);
        const nullGroup = constGroupMap.get(null)!;
        expect(nullGroup.items.map(i => i.chartKey)).toEqual([
            "110227-10",
            "110018-10",
            "110022-10",
            "110199-10",
            "110206-10",
            "110851-10",
            "110998-10",
            "121513-10",
        ]);
        for (const item of nullGroup.items) {
            expect(item.constant).toBeNull();
        }

        // by level
        const { json: jsonLevel } = await chartsGroupedIn(paths, [
            "--diff",
            "rem,utage",
            "--group-by",
            "level",
        ]);
        expect(jsonLevel.data.groups.map(g => [g.key, g.items.map(i => i.chartKey)])).toEqual([
            ["14+?", ["110022-10", "110998-10"]],
            ["14", ["70-4"]],
            ["14?", ["110227-10"]],
            ["13+", ["115-4"]],
            ["13", ["131-4", "58-4", "146-4"]],
            ["13?", ["110206-10", "110851-10"]],
            ["12+", ["256-4", "17-4"]],
            ["12+?", ["110199-10"]],
            ["12?", ["110018-10"]],
            ["11?", ["121513-10"]],
        ]);

        // by difficulty
        const { json: jsonDiff } = await chartsGroupedIn(paths, [
            "--diff",
            "rem,utage",
            "--group-by",
            "difficulty",
        ]);
        expect(jsonDiff.data.groups.map(g => [g.key, g.count])).toEqual([
            ["Re:MASTER", 7],
            ["UTAGE", 8],
        ]);

        // by version
        const { json: jsonVer } = await chartsGroupedIn(paths, [
            "--diff",
            "rem,utage",
            "--group-by",
            "version",
        ]);
        expect(jsonVer.data.groups.map(g => [g.key, g.items.map(i => i.chartKey)])).toEqual([
            ["舞萌DX 2026", ["110851-10"]],
            [
                "舞萌DX 2024",
                [
                    "110227-10",
                    "110018-10",
                    "110022-10",
                    "110199-10",
                    "110206-10",
                    "110998-10",
                    "121513-10",
                ],
            ],
            ["maimai GreeN", ["115-4", "256-4"]],
            ["maimai PLUS", ["131-4", "58-4", "146-4"]],
            ["maimai", ["70-4", "17-4"]],
        ]);
    });

    it("supports --fields with --group-by", async () => {
        const paths = makeHome();

        const { code, json } = await chartsGroupedIn(paths, [
            "--fields",
            "chartKey",
            "--group-by",
            "difficulty",
            "--limit",
            "1",
        ]);
        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expect(json.data.groups).toHaveLength(5);
        for (const group of json.data.groups) {
            expect(group.key).toBeDefined();
            expect(typeof group.count).toBe("number");
            expect(group.items).toHaveLength(1);
            expect(Object.keys(group.items[0])).toEqual(["chartKey"]);
        }
    });

    it("formats grouped results as TSV", async () => {
        const paths = makeHome();

        const { code, stdout } = await chartsIn(paths, [
            "--format",
            "tsv",
            "--group-by",
            "difficulty",
            "--limit",
            "1",
            "--fields",
            "chartKey",
        ]);
        expect(code).toBe(0);
        const lines = stdout.trimEnd().split("\n");
        expect(lines[0]).toBe("group\tchartKey");
        expect(lines.slice(1)).toEqual([
            "BASIC\t695-0",
            "ADVANCED\t695-1",
            "EXPERT\t695-2",
            "MASTER\t695-3",
            "Re:MASTER\t131-4",
        ]);
    });

    it("formats grouped results as text", async () => {
        const paths = makeHome();

        const { code, stdout } = await chartsIn(paths, [
            "--format",
            "text",
            "--group-by",
            "difficulty",
            "--limit",
            "1",
            "--fields",
            "chartKey",
        ]);
        expect(code).toBe(0);
        expect(stdout).toContain("BASIC（42 条）");
        expect(stdout).toContain("ADVANCED（42 条）");
        expect(stdout).toContain("EXPERT（42 条）");
        expect(stdout).toContain("MASTER（42 条）");
        expect(stdout).toContain("Re:MASTER（7 条）");
        expect(stdout).toContain("chartKey");
    });

    it("carries the stale metadata warning of a grouped result", async () => {
        const paths = makeHome();
        await chartsGroupedIn(paths, ["--group-by", "difficulty"]);

        const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
        const stale = await chartsGroupedIn(paths, ["--group-by", "difficulty"], {
            now: later,
            network: {},
        });
        expect(stale.code).toBe(0);
        expect(stale.json.data.groups).toHaveLength(5);
        expect(stale.json.warnings.map(w => w.code)).toEqual(["STALE_METADATA"]);
    });

    it("registers --sort, --asc, --desc and --group-by in help", async () => {
        const paths = makeHome();
        const { code, stdout } = await chartsIn(paths, ["--help"]);

        expect(code).toBe(0);
        expect(stdout).toContain("--sort");
        expect(stdout).toContain("--asc");
        expect(stdout).toContain("--desc");
        expect(stdout).toContain("--group-by");
    });
});
