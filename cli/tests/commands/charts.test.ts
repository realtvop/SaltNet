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
