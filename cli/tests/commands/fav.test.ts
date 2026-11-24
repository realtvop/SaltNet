import { describe, expect, it } from "vitest";
import { splitCommandLine } from "../../src/util/shell";
import { commandIn } from "../commandRun";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

describe("fav commands", () => {
    it("runs fav list offline on a fresh directory and returns empty items", async () => {
        const paths = makeHome();
        const { code, json } = await commandIn(paths, "fav", ["list", "--offline"]);
        expect(code).toBe(0);
        expect(json.v).toBe(1);
        expect(json.ok).toBe(true);
        expect(json.command).toBe("fav list");
        expect(json.data.items).toEqual([]);
    });

    it("creates a favorite and rejects empty or duplicate names", async () => {
        const paths = makeHome();

        const empty = await commandIn(paths, "fav", ["create", "   "]);
        expect(empty.code).toBe(2);
        expect(empty.json.error.code).toBe("USAGE");
        expect(empty.json.error.message).toContain("收藏夹名称不能为空");

        const created = await commandIn(paths, "fav", ["create", "  练习  "]);
        expect(created.code).toBe(0);
        expect(created.json.command).toBe("fav create");
        expect(created.json.data).toEqual({
            name: "练习",
            count: 0,
            musicIds: [],
        });

        const duplicate = await commandIn(paths, "fav", ["create", "练习"]);
        expect(duplicate.code).toBe(2);
        expect(duplicate.json.error.code).toBe("USAGE");
        expect(duplicate.json.error.message).toContain("收藏夹「练习」已存在");

        const list = await commandIn(paths, "fav", ["list"]);
        expect(list.code).toBe(0);
        expect(list.json.data.items).toEqual([{ name: "练习", count: 0, musicIds: [] }]);
    });

    it("renames a favorite and enforces name and reference rules", async () => {
        const paths = makeHome();
        await commandIn(paths, "fav", ["create", "练习一"]);
        await commandIn(paths, "fav", ["create", "练习二"]);

        const empty = await commandIn(paths, "fav", ["rename", "练习一", "   "]);
        expect(empty.code).toBe(2);
        expect(empty.json.error.code).toBe("USAGE");
        expect(empty.json.error.message).toContain("收藏夹名称不能为空");

        const duplicate = await commandIn(paths, "fav", ["rename", "练习一", "练习二"]);
        expect(duplicate.code).toBe(2);
        expect(duplicate.json.error.code).toBe("USAGE");
        expect(duplicate.json.error.message).toContain("收藏夹「练习二」已存在");

        const same = await commandIn(paths, "fav", ["rename", "练习一", "练习一"]);
        expect(same.code).toBe(0);
        expect(same.json.data).toEqual({ previousName: "练习一", name: "练习一" });

        const renamed = await commandIn(paths, "fav", ["rename", "练习一", "备选一"]);
        expect(renamed.code).toBe(0);
        expect(renamed.json.data).toEqual({ previousName: "练习一", name: "备选一" });

        const unknown = await commandIn(paths, "fav", ["rename", "不存在", "新名"]);
        expect(unknown.code).toBe(3);
        expect(unknown.json.error.code).toBe("NOT_FOUND");

        await commandIn(paths, "fav", ["create", "测试一"]);
        await commandIn(paths, "fav", ["create", "测试二"]);
        const ambiguous = await commandIn(paths, "fav", ["rename", "测试", "新名"]);
        expect(ambiguous.code).toBe(3);
        expect(ambiguous.json.error.code).toBe("AMBIGUOUS_REF");
    });

    it("previews deletion, checks confirmation codes, and deletes favorite", async () => {
        const paths = makeHome();
        await commandIn(paths, "fav", ["create", "练习"]);
        await commandIn(paths, "fav", ["add", "练习", "146-3"]);

        const preview = await commandIn(paths, "fav", ["delete", "练习"]);
        expect(preview.code).toBe(6);
        expect(preview.json.ok).toBe(false);
        expect(preview.json.error.code).toBe("CONFIRMATION_REQUIRED");
        expect(preview.json.error.codeRejected).toBe(false);
        expect(preview.json.error.preview).toEqual({
            name: "练习",
            count: 1,
            musicIds: [146],
        });
        const fix = preview.json.error.fix;
        expect(fix).toContain("saltnet fav delete 练习 --yes ");

        const wrong = await commandIn(paths, "fav", ["delete", "练习", "--yes", "WRONGCODE"]);
        expect(wrong.code).toBe(6);
        expect(wrong.json.error.codeRejected).toBe(true);

        // Add another song to change the favorite's state
        await commandIn(paths, "fav", ["add", "练习", "77-2"]);
        const staleArgs = splitCommandLine(fix!).slice(1);
        const stale = await commandIn(paths, staleArgs[0], staleArgs.slice(1));
        expect(stale.code).toBe(6);
        expect(stale.json.error.codeRejected).toBe(true);

        const currentFix = stale.json.error.fix!;
        const confirmArgs = splitCommandLine(currentFix).slice(1);
        const deleted = await commandIn(paths, confirmArgs[0], confirmArgs.slice(1));
        expect(deleted.code).toBe(0);
        expect(deleted.json.command).toBe("fav delete");
        expect(deleted.json.data).toEqual({
            name: "练习",
            count: 2,
            musicIds: [146, 77],
            remainingFavorites: 0,
        });

        const listAfter = await commandIn(paths, "fav", ["list"]);
        expect(listAfter.json.data.items).toEqual([]);

        const unknown = await commandIn(paths, "fav", ["delete", "不存在"]);
        expect(unknown.code).toBe(3);
        expect(unknown.json.error.code).toBe("NOT_FOUND");
    });

    it("lists entry counts and binds the deletion code to the difficulty of each entry", async () => {
        const paths = makeHome();
        await commandIn(paths, "fav", ["create", "练习"]);
        await commandIn(paths, "fav", ["add", "练习", "8-0"]);
        await commandIn(paths, "fav", ["add", "练习", "146-3"]);
        const listed = await commandIn(paths, "fav", ["list"]);
        expect(listed.json.data.items).toEqual([{ name: "练习", count: 2, musicIds: [8, 146] }]);

        const preview = await commandIn(paths, "fav", ["delete", "练习"]);
        expect(preview.code).toBe(6);

        // The last song again at another difficulty: the count and the music ids stay the same.
        await commandIn(paths, "fav", ["remove", "练习", "146-3"]);
        await commandIn(paths, "fav", ["add", "练习", "146-2"]);
        const staleArgs = splitCommandLine(preview.json.error.fix!).slice(1);
        const stale = await commandIn(paths, staleArgs[0], staleArgs.slice(1));
        expect(stale.code).toBe(6);
        expect(stale.json.error.codeRejected).toBe(true);
        expect(stale.json.error.preview).toEqual(preview.json.error.preview);
    });

    it("confirms deleting a favorite whose name starts with a dash", async () => {
        const paths = makeHome();
        const created = await commandIn(paths, "fav", ["create", "--", "-x"]);
        expect(created.code).toBe(0);
        expect(created.json.data.name).toBe("-x");

        const preview = await commandIn(paths, "fav", ["delete", "--", "-x"]);
        expect(preview.code).toBe(6);
        const fixArgs = splitCommandLine(preview.json.error.fix!).slice(1);
        const deleted = await commandIn(paths, fixArgs[0], fixArgs.slice(1));
        expect(deleted.code).toBe(0);
        expect(deleted.json.data.name).toBe("-x");
    });

    it("adds and removes charts with full chart resolution and error handling", async () => {
        const paths = makeHome();
        await commandIn(paths, "fav", ["create", "练习"]);

        // Unknown favorite on add, before the catalog is downloaded
        const badFav = await commandIn(paths, "fav", ["add", "未知", "146-3"]);
        expect(badFav.code).toBe(3);
        expect(badFav.json.error.code).toBe("NOT_FOUND");
        expect(badFav.requests).toEqual([]);
        const badFavRemoveFirst = await commandIn(paths, "fav", ["remove", "未知", "146-3"]);
        expect(badFavRemoveFirst.code).toBe(3);
        expect(badFavRemoveFirst.json.error.code).toBe("NOT_FOUND");
        expect(badFavRemoveFirst.requests).toEqual([]);

        // Unknown chart on add
        const badChart = await commandIn(paths, "fav", ["add", "练习", "99999-3"]);
        expect(badChart.code).toBe(3);
        expect(badChart.json.error.code).toBe("NOT_FOUND");

        // Ambiguous chart needing --type
        const ambiguous = await commandIn(paths, "fav", ["add", "练习", "ネコ日和。", "mas"]);
        expect(ambiguous.code).toBe(3);
        expect(ambiguous.json.error.code).toBe("AMBIGUOUS_REF");
        expect(ambiguous.json.error.candidates?.map(c => c.ref)).toEqual(["30-3", "10030-3"]);

        // Add with --type dx
        const addAmbiguous = await commandIn(paths, "fav", [
            "add",
            "练习",
            "ネコ日和。",
            "mas",
            "--type",
            "dx",
        ]);
        expect(addAmbiguous.code).toBe(0);
        expect(addAmbiguous.json.data.added).toBe(true);
        expect(addAmbiguous.json.data.chart.chartKey).toBe("10030-3");
        expect(addAmbiguous.json.data.favorite).toEqual({
            name: "练习",
            count: 1,
            musicIds: [10030],
        });

        // Add 146-3
        const addFirst = await commandIn(paths, "fav", ["add", "练习", "146-3"]);
        expect(addFirst.code).toBe(0);
        expect(addFirst.json.data.added).toBe(true);
        expect(addFirst.json.data.chart.chartKey).toBe("146-3");
        expect(addFirst.json.data.favorite).toEqual({
            name: "练习",
            count: 2,
            musicIds: [10030, 146],
        });

        // Add 146-2 (same song side 146, different difficulty): added is false
        const addSameSong = await commandIn(paths, "fav", ["add", "练习", "146-2"]);
        expect(addSameSong.code).toBe(0);
        expect(addSameSong.json.data.added).toBe(false);
        expect(addSameSong.json.data.favorite.count).toBe(2);

        // Remove 146-3
        const removeFirst = await commandIn(paths, "fav", ["remove", "练习", "146-3"]);
        expect(removeFirst.code).toBe(0);
        expect(removeFirst.json.data.removed).toBe(true);
        expect(removeFirst.json.data.chart.chartKey).toBe("146-3");
        expect(removeFirst.json.data.favorite).toEqual({
            name: "练习",
            count: 1,
            musicIds: [10030],
        });

        // Remove 146-3 again: removed is false
        const removeAgain = await commandIn(paths, "fav", ["remove", "练习", "146-3"]);
        expect(removeAgain.code).toBe(0);
        expect(removeAgain.json.data.removed).toBe(false);
        expect(removeAgain.json.data.favorite.count).toBe(1);

        // Unknown favorite on remove
        const badFavRemove = await commandIn(paths, "fav", ["remove", "未知", "146-3"]);
        expect(badFavRemove.code).toBe(3);
        expect(badFavRemove.json.error.code).toBe("NOT_FOUND");

        // Unknown chart on remove
        const badChartRemove = await commandIn(paths, "fav", ["remove", "练习", "99999-3"]);
        expect(badChartRemove.code).toBe(3);
        expect(badChartRemove.json.error.code).toBe("NOT_FOUND");
    });
});
