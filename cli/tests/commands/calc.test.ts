import { describe, expect, it } from "vitest";
import { commandIn } from "../commandRun";
import { detailedUser, seedScoreUsers } from "../scoreUsers";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

describe("calc command", () => {
    it("works offline with a constant and no catalog stored", async () => {
        const home = makeHome();
        // Empty home, network blocked
        const { code, json } = await commandIn(home, "calc", ["13.5"], { network: {} });
        expect(code).toBe(0);
        expect(json.data.constant).toBe(13.5);
        expect(json.data.chart).toBeNull();
        expect(json.data.stages.length).toBeGreaterThan(0);
        expect(json.meta.user).toBeUndefined();
        expect(json.meta.dataAsOf).toBeUndefined();
    });

    it("calculates --achievements with a constant", async () => {
        const home = makeHome();
        const { code, json } = await commandIn(home, "calc", ["13.0", "--achievements", "100.25"]);
        expect(code).toBe(0);
        expect(json.data.constant).toBe(13.0);
        expect(json.data.chart).toBeNull();
        expect(json.data.achievements).toBe(100.25);
        // At 100.25%: entry in table is 100.0% with offset 216 -> floor(130 * 1002500 * 216 / 1e8) = 281
        expect(json.data.rating).toBe(281);
        expect(json.data.rank).toBe("SSS");
        expect(json.data.stages).toBeNull();
    });

    it("hand-checks boundary values 100.5 and 100.4999 for constant 13.0", async () => {
        const home = makeHome();
        // At 100.5%: offset 224, ach4 1005000 -> 130 * 1005000 * 224 / 1e8 = 292.656 -> 292, SSS+
        const res1005 = await commandIn(home, "calc", ["13.0", "--achievements", "100.5"]);
        expect(res1005.code).toBe(0);
        expect(res1005.json.data.achievements).toBe(100.5);
        expect(res1005.json.data.rating).toBe(292);
        expect(res1005.json.data.rank).toBe("SSS+");

        // At 100.4999%: offset 222, ach4 1004999 -> 130 * 1004999 * 222 / 1e8 = 290.026... -> 290, SSS
        const res1004 = await commandIn(home, "calc", ["13.0", "--achievements", "100.4999"]);
        expect(res1004.code).toBe(0);
        expect(res1004.json.data.achievements).toBe(100.4999);
        expect(res1004.json.data.rating).toBe(290);
        expect(res1004.json.data.rank).toBe("SSS");

        // Achievements rounding: 100.49999 rounds to 100.5 (SSS+, rating 315 on constant 14)
        const resRoundUp = await commandIn(home, "calc", ["14", "--achievements", "100.49999"]);
        expect(resRoundUp.code).toBe(0);
        expect(resRoundUp.json.data.achievements).toBe(100.5);
        expect(resRoundUp.json.data.rating).toBe(315);
        expect(resRoundUp.json.data.rank).toBe("SSS+");

        // 100.49994 rounds to 100.4999
        const resRoundDown = await commandIn(home, "calc", ["14", "--achievements", "100.49994"]);
        expect(resRoundDown.code).toBe(0);
        expect(resRoundDown.json.data.achievements).toBe(100.4999);
    });

    it("calculates reachable and unreachable --rating with a constant", async () => {
        const home = makeHome();
        // Reachable: target 250 on constant 13.0
        const reach = await commandIn(home, "calc", ["13.0", "--rating", "250"]);
        expect(reach.code).toBe(0);
        expect(reach.json.data.target).toBe(250);
        expect(reach.json.data.rating).toBeGreaterThanOrEqual(250);
        expect(typeof reach.json.data.achievements).toBe("number");
        expect(typeof reach.json.data.rank).toBe("string");
        expect(reach.json.data.stages).toBeNull();

        // Unreachable: target 9999 on constant 13.0 (max is 292)
        const unreach = await commandIn(home, "calc", ["13.0", "--rating", "9999"]);
        expect(unreach.code).toBe(0);
        expect(unreach.json.data.target).toBe(9999);
        expect(unreach.json.data.achievements).toBeNull();
        expect(unreach.json.data.rating).toBeNull();
        expect(unreach.json.data.rank).toBeNull();
        expect(unreach.json.data.stages).toBeNull();
    });

    it("finds the lowest achievement rate for --rating, checked by hand for constant 13.0", async () => {
        const home = makeHome();
        const run = async (target: string) =>
            (await commandIn(home, "calc", ["13.0", "--rating", target])).json.data;
        // rating = floor(130 * achievement4 * offset / 1e8). S (offset 200) starts at 97.0000 and gives
        // floor(252.2) = 252; the best rate below S, 96.9999 (offset 176), gives 221.
        expect(await run("252")).toMatchObject({
            target: 252,
            achievements: 97,
            rating: 252,
            rank: "S",
        });
        // 253 needs achievement4 >= 253e8 / (130 * 200) = 973076.92: 97.3077 gives 253.00002.
        expect(await run("253")).toMatchObject({ achievements: 97.3077, rating: 253, rank: "S" });
        // The highest rating is floor(130 * 1005000 * 224 / 1e8) = floor(292.656) = 292, which only
        // 100.5 reaches (100.4999 gives 290).
        expect(await run("292")).toMatchObject({ achievements: 100.5, rating: 292, rank: "SSS+" });
        expect(await run("293")).toMatchObject({ achievements: null, rating: null, rank: null });
        expect(await run("0")).toMatchObject({ achievements: 0, rating: 0, rank: "D" });
    });

    it("accepts both ends of the --achievements range and rejects values just outside", async () => {
        const home = makeHome();
        const top = await commandIn(home, "calc", ["13.0", "--achievements", "101"]);
        expect(top.json.data).toMatchObject({ achievements: 101, rating: 292, rank: "SSS+" });
        const bottom = await commandIn(home, "calc", ["13.0", "--achievements", "0"]);
        expect(bottom.json.data).toMatchObject({ achievements: 0, rating: 0, rank: "D" });
        for (const value of ["101.0001", "-0.5"]) {
            const res = await commandIn(home, "calc", ["13.0", `--achievements=${value}`]);
            expect(res.code).toBe(2);
            expect(res.json.error.code).toBe("USAGE");
        }
    });

    it("reads a number as a chart reference when --type is given", async () => {
        const home = makeHome();
        const res = await commandIn(home, "calc", ["8", "--type", "dx"]);
        expect(res.code).toBe(2);
        expect(res.json.error.message).toContain("缺少难度");
    });

    it("reads a number out of the constant range as a bad constant, not as a chart", async () => {
        const home = makeHome();
        for (const value of ["15.5", "0.9", "0"]) {
            const res = await commandIn(home, "calc", [value], { network: {} });
            expect(res.code).toBe(2);
            expect(res.json.error.message).toContain("定数应该在 1.0 到 15.0 之间");
        }
    });

    it("supports chart reference and includes chart row and user score", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        const u = detailedUser("uid-1", "计算用户");
        u.remark = "计算用户";
        await seedScoreUsers(home, [u]);

        // Calc with chart reference: 146 mas (constant 13)
        const res = await commandIn(home, "calc", ["146", "mas", "--achievements", "100.0"]);
        expect(res.code).toBe(0);
        expect(res.json.data.constant).toBe(13);
        expect(res.json.data.chart).not.toBeNull();
        expect(res.json.data.chart.chartKey).toBe("146-3");
        expect(res.json.data.chart.score).not.toBeNull();
        expect(res.json.data.achievements).toBe(100.0);
        expect(res.json.data.rating).toBe(280);
        expect(res.json.data.rank).toBe("SSS");
        expect(res.json.meta.user.uid).toBe("uid-1");
    });

    it("works on a chart reference without users (score is null, not an error)", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);

        const res = await commandIn(home, "calc", ["146-3"]);
        expect(res.code).toBe(0);
        expect(res.json.data.chart).not.toBeNull();
        expect(res.json.data.chart.score).toBeNull();
        expect(res.json.data.stages.length).toBeGreaterThan(0);
    });

    it("rejects when both --achievements and --rating are specified", async () => {
        const home = makeHome();
        const res = await commandIn(home, "calc", [
            "13.0",
            "--achievements",
            "100",
            "--rating",
            "250",
        ]);
        expect(res.code).toBe(2);
        expect(res.json.error.code).toBe("USAGE");
        expect(res.json.error.message).toContain("不能同时指定");
    });

    it("rejects out-of-range option values and invalid constants", async () => {
        const home = makeHome();
        // --achievements out of range
        const resAchHigh = await commandIn(home, "calc", ["13.0", "--achievements", "105"]);
        expect(resAchHigh.code).toBe(2);
        expect(resAchHigh.json.error.code).toBe("USAGE");

        const resAchLow = await commandIn(home, "calc", ["13.0", "--achievements", "-5"]);
        expect(resAchLow.code).toBe(2);
        expect(resAchLow.json.error.code).toBe("USAGE");

        // --rating negative
        const resRaNeg = await commandIn(home, "calc", ["13.0", "--rating", "-1"]);
        expect(resRaNeg.code).toBe(2);
        expect(resRaNeg.json.error.code).toBe("USAGE");

        // constant out of range (< 1.0 or > 15.0)
        const resConstLow = await commandIn(home, "calc", ["0.5"]);
        expect(resConstLow.code).toBe(2);
        expect(resConstLow.json.error.code).toBe("USAGE");

        const resConstHigh = await commandIn(home, "calc", ["16.0"]);
        expect(resConstHigh.code).toBe(2);
        expect(resConstHigh.json.error.code).toBe("USAGE");

        // constant with more than 1 decimal place
        const resConstDec = await commandIn(home, "calc", ["13.55"]);
        expect(resConstDec.code).toBe(2);
        expect(resConstDec.json.error.code).toBe("USAGE");
    });

    it("rejects chart without a constant (utage)", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);
        const res = await commandIn(home, "calc", ["110227-10"]);
        expect(res.code).toBe(2);
        expect(res.json.error.code).toBe("USAGE");
        expect(res.json.error.message).toContain("该谱面没有定数");
    });
});
