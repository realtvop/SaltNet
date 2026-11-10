import { describe, expect, it } from "vitest";
import { columnsOf } from "../../src/output/table";
import { renderTsv } from "../../src/output/tsv";

function tsv(rows: readonly unknown[], columns = columnsOf(rows)): string {
    return renderTsv(rows, columns);
}

describe("renderTsv", () => {
    it("writes a header of column names and one line per row", () => {
        const rows = [
            { chartKey: "834-4", title: "PANDORA PARADOXXX", score: { rank: "SSS", rating: 324 } },
            { chartKey: "131-3", title: "Link", score: null },
        ];
        expect(tsv(rows)).toBe(
            [
                "chartKey\ttitle\tscore.rank\tscore.rating",
                "834-4\tPANDORA PARADOXXX\tSSS\t324",
                "131-3\tLink\t\t",
                "",
            ].join("\n")
        );
    });

    it("writes numbers and booleans as they are and null as an empty cell", () => {
        expect(tsv([{ a: 100.1234, b: true, c: false, d: null, e: 0 }])).toBe(
            "a\tb\tc\td\te\n100.1234\ttrue\tfalse\t\t0\n"
        );
    });

    it("writes lists and empty objects as compact JSON", () => {
        expect(tsv([{ tags: ["a", "b,c"], extra: {}, none: [] }])).toBe(
            'tags\textra\tnone\n["a","b,c"]\t{}\t[]\n'
        );
    });

    it("escapes what would break the layout", () => {
        const rows = [{ text: "a\tb\nc\rd\\e" }];
        expect(tsv(rows)).toBe("text\na\\tb\\nc\\rd\\\\e\n");
    });

    it("keeps Chinese and other text as it is", () => {
        expect(tsv([{ title: "熊華極", artist: "t+pazolite" }])).toBe(
            "title\tartist\n熊華極\tt+pazolite\n"
        );
    });

    it("can print a header for columns that were asked for when there are no rows", () => {
        expect(tsv([], ["chartKey", "score.rank"])).toBe("chartKey\tscore.rank\n");
    });

    it("prints nothing when there are no columns", () => {
        expect(tsv([])).toBe("");
    });

    it("follows the order of the columns it is given", () => {
        expect(tsv([{ a: 1, b: 2 }], ["b", "a"])).toBe("b\ta\n2\t1\n");
    });
});
