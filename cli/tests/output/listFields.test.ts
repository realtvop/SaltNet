import { describe, expect, it } from "vitest";
import { commandIn } from "../commandRun";
import { detailedUser, seedScoreUsers } from "../scoreUsers";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

describe("schema-based list fields", () => {
    it("rejects an unknown field when the filter matches no charts", async () => {
        const result = await commandIn(makeHome(), "charts", [
            "--search",
            "nicoxxx_no_hit",
            "--fields",
            "nonsense",
            "--limit",
            "1",
        ]);

        expect(result.json.error?.code).toBe("USAGE");
        expect(result.json.error.message).toContain("nonsense");
    });

    it("rejects an unknown field when every group is paged past its end", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [detailedUser("test-fields", "Fields User")]);
        const result = await commandIn(paths, "charts", [
            "--group-by",
            "rank",
            "--offset",
            "50000",
            "--limit",
            "1",
            "--fields",
            "chartKey,unknown",
        ]);

        expect(result.json.error?.code).toBe("USAGE");
        expect(result.json.error.message).toContain("unknown");
    });

    it("validates nested paths when every score is null", async () => {
        const paths = makeHome();
        const valid = await commandIn(paths, "charts", ["--limit", "1", "--fields", "score.rank"]);
        expect(valid.json.data.items).toEqual([{ score: { rank: null } }]);

        const invalid = await commandIn(paths, "charts", ["--limit", "1", "--fields", "score.rnk"]);
        expect(invalid.json.error?.code).toBe("USAGE");
        expect(invalid.json.error.candidates).toContainEqual({ ref: "score.rank" });
    });

    it("rejects an invalid requested child even when its parent is also requested", async () => {
        const result = await commandIn(makeHome(), "charts", [
            "--limit",
            "1",
            "--fields",
            "score,score.rnk",
        ]);
        expect(result.json.error?.code).toBe("USAGE");
        expect(result.json.error.candidates).toContainEqual({ ref: "score.rank" });
    });

    it.each(["tsv", "text"])("keeps the requested %s header on an empty page", async format => {
        const paths = makeHome();
        await seedScoreUsers(paths, [detailedUser("test-header", "Header User")]);
        const args = ["--limit", "1", "--fields", "score,chartKey", "--format", format];
        const full = await commandIn(paths, "charts", args);
        const empty = await commandIn(paths, "charts", [...args, "--offset", "999999"]);
        const header = full.stdout.trimStart().split("\n")[0];

        expect(full.code).toBe(0);
        expect(empty.code).toBe(0);
        expect(header.split(/\s+/)).toEqual([
            "score.achievements",
            "score.rank",
            "score.combo",
            "score.sync",
            "score.dxScore",
            "score.dxScoreMax",
            "score.dxStars",
            "score.rating",
            "score.playCount",
            "score.playCountEstimated",
            "score.changedAt",
            "chartKey",
        ]);
        expect(empty.stdout.trimStart().split("\n")[0].split(/\s+/)).toEqual(header.split(/\s+/));
    });

    it("puts the group key first in a grouped tsv with requested fields", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [detailedUser("test-group-header", "Group User")]);
        const args = ["--group-by", "rank", "--limit", "1", "--fields", "chartKey"];
        const full = await commandIn(paths, "charts", [...args, "--format", "tsv"]);
        const empty = await commandIn(paths, "charts", [
            ...args,
            "--offset",
            "50000",
            "--format",
            "tsv",
        ]);

        expect(full.code).toBe(0);
        expect(empty.code).toBe(0);
        const [header, firstRow] = full.stdout.split("\n");
        expect(header.split("\t")).toEqual(["group", "chartKey"]);
        // The group's key is written in its own column, before the requested fields.
        expect(firstRow.split("\t")).toHaveLength(2);
        expect(empty.stdout.split("\n")[0].split("\t")).toEqual(["group", "chartKey"]);
    });

    it("uses the query's declared columns to validate empty SQL results", async () => {
        const paths = makeHome();
        const query = "SELECT 1 AS actual WHERE 0";
        const invalid = await commandIn(paths, "sql", [query, "--fields", "typo"]);
        expect(invalid.json.error?.code).toBe("USAGE");

        const valid = await commandIn(paths, "sql", [
            query,
            "--fields",
            "actual",
            "--format",
            "tsv",
        ]);
        expect(valid.stdout).toBe("actual\n");
    });
});
