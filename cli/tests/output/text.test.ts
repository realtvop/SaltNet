import type { TextInput } from "../../src/output/text";
import { describe, expect, it } from "vitest";
import { renderText } from "../../src/output/text";
import { displayWidth } from "../../src/util/width";

function list(data: unknown, rest: Partial<TextInput> = {}): string[] {
    const text = renderText({ kind: "list", data, meta: {}, warnings: [], ...rest });
    expect(text.endsWith("\n")).toBe(true);
    return text.slice(0, -1).split("\n");
}

function object(data: unknown, rest: Partial<TextInput> = {}): string[] {
    const text = renderText({ kind: "object", data, meta: {}, warnings: [], ...rest });
    return text.slice(0, -1).split("\n");
}

describe("a list as text", () => {
    it("is a table with a header, null as a dash and nested keys as dotted columns", () => {
        expect(
            list({
                items: [
                    { chartKey: "834-4", level: "15", score: { rank: "SSS" } },
                    { chartKey: "131-3", level: "13+", score: null },
                ],
            })
        ).toEqual(["chartKey  level  score.rank", "834-4     15     SSS", "131-3     13+    -"]);
    });

    it("lines columns up by display width, so Chinese titles do not push them over", () => {
        const lines = list({
            items: [
                { title: "熊華極", level: "14" },
                { title: "Link", level: "13" },
            ],
        });
        const levelColumn = lines.map(line =>
            displayWidth(line.slice(0, line.search(/1[34]|level/)))
        );
        expect(new Set(levelColumn).size).toBe(1);
    });

    it("cuts a very long cell with an ellipsis", () => {
        const long = "A".repeat(60);
        const lines = list({ items: [{ title: long }] });
        expect(lines[1]).toBe(`${"A".repeat(39)}…`);
        expect(displayWidth(lines[1])).toBe(40);
    });

    it("cuts wide characters without going over the limit", () => {
        const lines = list({ items: [{ title: "熊".repeat(30) }] });
        expect(displayWidth(lines[1])).toBeLessThanOrEqual(40);
        expect(lines[1].endsWith("…")).toBe(true);
    });

    it("writes lists of simple values joined, and other structures as JSON", () => {
        expect(list({ items: [{ tags: ["a", "b"], none: [], deep: [{ x: 1 }] }] })[1]).toBe(
            'a、b  []    [{"x":1}]'
        );
    });

    it("says so when there is nothing to show", () => {
        expect(list({ items: [] })).toEqual(["（没有结果）"]);
    });

    it("shows where the page sits and how to get the next one", () => {
        const items = [{ a: 1 }, { a: 2 }];
        const first = list(
            { items },
            { meta: { page: { total: 10, offset: 0, limit: 2, nextOffset: 2 } } }
        );
        expect(first.at(-1)).toBe("第 1–2 条，共 10 条；下一页加 --offset 2");

        const last = list(
            { items },
            { meta: { page: { total: 10, offset: 8, limit: 2, nextOffset: null } } }
        );
        expect(last.at(-1)).toBe("第 9–10 条，共 10 条");

        const empty = list(
            { items: [] },
            { meta: { page: { total: 0, offset: 0, limit: 50, nextOffset: null } } }
        );
        expect(empty.at(-1)).toBe("第 0–0 条，共 0 条");
    });

    it("prints groups under a heading with their own tables", () => {
        expect(
            list({
                groups: [
                    { key: "14", count: 2, items: [{ title: "A" }] },
                    { key: "13+", count: 1, items: [{ title: "B" }] },
                ],
            })
        ).toEqual(["14（2 条）", "title", "A", "", "13+（1 条）", "title", "B"]);
    });

    it("prints the rest of data, such as statistics, as an outline after the table", () => {
        expect(list({ items: [{ a: 1 }], stats: { sss: 3, fc: 1 } })).toEqual([
            "a",
            "1",
            "",
            "stats:",
            "  sss: 3",
            "  fc: 1",
        ]);
    });

    it("lists warnings with the command that fixes them", () => {
        expect(
            list(
                { items: [{ a: 1 }] },
                {
                    warnings: [
                        {
                            code: "STALE_SCORES",
                            message: "成绩已经 3 天没更新",
                            fix: "saltnet sync",
                        },
                        { code: "NO_SCORES", message: "还没有同步过" },
                    ],
                }
            ).slice(2)
        ).toEqual([
            "警告 STALE_SCORES：成绩已经 3 天没更新（建议运行 saltnet sync）",
            "警告 NO_SCORES：还没有同步过",
        ]);
    });

    it("shows the other meta as an outline", () => {
        expect(
            list(
                { items: [{ a: 1 }] },
                { meta: { user: { index: 0, name: "玩家" }, dataAsOf: { catalog: "2026-11-10" } } }
            ).slice(3)
        ).toEqual(["user:", "  index: 0", "  name: 玩家", "dataAsOf:", "  catalog: 2026-11-10"]);
    });
});

describe("an object as text", () => {
    it("is an outline of key: value lines", () => {
        expect(
            object({
                musicId: 834,
                title: "PANDORA PARADOXXX",
                score: null,
                flags: { dx: false },
                tags: ["a", "b"],
                none: [],
                empty: {},
            })
        ).toEqual([
            "musicId: 834",
            "title: PANDORA PARADOXXX",
            "score: -",
            "flags:",
            "  dx: false",
            "tags: a、b",
            "none: []",
            "empty: {}",
        ]);
    });

    it("writes lists of objects as dashes with the keys lined up under the first one", () => {
        expect(
            object({
                charts: [
                    { difficulty: "MASTER", level: "14" },
                    { difficulty: "Re:MASTER", level: "14+" },
                ],
                title: "x",
            })
        ).toEqual([
            "charts:",
            "  - difficulty: MASTER",
            "    level: 14",
            "  - difficulty: Re:MASTER",
            "    level: 14+",
            "title: x",
        ]);
    });

    it("nests deeper structures", () => {
        expect(object({ a: { b: [{ c: 1, d: { e: 2 } }] } })).toEqual([
            "a:",
            "  b:",
            "    - c: 1",
            "      d:",
            "        e: 2",
        ]);
    });

    it("keeps a line break in a value from breaking the outline", () => {
        expect(object({ note: "a\nb" })).toEqual(["note: a b"]);
    });

    it("prints a plain value on one line", () => {
        expect(object("hello")).toEqual(["hello"]);
        expect(object(null)).toEqual(["-"]);
    });
});
